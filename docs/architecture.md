# 架构与工具协议

## 组件

```mermaid
flowchart LR
  Main[主会话模型] --> Tools[taskflow 工具]
  Tools --> Service[TaskService 权威任务树]
  Service --> Store[FileStore 原子文件账本]
  Service --> Scheduler[TaskRuntime 队列与并发]
  Scheduler --> Spawn[DSH subagents.startActivation]
  Spawn --> Child[真实子会话]
  Child --> Tools
  Child --> Result[最终结构化结果]
  Result --> Service
  Service --> Outbox[持久完成通知]
  Outbox --> DirectParent[直接父会话 steer]
  Service --> RPC[所有者 RPC]
  RPC --> UI[层级清单与左侧工具视图]
```

`src/domain` 负责状态与归属规则；`src/application` 负责全树调度；`src/storage` 负责账本和事务；以上层无 DSH 依赖。`src/server` 分模块适配 rc.2 工具、配置、系统提示、Agent 事件、完成通知与所有者 RPC。`src/client` 使用会话槽位渲染导航，通过隔离 portal 展示左侧工具区。`scripts/dev` 是独立验收环境，不是生产入口。

## 数据和归属

`taskflow.json` 保存 schema、全局修订号、plans、会话到计划的映射与通知 outbox。一个计划包含稳定 UUID、根会话 ID、任务字典、各会话当前任务、工具视图、事件记录。任务采用递增 `T-001` ID，标题修改与同级排序不改变 ID。

任务父子关系与依赖关系分开建模。负责会话是直接父任务的执行会话；父任务尚未委派时向上回退到实际负责会话。行内任务复用负责会话；委派任务使用独立原生子会话，并在启动前持久化绑定。子会话只能改自己负责的子树，主会话可以操作整棵树。

任务版本描述当前要求，attempt UUID 描述一次执行。提交结果必须同时匹配两者及执行会话。更新要求会中止旧执行、递增版本；原报告和尝试号保留用于历史。完成后再增补下级会重新打开已完成祖先。取消保留记录和会话，不满足依赖的“已完成”条件。

## 状态

```mermaid
stateDiagram-v2
  pending --> queued: 委派启动
  pending --> running: 行内启动
  queued --> running: 分配并发名额和子会话
  running --> awaiting_children: 等待下级，释放名额
  awaiting_children --> running: 下级报告，恢复本层
  running --> completed: 有效结果且下级已结束
  running --> failed: 运行错误
  running --> blocked: 缺少输入
  running --> paused: 要求变更或宿主中断
  queued --> paused: 宿主中断
  completed --> pending: 新增下级
  pending --> cancelled: 用户取消
```

图仅列主要转换；所有未取消状态均可按约束更新、取消。父任务必须完成自身剩余工作才能提交结果，等待下级不构成额外审核。等待接口返回未启动的行内事项，模型继续处理，避免等待自己的工作而死锁。深度上限在启动时同步判定，转行内执行并在工具返回中告知模型。

## 模型工具

| 工具 | 参数与用途 |
| --- | --- |
| `taskflow_plan` | `title, goal, tasks`；仅首次创建，不覆盖已有计划 |
| `taskflow_status` | 读取完整计划、当前任务、版本与工具视图 |
| `taskflow_add` | `tasks, parentId?, expectedVersion?`；增补当前或指定任务 |
| `taskflow_update` | `taskId, version, patch`；增量修改要求、模式、归属、依赖 |
| `taskflow_cancel` | `taskId, version`；取消完整子树 |
| `taskflow_reorder` | `taskId, direction, expectedVersion`；同级上移 -1 / 下移 1 |
| `taskflow_start` | `taskId`；返回版本、模式、attempt 等实际执行信息 |
| `taskflow_wait` | `taskId`；释放本层委派名额，等待下级运行结束 |
| `taskflow_complete` | 行内任务提交 `taskId, version, attemptId, status?, summary` |
| `taskflow_open_view` | `kind, title?, url?, content?`；展示实际页面或输出 |

任务输入支持 `title / instructions / criteria / complexity / independent / mode / parentId / dependsOn`。同批次 `ref` 可用于父级与依赖引用，支持前向引用。`complexity` 为 low / medium / high，未指定模式时，中高复杂度且独立的任务委派，其他行内执行。`patch` 可修改 title、instructions、criteria、complexity、independent、mode、parentId、dependsOn；执行模式的变更需显式提供 mode。

委派任务最终必须通过 DSH 原生结构化输出提交：

```json
{ "status": "completed", "summary": "实际完成结果与可追溯证据" }
```

也可以返回 `blocked / failed`，不会勾选完成。没有有效结构化结果、宿主停止原因异常或下级未结束时，任务不会误报完成。

## 持久化和通知

所有修改串行事务执行；临时文件写入、fsync、rename 成功后才发布内存状态。单写入进程锁避免两个宿主同时覆盖。状态损坏会拒绝启动并保留原文件，不会用空状态覆盖。重启保留完成项，将中断任务暂停，不自动重跑。

完成状态与 outbox 同一事务提交。通知以计划、任务、版本、attempt 的组合去重；Agent 收件箱和会话历史中的确定消息 ID 再次去重，送达后 flush 会话。父会话不在线或持久化失败则保留重送；旧版本待送通知作废。此实现不承诺外部浏览器、终端命令的业务操作恰好执行一次，重试前需依据实际环境确认。

## 客户端与扩展

所有者专用 `/api` RPC：`taskflow/view`、`taskflow/action`。界面每 1.2 秒同步，不使用浏览器本地缓存作为权威数据。切换会话防止旧请求污染新视图，单次轮询不重叠。界面所有文本按 React 文本渲染，不解释 HTML。

原生 `sidebar.right.pane.tab` 槽位按注册定义 ID 挂载；头部入口使用 `conversation.session.header.utilities`。增补、修改、继续通过本会话输入 facade 预填并聚焦，用户发送后交给模型；取消和排序直接作为用户界面操作提交。

左侧工具 DOM 兼容层限定 rc.2 的 `[data-conversation-content]`、`data-conversation-session`、`data-content-phase`，只插入自己的节点和类名，不移动宿主内容。会话切换和卸载清理。没有目标节点时观察 DOM 等待出现，Hero 阶段不挤占布局。

可选注册专用工具渲染器：

```jsx
const dispose = ctx.taskflowViews.register('browser', ({ tool, sessionId }) => (
  <YourBrowserController taskId={tool.taskId} sessionId={sessionId} url={tool.url} />
));
```

渲染器的浏览器控制、权限与交互由对应插件负责。本版默认渲染器只预览页面和文本，拒绝 javascript/file URL 和含凭据的地址。

### 原型样式来源

`npm run build` 与开发服务启动时执行 `scripts/prd-assets.mjs`。脚本读取仓库内保留的 PRD，生成 `src/client/generated` 内的组件作用域 CSS、SVG 路径与 Fish 标志。完整宿主只注入这些组件样式，不注入原型的全局 app/sidebar/composer 规则。`styles.css` 负责宿主隔离、工具 portal 和断点适配。

验收外壳另以 `/prototype.css` 加载 PRD 的完整布局样式；`/prototype` 返回原始 PRD。外壳在窄屏通过区域标签切换，不改变宿主原有侧栏。任务详情在 document.body 使用原生模态 dialog，Escape、关闭按钮及遮罩外点击均可退出，避免把详情覆盖在右侧任务树内。
