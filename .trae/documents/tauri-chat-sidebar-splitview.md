# Tauri 聊天侧栏 / 分屏弹窗 — 收尾重构计划

## 背景

实现「默认仅展示 web 文件预览页；选中文本打开 chat 才出现侧边弹窗；可切换悬浮弹窗、可收起、可关闭；关闭后下次调用才再展示；侧边弹窗类似 Dia 分屏（左 web 预览 / 右 AI chat），支持调整 chat 区宽度」。

本计划是**收尾阶段**：Rust 侧与 hook 已在前序会话完成并落盘，仅剩前端容器的接线缺陷需要修复。

## 当前状态分析（已验证落盘）

### 已完成且正确
- **`src-tauri/src/lib.rs`**：`DOCUSYNC_INIT_SCRIPT`（拦截 `window.open` → `open_ai_chat`）、`AI_CHAT_INIT_SCRIPT`（注入 30px header：分屏/悬浮/收起/关闭 + popup 模式可拖拽）、`HeaderState`（camelCase 序列化，`#[serde(skip)] url` 跟踪上次 URL 避免重复导航）、命令 `get_main_size` / `open_ai_chat` / `open_ai_chat_popup` / `close_ai_chat` / `minimize_ai_chat` / `ai_chat_header_action` / `get_ai_chat_header_state` / `resize_webview` / `move_webview` 全部注册；`setup` 用 `cfg!(debug_assertions)` 区分 dev(`localhost:1420`)/prod(`index.html`)。
- **`src-tauri/capabilities/default.json`**：含 `core:event:default` / `allow-emit` / `allow-listen`，windows `["main","ai-chat"]`，remote URLs 已配置。
- **`src-tauri/tauri.conf.json`**：`url:"index.html"`（由 lib.rs 处理 dev/prod）。
- **`src/hooks/useChatPanelTauri.ts`**：状态机 `closed|sidebar|popup|minimized`，`lastModeRef`，`localStorage` 持久化 `width`(300–600,默认400)/`lastMode`；监听 `ai-chat-header-action`→分派 `switchToSidebar/switchToPopup/minimize/close`；监听 `ai-chat-opened`/`ai-chat-closed`；暴露 `openChat = openSidebar`。`urlRef`/`titleRef` 保证事件回调读到最新值。

### 存在缺陷（本次要修）
- **`src/components/ChatPanelContainer.tsx`**：`TauriChatPanel` 直接 `invoke('open_ai_chat', {url,title})`（第 58–68 行），**绕过 hook**。后果：选中文本调用 `openChat` 时，hook 的 React state（`mode`/`currentUrl`/`currentTitle`）从不更新 → 分隔线永不显示、header-action 事件回到一个状态为 `closed` 的实例。
- **`src/components/ChatPanelTauri.tsx`**：`useChatPanel()` 被调用两次（`ChatPanel` 第 20 行 + `ChatPanelTauri` wrapper 第 106 行）→ 两个独立状态副本、事件监听重复、mode 不同步。`refreshMainWidth` 定义后从未调用（`mainWidthRef` 恒为 0，拖拽全靠 fallback）。`ChatPanelModeSync` 是空操作死代码。

### 消费方契约（已确认无需改动）
- `src/App.tsx:306-423`：`<ChatPanelContainer>{(openChat) => ...}`，把 `openChat` 传给 `<SelectionToolbar onOpenChat={openChat} />`。
- `src/components/SelectionToolbar.tsx:116-117`：`isTauri() && onOpenChat` 时调用 `onOpenChat(service.url, service.name)`。
- 契约 `openChat: (url: string, title: string) => void` 与 hook 的 `openSidebar(url?, title?)` 兼容。

## 提议改动

### 改动 1：`src/components/ChatPanelContainer.tsx`

**目标**：让单一 `useChatPanel()` 实例成为唯一真源，`openChat` 走 hook 状态机。

**做法**：
1. 删除 `chatUrl`/`chatTitle`/`handleOpenChat` state（hook 自管 url/title）。
2. `ChatPanelContainer` 仍先 `if (!isTauri()) return <>{children(() => {})}</>`（浏览器 no-op，且符合 Hooks 规则——分支前不调用任何 hook）。
3. Tauri 分支渲染 `<TauriChatPanel>{children}</TauriChatPanel>`。
4. `TauriChatPanel` 内调用**一次** `useChatPanel()`，渲染：
   ```tsx
   <>
     {children(panel.openChat)}
     <ChatPanelTauri panel={panel} />
   </>
   ```
5. 移除原 `invoke('open_ai_chat')` 绕过逻辑与动态 `import('@tauri-apps/api/core')`。
6. 顶部 `import { useChatPanel } from '../hooks/useChatPanelTauri'`。

**为什么**：`openChat` 现在经过 `openSidebar` → 设置 `currentUrl/Title` + `invoke('open_ai_chat')` + `setMode('sidebar')`，分隔线才会出现；header-action 事件回到同一个有正确 state 的实例。`TauriChatPanel` 仅在 Tauri 模式挂载，所以 hook 中的 `invoke`/`listen` 不会在浏览器环境触发。

**lazy 导入保持不变**：`lazy(() => import('./ChatPanelTauri').then((m) => ({ default: m.ChatPanel })))`，仍映射到 `ChatPanel` 命名导出。

### 改动 2：`src/components/ChatPanelTauri.tsx`

**目标**：消除重复 hook 实例，改用 prop 接收单一 `panel`。

**做法**：
1. `ChatPanel` 签名改为 `function ChatPanel({ panel }: { panel: ChatPanelState })`，**移除**内部的 `const panel = useChatPanel()`。
2. 顶部 `import { type ChatPanelState } from '../hooks/useChatPanelTauri'`（不再导入 `useChatPanel` 函数）。
3. 新增 `useEffect(() => { void refreshMainWidth() }, [refreshMainWidth, panel.mode])`：挂载时及每次 mode 变化（尤其进入 `sidebar`）刷新 `mainWidthRef`，修复原本恒为 0 的潜在 bug。
4. 删除 `ChatPanelTauri` wrapper（第 105–114 行）、`ChatPanelInner`、`ChatPanelModeSync`（死代码）——它们都是为「多实例」设计的，现已不需要。
5. 保留：sidebar 模式的右缘可拖拽分隔线（1.5px）+ ◀/▶ 微调按钮（NUDGE=40px，因 ai-chat 是独立 OS webview，光标无法越过边界向右拖窄）；minimized 模式的恢复气泡（右下 MessageSquare）；closed/popup 返回 `null`。
6. `startDrag` 依赖数组保持 `[panel]`（mousedown 处理器，重建开销可忽略）。

**为什么**：单一 hook 实例 → 单一事件监听集合、单一 mode 真源；prop 传递避免二次调用 hook。

## 假设与决策
- **悬浮弹窗形态** = 主窗口内浮动面板（`open_ai_chat_popup` 在主窗口内 `add_child`/定位），非独立 OS 窗口（前序会话已确认）。
- **AI 侧页签栏** = 注入脚本渲染 header（`AI_CHAT_INIT_SCRIPT`），非 React 渲染（前序会话已确认）。
- **拖拽方向限制**：sidebar 模式分隔线只能向左拖（加宽 chat）；向右收窄由 ◀/▶ 按钮实现（OS webview 边界限制，前序会话已接受）。
- **关闭 vs 收起语义**：关闭 → `close_ai_chat`（hide + docusync 复原 + mode=closed，下次调用才重开）；收起 → `minimize_ai_chat`（hide + mode=minimized，恢复气泡可一键回到 `lastMode`）。
- **URL 复用**：`open_ai_chat`/`open_ai_chat_popup` 通过 `HeaderState.url` 跟踪上次 URL，相同 URL 跳过 `navigate` 以保留聊天上下文。
- 不改动 `App.tsx`、`SelectionToolbar.tsx`、Rust 侧、capabilities、tauri.conf.json——它们已正确。

## 验证步骤
1. **`npm run build`**（`tsc -b && vite build`）：在沙箱可运行，验证 TS 类型与编译。重点关注：
   - `ChatPanel` 的 `panel` prop 类型与 `ChatPanelState` 一致；
   - `ChatPanelContainer` 不再引用已删除的 `chatUrl/chatTitle`；
   - 无未使用导入（`useChatPanel` 在 `ChatPanelTauri.tsx` 改为只导 type）。
2. **`cargo check`**：沙箱缺 `glib-2.0`/`gtk-3`/`webkit2gtk-4.1` 系统库且网络不可达（archive.ubuntu.com 超时），**环境限制无法运行**。改用人工核对：命令签名、`invoke_handler!` 注册项、`State<Mutex<HeaderState>>` 一致性（前序会话已完成，本次未改 Rust）。
3. **运行时人工验证清单**（用户本机）：
   - 默认只看到 web 文件预览，无 chat 窗口。
   - 选中文件文本 → 点 AI 服务图标 → 右侧出现 chat 侧栏，docusync 自动收窄。
   - 分隔线可向左拖加宽 chat；◀/▶ 按钮微调。
   - chat header 点「悬浮」→ chat 变为主窗口内浮动面板，可拖 header 移动。
   - 点「分屏」→ 回到侧栏。
   - 点「收起」→ chat 隐藏，右下出现恢复气泡；点气泡回到上次模式。
   - 点「关闭」→ chat 隐藏且无气泡；再次选中文本打开才重现。
   - 重启后 `localStorage` 记住的宽度/上次模式生效。

## 实施顺序
1. 改 `ChatPanelTauri.tsx`（改签名 + 删死代码 + 加 mount effect）。
2. 改 `ChatPanelContainer.tsx`（单一 hook 实例 + prop 下传 + 删绕过）。
3. `npm run build` 验证。
4. 更新 todo，汇报结果。
