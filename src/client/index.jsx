import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TaskPanel } from './components/task-panel.jsx';
import { ToolPanel } from './components/tool-panel.jsx';
import { useTaskflow } from './hooks/use-taskflow.mjs';
import css from './styles.css';
import prototypeCss from './generated/prototype.css';
import { Icon } from './generated/icons.jsx';

export const inject = ['slots', 'sessions', 'connection'];
export function createApi(connection) {
  const call = async (method, data) => { const result = await connection.rpc.call('/api', method, data); if (!result.ok) throw new Error(result.error.message); return result.value; };
  return { view: sessionId => call('taskflow/view', { sessionId }), action: (sessionId, action, data) => call('taskflow/action', { sessionId, action, ...data }) };
}
export function apply(ctx) {
  const api = createApi(ctx.connection), renderers = new Map();
  ctx.provide('taskflowViews', { register(kind, component) { renderers.set(kind, component); return () => { if (renderers.get(kind) === component) renderers.delete(kind); }; } });
  ctx.effect(() => { const style = document.createElement('style'); style.dataset.dshTaskflow = ''; style.textContent = css + '\n' + prototypeCss; document.head.append(style); return () => style.remove(); });
  ctx.inject(['sidebarRightTabs', 'sidebarRight', 'uiWorkspace'], scope => {
    scope.effect(() => scope.sidebarRightTabs.register({ id: 'dsh-taskflow', kind: 'taskflow', priority: 'extension', keepMounted: true, title: () => '任务导航', guide: [{ id: 'taskflow', order: 0, title: () => '任务导航', description: () => '持久层级待办' }] }));
    const register = (slot, options, Component) => scope.effect(() => scope.slots.inject(slot, () => scope.slots.register({ name: slot, ...options }, Component)));
    const augment = (props, value) => { const binding = ctx.sessions.binding(props.sessionId); const input = binding && ctx.conversation?.input?.for(binding.ctx); if (input) { input.setDraft(value); input.focus(); } else props.inputActions?.setDraft(value); };
    function Panel(props) { const view = useTaskflow(api, props.sessionId); return <TaskPanel view={view} sessionId={props.sessionId} action={(type, data) => api.action(props.sessionId, type, data)} navigate={id => scope.uiWorkspace.openSession(id)} augment={value => augment(props, value)}/>; }
    register('sidebar.right.pane.tab', { key: 'dsh-taskflow' }, Panel);
    function SessionEntry(props) {
      const view = useTaskflow(api, props.sessionId), [mount, setMount] = useState(null), [showTool, setShowTool] = useState(true), autoOpened = useRef(false);
      useEffect(() => { if (mount) mount.parentElement?.classList.toggle('tf-tool-show-tool', showTool); }, [mount, showTool]);
      useEffect(() => { if (view.tool?.open) setShowTool(true); }, [view.tool?.open, props.sessionId]);
      useEffect(() => {
        if (view.plan && !autoOpened.current) { try { scope.sidebarRight.openTab('taskflow'); autoOpened.current = true; } catch {} }
      }, [view.plan?.id, props.sessionId]);
      useEffect(() => { autoOpened.current = false; }, [props.sessionId]);
      useEffect(() => {
        if (!view.tool?.open) { setMount(null); return; }
        // rc.2 has no additive seat to the left of the conversation. This isolated,
        // versioned bridge adds only our portal node and CSS class; never reparent host nodes.
        let cleanup = () => {};
        const attach = () => { const body = [...document.querySelectorAll('[data-conversation-content]')].find(e => e.dataset.conversationSession === props.sessionId && e.dataset.contentPhase !== 'hero'); if (!body) return false; const parent = body.parentElement; const node = document.createElement('div'); node.className = 'tf-tool-mount'; const bodyOnly = parent.classList.contains('workbody'); parent.append(node); parent.classList.add('tf-tool-layout'); if (bodyOnly) parent.classList.add('tf-tool-body'); setMount(node); cleanup = () => { parent.classList.remove('tf-tool-layout', 'tf-tool-show-tool', 'tf-tool-body'); node.remove(); }; return true; };
        let observer;
        if (!attach()) { observer = new MutationObserver(() => { if (attach()) observer.disconnect(); }); observer.observe(document.body, { childList: true, subtree: true }); }
        return () => { observer?.disconnect(); cleanup(); setMount(null); };
      }, [view.tool?.open, props.sessionId]);
      const Renderer = renderers.get(view.tool?.kind);
      return <><button className="tf-entry" onClick={() => scope.sidebarRight.openTab('taskflow')}><Icon name="check"/>任务导航</button>{view.tool?.open && <span className="tf-mobile-view"><button aria-pressed={!showTool} onClick={() => setShowTool(false)}>看对话</button><button aria-pressed={showTool} onClick={() => setShowTool(true)}>看工具</button></span>}{mount && createPortal(<ToolPanel tool={view.tool} onClose={() => void api.action(props.sessionId, 'close-view', {})} renderer={Renderer ? tool => <Renderer tool={tool} sessionId={props.sessionId}/> : null}/>, mount)}</>;
    }
    register('conversation.session.header.utilities', { id: 'taskflow', order: -5 }, SessionEntry);
  });
}
