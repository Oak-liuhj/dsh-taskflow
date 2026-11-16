import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { clientSource } from '../scripts/client-source.mjs';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { TaskService } from '../src/domain/task-service.mjs';
import { MemoryStore } from '../src/storage/task-store.mjs';

test('编译后客户端：槽位注册、父任务预填、会话导航和工具 portal 清理', async () => {
  const compiled = await build({ absWorkingDir: process.env.TASKFLOW_BUILD_SOURCE || process.cwd(), entryPoints: ['src/client/index.jsx'], bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', loader: { '.css': 'text' }, plugins: [clientSource()] });
  // Node data URL cannot resolve package imports; install the test artifact next to node_modules.
  const { mkdir, writeFile } = await import('node:fs/promises'); await mkdir('.local/tests', { recursive: true });
  await writeFile('.local/tests/client.mjs', compiled.outputFiles[0].text);
  const { apply } = await import('../.local/tests/client.mjs');
  const dom = new JSDOM('<html><head></head><body><div id="host"><header id="header"></header><main data-conversation-content data-conversation-session="main" data-content-phase="active"><textarea></textarea></main></div><div id="panel"></div></body></html>', { url: 'http://localhost' });
  const saved = new Map(); for (const [k, v] of Object.entries({ window: dom.window, document: dom.window.document, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true })) { saved.set(k, Object.getOwnPropertyDescriptor(globalThis, k)); Object.defineProperty(globalThis, k, { configurable: true, writable: true, value: v }); }
  const s = new TaskService(new MemoryStore()); const p = await s.create('main', { title: 'UI 验收', goal: '检查会话归属', tasks: [{ title: '父项', mode: 'delegate' }] });
  let t = await s.start('main', 'T-001'); await s.bind(p.id, t.id, t.attempt.id, 'child'); await s.add('child', [{ title: '下级' }]);
  const seats = new Map(), cleanups = [], drafts = [], navigation = []; let definition;
  const ctx = { slots: { inject: (_slot, fn) => fn(), register: (options, Component) => { seats.set(options.name, { options, Component }); return () => seats.delete(options.name); } },
    connection: { rpc: { call: async (channel, method, payload) => { assert.equal(channel, '/taskflow'); assert.ok(['view', 'action'].includes(method)); return { ok: true, value: method === 'view' ? s.view(payload.sessionId) : await s.focus(payload.sessionId, payload.taskId) }; } } },
    sessions: { binding: sid => ({ ctx: { sid } }) }, conversation: { input: { for: binding => ({ setDraft: text => drafts.push({ sid: binding.sid, text }), focus() {} }) } },
    sidebarRightTabs: { register: d => { definition = d; return () => {}; } }, sidebarRight: { openTab: () => {} }, uiWorkspace: { openSession: sid => navigation.push(sid) },
    provide() {}, effect: fn => { const cleanup = fn(); if (typeof cleanup === 'function') cleanups.push(cleanup); }, inject: (_deps, fn) => fn(ctx),
  };
  const panel = createRoot(document.getElementById('panel')), header = createRoot(document.getElementById('header'));
  const click = async element => { assert.ok(element); await act(async () => element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))); };
  const waitPoll = () => act(() => new Promise(resolve => setTimeout(resolve, 1250)));
  try {
    apply(ctx); assert.equal(seats.get('sidebar.right.pane.tab').options.key, definition.id);
    const Panel = seats.get('sidebar.right.pane.tab').Component, Entry = seats.get('conversation.session.header.utilities').Component;
    await act(async () => { panel.render(React.createElement(Panel, { sessionId: 'main' })); header.render(React.createElement(Entry, { sessionId: 'main' })); });
    assert.equal(definition.title(), '待办任务清单'); assert.equal(definition.guide[0].title(), '待办任务清单');
    assert.equal(document.querySelector('.tf-entry').textContent, '任务'); assert.ok(document.querySelector('.tf-entry svg'));
    assert.equal(document.querySelector('.tf-panel').getAttribute('aria-label'), '待办任务清单');
    assert.equal(document.querySelector('.plan-tabs .tab').textContent, '待办任务清单');
    assert.match(document.getElementById('panel').textContent, /下级/); assert.equal(document.querySelector('.tf-tool-mount'), null);
    await click(document.querySelector('[aria-label="查看 T-001 详情"]'));
    await click([...document.querySelectorAll('button')].find(e => e.textContent === '增补下级事项'));
    assert.deepEqual(drafts, [{ sid: 'main', text: '在 T-001 下新增一个' }]);
    await click(document.querySelector('[data-task-id="T-001"] .tf-task')); assert.deepEqual(navigation, ['child']);
    await s.openView('main', { kind: 'terminal', content: '实际工具输出' }); await waitPoll();
    assert.ok(document.querySelector('#host.tf-tool-layout .tf-tool-mount')); assert.match(document.querySelector('.tf-tool').textContent, /实际工具输出/);
    await act(async () => { header.render(React.createElement(Entry, { sessionId: 'child' })); });
    assert.equal(document.querySelector('.tf-tool-mount'), null); assert.equal(document.getElementById('host').classList.contains('tf-tool-layout'), false);
  } finally {
    await act(async () => { panel.unmount(); header.unmount(); }); cleanups.reverse().forEach(fn => fn()); dom.window.close();
    for (const [k, descriptor] of saved) if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k];
  }
});
