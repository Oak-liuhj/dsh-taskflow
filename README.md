# dsh-taskflow · 智能任务编排

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供持久任务树、按需子会话与自动完成通知。在主会话描述目标，由模型根据任务复杂度规划清单；执行进度与会话保持关联，跨轮对话继续沿用同一份计划。

[安装](#安装) · [使用](#使用) · [配置](#配置) · [数据与恢复](#数据与恢复) · [开发](#开发) · [问题反馈](https://github.com/Oak-liuhj/dsh-taskflow/issues)

## 功能

- **持久任务清单**：独立于 `todo_write` 保存计划、稳定任务 ID、层级、状态与执行历史，对话换轮、页面刷新和宿主重启不会自动清空。
- **按需递归委派**：简单事项在负责会话执行；复杂且独立的事项通过宿主 `spawn` 创建子会话，可在深度和并发限制内继续拆分为孙子会话。
- **完成自动通知**：子会话提交有效完成结果后，自动勾选对应事项并通知直接父会话，无需主会话再做结果核对。
- **增量维护计划**：通过父任务会话增补、修改、取消或调整事项；默认增补到当前执行或选中任务，也可在主会话明确指定目标父任务。
- **层级任务导航**：右侧直接展示任务树，支持进度、折叠、筛选、详情与执行会话跳转。
- **按需工具视图**：工具实际调用后，在会话左侧展示网页或输出；支持关闭，窄屏可切换工具与对话。

![任务导航与会话](https://raw.githubusercontent.com/Oak-liuhj/dsh-taskflow/main/docs/screenshots/desktop.png)

截图来自标注“固定响应模型”的开发验收环境，复用 [PRD 原型](https://github.com/Oak-liuhj/dsh-taskflow/blob/main/docs/prototype/dsh-taskflow-prd.html) 样式。原生宿主安装与真实模型验证范围见[版本与验证](#版本与验证)。

## 环境与宿主要求

| 项目 | 要求 |
| --- | --- |
| DSH | 下方完整 SemVer 范围，最低 `0.2.1-rc.3`，排除 `1.0.0` 及其预发行版本 |
| Node.js | `>=24.9.0` |
| 服务端服务 | `tools`、`agents`、`sessions`、`systemPrompt`、`subagents` |
| 子会话提供者 | 已注册的 `spawn`；可通过 `provider` 配置调整 |
| 客户端 | DSH Web 渲染层的会话、工作区、右侧栏、布局和连接模块 |

`package.json` 声明的宿主范围：

```json
{
  "engines": {
    "node": ">=24.9.0",
    "dsh": ">=0.2.1-rc.3 <1.0.0-0 || >=0.2.2-0 <1.0.0-0 || >=0.2.3-0 <1.0.0-0 || >=0.3.0-0 <1.0.0-0"
  }
}
```

兼容性提示中的 `∩` 表示范围交集，不是 npm SemVer 语法；上面保留各个 `||` 分支，使用可写入包清单的表达式。DSH 的宿主检查启用 `includePrerelease: true`，在该规则下，这些分支的并集等价于 `>=0.2.1-rc.3 <1.0.0-0`。安装判定以实际发布包的 `engines.dsh` 为准，README 不会改变宿主检查结果。

DSH 桌面端如使用上述 Web 渲染层，也需要同样的客户端服务。完整桌面安装尚未完成验收。版本范围为安装兼容声明，已运行测试的具体宿主见[版本与验证](#版本与验证)。

## 安装

### 插件市场

市场收录后，搜索 `dsh-taskflow`，核对仓库为 `Oak-liuhj/dsh-taskflow`，选择与当前宿主兼容的正式版本，安装至使用中的 profile。

### DSH CLI

正式版发布到 npm 后，安装 `latest` 标签对应的版本：

```sh
dsh plugin --profile web add dsh-taskflow@latest
```

需要固定版本时，将 `latest` 替换为已经发布的版本号。也可以安装经过验证的本地发布包，例如将以下路径替换为实际 `.tgz` 文件路径：

```sh
dsh plugin --profile web add /absolute/path/to/dsh-taskflow.tgz
```

将 `web` 替换为实际 profile 名称，按宿主提示重载该 profile。插件使用 `dsh.bundle.patch` 注册服务端入口，并通过 `dsh.client` 加载编译后的界面；安装用户无需在插件目录编译源码。

插件依赖 DSH 提供模型、会话和执行工具。浏览器、终端、编辑器等操作能力需要由宿主或相应插件提供。

## 检查与更新

通过 npm 包名安装后，DSH 插件管理器可查询注册表的新版本。打开插件详情，点击“重新检查”，选择兼容版本并点击“更新”；宿主会再次校验版本要求，并在需要时提示重启。正式版更新默认优先推荐兼容、未弃用的稳定版本，预发行版需展开相应选项。

也可使用 DSH CLI 更新：

```sh
dsh plugin --profile web add dsh-taskflow@latest
```

将 `latest` 替换为已发布的确切版本号可固定版本。Git、本地目录和 `.tgz` 安装不走宿主的 npm 注册表版本检测，应手动安装新的来源。Taskflow 使用宿主更新机制，无需额外更新服务。

## 使用

在主会话说明目标，模型根据复杂度创建计划：

```text
开发知识库导入模块，先规划任务，复杂且独立的部分分配子会话。
```

后续通过自然语言维护同一份任务树：

```text
在当前任务下新增一个移动端检查。
在 T-005 下新增一个 PDF 导入检查。
修改 T-003 的要求，增加失败重试和错误提示。
取消 T-006，保留历史。
继续执行 T-003。
```

首次规划通过 `taskflow_plan` 创建计划，后续对话只做增量变更。默认在当前执行或选中事项下增补；未定位到当前事项时，新增到根计划。主会话可指定父任务 ID 或唯一完整名称，名称存在歧义时需要进一步定位。

复杂事项创建执行子会话，简单事项可在负责会话内完成。子会话结束时，插件校验完成结果、任务版本和本次执行 ID；有效结果立即更新状态并通知直接父会话。修改要求后，旧执行结果不能覆盖新要求。

在右侧任务导航中可查看层级和进度、打开详情、跳转执行会话。增补、修改和继续操作会预填会话输入框，发送后由模型执行；取消与同级排序可直接在界面操作。向已完成事项增补下级会重新打开该事项及已完成祖先，同时保留历史报告。

## 配置

在 DSH 对应 profile 的插件配置中调整。安装默认值见 [cordis.patch.yml](https://github.com/Oak-liuhj/dsh-taskflow/blob/main/cordis.patch.yml)。

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `dataDir` | `${DSH_HOME}/taskflow`；未设环境变量时为 `~/.dsh/taskflow` | 持久任务账本目录 |
| `maxDepth` | `2` | 最大委派深度；根会话为 0，达到上限后转为负责会话内执行；可设 0–8 |
| `maxConcurrent` | `2` | 调度器同时执行的委派名额；父任务等待下级时释放名额；可设 1–16 |
| `maxTasks` | `200` | 每份计划的事项上限；可设 1–2000 |
| `autoPlan` | `true` | 引导模型为复杂任务自动规划；设为 `false` 后需明确要求创建计划 |
| `provider` | `spawn` | 宿主已注册的子会话提供者名称 |

`autoPlan` 通过模型提示引导规划，实际拆解与工具选择受模型能力和用户指令影响。

## 数据与恢复

任务账本独立存储，原生对话记录由 DSH 管理。同一个 `dataDir` 只允许一个活跃宿主写入。

- **备份**：停止宿主后备份整个 `dataDir`，保留计划、完成报告与待送通知。
- **迁移**：除任务账本外，同时备份和恢复对应的 DSH 原生会话数据，以保留会话跳转关系。
- **中断恢复**：恢复已有计划；中断时仍在执行的事项转为暂停，需要从负责会话继续。
- **卸载**：保留任务数据；需要清理时，先停止宿主并完成备份，再手动删除对应账本目录。

## 工具视图与限制

工具由宿主执行，Taskflow 根据实际工具调用在会话左侧展示地址或输出。默认网页视图采用受限 iframe；网站的 CSP、登录和跨域策略可能阻止嵌入。需要交互控制时，应使用宿主浏览器工具提供的能力。

右侧任务面板通过宿主槽位注册；左侧工具区通过隔离 DOM portal 挂载，会话切换和卸载时清理。该区域依赖宿主页面结构，升级宿主后需要复核。其他客户端插件可通过 `taskflowViews.register(kind, Component)` 注册专用渲染器，见[架构说明](https://github.com/Oak-liuhj/dsh-taskflow/blob/main/docs/architecture.md)。

## 版本与验证

当前版本为 **0.1.1**，npm 正式版发布标签为 `latest`。源码、锁文件、运行依赖范围与发布校验使用同一宿主兼容声明。npm 发布和插件市场收录状态以各渠道实际结果为准；本地构建成功不代表已经对外发布。

本版验证包括 **30 项自动化测试**，覆盖领域规则、持久化、调度、客户端、正式版元数据与真实 AgentLoop 的固定响应模型集成。最终 `.tgz` 在独立目录生产安装；宿主矩阵覆盖 **0.2.1-rc.3、0.2.2-rc.2、0.2.2-rc.3**，每个环境安装对应精确宿主依赖，验证模型规划、子会话、孙子会话、结构化完成与直接父通知。具体证据见[验收记录](https://github.com/Oak-liuhj/dsh-taskflow/blob/main/docs/acceptance.md)，包哈希与矩阵结果由发布产物中的报告绑定。

上述结果不代表完整目标版本范围均已运行验证。正式版发布前，仍需完成目标宿主的独立 profile 安装、原生界面、真实模型规划与第三方工具验收；截图中的开发环境不能替代这些检查。

## 开发

```sh
git clone https://github.com/Oak-liuhj/dsh-taskflow.git
cd dsh-taskflow
npm ci --ignore-scripts
npm run build
npm run check
npm run check:package
npm run dev
```

开发预览地址为 `http://127.0.0.1:4173`，`/prototype` 可查看原型对照。设置 `TASKFLOW_DEV_PORT` 可修改端口。预览使用真实 DSH AgentLoop 与固定响应模型，数据存于 `.local/dev`。

服务端按 `domain`、`application`、`storage`、`server` 分层，界面位于 `src/client`。npm 包仅包含生产入口、运行模块、必要资源和用户文档；完整源码、原型与测试保留在 GitHub。

[开发说明](https://github.com/Oak-liuhj/dsh-taskflow/blob/main/docs/DEVELOPMENT.md) · [发布说明](https://github.com/Oak-liuhj/dsh-taskflow/blob/main/docs/PUBLISHING.md) · [更新记录](https://github.com/Oak-liuhj/dsh-taskflow/blob/main/CHANGELOG.md)

## 问题反馈

请通过 [GitHub Issues](https://github.com/Oak-liuhj/dsh-taskflow/issues) 提供插件版本、DSH 版本、profile 类型、复现步骤及脱敏后的日志。涉及工具显示时，请同时说明工具提供者与页面表现。请勿提交 API 密钥、认证令牌或完整私密会话。

## 许可

原创代码采用 [Apache-2.0](https://github.com/Oak-liuhj/dsh-taskflow/blob/main/LICENSE)。复用的 DeepSeek 界面样式与图标保留 MIT 许可，详见 [NOTICE](https://github.com/Oak-liuhj/dsh-taskflow/blob/main/NOTICE) 与 [DeepSeek-MIT.txt](https://github.com/Oak-liuhj/dsh-taskflow/blob/main/licenses/DeepSeek-MIT.txt)。仓库原型内嵌的 Montserrat 字体按 OFL-1.1 分发，完整原型与字体不进入 npm 运行包。

本项目为社区插件。
