// 独立 RPC 通道，避免抢占宿主 Gateway 的 /api interceptor。
// 传输沿用宿主认证；界面仍仅允许所有者访问。
export function registerRpc(ctx, service) {
  ctx.inject(['connection', 'webServer'], scope => {
    scope.effect(() => scope.connection.rpc.handle('/taskflow', async (method, payload, signal, peer) => {
      if (!peer || (peer !== scope.connection.browserPeer && peer.principal?.kind !== 'owner')) return { ok: false, error: { code: 'forbidden', message: '仅宿主所有者可访问任务计划', details: {} } };
      try {
        if (!payload || typeof payload.sessionId !== 'string' || payload.sessionId.length > 200) throw new Error('缺少有效会话 ID');
        const sid = payload.sessionId;
        if (method === 'view') return { ok: true, value: service.view(sid) };
        if (method !== 'action') throw new Error('不支持的方法');
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
