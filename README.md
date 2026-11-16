# dsh-taskflow

[简体中文](https://github.com/Oak-liuhj/dsh-taskflow/blob/main/README.md) · [English](https://github.com/Oak-liuhj/dsh-taskflow/blob/main/README_en.md)

[![npm version](https://img.shields.io/npm/v/dsh-taskflow)](https://www.npmjs.com/package/dsh-taskflow)
[![GitHub stars](https://img.shields.io/github/stars/Oak-liuhj/dsh-taskflow?style=social)](https://github.com/Oak-liuhj/dsh-taskflow)

**面向持久任务计划与多层子会话协作的 [DeepSeek Harness](https://www.deepseek.com/harness/) 智能任务编排插件。**

[`dsh-taskflow`](https://www.npmjs.com/package/dsh-taskflow) 将主会话的目标组织为持续保留的任务树，让你看到要做什么、由哪个会话执行，以及哪些事项已经完成。

- **持久任务清单** — 模型根据请求复杂度规划事项，使用独立任务账本保存；对话换轮、页面刷新和宿主重启不会自动清空计划。
- **按需递归委派** — 简单事项在负责会话完成，复杂且独立的事项创建子会话；子会话可在深度与并发限制内继续拆分。
- **完成自动通知** — 子会话返回有效完成结果后，自动勾选对应事项并通知直接父会话，无需主会话再次核对。
- **对话增量维护** — 在当前执行或选中的任务下增补事项，也可在主会话明确指定目标父任务；支持修改要求、取消和调整顺序。
- **层级任务导航** — 在右侧按层级查看清单、进度、执行状态和任务详情，跳转到对应执行会话。
- **按需工具视图** — 浏览器、文件、命令或插件工具实际调用后，可在会话左侧展示对应页面或输出；工具区默认关闭。

![任务导航与会话](https://raw.githubusercontent.com/Oak-liuhj/dsh-taskflow/main/docs/screenshots/desktop.png)

*截图来自固定响应模型的开发验收环境。*

## 安装 / 更新

### 在 DeepSeek Harness 网页版或桌面版中安装

打开 **Plugins / 插件** → **Add plugin / 添加插件**，搜索 `dsh-taskflow`。如果结果中出现仓库 `Oak-liuhj/dsh-taskflow`，选择对应条目安装；尚未检索到时，可使用下方 CLI 按 npm 包名安装。

安装后按宿主提示重载对应 profile。插件需要宿主提供模型、工具与 `spawn` 子会话能力；桌面端需提供相同的 Web 渲染层服务。

### 使用 `dsh` CLI 安装或更新

```sh
dsh plugin --profile web add dsh-taskflow@latest
```

需要固定当前版本时：

```sh
dsh plugin --profile web add dsh-taskflow@0.1.1
```

将 `web` 替换为实际 profile 名称。已通过 npm 包名安装的用户，也可在插件详情点击 **重新检查**，选择兼容版本后点击 **更新**，按宿主提示重启或重载。

## 使用方法

在主会话描述目标，模型会为需要多个步骤、工具或独立执行的请求规划任务；短问答无需建立计划。

| 入口 | 可以做什么 |
| --- | --- |
| **任务导航** | 查看持久任务树、完成进度与执行状态；在全局计划和当前会话之间切换，筛选、折叠及跳转任务。 |
| **主会话** | 创建计划、调整整体要求，或明确指定在哪个子任务下增补事项。 |
| **子任务会话** | 执行负责的事项；必要时拆分下级任务，完成后向直接父会话报告。 |
| **任务详情** | 查看要求、完成标准和结果；增补、修改、继续执行、取消及调整同级顺序。 |
| **会话左侧工具区** | 按需展示实际工具页面或输出，支持关闭；窄屏可切换对话与工具。 |

## ✅ 任务导航 — 一份跨轮保留的清单

在会话顶部点击 **任务导航**，或在右侧栏选择对应入口。已有计划时，面板按父子层级展示事项，不额外划分规划、决策或核对分类。

| 内容 | 解答的问题 |
| --- | --- |
| **完成进度** | 整份计划完成了多少事项。 |
| **全局计划 / 当前会话** | 查看完整任务树，或聚焦当前会话负责的部分。 |
| **事项状态** | 哪些事项待执行、执行中、已完成、暂停、失败或已取消。 |
| **稳定任务 ID** | 在对话中准确引用同一事项，避免同名任务混淆。 |
| **执行会话** | 当前事项在本会话完成，还是交由独立子会话处理。 |
| **任务详情与动态** | 查看要求、完成标准、执行结果及历史变更。 |

点击任务标题可聚焦事项或打开对应执行会话；通过折叠和筛选查看较长的计划。

## 🧩 子会话协作 — 按任务复杂度拆分

例如，在主会话输入：

```text
开发知识库导入模块，先规划任务，复杂且独立的部分分配子会话。
```

模型结合复杂度与独立性选择执行方式：简单或需要共享上下文的事项留在负责会话；适合独立处理的复杂事项创建子会话。子会话可以继续拆分下级，达到深度上限后在负责会话内完成。

子会话返回有效的结构化完成结果后，插件更新对应事项，并通知它的直接父会话。任务要求和本次执行 ID 会参与校验，旧结果不能覆盖修改后的要求；父会话可据此继续剩余工作。

## ✏️ 增补与修改 — 在原计划上继续推进

通过对话明确要调整的任务：

```text
在当前任务下新增一个移动端检查。
在 T-005 下新增一个 PDF 导入检查。
修改 T-003 的要求，增加失败重试和错误提示。
取消 T-006，保留历史。
继续执行 T-003。
```

默认增补到当前执行或选中的事项；主会话也可指定父任务 ID 或唯一完整名称。未定位当前事项时，新增到根计划；名称存在歧义时需要进一步定位。

![任务详情与操作](https://raw.githubusercontent.com/Oak-liuhj/dsh-taskflow/main/docs/screenshots/task-detail.png)

详情中的 **增补下级事项**、**修改要求** 和 **在会话中继续** 会预填当前会话输入框，发送后由模型执行。**取消任务** 和 **上移 / 下移** 可直接操作。向已完成任务增补下级时，会重新打开该任务及已完成祖先，并保留历史报告。

## 🖥️ 工具视图 — 需要操作时再展示

![会话左侧工具视图](https://raw.githubusercontent.com/Oak-liuhj/dsh-taskflow/main/docs/screenshots/desktop-tool.png)

工具区默认关闭。模型实际调用宿主的浏览器、文件、命令或其他插件工具时，可在会话左侧显示本次实际地址或输出；不再需要时可关闭。

浏览器自动化、终端和编辑能力由宿主或相应插件提供。默认网页视图使用受限 iframe，部分网站会因 CSP、登录或跨域策略无法嵌入。其他客户端插件可通过 `taskflowViews.register(kind, Component)` 注册专用渲染器，见[架构说明](https://github.com/Oak-liuhj/dsh-taskflow/blob/main/docs/architecture.md)。

## ⚙️ 设置

在所用 profile 的插件配置中调整，默认配置见 [cordis.patch.yml](https://github.com/Oak-liuhj/dsh-taskflow/blob/main/cordis.patch.yml)。

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `autoPlan` | `true` | 引导模型为复杂请求自动规划；关闭后需明确要求创建计划。 |
| `maxDepth` | `2` | 最大委派深度，根会话为 0；可设 0–8。 |
| `maxConcurrent` | `2` | 全树同时执行的委派名额；父任务等待下级时释放名额；可设 1–16。 |
| `maxTasks` | `200` | 每份计划的事项上限；可设 1–2000。 |
| `provider` | `spawn` | 宿主已注册的子会话提供者。 |
| `dataDir` | `${DSH_HOME}/taskflow` | 任务账本目录；未设置环境变量时为 `~/.dsh/taskflow`。 |

## 注意事项

- **兼容性** — 当前版本 **0.1.1**，要求 Node.js **≥24.9.0**；DSH 兼容声明为 `>=0.2.1-rc.3 <1.0.0-0 || >=0.2.2-0 <1.0.0-0 || >=0.2.3-0 <1.0.0-0 || >=0.3.0-0 <1.0.0-0`。宿主需启用 `tools`、`agents`、`sessions`、`systemPrompt`、`subagents` 及相应客户端服务。
- **规划与执行** — 自动规划由模型提示引导，具体拆解和工具选择取决于宿主模型。任务账本独立于 `todo_write`，后续对话通过增量操作维护原计划。
- **数据与恢复** — 同一 `dataDir` 只允许一个活跃写入者。停止宿主后备份整个目录；完整迁移还需备份原生 DSH 会话。中断时仍在执行的任务恢复为暂停，从负责会话继续；卸载插件保留账本数据。
- **验证范围** — 已通过 30 项自动化测试、12 个版本边界检查，以及 `0.2.1-rc.3`、`0.2.2-rc.2`、`0.2.2-rc.3` 的固定响应模型集成测试。完整原生 profile、真实模型与第三方工具仍需验收，详见[验收记录](https://github.com/Oak-liuhj/dsh-taskflow/blob/main/docs/acceptance.md)。
- **语言** — 插件说明提供简体中文和英文；任务导航界面当前以中文显示。

## 喜欢它？

欢迎在 [GitHub](https://github.com/Oak-liuhj/dsh-taskflow) 点亮 ⭐，或提交 [Issue](https://github.com/Oak-liuhj/dsh-taskflow/issues) / PR。反馈时请附插件与 DSH 版本、profile 类型、复现步骤及脱敏日志。

开发与贡献请参阅[开发说明](https://github.com/Oak-liuhj/dsh-taskflow/blob/main/docs/DEVELOPMENT.md)和[发布说明](https://github.com/Oak-liuhj/dsh-taskflow/blob/main/docs/PUBLISHING.md)。

## 许可证

原创代码采用 [Apache-2.0](https://github.com/Oak-liuhj/dsh-taskflow/blob/main/LICENSE)，复用的 DeepSeek 界面样式和图标保留 MIT 许可，详见 [NOTICE](https://github.com/Oak-liuhj/dsh-taskflow/blob/main/NOTICE) 与 [DeepSeek-MIT.txt](https://github.com/Oak-liuhj/dsh-taskflow/blob/main/licenses/DeepSeek-MIT.txt)。仓库 PRD 内嵌字体按 OFL-1.1 分发，字体与完整 PRD 不进入 npm 运行包。本项目为社区插件。
