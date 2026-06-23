# 分屏对比功能设计文档

## 目标

在 DocuSync 中支持左右/上下分屏，同时预览两个文档（可以是同一文档的两个副本），用于内容对比。

### 不在范围内

- 文档差异高亮（diff）
- 同步滚动联动
- 合并编辑

以上为后续可选增强，不在本期实现。

---

## 交互设计

### 核心思路：先选内容，再进入分屏

参考 Arc 浏览器的分屏模型——「先有内容，再安排布局」。DocuSync 没有 tab 系统，同一时间只显示一个文档，因此用变通方案：**让用户先选好第二个文档，再瞬间进入分屏**，而不是先进入空的分屏模式再选文档。

**关键约束：分屏出现时两个 pane 都有内容，没有「空 pane」状态。**

### 交互流程（三步）

```
步骤1: 用户在看文档A，点击 Header 的分屏图标
        ↓
步骤2: 弹出「选择对比文档」面板（SplitPickerPopover）
        - 最近文档列表（复用 history 数据）
        - 上传新文件按钮
        - 关闭面板（ESC 或点击外部）
        ↓
步骤3: 用户选择文档B → 直接进入分屏视图
        - Pane A = 文档A（保留当前状态）
        - Pane B = 文档B（新加载）
        - 分割线默认在 50%
```

### 入口

| 入口 | 位置 | 行为 |
|------|------|------|
| Header 分屏按钮 | 文件名右侧，`Columns2` 图标 | 点击打开 SplitPickerPopover |
| 历史记录快捷打开 | 历史下拉列表中每条记录旁的图标 | 直接进入分屏，该文档加载到 Pane B |
| 快捷键 | `Cmd/Ctrl + \` | 切换分屏模式开/关 |

---

## 组件设计

### 1. SplitPickerPopover（新建）

从分屏图标下方弹出的面板，用于选择第二个文档：

```
┌─────────────────────────────────┐
│  选择对比文档                    │
│                                 │
│  ┌─────────────────────────────┐│
│  │ 📄 报告2024.pdf    2小时前  ││
│  │ 📝 笔记.md         昨天    ││
│  │ 📊 数据.xlsx       3天前   ││
│  └─────────────────────────────┘│
│                                 │
│  ┌─────────────────────────────┐│
│  │   📤 上传新文件              ││
│  └─────────────────────────────┘│
│                                 │
│  支持左右/上下布局，进入后可切换  │
└─────────────────────────────────┘
```

- 位置：从分屏图标下方弹出（类似 history dropdown 的定位方式）
- 内容：复用 `useFileHistory` 的数据，每个记录可点击
- 底部：上传按钮，点击触发 `<input type="file">`
- 选中后：Popover 关闭，立即进入分屏，两个 pane 都有文档

### 2. PaneHeader（新建）

进入分屏后，每个 pane 顶部的 mini bar：

```
Pane A (左/上):
┌──────────────────────────────────────┐
│ 📄 文档A.pdf              [✕ 关闭]  │  ← 关闭 = 退出分屏，保留A
└──────────────────────────────────────┘

Pane B (右/下):
┌──────────────────────────────────────┐
│ 📄 文档B.md    [🔄 更换]  [✕ 关闭]  │  ← 更换 = 重新打开 SplitPicker
└──────────────────────────────────────┘
```

- **关闭 Pane A**：退出分屏，Pane B 变成主视图
- **关闭 Pane B**：退出分屏，回到 Pane A 单文档模式
- **更换按钮**：只在 Pane B 上有，重新打开 SplitPicker 选择另一个文档

### 3. SplitPane（新建）

分屏容器组件，负责布局和分割线：

- 使用 CSS `flex-direction: row`（左右）或 `column`（上下）
- 中间有可拖拽的分割线（divider），用 `mousedown` + `mousemove` + `mouseup` 实现
- splitRatio 范围 0.2 ~ 0.8，默认 0.5，防止某个 pane 被完全挤掉

### 4. Header 适配（修改 Layout.tsx）

分屏模式下 Header 的变化：

```
[← 返回] [文档A ↔ 文档B]  [⟺ 方向]  [分屏icon(高亮)]  [AI] [历史] [账号]
```

| 元素 | 单文档模式 | 分屏模式 |
|------|-----------|---------|
| 文件名 | `文档A.pdf` | `文档A ↔ 文档B`（各截断） |
| 分屏按钮 | 普通状态 | 高亮，再次点击 = 关闭 Pane B |
| 方向切换按钮 | 隐藏 | 显示，切换左右/上下布局 |
| AI Summary | 作用于当前文档 | 作用于 `activePane`（最后交互的 pane） |

---

## 状态管理

### useSplitView hook（新建）

```typescript
interface SplitViewState {
  mode: 'single' | 'split'
  direction: 'horizontal' | 'vertical'
  activePane: 'a' | 'b'
  paneA: UploadedFile | null   // 始终 = 当前主文档
  paneB: UploadedFile | null   // null = 未分屏，有值 = 分屏中
  splitRatio: number           // 0.2 ~ 0.8，默认 0.5
  pickerOpen: boolean          // SplitPickerPopover 是否打开
}
```

设计决策：新建独立 hook，而非扩展 `useFileUpload`。

理由：
1. `useFileUpload` 保持单一职责（单文件上传/恢复/清除），分屏逻辑独立管理
2. 内部组合两个 `useFileUpload` 实例，上传、下载、校验逻辑全部复用
3. 单屏模式下只用 `paneA`，行为与现有逻辑完全一致

### App.tsx 改造

```typescript
// 现在
const { uploadedFile, ... } = useFileUpload()

// 改为
const splitView = useSplitView()
// splitView.paneA 对应原来的 uploadedFile
// splitView.paneB 是第二个 pane
// splitView.mode 控制布局
```

---

## 交互细节

| 场景 | 行为 |
|------|------|
| 拖拽分割线 | 实时调整 `splitRatio`，用 `mousedown` + `mousemove` + `mouseup` 实现 |
| 同一文档打开两次 | 允许。两个独立实例，各自独立缩放/翻页 |
| Pane B 上传新文件 | 在 SplitPickerPopover 中上传，上传后自动加载到 Pane B |
| 退出分屏 | 关闭 Pane B，Pane A 保持不变 |
| AI Summary | 追踪 `activePane`，summary 作用于最后活跃的 pane |
| 移动端 (<640px) | 强制上下布局，SplitPickerPopover 改为底部 Sheet |
| 键盘 | `Tab` 切换 pane 焦点，`ESC` 关闭 picker |

---

## 文件变更范围

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/hooks/useSplitView.ts` | 新建 | 分屏状态 + picker 状态管理 |
| `src/components/SplitPane.tsx` | 新建 | 分屏容器（divider、布局切换） |
| `src/components/SplitPickerPopover.tsx` | 新建 | 选择对比文档的 popover |
| `src/components/PaneHeader.tsx` | 新建 | 每个 pane 顶部的 mini bar |
| `src/App.tsx` | 修改 | 接入 useSplitView，渲染分屏逻辑 |
| `src/components/Layout.tsx` | 修改 | 分屏按钮、方向切换、文件名适配 |
| `src/components/FileUpload.tsx` | 小改 | compact 模式用于 picker 中的上传 |

共 7 个文件，4 个新建，3 个修改。无后端变更。

---

## 风险与假设

### 最脆弱假设

「两个 pane 的 viewer 实例可以完全独立运行」——当前 PdfViewer、MarkdownViewer、OfficeViewer 都是无副作用的纯渲染组件，各自持有独立 state（pageNum、scale 等），互不干扰。如果未来某个 viewer 依赖全局状态（如全局 PDF worker pool），这个假设会失效。就当前代码而言，完全成立。

### 被否决的方案

**在 `useFileUpload` 内部支持多文件**：会让现有 hook 变得复杂（需要 pane 索引参数），影响所有调用方。分屏是独立的布局模式，应在更高层管理。

**用 Context 管理分屏状态**：当前 App.tsx 已经是顶层编排者，prop drilling 层级只有 2 层，Context 引入不必要的复杂度。如果后续 pane 数量可变（3-pane 等），再迁移 Context 也不迟。
