export const STATUS = { pending: '待执行', queued: '排队中', running: '执行中', awaiting_children: '等待下级', paused: '已暂停', blocked: '受阻', failed: '失败', completed: '已完成', cancelled: '已取消' };
export const TOOL_NAMES = { browser: '浏览器', editor: '编辑器', terminal: '终端', plugin: '插件', orchestration: '编排' };
export function visibleTree(plan, { filter = 'all', scope = 'global', sessionId } = {}) {
  if (!plan) return [];
  const all = Object.values(plan.tasks), kept = new Set();
  const matches = t => (filter === 'all' || (filter === 'active' ? !['completed', 'cancelled'].includes(t.status) : t.status === filter)) && (scope === 'global' || t.executionSessionId === sessionId || (t.parentId ? plan.tasks[t.parentId].executionSessionId : plan.rootSessionId) === sessionId);
  for (const t of all.filter(matches)) { for (let x = t; x; x = plan.tasks[x.parentId]) { if (kept.has(x.id)) break; kept.add(x.id); } }
  const walk = parentId => all.filter(t => t.parentId === parentId && kept.has(t.id)).map(t => ({ ...t, children: walk(t.id) }));
  return walk(null);
}
export function progress(plan) { const roots = Object.values(plan?.tasks ?? {}).filter(t => t.parentId === null && t.status !== 'cancelled'); const done = roots.filter(t => t.status === 'completed').length; return { done, total: roots.length, percent: roots.length ? Math.round(done / roots.length * 100) : 0 }; }
