# 市场投稿草稿

目标文件：`awesome-dsh-plugin/awesome-dsh-plugin` 仓库的 `data/plugins/Oak-liuhj__dsh-taskflow.yml`。
复制本目录的同名 YAML，只新增本条目；不要改目录仓库生成的 README。

PR 标题：`Add Oak-liuhj/dsh-taskflow`

PR 正文草稿：

Adds dsh-taskflow 0.1.0, a DSH workflow plugin declaring support from
0.2.1-rc.3 up to (excluding) 1.0.0 prereleases and releases. It keeps a persistent
hierarchical task ledger, delegates independent work to nested sessions when
needed, and notifies the direct parent on completion without a review gate.

The repository declares a dsh.bundle patch, ships compiled client code, a
raster icon and screenshots.json. The screenshots show the labelled local
fixture host. Real AgentLoop integration uses a deterministic model adapter;
full-profile and production-model acceptance remain documented limitations.

No other catalog entries or generated READMEs are changed.

提交前需推送真实源码与素材，补齐仓库 `dsh-plugin` topic，并按 docs/PUBLISHING.md 完成宿主安装验收。本文只是草稿，未提交 PR。
