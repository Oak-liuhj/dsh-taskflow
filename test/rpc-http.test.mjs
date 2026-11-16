import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Context } from '@deepseek-ai/cordis';
import { HostConnectionService } from '@deepseek-ai/dsh-client-connection';
const { registerRpc } = await import(process.env.TASKFLOW_TEST_RPC ? pathToFileURL(resolve(process.env.TASKFLOW_TEST_RPC)).href : '../src/server/rpc.mjs');
import { TaskService } from '../src/domain/task-service.mjs';
import { MemoryStore } from '../src/storage/task-store.mjs';

test('真实宿主 HTTP：复现共享 /api 冲突，独立通道可读写、鉴权、释放及重新加载', async () => {
  const ctx = new Context(), routes = new Map();
  const service = new TaskService(new MemoryStore());
  await service.create('main', { title: 'HTTP 验收', goal: '验证真实传输', tasks: [{ title: '待办一' }] });
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    const route = [...routes.values()].find(r => path === r.path || path.startsWith(`${r.path}/`));
    if (!route) { res.writeHead(404); res.end(); return; }
    Promise.resolve(route.handler(req, res)).catch(error => { res.writeHead(500); res.end(String(error)); });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (channel, method, payload = { sessionId: 'main' }, options = {}) => fetch(`${base}${channel}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: 'fixture-owner=yes', ...options.headers },
    body: JSON.stringify({ type: 'client-request', rpcId: 'fixture-request', method, payload }),
  });
  let connection;
  try {
    const webServer = { host: '127.0.0.1', protocol: 'http:', register(route) {
      assert.ok(!routes.has(route.path)); routes.set(route.path, route);
      return () => routes.delete(route.path);
    } };
    await ctx.plugin(owner => {
      connection = new HostConnectionService(owner, [], {
        isAuthenticated: req => req.headers.cookie === 'fixture-owner=yes', authenticateApi: () => undefined,
      });
    });
    const removeGateway = ctx.connection.rpc.intercept('/api', method => method === 'gateway/ping', async () => ({ ok: true, value: 'gateway' }));
    const shared = connection.createSharedFetchHandler('/api');
    const oldResponse = await shared.fetch(new Request(`${base}/api/taskflow/view`, { method: 'POST' }), connection.browserPeer);
    assert.equal(oldResponse.status, 404, 'Gateway does not expose plugin endpoints');
    assert.throws(() => ctx.connection.rpc.intercept('/api', () => true, async () => ({ ok: true, value: null })), /already has an interceptor/);
    const gatewayRequest = () => shared.fetch(new Request(`${base}/api/gateway/ping`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'gateway', method: 'gateway/ping', payload: {} }),
    }), connection.browserPeer);
    const plugin = await ctx.plugin(owner => registerRpc(owner, service));
    assert.equal(routes.has('/taskflow'), false, 'Wait for the webServer dependency');
    ctx.provide('webServer', webServer);
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(routes.has('/taskflow'));
    assert.equal((await (await gatewayRequest()).json()).result.value, 'gateway');
    const view = await request('/taskflow', 'view'); assert.equal(view.status, 200);
    assert.equal((await view.json()).result.value.plan.title, 'HTTP 验收');
    const edit = await request('/taskflow', 'action', { sessionId: 'main', action: 'update', taskId: 'T-001', patch: { title: '已修改' }, version: 1 });
    assert.equal((await edit.json()).result.ok, true);
    assert.equal((await (await request('/taskflow', 'view')).json()).result.value.plan.tasks['T-001'].title, '已修改');
    assert.equal((await request('/taskflow', 'view', undefined, { headers: { cookie: '' } })).status, 401);
    assert.equal((await request('/taskflow', 'view', undefined, { headers: { origin: 'https://untrusted.invalid' } })).status, 403);
    assert.equal((await (await request('/taskflow', 'unknown', { sessionId: 'main', action: 'cancel', taskId: 'T-001' })).json()).result.ok, false);
    await plugin.dispose(); assert.equal((await request('/taskflow', 'view')).status, 404);
    assert.equal((await (await gatewayRequest()).json()).result.value, 'gateway');
    const reloaded = await ctx.plugin(owner => registerRpc(owner, service));
    assert.equal((await request('/taskflow', 'view')).status, 200);
    await reloaded.dispose(); await removeGateway();
  } finally {
    await ctx.fiber.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});
