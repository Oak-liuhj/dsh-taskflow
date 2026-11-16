# npm 与插件市场发布准备

本文件记录 0.1.0-alpha.1 的发布候选准备，不代表已经发布。最后核对日期：2026-11-14。

## 规则与当前外部状态

依据 [awesome-dsh-plugin 贡献指南](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md) 的当前内容，通过 GitHub API 读取核对：

- 投稿是 `data/plugins/<owner>__<repo>.yml` 单个文件，必须指向真实代码仓库；`dsh.bundle.patch` 和 patch 文件是安装条件，只有 `dsh.client` 不够。
- 仓库需创建满一天并添加 `dsh-plugin` topic。描述准确、分类贴合实际。本插件选 `workflow`。
- 市场图标只接受 GitHub 托管的 PNG/JPEG/WebP 等位图，不接受 SVG。准备了 180×180 `assets/icon.png`，同时保留 SVG 源。
- 在自己的仓库根提供 `screenshots.json`，声明 1–8 张相对路径截图。本仓库选择 5 张明确标为开发验收环境的截图。
- npm 是独立渠道，目录通过 published package 的 `repository` 自动关联，不允许在 YAML 增加 `npm:` 字段。不要手改目录仓库生成的 README。

本次只读查询结果：

| 项目 | 当前状态 | 发布前动作 |
| --- | --- | --- |
| GitHub 仓库 | 公开，创建于 2026-11-13 14:49:50 UTC | 北京时间 2026-11-14 22:49:50 起满足一天要求 |
| 远端 `main/package.json` | API 返回 404 | 推送完整源码、构建产物及素材后复核 |
| 仓库 topics | 当前为空 | 添加 `dsh-plugin` |
| npm `dsh-taskflow` | 官方 registry 查询返回 404 | 尚无可见公共包；名称权限仍以发布时结果为准 |
| DSH npm 标签 | `latest=0.2.2-rc.1`，`next=0.2.2-rc.3` | 本候选只声明已测 rc.2，不因标签变化扩大兼容范围 |
| npm 账号、包权限和 2FA | 本次未验证 | 发布者在本机完成认证，不将凭据写入仓库 |

这些是查询时的状态，正式发布前应重新核对。没有推送、发布 npm、创建 Release 或提交市场 PR。

## 本地已完成

- 领域、调度、存储、宿主适配及客户端组件分层；根入口、配置 ID 和账本 schema 不变。
- 明确服务端必需 peer 与浏览器宿主 optional peer；编译器、测试夹具和 YAML 校验库只在开发依赖中。
- npm 使用显式文件白名单：生产入口、运行 `.mjs`、图标、locale、用户详情、README、CHANGELOG、NOTICE 和许可。
- 完整 PRD、开发截图、JSX/CSS 源、脚本、测试、市场投稿草稿和本地账本不进入 npm 包。源码仍保留在 GitHub；用户安装无需构建。
- 提供 PNG、双语插件元数据与详情、5 张截图声明、`workflow` 投稿 YAML 及正文草稿。
- 客户端构建内保留完整 MIT 归属，单独提供 DeepSeek MIT 与 Montserrat OFL 文本。
- `build:check` 验证生成物一致；`check:release` 验证元数据、入口、直接导入依赖、许可、图标、截图和 YAML。
- `check:package` 对实际 tgz 做独立目录生产安装、导入与 ModuleLoader 检查，并以安装包运行真实 DSH AgentLoop 集成测试；生成 `dist/package-report.json` 和 SHA-256。
- 新增 Linux / Windows CI 验证工作流，只检查并上传候选包，不自动发布。远端 CI 尚未执行。
- 收紧 RPC 边界，拒绝缺少 peer 的请求，并增加回归验证。

本次候选包约 **44 KB**，之前含原型与截图的包约 **504 KB**，减少约 **91%**。最终字节数、文件清单与 SHA-256 以 `dist/package-report.json` 为准。

## 发布前验证

```sh
npm ci --ignore-scripts
npm run build
npm run check
npm run check:package
```

打包流程没有安装期构建脚本。`check:package` 会调用 `npm pack --ignore-scripts`，所以必须先通过 build/check；独立安装默认优先离线缓存，缓存不足时才访问 registry。候选包的压缩上限为 128 KiB，解包上限为 512 KiB，超出会失败以提醒审查。

还需在**独立 rc.2 profile** 安装候选 tgz，检查原生插件页的标题/图标/详情、右侧槽位、左侧工具 portal、真实模型多轮规划及子会话。不要拿本地验收外壳代替这一步。生产 profile 的数据和配置应保留，原始账本不因结构重排而迁移。

测试的证据和限制见 [acceptance.md](./acceptance.md)。本地通过不代表完整宿主、Linux CI、第三方工具或市场审核已经通过。

## 对外发布顺序

1. 完成上述宿主验收；审查 Git 差异，提交全部移动后的模块、锁文件、生成物、文档和素材，再推送 GitHub。确认远端 CI 通过、链接可访问，并添加 `dsh-plugin` topic。
2. 再次确认版本未被发布。当前是预发行 `0.1.0-alpha.1`，保持 npm `alpha` 标签，不推入 `latest`。
3. 使用**已经通过实际安装测试的同一个 tgz** 发布。示例为 PowerShell；认证由发布者在本机完成：

   ```powershell
   npm whoami --registry=https://registry.npmjs.org/
   $taskflowArchive = (Resolve-Path 'dist/dsh-taskflow-0.1.0-alpha.1.tgz').Path
   npm publish "$taskflowArchive" --tag alpha --access public --registry=https://registry.npmjs.org/ --ignore-scripts
   npm view dsh-taskflow@0.1.0-alpha.1 version repository dist --json --registry=https://registry.npmjs.org/
   ```

   `publishConfig.tag` 也已设置为 `alpha`。不要把 npm 安全凭据或验证码存入源码、日志和 PR。具体认证方式以 npm 当前账号政策及提示为准。
4. 匿名从官方 registry 下载精确版本，核对 tarball SHA-256 与本地候选一致；在独立 profile 按精确版本安装验证。新包的镜像、缓存或宿主最小发布时间窗口可能导致短时不可见，应分别核对。
5. 创建 GitHub **预发行** `v0.1.0-alpha.1`，上传同一 tgz、SHA256SUMS 和包验证报告，更新 CHANGELOG 的实际发布日期与验证状态。
6. 向目录仓库提交 `marketplace/Oak-liuhj__dsh-taskflow.yml`，正文草稿见 [SUBMISSION.md](../marketplace/SUBMISSION.md)。只新增自己的条目。当前 YAML 通过仓库安装入口，不预设尚不存在的 Release 下载地址；如果后续改为 tarball，应先验证固定标签地址及包哈希，再按目录当时 schema 调整。
7. 分别记录 npm 可见、Release 可下载、收录 PR、维护者合并、目录刷新、市场可搜索及可安装的结果。任一步成功不能替代其他步骤。

## 后续版本

npm 已发布版本不可原地覆盖；修复后递增版本并重新生成候选包。保持包名、根导出、ModuleLoader ID、Cordis 插件 ID 与数据目录稳定。扩大 `engines.dsh` 前执行对应宿主版本的隔离安装和界面测试，不通过 `--force` 跳过兼容检查。

从 alpha 转为正式版时，明确调整版本、publishConfig.tag、文档及 CHANGELOG；不要只把未经额外验收的预发行重标为稳定版。
