// Isolated acceptance host. Never reads the user's DSH profile or model keys.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';
import { Context } from '@deepseek-ai/cordis';
import { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm';
import Subagents from '@deepseek-ai/dsh-subagent';
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process';
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl';
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit';
import * as Plugin from '../index.js';
import { syncPrdAssets } from './prd-assets.mjs';

const root = process.cwd(), dataDir = join(root, '.local/dev');
await mkdir(dataDir, { recursive: true });
const ctx = new Context(), queues = new Map();
await mountAgentLoopTestDependencies(ctx, { workingDirectory: true });
await ctx.plugin(Jsonl, { root: join(dataDir, 'sessions'), compression: 'none' });
await ctx.plugin(Subagents, { maxDepth: 2, maxActiveSubagents: 4 });
await ctx.plugin(Spawn, { providerName: 'spawn' });
const done = summary => ({ name: 'structured_output', args: { status: 'completed', summary } });
ctx.llm.registerAdapter(['fixture'], new class extends LlmAdapter {
  async resolveModel(provider, model) { return { provider, id: model, name: model }; }
  async *stream(options) {
    await new Promise(resolve => setTimeout(resolve, 300));
    const sid = options.sessionId, view = ctx.taskflow.service.view(sid), own = view.currentTaskId;
    const job = queues.get(sid)?.shift();
    const call = job ? await job() : sid !== 'taskflow-dev-main' && view.plan?.tasks[own]?.status === 'running' ? done('固定响应模型已完成子会话流程演练；此摘要不代表真实业务执行。') : null;
    if (call) { yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: crypto.randomUUID(), name: call.name, arguments: JSON.stringify(call.args) } }; yield { type: 'finish', reason: { kind: 'tool-calls' } }; }
    else { yield { type: 'block-end', index: 0, block: { type: 'text', text: own ? `正在执行 ${own}。` : '流程状态已保存。你可以查看进度、增补事项或继续执行。' } }; yield { type: 'finish', reason: { kind: 'stop' } }; }
  }
}());
await ctx.plugin(Plugin, { dataDir: join(dataDir, 'taskflow'), maxDepth: 2, maxConcurrent: 2 });
const harness = await mountAgentLoopTestHarness(ctx);
async function getAgent(sid) {
  if (ctx.agents.get(sid)) return ctx.agents.get(sid);
  if (ctx.taskflow.service.view(sid).plan) return (await ctx.agents.resume({ resumeSessionId: sid, agentOptions: { provider: 'fixture', model: 'acceptance-fixture', maxTokens: 3000 } })).agent;
  return harness.create(sid, { provider: 'fixture', model: 'acceptance-fixture', maxTokens: 3000 }, { cwd: root });
}
await getAgent('taskflow-dev-main');
await syncPrdAssets();
const bundle = await build({ entryPoints: ['scripts/dev-client.jsx'], bundle: true, write: false, format: 'iife', platform: 'browser', loader: { '.css': 'text' }, charset: 'utf8' });
const prototype = await readFile(join(root, 'docs/prototype/dsh-taskflow-prd.html'), 'utf8');
const theme = prototype.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] ?? '';
const layout = [...prototype.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)][1][1];
const shell = await readFile(join(root, 'scripts/dev.html'), 'utf8');
function command(sid, prompt) {
  const service = ctx.taskflow.service, p = service.view(sid).plan;
  const tool = (name, args) => () => ({ name, args });
  if (!p) return [tool('taskflow_plan', { title: prompt.slice(0, 50), goal: prompt, tasks: [{ title: '梳理目标与约束' }, { title: '独立子任务流程验证', complexity: 'high', independent: true }] })];
  const add = prompt.match(/^(?:在\s*(.+?)\s*下)?新增(?:一个)?\s*(.+)$/);
  if (add) return [tool('taskflow_add', { parentId: add[1]?.trim(), tasks: [{ title: add[2].trim() }] })];
  const start = prompt.match(/继续执行\s*(T-\d+)/);
  if (start) return [tool('taskflow_start', { taskId: start[1] }), () => { const t = service.view(sid).plan.tasks[start[1]]; return t.mode === 'inline' ? { name: 'taskflow_complete', args: { taskId: t.id, version: t.version, attemptId: t.attempt.id, summary: '固定响应模型完成行内执行流程演练；未执行真实业务操作。' } } : { name: 'taskflow_status', args: {} }; }];
  return [tool('taskflow_status', {})];
}
async function body(req) {
  let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 200000) throw new Error('请求过大'); } return JSON.parse(raw || '{}');
}
function messages(sid) {
  const a = ctx.agents.get(sid); if (!a) return [];
  return a.session.snapshotEvents().filter(e => ['user/message', 'assistant/message'].includes(e.type)).flatMap(e => {
    const m = e.data.message ?? e.data;
    if (m.source?.kind === 'runtime-context' || m.source?.summary === '持久任务状态') return [];
    const content = (m.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    return content ? [{ role: m.role, content, source: m.source?.kind }] : [];
  }).slice(-40);
}
const port = Number(process.env.TASKFLOW_DEV_PORT || 4173);
const server = createServer(async (req, res) => {
  try {
    if (req.headers.origin && req.headers.origin !== `http://127.0.0.1:${port}`) { res.writeHead(403).end(); return; }
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    let result, type = 'application/json; charset=utf-8';
    if (req.method === 'GET' && url.pathname === '/') { result = shell; type = 'text/html; charset=utf-8'; }
    else if (req.method === 'GET' && url.pathname === '/app.js') { result = bundle.outputFiles[0].text; type = 'text/javascript; charset=utf-8'; }
    else if (req.method === 'GET' && url.pathname === '/theme.css') { result = theme; type = 'text/css; charset=utf-8'; }
    else if (req.method === 'GET' && url.pathname === '/prototype.css') { result = layout; type = 'text/css; charset=utf-8'; }
    else if (req.method === 'GET' && url.pathname === '/prototype') { result = prototype; type = 'text/html; charset=utf-8'; }
    else if (req.method === 'GET' && url.pathname === '/tool-page') { result = '<html lang="zh-CN"><meta charset="utf-8"><body style="font:16px system-ui;padding:32px"><h2>本地工具页面</h2><p>用于验证实际 iframe 挂载、地址和会话绑定。</p><label>测试输入 <input placeholder="输入内容"></label></body></html>'; type = 'text/html; charset=utf-8'; }
    else if (req.method === 'POST' && url.pathname === '/rpc') {
      const a = await body(req), sid = a.sessionId ?? 'taskflow-dev-main', s = ctx.taskflow.service;
      if (a.method === 'taskflow/view') result = s.view(sid);
      else if (a.method === 'taskflow/action') {
        if (a.action === 'focus') result = await s.focus(sid, a.taskId);
        else if (a.action === 'cancel') result = await s.cancel(sid, a.taskId, a.version);
        else if (a.action === 'reorder') result = await s.reorder(sid, a.taskId, a.direction, a.expectedVersion);
        else if (a.action === 'close-view') result = await s.closeView(sid);
        else throw new Error('未知操作');
      } else if (a.method === 'dev/state') {
        await getAgent(sid);
        const p = s.view(sid).plan;
        result = { plan: p, sessions: [{ id: 'taskflow-dev-main', title: p?.title ?? '主会话', parentId: null }, ...Object.values(p?.tasks ?? {}).filter(t => t.mode === 'delegate' && t.executionSessionId).map(t => ({ id: t.executionSessionId, title: `${t.id} ${t.title}`, parentId: t.parentId ? p.tasks[t.parentId].executionSessionId || p.rootSessionId : p.rootSessionId }))], messages: messages(sid) };
      } else if (a.method === 'dev/message') {
        const prompt = String(a.text ?? '').trim(); if (!prompt || prompt.length > 16000) throw new Error('消息为空或过长');
        const agent = await getAgent(sid); if (agent.isRunning) throw new Error('请等待当前执行结束');
        queues.set(sid, command(sid, prompt));
        agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: prompt }] })); result = { ok: true };
      } else if (a.method === 'dev/tool') { await s.openView(sid, { kind: a.kind ?? 'browser', title: '本地验收工具', url: a.kind === 'terminal' ? undefined : `http://127.0.0.1:${port}/tool-page`, content: a.kind === 'terminal' ? 'Taskflow 验收输出\n此处展示工具输出，不执行命令。' : undefined }); result = { ok: true }; }
      else throw new Error('未知请求');
      result = JSON.stringify({ ok: true, value: result ?? null });
    } else { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(result);
  } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: { message: e.message } })); }
});
server.listen(port, '127.0.0.1', () => console.log(`Taskflow acceptance preview: http://127.0.0.1:${port} (fixture model, isolated .local/dev)`));
async function shutdown() { server.close(); await ctx.taskflow.runtime.dispose(); for (const a of ctx.agents.list()) a.cancel({ kind: 'disposed' }); await Promise.allSettled(ctx.agents.list().map(a => a.whenIdle())); await ctx.fiber.dispose(); process.exit(0); }
process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
