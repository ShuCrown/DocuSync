<div align="center">

<img src="public/hero.png" width="120" alt="DocuSync">

# DocuSync

**一站式文档预览 —— 多标签、分栏对比，PDF / Word / Excel / PPT / Markdown 尽在一处**

</div>

## Why

每天我们都要和 PDF、Word、Excel、PPT 这些散落在各处的文档打交道。DocuSync 把它们统一到一个干净的视图里：上传文件即可即时预览，还能多标签打开、分栏对比。无需插件、无需安装、无需账号。

## See it

| **PDF** · 全文渲染 + 页面导航 | **Word** · HTML 转换 + 目录支持 | **Excel** · 表格解析 + Sheet 标签 |
|:---:|:---:|:---:|
| ![PDF](https://img.shields.io/badge/PDF-ef4444?style=flat-square&logo=adobeacrobatreader&logoColor=white) | ![Word](https://img.shields.io/badge/Word-2b579a?style=flat-square&logo=microsoftword&logoColor=white) | ![Excel](https://img.shields.io/badge/Excel-217346?style=flat-square&logo=microsoftexcel&logoColor=white) |

| **PowerPoint** · 幻灯片预览 | **Markdown** · 语法高亮渲染 | **Split View** · 多标签分栏对比 |
|:---:|:---:|:---:|
| ![PPT](https://img.shields.io/badge/PPT-b7472a?style=flat-square&logo=microsoftpowerpoint&logoColor=white) | ![Markdown](https://img.shields.io/badge/Markdown-000000?style=flat-square&logo=markdown&logoColor=white) | ![Split](https://img.shields.io/badge/Split_View-1B365D?style=flat-square) |

## Features

- **多格式预览**：PDF、Word、Excel、PowerPoint、Markdown 一键预览；每种文件类型都有专属图标与品牌色，一眼可辨
- **多标签 + 分栏预览**：每个分栏可同时打开多个标签页；左右/上下分栏，拖动分隔条调整比例、一键交换两侧、切换分栏方向；每个分栏独立滚动与缩放，文档状态在切换标签时完整保留
- **标签页右键菜单**：关闭当前 / 关闭其他 / 关闭所有
- **最近查看**：
  - 内联展示最近 8 条，更多记录通过「更多」按钮或搜索入口打开**全量可检索列表**（VSCode Quick Open 风格：实时过滤、↑↓ 键盘选择、Enter 打开）
  - 按**预览时间**排序，最新预览过的文档自动置顶并标注预览时间（带年份）
- **记录不丢文件**：从「最近查看」移除记录仅隐藏记录本身，文件仍保留在服务器/本机，随时可从检索列表重新打开；彻底删除需**二次确认**
- **同名覆盖**：重复上传同名文件时明确提示「将覆盖旧版本」，安全顺序先传新再删旧，失败也不丢数据
- **桌面端**：Tauri 桌面应用，本地模式无需账号，文件与元数据全部存储在本机
- **在线分享**：在线模式下可将文档生成分享链接（本地模式不可用）

## Usage

```bash
# Install
npm install

# Web 前端（仅前端）
npm run dev

# 桌面端（Tauri）
npm run tauri:dev

# 部署到 Cloudflare（Worker + Pages）
npm run deploy
```

## Design

| Element | Choice |
|---------|--------|
| Frontend | React 19 · Vite · TypeScript · Tailwind CSS v4 |
| Desktop | Tauri 2（macOS / Windows / Linux，本地模式） |
| Backend | Cloudflare Worker · Hono |
| Storage | R2（文件）· D1（元数据） |
| PDF | pdf.js with web worker |
| Office | mammoth（Word）· xlsx（Excel）· DOMPurify（XSS 安全） |
| Markdown | react-markdown · remark-gfm · rehype-highlight |
| Auth | 设备维度（localStorage），可选邮箱绑定 |

## Architecture

```
┌──────────────┐     ┌───────────────┐     ┌──────────────┐
│   Browser    │────▶│  CF Pages     │────▶│  CF Worker   │
│  React App   │     │  (Functions)  │     │  (Hono API)  │
└──────────────┘     └───────────────┘     └──────┬───────┘
                                                  │
                                       ┌──────────┴───────────┐
                                       ▼                      ▼
                                       R2                     D1
                                     (files)                 (meta)
```

**桌面端（Tauri）**走本地通道：文件存于本机磁盘（appDataDir），元数据存本地 SQLite，预览与分栏能力与在线版一致，无需账号即可使用。

## License

MIT
