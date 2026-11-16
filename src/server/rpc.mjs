// 所有者专用界面 RPC，与模型会话内的权限校验分开。
export function registerRpc(ctx, service) {
  ctx.inject(['connection'], scope => {
    scope.effect(() => scope.connection.rpc.intercept('/api', method => method === 'taskflow/view' || method === 'taskflow/action', async (method, payload, signal, peer) => {
      if (!peer || (peer !== scope.connection.browserPeer && peer.principal?.kind !== 'owner')) return { ok: false, error: { code: 'forbidden', message: '仅宿主所有者可访问任务计划', details: {} } };
      try {
        if (!payload || typeof payload.sessionId !== 'string' || payload.sessionId.length > 200) throw new Error('缺少有效会话 ID');
        const sid = payload.sessionId;
        if (method === 'taskflow/view') return { ok: true, value: service.view(sid) };
        let value;
        if (payload.action === 'close-view') value = await service.closeView(sid);
        else if (payload.action === 'focus') value = await service.focus(sid, payload.taskId);
        else if (payload.action === 'start') value = await service.start(sid, payload.taskId);
        else if (payload.action === 'cancel') value = await service.cancel(sid, payload.taskId, payload.version);
        else if (payload.action === 'update') value = await service.update(sid, payload.taskId, payload.patch, payload.version);
        else if (payload.action === 'reorder') value = await service.reorder(sid, payload.taskId, payload.direction, payload.expectedVersion);
        else throw new Error('不支持的操作');
        return { ok: true, value: value ?? { ok: true } };
      } catch (error) { return { ok: false, error: { code: error.code ?? 'invalid', message: error.message, details: {} } }; }
    }));
  });
}
