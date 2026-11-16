// 展示真实工具输出；执行仍属于原宿主工具。
export function registerToolViews(ctx, service, log) {
  ctx.on('tools/execute', async (exec, next) => {
    const sid = exec.agent?.session.id;
    if (sid && service.view(sid).plan && !exec.name.startsWith('taskflow_') && !['structured_output', 'todo_write', 'ask_user'].includes(exec.name)) {
      const kind = /browser|navigate|web_page/.test(exec.name) ? 'browser' : /bash|pwsh|terminal|command/.test(exec.name) ? 'terminal' : /^(read|write|edit|str_replace)/.test(exec.name) ? 'editor' : 'plugin';
      if (kind) await service.openView(sid, { kind, title: exec.name, ...(typeof exec.args?.url === 'string' ? { url: exec.args.url } : {}), content: '工具正在执行…' }).catch(log);
      const result = await next();
      if (kind) { const output = (result.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('\n'); if (output) await service.openView(sid, { ...service.view(sid).tool, content: output }).catch(log); }
      return result;
    }
    return next();
  }, { global: true });
}
