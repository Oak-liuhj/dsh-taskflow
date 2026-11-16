import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Context } from '@deepseek-ai/cordis';
import { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm';
import Subagents from '@deepseek-ai/dsh-subagent';
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process';
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl';
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit';
// Package checks load the installed tgz; normal tests use the checkout entry.
const Plugin = await import(process.env.TASKFLOW_TEST_PLUGIN ? pathToFileURL(resolve(process.env.TASKFLOW_TEST_PLUGIN)).href : '../index.js');
import { createNoticeSender } from '../src/server/notifications.mjs';

const textChunks = text => [{ type: 'block-end', index: 0, block: { type: 'text', text } }, { type: 'finish', reason: { kind: 'stop' } }];
const toolChunks = (name, args, id) => [{ type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: JSON.stringify(args) } }, { type: 'finish', reason: { kind: 'tool-calls' } }];
const until = async (condition, timeout = 12000) => { const end = Date.now() + timeout; while (!condition()) { if (Date.now() > end) throw new Error('Host integration timed out'); await new Promise(r => setTimeout(r, 10)); } };

test('通知 flush 失败后重试持久化，同一父会话只入队一次', async () => {
  let writes = 0; const inbox = { nextStep: [], nextTurn: [] }, agent = { inbox, session: { snapshotEvents: () => [] }, steer: m => inbox.nextStep.push(m) };
  const notify = createNoticeSender({ agents: { get: () => agent }, sessions: { flush: async () => ++writes > 1 } });
  const n = { id: 'notice-id', taskId: 'T-001', targetSessionId: 'parent', report: { summary: '已完成' } };
  await assert.rejects(notify(n), /持久化/); assert.equal(await notify(n), true); assert.equal(writes, 2); assert.equal(inbox.nextStep.length, 1);
});

test('真实 DSH rc.2 AgentLoop：模型规划、行内执行、spawn 子会话、结构化完成与父通知', { timeout: 25000 }, async () => {
  await mkdir('.local/tests', { recursive: true }); const dir = await mkdtemp(join(process.cwd(), '.local/tests/host-'));
  const ctx = new Context(); const requests = [], errors = []; let adapter;
  try {
    await mountAgentLoopTestDependencies(ctx, { workingDirectory: true });
    await ctx.plugin(Jsonl, { root: join(dir, 'sessions'), compression: 'none' });
    await ctx.plugin(Subagents, { maxDepth: 2, maxActiveSubagents: 4 });
    await ctx.plugin(Spawn, { providerName: 'spawn' });
    const counts = new Map();
    adapter = new class extends LlmAdapter {
      async resolveModel(provider, model) { return { provider, id: model, name: model }; }
      async *stream(options) {
        requests.push(options); const sid = options.sessionId, count = counts.get(sid) ?? 0; counts.set(sid, count + 1);
        if (count > 12) throw new Error(`Unexpected repeated requests for ${sid}`);
        if (sid !== 'taskflow-main') {
          const own = ctx.taskflow.service.view(sid).currentTaskId;
          if (own === 'T-002' && count === 0) yield* toolChunks('taskflow_add', { tasks: [{ title: '独立子模块', complexity: 'high', independent: true }] }, `${sid}-${count}`);
          else if (own === 'T-002' && count === 1) yield* toolChunks('taskflow_start', { taskId: 'T-003' }, `${sid}-${count}`);
          else if (own === 'T-002' && count === 2) yield* toolChunks('taskflow_wait', { taskId: 'T-002' }, `${sid}-${count}`);
          else yield* toolChunks('structured_output', { status: 'completed', summary: '子会话实际执行完成' }, `${sid}-${count}`);
          return;
        }
        if (count === 0) yield* toolChunks('taskflow_plan', { title: '集成验收', goal: '验证持久计划和实际子会话', tasks: [{ title: '准备上下文' }, { title: '独立实现', complexity: 'high', independent: true }] }, `main-${count}`);
        else if (count === 1) yield* toolChunks('taskflow_start', { taskId: 'T-001' }, `main-${count}`);
        else if (count === 2) { const t = ctx.taskflow.service.view(sid).plan.tasks['T-001']; yield* toolChunks('taskflow_complete', { taskId: t.id, version: t.version, attemptId: t.attempt.id, summary: '已准备上下文' }, `main-${count}`); }
        else if (count === 3) yield* toolChunks('taskflow_start', { taskId: 'T-002' }, `main-${count}`);
        else yield* textChunks('继续主任务，已完成事项无需重复核对。');
      }
    }();
    ctx.llm.registerAdapter(['fixture'], adapter);
    await ctx.plugin(Plugin, { dataDir: join(dir, 'taskflow'), maxDepth: 2, maxConcurrent: 1 });
    const harness = await mountAgentLoopTestHarness(ctx);
    const agent = await harness.create('taskflow-main', { provider: 'fixture', model: 'scripted', maxTokens: 2000 }, { cwd: process.cwd() });
    ctx.on('tools/result', (_exec, result) => { if (result.isError) errors.push(result); }, { global: true });
    agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '完成持久任务编排集成验证，分别验证行内事项和独立子会话。' }] }));
    await until(() => ctx.taskflow.service.view('taskflow-main').plan?.tasks['T-002'].status === 'completed').catch(error => { throw new Error(`${error.message}: ${JSON.stringify({ errors, view: ctx.taskflow.service.view('taskflow-main'), requests: requests.length })}`, { cause: error }); });
    await until(() => ctx.taskflow.service.store.read().outbox.every(n => n.delivered));
    await agent.whenIdle();
    assert.deepEqual(errors, []);
    const view = ctx.taskflow.service.view('taskflow-main'); assert.equal(view.plan.tasks['T-001'].status, 'completed'); assert.equal(view.plan.tasks['T-002'].status, 'completed');
    assert.ok(view.plan.tasks['T-002'].executionSessionId); assert.notEqual(view.plan.tasks['T-002'].executionSessionId, 'taskflow-main');
    assert.equal(view.plan.tasks['T-003'].status, 'completed');
    const notices = agent.session.snapshotEvents().filter(e => e.type === 'user/message' && e.data.source?.kind === 'taskflow' && e.data.source?.summary?.endsWith('已完成'));
    assert.equal(notices.filter(e => e.data.source.summary === 'T-002 已完成').length, 1);
    assert.equal(notices.filter(e => e.data.source.summary === 'T-003 已完成').length, 0, '孙任务不能跳过直接父会话通知主会话');
    assert.ok(agent.session.snapshotEvents().some(e => e.type === 'system/message' && JSON.stringify(e.data).includes('taskflow_plan'))); assert.ok(requests.some(r => r.sessionId !== 'taskflow-main'));
    const before = JSON.stringify(view.plan.tasks);
    agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '查看进度，保留既有任务。' }] })); await agent.whenIdle();
    assert.equal(JSON.stringify(ctx.taskflow.service.view('taskflow-main').plan.tasks), before);
    const disk = JSON.parse(await readFile(join(dir, 'taskflow/taskflow.json'), 'utf8')); assert.equal(Object.keys(disk.plans).length, 1); assert.ok(disk.outbox.every(n => n.delivered));
  } finally {
    if (ctx.taskflow) await ctx.taskflow.runtime.dispose();
    for (const agent of ctx.agents?.list?.() ?? []) agent.cancel({ kind: 'disposed' });
    await Promise.allSettled((ctx.agents?.list?.() ?? []).map(a => a.whenIdle()));
    await ctx.fiber.dispose();
  }
});
