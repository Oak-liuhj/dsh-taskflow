import React, { useState, useEffect } from 'react';
import { STATUS, visibleTree, progress } from '../model.mjs';
import { Icon } from '../generated/icons.jsx';
import { TaskDialog } from './task-dialog.jsx';

export function TaskPanel({ view, sessionId, action, navigate, augment, onError }) {
  const [filter, setFilter] = useState('all'), [scope, setScope] = useState('global'), [collapsed, setCollapsed] = useState(new Set()), [detail, setDetail] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { setDetail(null); setError(''); }, [sessionId]);
  const p = view.plan, pr = progress(p);
  const perform = async (type, data) => { if (busy) return; setBusy(true); setError(''); try { await action(type, data); } catch (e) { setError(e.message); onError?.(e); } finally { setBusy(false); } };
  const prompt = value => { augment(value); setDetail(null); };
  const row = t => <div className="task-node" key={t.id}>
    <div className={`tf-row task-row ${t.status} ${view.currentTaskId === t.id ? 'focused' : ''}`} data-task-id={t.id} data-status={t.status}>
      <div className="task-line"><span className={`task-box ${t.status}`} aria-label={STATUS[t.status]}>{t.status === 'completed' ? <Icon name="check"/> : t.status === 'cancelled' ? '−' : null}</span>
        <div className="task-copy"><button className="tf-task task-title" onClick={() => { const target = t.executionSessionId || (t.parentId ? p.tasks[t.parentId].executionSessionId : p.rootSessionId); if (target && target !== sessionId) navigate(target); else void perform('focus', { taskId: t.id }); }}>{t.title}</button><div className="task-meta"><code>{t.id}</code><span>· {t.mode === 'delegate' && t.executionSessionId ? '独立会话' : t.mode === 'delegate' ? '按需委派' : '当前会话'}</span>{t.version > 1 && <span>v{t.version}</span>}{t.children.length > 0 && <button className="tf-fold" aria-label={`${collapsed.has(t.id) ? '展开' : '折叠'} ${t.title}`} onClick={() => setCollapsed(old => { const n = new Set(old); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n; })}><Icon name="chevron" style={{ transform: collapsed.has(t.id) ? '' : 'rotate(90deg)' }}/></button>}</div></div>
        <button className="iconbtn" aria-label={`查看 ${t.id} 详情`} onClick={() => setDetail(t.id)}><Icon name="dots"/></button>
      </div>
      {!['completed', 'cancelled'].includes(t.status) && <div className="task-status"><span className={`pill ${t.status === 'running' ? 'blue' : ''}`}><i className={`dot ${t.status}`}/>{STATUS[t.status]}</span>{['pending', 'paused', 'blocked', 'failed'].includes(t.status) && <button className="btn small outline" onClick={() => prompt(`继续执行 ${t.id}，按当前要求完成任务。`)}>{t.status === 'pending' ? '开始' : '继续'}</button>}</div>}
    </div>
    {!collapsed.has(t.id) && t.children.length > 0 && <div className="child-tasks">{t.children.map(row)}</div>}
  </div>;
  const selected = p?.tasks[detail];
  return <section className="tf-panel" aria-label="待办任务清单">
    <header className="plan-tabs"><span className="tab"><Icon name="check"/>待办任务清单</span><span className="pill" style={{ fontSize: 10 }}>持久计划</span><button className="iconbtn" aria-label="查看任务动态" onClick={() => setDetail('activity')}><Icon name="dots"/></button></header>
    {view.loading ? <p className="empty">正在加载任务…</p> : !p ? <div className="empty"><Icon name="check"/><p>暂无任务计划</p><p>在会话中描述目标，模型将根据任务复杂度规划待办。</p></div> : <>
      <div className="plan-heading"><h2>{p.title}</h2><div className="progress-label"><strong>{pr.done} / {pr.total} 项已完成</strong><span>v{p.version} · {pr.percent}%</span></div><div className="progress-track" role="progressbar" aria-label="根任务完成进度" aria-valuenow={pr.percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${pr.percent}%` }}/></div></div>
      <div className="plan-controls"><div className="segments">{[['global', '全局计划'], ['local', '当前会话']].map(([id, title]) => <button key={id} className={scope === id ? 'selected' : ''} aria-pressed={scope === id} onClick={() => setScope(id)}>{title}</button>)}</div><select aria-label="任务筛选" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">全部事项</option><option value="active">未完成</option><option value="completed">已完成</option><option value="cancelled">已取消</option></select></div>
      <div className="task-list">{visibleTree(p, { filter, scope, sessionId }).map(row)}</div>
      <footer className="plan-bottom"><button className="btn outline" onClick={() => augment(view.currentTaskId ? `在 ${view.currentTaskId} 下新增一个` : '新增一个待办事项：')}><Icon name="plus"/>{view.currentTaskId ? '在当前任务下增补' : '在主任务下增补'}</button><p>稳定 ID · 跨轮保留 · 刷新恢复</p></footer>
    </>}
    {(error || view.error) && <p role="alert" className="tf-error">{error || view.error}</p>}
    {selected && <TaskDialog title={selected.title} subtitle={`${selected.id} · 任务详情`} onClose={() => setDetail(null)} actions={<>
      {['pending', 'paused', 'blocked', 'failed'].includes(selected.status) && <button className="btn small primary" onClick={() => prompt(`继续执行 ${selected.id}，按当前要求完成任务。`)}>在会话中继续</button>}
      {selected.status !== 'cancelled' && <><button className="btn small outline" onClick={() => prompt(`在 ${selected.id} 下新增一个`)}>增补下级事项</button><button className="btn small outline" onClick={() => prompt(`修改 ${selected.id} 的要求为：`)}>修改要求</button></>}
      {!['cancelled', 'completed'].includes(selected.status) && <button className="btn small danger" disabled={busy} onClick={() => void perform('cancel', { taskId: selected.id, version: selected.version })}>取消任务</button>}
      <button className="btn small" disabled={busy} onClick={() => void perform('reorder', { taskId: selected.id, direction: -1, expectedVersion: p.version })}>上移</button><button className="btn small" disabled={busy} onClick={() => void perform('reorder', { taskId: selected.id, direction: 1, expectedVersion: p.version })}>下移</button>
    </>}><dl className="detail-kv"><dt>状态</dt><dd><span className="pill">{STATUS[selected.status]} · v{selected.version}</span></dd><dt>执行方式</dt><dd>{selected.mode === 'delegate' ? '独立子会话' : '当前会话'}</dd><dt>父级事项</dt><dd>{selected.parentId || '主任务'}</dd><dt>任务要求</dt><dd>{selected.instructions || selected.title}</dd><dt>完成标准</dt><dd>{selected.criteria || '按当前任务要求完成'}</dd></dl>{selected.report && <div className="notice"><strong>{selected.report.version === selected.version ? '执行结果' : `历史结果 v${selected.report.version}（当前要求已变化）`}</strong><p>{selected.report.summary}</p></div>}{error && <p className="tf-error" role="alert">{error}</p>}</TaskDialog>}
    {detail === 'activity' && p && <TaskDialog title="任务动态" subtitle={`持久计划 · v${p.version}`} closeLabel="关闭任务动态" onClose={() => setDetail(null)}>{[...p.events].reverse().map(e => <article className="history" key={e.id}><time>{e.at.replace('T', ' ').slice(0, 19)} · {e.taskId}</time>{e.detail}</article>)}</TaskDialog>}
  </section>;
}

