import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { PLANNING_PROMPT } from './prompts.mjs';

export function registerSessionContext(ctx, service, config) {
  ctx.systemPrompt.section({ name: 'taskflow', order: 155, text: config.autoPlan === false ? PLANNING_PROMPT.replace('对需要多个步骤、工具操作或独立执行的请求，先根据实际难度通过 taskflow_plan 规划具体待办；短问答无需计划。', '仅当用户明确要求任务计划时调用 taskflow_plan。') : PLANNING_PROMPT, interpolate: false });
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    const decision = await next(); if (decision.kind === 'reject') return decision;
    const view = service.view(agent.session.id);
    if (!view.plan && config.autoPlan === false) return decision;
    const content = view.plan ? JSON.stringify({ title: view.plan.title, planVersion: view.plan.version, currentTaskId: view.currentTaskId, tasks: Object.values(view.plan.tasks).map(t => ({ id: t.id, title: t.title, parentId: t.parentId, mode: t.mode, status: t.status, version: t.version, attempt: t.attempt, dependsOn: t.dependsOn })) }) : '本会话尚无持久计划。复杂多步骤任务先调用 taskflow_plan；短问答直接回答。';
    return { ...decision, messages: [...decision.messages, createUserMessage({ content: [{ type: 'text', text: `Taskflow 当前持久状态（不需要重新规划）：\n${content}` }], source: { kind: 'taskflow', form: 'notice', summary: '持久任务状态' } })] };
  }, { global: true });
  ctx.tools.guard(exec => {
    const sid = exec.agent?.session.id; if (!sid || !service.view(sid).plan) return;
    if (['subagent', 'subagent_fork', 'workflow'].includes(exec.name)) return '请用 taskflow_add / taskflow_start 委派，保留层级与并发限制';
  });
}
