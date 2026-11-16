import { defineTool } from '@deepseek-ai/dsh-tools';

const string = description => ({ type: 'string', description });
const json = description => ({ type: 'json', description });
const number = description => ({ type: 'number', description });
const required = schema => ({ ...schema, required: true });
const jsonOutput = { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] };
const taskHelp = '任务数组。每项 title/instructions/criteria、complexity:low|medium|high、independent:boolean、mode:inline|delegate；可选 ref 为本批次临时引用，parentId 和 dependsOn 可引用该 ref 或现有任务 ID。';


/** 把模型工具映射到领域服务；不在此保存任务状态。 */
export function registerTools(ctx, service, runtime) {
  const register = (toolName, description, parameters, execute) => ctx.tools.register(defineTool({
    name: toolName, description, parameters, output: jsonOutput,
    async execute(args, exec) { if (!exec.agent) throw new Error('Taskflow 需要会话上下文'); if (exec.signal.aborted) throw exec.signal.reason; return (await execute(args, exec.agent.session.id, exec)) ?? { ok: true }; },
    presentCall: () => ({ card: 'generic', title: description.split('。')[0] }), presentResult: () => ({ card: 'generic' }),
  }));
  register('taskflow_plan', '规划并保存当前会话的持久层级待办。已有计划不能覆盖；子会话请用 taskflow_add。', { title: required(string('计划标题')), goal: required(string('用户目标与约束')), tasks: required(json(taskHelp)) }, (a, sid) => service.create(sid, a));
  register('taskflow_status', '读取整个持久计划、当前任务、版本和工具视图。不会重置计划。', {}, (_a, sid) => service.view(sid));
  register('taskflow_add', '在当前任务或明确指定父任务下增补待办。目标歧义会拒绝，不改变其他事项。', { tasks: required(json(taskHelp)), parentId: string('可选父任务 ID 或完整名称；不填则为当前任务'), expectedVersion: number('可选计划版本，防止并发增补冲突') }, (a, sid) => service.add(sid, a.tasks, a.parentId, a.expectedVersion));
  register('taskflow_update', '增量修改任务要求。递增版本，中止旧执行；不会重写整棵树。', { taskId: required(string('任务 ID')), version: required(number('当前任务版本')), patch: required(json('仅允许 title/instructions/criteria/complexity/independent/mode/parentId/dependsOn')) }, (a, sid) => service.update(sid, a.taskId, a.patch, a.version));
  register('taskflow_reorder', '调整同级事项顺序，保留任务 ID、执行状态和历史。', { taskId: required(string('任务 ID')), direction: required(number('-1 上移，1 下移')), expectedVersion: required(number('当前计划版本')) }, (a, sid) => service.reorder(sid, a.taskId, a.direction, a.expectedVersion));
  register('taskflow_cancel', '取消任务及其下级，保留历史会话与已交付记录。取消不等于完成。', { taskId: required(string('任务 ID')), version: required(number('当前任务版本')) }, (a, sid) => service.cancel(sid, a.taskId, a.version));
  register('taskflow_start', '启动事项。inline 留在负责会话，delegate 排队并自动创建子会话；可递归。', { taskId: required(string('待启动的任务 ID')) }, (a, sid) => service.start(sid, a.taskId));
  register('taskflow_wait', '等待当前任务下级的执行结果，释放本层并发名额；返回后继续本层工作。', { taskId: required(string('本会话正在执行的任务 ID')) }, (a, sid, exec) => runtime.wait(sid, a.taskId, exec.signal));
  register('taskflow_complete', '保存行内事项的真实执行结果并立即勾选、通知直接父任务。委派任务通过最终结构化输出完成。', { taskId: required(string('任务 ID')), version: required(number('执行要求版本')), attemptId: required(string('taskflow_start 返回的 attempt.id')), summary: required(string('实际完成结果、证据或阻塞原因')), status: string('completed（默认）/blocked/failed') }, (a, sid) => service.settle(sid, a.taskId, a.attemptId, a.version, { status: a.status ?? 'completed', summary: a.summary }));
  register('taskflow_open_view', '按需在会话左侧显示实际工具页面或输出；该工具本身不执行浏览器、命令或文件操作。', { kind: required(string('browser/editor/terminal/plugin/orchestration')), title: string('当前工具标题'), url: string('实际 HTTP(S) 页面地址，可选'), content: string('实际工具输出或文件内容，可选') }, (a, sid) => service.openView(sid, a));
}
