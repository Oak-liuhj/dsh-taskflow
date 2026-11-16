import test from 'node:test';
import assert from 'node:assert/strict';
import { registerRpc } from '../src/server/rpc.mjs';

function endpoint(browserPeer) {
  let handler, reads = 0;
  const service = { view: sid => { reads++; return { sessionId:sid }; } };
  const scope = { connection:{ browserPeer, rpc:{intercept(channel, matches, fn) { assert.equal(channel,'/api'); assert.equal(matches('taskflow/view'),true); assert.equal(matches('other'),false); handler=fn; return () => {}; }}}, effect:fn=>fn() };
  registerRpc({inject:(_names, fn)=>fn(scope)},service);
  return {call:(peer,payload={sessionId:'main'},method='taskflow/view')=>handler(method,payload,undefined,peer),reads:()=>reads};
}

test('发布前 RPC 边界：匿名/缺少 browserPeer 不放行，外部访客拒绝，所有者和绑定浏览器可读', async () => {
  const browser = {}, api=endpoint(browser);
  for (const peer of [undefined,null,{}, {principal:{kind:'guest'}}]) assert.equal((await api.call(peer)).error.code,'forbidden');
  const missing = endpoint(undefined); assert.equal((await missing.call(undefined)).error.code,'forbidden'); assert.equal(missing.reads(),0);
  assert.equal(api.reads(),0);
  assert.deepEqual(await api.call(browser),{ok:true,value:{sessionId:'main'}});
  assert.equal((await api.call({principal:{kind:'owner'}})).ok,true);
  assert.equal((await api.call(browser,null)).error.code,'invalid');
  assert.equal((await api.call(browser,{sessionId:'main',action:'unsupported'},'taskflow/action')).error.code,'invalid');
  assert.equal(api.reads(),2);
});
