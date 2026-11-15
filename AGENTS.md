# AGENTS.md

This file is the whole design of the project. It records the rules, the user's core requirements, the
engineering design and the current working tree. The tree is an attempt at this design, not its
definition.

Read in order: Part 1 is authority over Part 2; Part 2 is authority over Part 3; Part 4 is operational
only. A change that needs a contradiction between Parts 1–3 is a discussion, not an edit. Do not
change Part 2 without the user's decision; the latest user instruction is the only source that can.

---

# Part 1 — Rules

## 1.1 The first principle

The reader's time and trust outrank every technical preference here.

- No white flash in a dark room. No layout shift while content arrives. No click lost because a node
  was replaced under the pointer. No error hidden in a console.
- Every wait is visible, and every visible wait can be cancelled. A control that appears must work.
- An error says what happened and what to do; internal state is not the reader's business.
- One extra step is a cost. One extra second is a cost. Slow is rude.

Every rule below exists to make this principle enforceable. A rule without a check is a wish; 1.8
names the owner of each promise.

## 1.2 Precedence

1. These rules.
2. Part 2, the user's core requirements. They are the user's words; only the user changes them.
3. Part 3, the engineering design. It is the default answer.
4. The specification and the reference implementation, read from disk.
5. `past/` and earlier attempts. They are read, never shipped.

## 1.3 The working loop

One step is short and complete:

1. **Read.** The module, the governing section of this file, and any protocol specification on disk.
   Do not plan against code nobody read.
2. **Plan.** Name the approach and the smaller alternative. A decision the user owns stops here and
   becomes a question.
3. **Implement.** Leave the tree coherent after every file. One job per module; one implementation per
   boundary.
4. **Run it.** The real page in a browser, the worker protocol from a browser, or a pure test for a
   rule that can be pure.
5. **Verify at the rung claimed.** A claim one rung above its evidence is a reporting defect.
6. **Record.** A defect goes to the open-defect section with symptom, known facts, ruled out and next
   step. A decision goes to Part 2 or Part 3.
7. **Commit and push** one coherent change, the reason in the body.

Before a step is done, `npm run check` passes: types, Prettier, lint, tests, build, audit, contracts.
A budget is never raised to hide a defect. The stylesheet budget is deferred during UI reconstruction by explicit user decision; it returns when the UI is complete.

### A bug report is its own loop

Reproduce it in the browser, find the root cause, fix the cause, re-run the same reproduction, commit
with the cause named. Two failed fixes on one symptom mean the boundary is wrong (1.7).

### Changing the design

Part 2 changes only when the user decides. Engineering decisions live in Part 3 with their reason; a
decision that replaces an older one rewrites that paragraph, never adds a second description. A new
rule adds its contract row and, when possible, its check.

### What a step leaves behind

| a change that | also leaves |
|---|---|
| fixes a defect | the reproduction that failed before and passes after, named in the commit |
| adds behavior | a unit test for the rule, or a browser run whose assertion is the behavior |
| adds or moves a rule | its contract row and the check |
| changes a decision | the rewritten paragraph, never a second description |
| adds a dependency | the reason, and the removal of one nothing imports |
| touches the protocol | the specification path it was checked against, quoted in the commit |

## 1.4 The verification ladder

A claim names its rung:

1. **Pure** — a unit test; no DOM, no network.
2. **Worker** — the protocol driven from a browser: login, sync, send, decrypt.
3. **Surface** — the page driven in Chromium: the control does what it says.
4. **Scriptless** — the same page with JavaScript disabled: the frame is complete and every visible
   control either works or says what it needs.
5. **Real server** — the whole flow against a homeserver on a real device.
6. **Other engines** — Firefox and Safari. Until this rung runs, a browser claim says Chromium.

The first paint has its own evidence: a screenshot at load, a screenshot after stored data arrives,
and the absence of a shift between them. "It looked fine" is not evidence.

## 1.5 Defects, open questions, and the record

A defect found and not fixed is written down with four fields: the symptom a reader sees, what is
known, what was ruled out, and the next concrete step. A defect whose cause is unknown after two
attempts is a boundary problem: the third attempt starts by redesigning the boundary.

A question carries a recommendation and what it rules out. Work continues on the parts that do not
depend on the answer. An answer the user gave replaces the design paragraph; it never lives in a
second place.

## 1.6 Writing floor

- Correctness first, then human readability: domain names, straight lines, early returns, explicit
  data, no abbreviation a newcomer must decode.
- One module, one job; the file name says it. No abstraction before the third repetition.
- One implementation per boundary. A second way to do the same thing is a defect: the choke point
  grows, the workaround does not.
- No dead code, unused export, TODO, stub, placeholder, fake control, or copy for a feature that does
  not exist. A missing feature is absent.
- A comment states what the code cannot: a protocol quirk, a browser behavior, a security boundary,
  an invariant. One line, English, no decoration. Code, identifiers, commits and docs are English;
  Part 2 is Chinese because it is the user's voice.
- No vendor prefix, no polyfill, no engine-specific branch, no compatibility shim. One spelling per
  feature.
- A generated file is never hand-edited. The generator changes.

## 1.7 When to stop and redo

These are exit conditions, not warnings:

1. The same boundary needs a third workaround: the boundary is wrong.
2. A defect returns after being fixed in two places: it has two owners; delete one.
3. A phase cannot exit with the tool it planned with: change the tool and record why.
4. A generated file must be edited by hand to work: the generator is wrong.
5. A "temporary" second path outlives its step: delete or promote it in the same change.

Rewriting one module on these is normal repair. Rewriting the tree is what happens when they are
ignored.

## 1.8 Checks and contracts

One command per intent. The check command is the whole contract; a failing check names its contract
and the paragraph that owns it.

| id | contract | enforced by |
|---|---|---|
| C1 | one catalog key set per language; every key is read outside the catalogs; nothing empty | catalog test and contracts |
| C2 | every protocol command has a handler | contracts — waits for the worker |
| C3 | the client never imports the SDK; the worker never imports the interface; a page never imports client code | contracts — waits for the worker |
| C4 | every page has a language, one `h1`, a scriptless note, and the chat page carries its `data-region` regions | page tests and contracts |
| C5 | every manifest name is hashed and present in the output | audit and contracts |
| C6 | client and stylesheet budgets deferred until the UI is complete | contracts |
| C7 | no TODO marker, no console output, no Chinese outside the Chinese catalog | contracts |
| C8 | every screen exists in every language; English at `/en/`, the root is the language entry | contracts |
| C9 | a new web feature is in `features.md` and passes the platform check | feature check and review |
| C10 | the first paint is final; only an uncached room list may show skeleton rows, no fade or layout shift | browser first-paint run |
| C11 | no page contains inline CSS, inline script, inline style, inline handler, or a `javascript:` URL | page tests |
| C12 | the static shell contains no room, message, unread, identity, draft or media state; booted mock state is already read | review test |
| C13 | a grouped message carries its avatar on the last row and chains its inner bubble corners | timeline and style tests |

Current budgets: the client and stylesheet budgets are deferred until the UI is complete; C6 enforces neither in this phase. A budget is a decision, not a target.
Raising one is a change to this file with the reason.

## 1.9 Review, commits, sessions

- Before a multi-file change is reported, it is read once against this file by a reader with no
  memory of writing it. The answer is a list of blockers.
- A layout refactor is compared with a before crop at the claimed width before it is reported. A moved
  message avatar anchor, a closed avatar/bubble gutter, a lost glass layer or a lost watermark is a
  blocker, not a style preference.
- One commit is one coherent change, imperative, reason in the body, the contract or section named
  when not obvious. History is never rewritten. A mistake is corrected by the next commit.
- Every commit is a place a reader can stop: the tree builds, the gate passes, the documents agree.
- A session starts by reading this file, the open defects and the status table. It ends green, the
  documents in step, the commits pushed, and one paragraph on what moved, what is verified at which
  rung, and what is next. An unfinished change is finished or removed before the session ends.
- A snapshot is restored before work continues, and the tree is read again because the conversation
  is ahead of it.

## 1.10 Deciding and asking

| the agent decides | the agent asks |
|---|---|
| module boundaries, names, file layout | what the product promises |
| which existing pattern to follow | anything a reader would notice as a behavior change |
| a cheaper implementation of the same promise | a rule in Part 2, a budget, a scope cut |
| deleting code it has just made dead | deleting code it did not write and cannot attribute |

## 1.11 What the loop forbids

- Committing a tree that fails a gate, or leaving an unfinished change at the end of a turn.
- Silently weakening a check, a budget, or a test to get green.
- Reporting a feature as working when it was only wired.
- Carrying a second implementation beside an existing one because the first was awkward.
- Adding a new feature because it is new, before the design question is answered.

---

# Part 2 — 用户核心要求

这一部分是用户的话，是产品的承诺。只有用户能改；代理先讨论，再记录。

## 2.1 产品

一个快、省、本地优先的 Matrix 客户端。页面加载后即可离线使用；看消息、翻历史、搜索、发送都不该被网络或动画卡住。绝大多数 Matrix 客户端卡顿，这个不能。

输出是静态目录：没有后端，没有服务端渲染。协议、同步、加密都在 worker；主线程只画。技术栈是 TypeScript + esbuild，外加 `matrix-js-sdk` 与 rust crypto wasm，以及消毒器；没有 UI 框架、组件库、CSS 框架、状态库、路由库、i18n 库、日期库、图标字体、外部字体。

## 2.2 速度与首帧

- 第一眼看到的就是最终画面。有缓存房间时首帧直接画，不闪；没有缓存且 `roomsLoading` 时，只在房间区画灰条，菜单卡片、顶栏和输入区保持最终位置，数据到达后原地替换。没有白闪，没有“先占位再替换”，没有抖动。
- 本地数据先出。房间列表、分区状态、顶栏身份来自本地，不等待同步、不等待加密初始化。缓存的密钥门状态可以先画，后台的检查再纠正。
- 顶栏、标题、描述在首帧就有最终位置和最终颜色。标题和描述过长时截断，绝不换行。没有选中房间时顶栏仍在，身份区留空或显示一个转圈，不做淡入淡出，不做流动灰带。
- 加载是可见的、可取消的；没有空白等待。首帧不做入场动画；页面重绘可以有短动画，并遵守 reduced-motion。
- 折叠分区按账户记忆。列表原地更新，不重建节点；首帧的状态在绘制前应用。
- 刷新应该像无感刷新：该在的内容已经在，变化的内容只变一次。
- 静态 HTML 只画 shell：HTML、`color-scheme`、导航框架、顶栏框架、时间线区域、输入区和无 JS 提示。房间行、未读数、成员、顶栏身份、消息、草稿、媒体和选择器内容都由 JS 一次性注入。
- 注入前的状态必须已经是最终态（已读、最终滚动位置）；注入完成后不再 `markRead`，不再二次滚动。

## 2.3 界面

- **骨架交给 HTML，外观交给 CSS，业务逻辑才交给 JS。** HTML 不含内联 CSS/JS；样式表与脚本外部引入。
- 没有 JS 时页面是完整的：导航、顶栏、时间线区域、输入框都在，只是没有数据。窄屏无 JS 时导航与内容上下排列，导航仍可展开；需要 JS 的能力必须是 `<button>`，由面板说明缺少 JavaScript；不用 `<a>` 假装能点。
- 两墨一纸：表面声明墨的比例并据此推出文字色；浅色与深色各一套，用 `light-dark()`。所有颜色、字体、字号、间距、圆角、时长都是 token；规则只用 token。选中文本的灰蓝色是唯一获准的非 ink/page 色令牌。
- 流体布局：`clamp()`、`minmax()`、`auto-fit`、容器查询；不用宽度媒体查询。窄屏与宽屏是同一套布局的两种状态。
- 不用阴影、渐变、卡片化仪表盘、大厂范式。顶栏、导航和所有弹窗可以共享一层克制的半透明 + 高斯模糊；这是唯一获准的“玻璃”用法，不做第二套。
- 焦点永远可见；点击目标不小于 24px；动画短、可打断、只动 transform/opacity/color，reduced-motion 下关闭。
- 文案只陈述读者需要知道的事实。不解释他看得见的东西，不写空话、营销腔或机器腔。文案只在带类型的 catalog 里，缺键是编译错误。

## 2.4 弹窗与悬浮

这是两类，不是一类：

- **弹窗**：设置、搜索、新消息、邀请、加入、创建。用 `<dialog>`，虚化背景，背景不可操作，焦点被限制在弹窗内，关闭后焦点回到触发它的控件。背景点击、Escape、关闭按钮都能关闭。`closedby` 直接用，不做 JS 兜底。
- **悬浮**：房间菜单、语言菜单、表情/贴纸选择器、附件选择器。用 popover，不虚化背景，不限制焦点，点击外部关闭。

触发弹窗用声明式命令（`commandfor`），关闭也声明式；不需要 JS 就能打开和关闭。悬浮继续用 `popovertarget`。顶栏房间菜单与顶栏底部、窗口右边各留一个小的相等间距。

## 2.5 聊天

- **左导航**：菜单区是一张 raised surface 卡片（搜索、新消息、邀请、加入、创建、设置）+ 房间区（收藏、房间、私聊、频道四个分区，默认只展开房间，状态按账户记忆，空区保留折叠头）。折叠标题加粗。频道是 space，点击就地展开子房间，不改变右侧内容。房间行有头像、名称、预览、未读/提及、静音、当前高亮；不显示时间和 `...` 按钮，房间菜单由右键、长按或键盘上下文键打开。房间卡片左 padding 用 `space-2`。底部账号是一张有背景的卡片。
- **右顶栏**：窄屏返回、头像、标题在上描述在下、房间菜单。没有选中房间时 bar 仍在。
- **右内容**：没有房间时不渲染房间内容；有房间时顶栏、时间线、输入框。未登录在时间线位置说明；密钥门未完成说明密钥未设置；这两种状态由 JS 在知道会话之后画，静态页不预置。
- **时间线**：自己的消息靠右、他人的靠左；同一发送者连续段只在最后一条显示头像，头像贴近该段底部，昵称在第一条，头像完整圆形。连续段第一条气泡的左下、中间各条气泡的左上和左下、最后一条的左上使用更小的圆角，其余角为正常圆角，使整段看起来连成一体；自己的消息镜像到右侧。文字气泡按内容收缩，最大宽度受 `--bubble-max` 限制；消息间距比分组内间距大。图片/视频/贴纸没有气泡底色，时间作为 span 落在媒体内部的右下角；文件/音频的时间落在卡片内部的右下角。图片进入视口附近才加载；视频显示为较小的预览卡片，点击后在居中弹窗播放；图片点击后居中显示，可缩放，点击背景或关闭按钮退出。只有一行的文字气泡撑长，时间留在同一行；日期分隔是行间小元素。不能解密的消息说明原因；加载更早和跳转不阻塞滚动。向上翻自动加载旧消息后保留当前位置，可以继续向上。当前房间在下方出现新未读消息且视口不在底部时，显示带计数的跳转按钮；到达底部或点击后标记已读。其他房间用导航未读徽章，不额外弹 toast。点击有未读计数的房间时定位到第一条未读消息，整行背景短暂显示后消失，未读清零。
- **输入框**：附件、贴纸、输入框、表情、发送。附件支持多选和粘贴，同一缓冲区，可移除、有进度、可取消、可重试。Enter 换行，Ctrl/Cmd+Enter 发送，输入法组字期间不发送。输入框随内容长高到上限后内部滚动。草稿按房间保存。发送按钮长按或右键打开 Normal text/Markdown，点击选项立即发送。只有富文本气泡渲染 Markdown，普通文本保持纯文本。发送顺序：文件一条一个消息，随后文字。聊天区时间线与输入区占满内容列，不设 `--content-max`。贴纸选择器从客户端载入；回应选项打开一个紧凑的表情选择器，提供多种反应。
- 消息菜单：回复、回应、编辑、删除、复制文本、复制链接。不显示 `...` 按钮；在消息上右键、长按或键盘上下文键打开。

## 2.6 登录、密钥门、设置

- 服务器地址、`.well-known`、`/versions`、`/login` flows；密码登录、SSO、注册（含交互式认证阶段）。忘记密码在重置流程存在之前不出现。
- 密钥门强制。三条路径：恢复密钥/口令、另一台设备 SAS 验证、重新开始。注册后只有“重新开始”。恢复密钥只显示一次，等宽字体，可复制、可下载，不写日志。未完成前聊天页不可交互，也不渲染房间数据。
- 设置一个对话框：账户、通知、安全、关于。账户有头像、显示名、MXID、退出登录；安全有设备验证、恢复密钥、备份、重置、会话列表（验证/登出单台/登出其他）；通知有应用内徽章、标题总数、桌面通知（默认关闭、手势请求、可关预览）；关于有版本、源码、许可、无统计。没有语言自定义。
- 房间设置从房间卡片菜单打开：概况、成员、通知模式、加密状态（只读）、离开。没有权限时只读。
- 个人资料从发送者、成员行或提及打开。

## 2.7 平台与安全

- Chrome、Firefox、Safari 三方在 2026-10 的版本内可用。Baseline 2026 是底线，不是上限；每个新特性都用检查命令核实，不靠记忆、不靠文章。只有三大浏览器都支持才用。
- 不满足三家的特性不用；`features.md` 只记录确实能用到的特性。
- 事件、资料、房间名、formatted_body 一律不可信；富文本过白名单消毒器。CSP 不允许内联脚本与内联样式；没有第三方请求，没有统计。
- token 与密钥只在 worker；主线程只看到会话摘要与一次性显示的恢复密钥。不记录 token、密钥与消息正文。
- 离线是正常状态：预缓存 shell，导航 cache-first 并后台更新；消息、房间、头像在 IndexedDB 里，由 worker 独占；homeserver 请求永不进 HTTP 缓存。

## 2.8 范围

- **先做**：登录与密钥门。
- **范围内**：房间与时间线、发送与接收、回复/编辑/删除/回应、媒体、贴纸与表情包、本地搜索、设置、会话与设备验证、频道、通知、离线。
- **不做**：通话与视频、线程、低优先级分区。邀请进菜单。

## 2.9 本轮用户视觉修正（摘要）

- 左导航的 active 与 hover 必须分得清；space 内被选中的房间与未选中不能看起来一样。
- 底部账号信息卡要有自己的背景。点击账号出现的菜单，hover 必须能在菜单底色上分辨。
- 房间卡片左 padding 从 `space-1` 改为 `space-2`；房间行不再显示时间，样式更统一。
- 顶栏和左侧背景应是同一层，都可以有一点透明；左侧看不出来也没关系。顶栏最右侧菜单与顶栏底部、浏览器窗口右边都留一个一致的、比较小的间距。
- 下方聊天区不限宽，应该和容器一样宽。
- 文字气泡按内容收缩，不因为字少就撑满整列；气泡之间的间距稍大。reaction 的背景要更淡。
- 点击有未读计数气泡的房间时，跳到最后一次已读的位置；第一条新消息的整行背景短暂显示 hover 效果，然后消失。
- 所有图标换成一套新的、统一的图标；现在的图标不好看。
- 所有弹窗和右侧顶栏都用背景高斯模糊；具体强度由实现规划。
- 组件的背景与文字颜色独立：导航、账号卡、顶栏、气泡、菜单、对话框、输入框和卡片各自声明纸与文字角色；卡片不必共用同一个 ink，文字颜色根据它所在的背景推导。
- 设置开关关闭时圆点在左，开启时圆点在右；开启轨道使用纸面墨色。弹窗卡片的模糊弱于悬浮菜单和顶栏。
- 设置的左侧导航是一整块纸；账号行只保留自己一层背景，右侧内容不再套第二层 section 卡。
- 左侧激活 tab 使用比纸面更深的 card step；右侧标题区和内容区使用同一层 dialog paper。
- 设置侧栏只比 dialog 纸略亮或略深；激活项使用细 indicator 加很淡的 tint，不做过亮的整块填充。
- 房间设置复用同一套左侧纸、右侧 dialog 纸、激活 tab 和 flat section；不额外套 section 卡片。
- 设置 tab 任意时刻只有一个激活；hover 使用很淡的 ink overlay，不再出现第二个深色块。
- 文本选中的高亮改成浅灰蓝色；要更浅一些，有一点透明感，但不明显。
- 亮色模式气泡背景更浅。
- 聊天区域的头像要完整圆形，并与昵称中心对齐；其他区域的圆形头像保持现状。
- 图片、视频、贴纸等媒体消息的时间显示在媒体内部右下角，像一个 span；文本消息的时间保持在文本内。
- `Load older` 与 `Copy link` 保留为 mock 评审演示，不当作真实功能。
- 浏览器存储不可用时显式说明并停止重定向，不进入循环。

---

# Part 3 — Design

## 3.1 The model

1. **One writer per fact.** The worker owns the account database, the SDK and crypto. The main thread
   owns the UI database and the interface. A module asks another layer for a fact; it never reads that
   layer's storage directly.
2. **Local first.** The database is the source of the interface. A sync, a reload or an offline start
   reads the same projection. The network is an update, not a prerequisite.
3. **Deterministic restore.** On load, the cached session state decides the first frame; the worker
   verifies in the background and corrects the gate. The reader never watches a blank shell while
   crypto initializes.
4. **One protocol.** Client and worker never import each other; they speak commands and events. A
   command has an id and a reply; an event has no id.
5. **Every promise has a check.** A rule that no check enforces is a wish; 1.8 names the owner.

## 3.2 Architecture

Build time only: catalogs (pure data, one typed object per language), a tiny HTML builder (escaping by
default), asset records, layouts, components (markup in, string out), pages (one function per page,
region ids shared with the client), and scripts (build, pages, audit, features, contracts).

Runtime: `protocol/` (command and event unions), `client/` (store, worker client, router, one module
per region), `worker/` (api, session, db, projection, media, keys), and `src/styles/` (one entry importing
layer modules, tokens first). The current tree has only the build-time shell and a mock client; the static
shell carries no room or message data, and the client injects one final snapshot.

Dependency direction is one way: catalogs → lib → layouts/components → pages, build time only; client
and worker depend on protocol and core types, never on each other.

Each page is one document. `<html data-page>` tells the client what to boot. Region ids live in one
module imported by both the generator and the client, so the two cannot disagree. The build-time
`appShell` takes no state and always renders `emptyChatState`; a page cannot accidentally ship mock data.
The client mounts the same components with the final store.

## 3.3 Data

The account database is opened by the worker and nobody else. Its stores: session and per-room cursor,
rooms, events (indexed by room and by room+time), members, and media keyed by a content address. The
UI database holds locale, last account, collapse state, drafts, and recent emoji. The current mock
client stores sections, spaces and drafts under the account id.

A message row carries identity, room, sender, name, avatar, time, kind, body, HTML, media, reply, edited,
reactions, mentions, status, error, encrypted flag, membership, and search tokens. The HTML is stored
raw and sanitized at render.

**The projection has two directions.** Forward: every event after the room cursor, plus the last thirty
rows, because an edit, reaction or redaction changes an older row without adding one. Backward: after a
scrollback, walk from the start of the live timeline and stop at the first stored id, because the cursor
marks the newest row and cannot see that direction. Neither pass clears a store; a room disappears only
on an explicit leave.

The queued message is an ordinary row, written under its transaction id before the request. The remote
echo carries the same id and replaces it. A failed send leaves a failed row with an error; retry resets
it, discard deletes it.

Relations come from the SDK aggregate at projection time, so there is no second store to replay. An
annotation counts once per sender per key, and `me` is the viewer.

Read state is one call that moves the receipt and the fully-read marker together; the room row keeps the
receipt id so the timeline can draw where reading stopped.

## 3.4 Worker protocol

One dedicated worker per tab, created when the page needs data.

| command | reply | notes |
|---|---|---|
| `start` | session + keys | opens the database, posts stored rooms **before** crypto, restores the session, starts sync after the reply |
| `login` | session | credentials arrive once and never stay on the main thread |
| `logout` | empty | clears SDK, crypto and account database |
| `keyStatus` | ready or not | the gate's answer |
| `open` | one window | waits for `start`; a caller never races it |
| `older` | one window | backfill in the backward direction |
| `send` | empty | the row is written first; outbox events follow |
| `media` | a blob | decrypted with the row's file object, cached |
| `packs`, `sticker`, `react`, `edit`, `redact`, `markRead`, `typing` | the documented shape | one handler each |

Events: ready, rooms, window, outbox, connection, keys, typing, fatal. The payload is bounded; a lost
event costs one window, not a rebuild.

**Start order.** `start` is sent once, before any room is opened. The stored rooms paint from the cached
gate state; the start reply corrects the gate if the keys are gone. The room window is opened only after
the start reply, and the timeline waits for it instead of racing it.

**Failure.** A worker error marks the connection degraded and restarts it once; the projection on disk is
untouched. There is no main-thread SDK fallback.

## 3.5 UI

The store is a key table, not a render pass: phase, session, rooms, room id, messages, has-older,
connection, keys, typing. `set` compares each key by reference and notifies only changed keys. A region
subscribes to the keys it reads. Regions: navigation, header, timeline, composer, surfaces.

The composer and any open surface own their state and are never re-rendered by a store change; that is
what keeps the caret and the selection.

**Navigation** is built once. Its header is one account button: the avatar on the left, the display name
over the MXID beside it. The whole header opens a floating menu of the six labeled actions below it, and
each action opens its own dialog. The room sections follow. Section labels are bold. Rows are keyed by
room id and moved only when order changes, so a sync, a repaint or a reload never rebuilds the list under
the pointer. Section state is per account, with the old global map as the migration base; the default is
rooms open, the rest closed. A room row has no visible menu button and no time; right-click, long-press or
the keyboard context-menu key opens the room menu. The account card at the bottom has its own surface.
Room cards use `space-2` left padding. Active is a deeper step than hover; a room nested in a space must
still read as selected.

**Topbar** has four cells: back (narrow only), room avatar, title over topic, room menu. The title and
topic truncate, never wrap. The bar stays when no room is selected. It shares the navigation's translucent
surface and blur. The identity area is JS-only until real data exists; there is no static placeholder and
no fade. The room menu is anchored below the bar with a small equal gap from the bar and the window edge.

**Timeline** fills the content column; it is not constrained to `--content-max`. Rows are keyed by
message id and updated in place; day separators and the older control are display items with their own
keys. A message has no visible menu button; its row is focusable and right-click, long-press or the
keyboard context-menu key opens the message menu when no text is selected. New rows append; backfill
prepends and restores the scroll position from an anchor, whether the list grew or the server had nothing
older. Opening another room resets the anchor and the pinned state. A bubble tints to the hover step while
a long press is held and while its menu is open; a click or a plain mouse hover does not change it. All
rows share one message body column between the two avatar gutters; other bubbles fill that column, so
every bubble's right edge lines up, and own bubbles align to the same right edge. Text bubbles fit their
content up to `--bubble-max` and break at any character rather than leaving a ragged right edge; message
spacing is `space-3`; media timestamps sit inside the media at the bottom right as a span. The first unread message gets a full-row reveal background that clears after the
reveal. The message avatar is a complete circle on the last message of a sender group, aligned to the
group's bottom while the sender name is on the first, never clipped by `content-visibility` paint
containment. A group chains its inner bubble corners: the first bubble's bottom-left, the middle bubbles'
top-left and bottom-left, and the last bubble's top-left use `--bubble-inner`; every other corner is the
normal radius, mirrored on the right for own messages. Every timestamp uses the `--text-xs` tier. A queued or sending row
places three pulsing dots inside the bubble below the time; a failed row places a small `--danger` badge
there, whose title carries the error. The timestamp, edited mark and status are not selectable; copying a
message reads its body, not the meta. Images use native lazy loading and async decoding; the video row is a
compact preview that opens a centered player. The image viewer centers the image, toggles a zoomed reading
state on click, and closes on backdrop or the close control. A new message in the active room does not raise
a toast: when the viewport is away from the bottom, the jump control names the unread count; reaching the
bottom or using it marks the room read. Other rooms use the navigation badge. Backfill prepends a page and
restores the recorded row, so the reader stays in place and can continue upward.

**Composer** owns its draft, its tray, its height and its selection. The send button's long-press or
context menu offers normal text and Markdown; choosing an option sends immediately, with no visible
format switch. Only rich-text bubbles render Markdown; normal text stays plain. The dialogs never cover
it; the overlays never steal its caret. The bar fills the content column.

**Overlays are two kinds.**

- *Dialog*: a `<dialog>` with `showModal`, opened by `commandfor`, closed by `command`, `closedby` and
  Escape. The backdrop is `--scrim` plus a small `backdrop-filter` blur. The background is inert, the page
  scroll is locked with `:has`, focus starts inside and returns to the trigger. No JS is needed to open,
  close, or dismiss it. Safari 27.0 still lacks `closedby`; its backdrop click does not close, and there is
  no JS fallback.
- *Popover*: a `popover` section with `popovertarget`, no backdrop, no focus trap. Menus and pickers are
  popovers; the room and message menus use `popover="manual"` and close on an outside pointerdown or
  Escape, because Firefox light-dismisses an auto popover on the right-click release. The other pickers
  use `auto` and anchor positioning (`position-area`, `position-try-fallbacks`, and the popover's implicit
  anchor), as does the topbar room menu. Opening a new floating trigger closes an open context menu first,
  so one menu at a time keeps its coordinates. The topbar room menu is anchored to its button at the
  topbar's bottom and right edges, never positioned from a context point. Pointer context menus are
  measured with visibility hidden, positioned at the pointer (a touch long-press opens after release,
  centered on the touch point), and then revealed without an entrance transition; a non-empty selection
  keeps the native menu, and a touch long-press suppresses the contextmenu only when no text is selected.

The reaction picker is a compact manual popover anchored at the message. It follows the context-menu
positioning and cleanup rules: outside pointer or Escape closes it, and keyboard focus returns to the
message.

The dialogs and floating menus share one glass language; the dialog paper is opaque with the weaker
`--dialog-blur`, while the topbar, navigation and menus use the translucent `--float-blur` paper. There is
no second glass style. The entrance of either uses `@starting-style` and `transition-behavior:
allow-discrete`, never a skeleton and never a fade on the initial page load.

## 3.6 First paint

The static document is the shell: markup, stylesheet, script tag, regions, scriptless note. It never
contains room data, a "not signed in" sentence, or a loading placeholder.

On the chat page:

0. If a cached room window exists, it paints before any skeleton. Without one, only the room list shows
   skeleton rows while `roomsLoading`; the action card, topbar and composer keep their final boxes, and
   the rows replace in place when the data arrives.
1. The account's last gate state selects the interface phase; the stored rooms and per-account section
   state paint immediately.
2. The topbar is part of the static shell, at its final height and background. The avatar, title and
   topic appear when the room is known; the bar does not move when they do.
3. `start` is posted; the stored rooms event renders; the start reply corrects the gate; `open` follows
   and the timeline fills.
4. Nothing animates on this first pass. A sync that changes the list updates rows in place.
5. A page reload is the same path. A background sync is the quiet one: same rows, same positions.

The measured evidence is a screenshot at load, a screenshot after the data, and a comparison of the
topbar and list boxes between them.

The static shell is data-free. The client receives one final snapshot, renders every region once in one
task, computes the first scroll from the same snapshot, and only then becomes interactive. The initial
injection never calls `markRead` and never scrolls a second time. The review's active room is already
read, so its receipt is the last message and the first render is final. `prepaint` sets the interactive
view and the saved section open state; it never writes data, a badge, a draft or a scroll position.

A static page never contains a visible state that boot would change. C12 tests the data-free shell and the
read snapshot; C10 remains the browser first-paint check.

A narrow first load opens on the navigation; selecting a room opens its detail. The generated review page
starts with `data-view="shell"` so a script-free reader sees the complete navigation and content frame;
`prepaint` switches an interactive page to `data-view="list"` before the client renders.

## 3.7 Build, assets, and caching

Four entries — guard, prepaint, client, stylesheet — bundled by esbuild, minified, content-hashed, with a
metafile the page generator reads. The worker and wasm entry wait for Matrix. HTML is minified with the same
options in build and audit. Output is a generated static directory, audited byte-for-byte; `dist/` and
`build/manifest.json` are ignored and owned by the build.

Assets are one of five things: a module import (hashed by the bundler), a stylesheet `url()` (hashed by
the bundler), a page asset named in the generator's list and resolved through the manifest, a file the
client needs by fixed name declared in a `<meta>` tag, or a platform file copied verbatim.
Icons that follow `currentColor` are functions returning SVG, not files. The current icon set is one
coherent 24px, rounded, 1.75-stroke system. The worker never imports an asset. The generator never imports
a browser module.

The crypto wasm is copied by the build with a hash of its bytes and served as `application/wasm`; the
worker initializes it explicitly before rust crypto.

The service worker is generated with the manifest inlined, so its bytes change exactly when the shell
does. Install precaches the locale's pages and hashed assets; navigation is cache-first with a background
revalidate; `skipWaiting` and `clients.claim` keep one version live; registration is production-only with
`updateViaCache: "none"`.

## 3.8 CSS

The palette in `:root` is the frozen sRGB set: `--page`; the ink scale; the surface steps; bubble, menu,
chrome, navigation and float glass; and the focus, danger, mark, selection, media and scrim roles. On top of
that, each paper declares its own text and state roles: `--nav-*`, `--account-*`, `--topbar-*`,
`--bubble-*`, `--menu-*`, `--dialog-*`, `--field-*`, `--composer-*` and `--card-*`. These are semantic
pairs, not numbered shades: a component never has to take the page ink when its paper is a card, a bubble
or a glass menu. A value may be derived with `color-mix` from ink and its paper; the role name records the
paper. `--danger` remains the only semantic state color, reserved for the failed-send mark, the mention
badge and destructive actions.

Surfaces: the page uses `--page`; the topbar uses `--chrome`; the navigation uses `--nav`; the account card
uses `--account-bg`; raised cards use `--card-bg`; bubbles use `--bubble-bg`; floating menus use
`--menu-bg`; dialogs use the opaque `--dialog-bg`; fields use `--field-bg`. Text, muted text and hover/active
states come from that paper's own roles. The topbar, navigation and floating menus share the 8px glass blur;
dialogs use a weaker `--dialog-blur` of 4px so the card stays readable. The dialog backdrop uses the scrim
plus a 6px blur. No shadow, no gradient, no visible border.

Dialogs have a title and a close control; floating surfaces have no header. The dialog is 24rem wide,
settings 46rem, the SAS 22rem, the floating surface 14rem, the send menu 11rem, and the accessible name is
the surface title. Context menus fit their content within that cap and use SVG icons for their actions.

Rules for future CSS:

1. A token names a paper and a role. Numbered color tokens are forbidden; paper text aliases are required
   because they prove contrast against the paper the component actually paints.
2. Palette values are fixed. Component role values may derive from the palette with `color-mix`; changing a
   palette value is a user decision, never a side effect of a refactor.
3. Literal colors live only in the token layer. Component rules use roles; `color-mix` may combine roles,
   never a literal.
4. Hover and active reuse the paper's state roles. A new state color needs a new named role and a check.
5. One stylesheet entry, one layer order: tokens, reset, base, layout, components, surfaces, motion. The
   entry imports modules by layer; navigation, timeline and composer are separate files inside the
   components layer. Local custom properties are for geometry or motion, never for a color.
6. No width media query. Layout is fluid with `clamp()`, `minmax()`, `auto-fit` and container queries;
   every control gets `appearance: none` before styling and a visible focus outline.
7. Every new rule must pass `test/style.test.ts`: all declared properties used, no numbered color tokens,
   no literal `color` or `background` outside tokens, no vendor prefixes or viewport width queries, and the
   navigation, bubble, menu, dialog, field and card text roles still resolve to their own token.

Fluid layout: navigation `clamp(15rem, 22vw, 19rem)`, chat full content width, bubbles and media `36rem`,
fixed space 1–7, radii and ease. `@container` on the body switches the narrow shell and `data-view` on the
app switches list/room; no width media query. `appearance: none` on every control before styling. Focus is
a visible outline at a small offset; never removed except the composer textarea, whose field draws the
focus ring. The danger token is the only semantic state color; every other paper and text token is a fixed
sRGB value.

Decorative motion is absent or at most a 120ms opacity/color/rotate change. The first unread reveal uses
the surface-hover background and clears after the reveal; reduced motion removes any transition. A section
collapses natively and immediately. Overlays fade without sliding, the skeleton is static, and the
functional loaders — the router spinner and the pending message dots — are the only looping animations;
reduced motion stops them.

## 3.9 Testing

Pure tests: catalog parity and placeholder substitution, HTML escaping, message grouping in one pass,
store notification granularity and batching, generated page structure and locale addresses, the surface
registry, the data-free static shell, per-paper color roles, grouped avatars and bubble corners, CSS
token/selector invariants and the deterministic watermark pack. Browser surface tests cover the live chat,
dialogs and popovers; worker and real-server tests wait for P1.

Real-server tests: the whole flow on a device whose state is real, including the first paint and the
timing of rooms versus crypto.

The feature check: every new feature is looked up before it is written and recorded in `features.md`; the
check passes for the platform floor.

## 3.10 Platform

The authority is the `web-features` dataset, with MDN compatibility data for entries it does not name or
where its compatibility record lags the engines (anchor positioning), and `features.md` is the project's
recording of what it can use. The floor is Chromium 156, Firefox 157 and Safari 27.0.

Four questions before a feature is used: does the design need the behavior; does what we have already do
the job; is the feature larger than the need; does it replace code or add a second spelling.

Current decisions: `<dialog>` and popovers split the overlays; `commandfor` opens the dialogs; `closedby`
dismisses them, with no fallback; anchor positioning (`position-area`, `position-try-fallbacks`, implicit
anchor, `anchor-size`) places and sizes popovers without JS; `backdrop-filter` blurs the backdrop, the
topbar, the navigation and dialogs; `@starting-style` and `transition-behavior` handle entrances;
`field-sizing`, `scrollbar-gutter` and container queries serve the layout; `:user-invalid` serves forms;
`crypto.randomUUID` and async clipboard serve local actions. `content-visibility`, `::details-content`,
`@scope` and nesting are not used and are not claimed.

Rejected for this floor: scroll-driven animations, `interpolate-size`, `text-box`, cross-document view
transitions, and Temporal, because at least one of the three engines does not ship them.

## 3.11 Lessons the design closes

| lesson | mechanism |
|---|---|
| one fact with two writers drifts | worker owns account data; main thread owns UI data |
| a forward-only projection cannot grow history | two passes, decided together |
| prepending moves the viewport | a recorded anchor restored in a frame |
| a reader scrolled up has not read below | receipts move only at the bottom |
| the user agent paints its own button face | `appearance: none` before styling |
| a wrong wasm MIME breaks crypto | the build copies it and serves it as `application/wasm` |
| a new device cannot read old history | the gate says so; the timeline says why |
| storage can be evicted | persistence is requested; a refusal is stated |
| an immediately activating service worker mixes versions | one version live, precache stamped by the build |
| a scrollbar moves the layout | stable gutter |
| an IndexedDB transaction dies across an await | reads open their own transaction or cursor |
| long unbroken strings overflow a flex child | `min-inline-size: 0` and `overflow-wrap` |
| a click is lost when a node is replaced mid-gesture | keyed rows, updated in place |
| a surface text color copied globally fails on another paper | each paper declares its own text pair; hover keeps the same family |
| a chat surface defined in several lists drifts | one `core/surfaces.ts` registry feeds markup and overlay behavior |
| one file under two names is two facts | one hashed icon, no speculative probe |
| a page paints the agent's canvas before CSS | `color-scheme` in the head of every page |
| copy that explains the visible is noise | one sentence per note, only what is missing |
| a string for an unbuilt feature rots | the catalog test fails on a key nothing reads |
| the local list waited for crypto | cached gate state paints first; start corrects |
| the static bar painted before its title | the bar is static and final; the identity is JS-only |
| the title was rebuilt on every draw | the title and topic update in place |
| a static "not signed in" appeared before the session was known | the boot phase draws nothing |
| an initial row animation read as flicker | no animation on the first paint; sync updates in place |
| the dialog backdrop needs the modal top layer | `<dialog>` and `::backdrop`, not a popover |
| a floating menu must not dim the page | popovers keep no backdrop |
| the backdrop click is not native on `<dialog>` | `closedby`, not a JS fallback |
| a negative margin under `content-visibility` paint containment is clipped | keep the avatar inside the row; pad the message body |
| a media timestamp outside the image floats in the page | put the time span inside the media frame |
| a topbar menu at an anchor edge overlaps the chrome | fixed inset below the bar with equal gaps |
| active and hover at adjacent ink steps are indistinguishable | active is a deeper step; nested space rows use a middle step |
| a static review frame showed unread badges and media chrome boot removes | data-free shell, one final injection and C12 |
| a grouped message avatar moved to the first row and lost its corner chain | avatar on the group end; inner corners use `--bubble-inner`; C13 |
| a switch knob positioned from the inline end ran outside its track | start at the track's leading inset and translate one knob width; the style test locks it |

## 3.12 Phases

| phase | work | exit |
|---|---|---|
| P0 | pipeline: build, pages, audit, features, layouts, components, router, chat pages, stylesheet | generated locale pages, audit green, chat complete scriptless at both widths and both schemes |
| P1 | worker: entry, hashed wasm, init, login, sync, decrypt | protocol test signs in, syncs, sends, reads the echo |
| P2 | every page and the stylesheet in full | no dead control, every page complete scriptless |
| P3 | data: database, both projections, store, sections, timeline, composer | a real account lists, reads, sends, keeps its place through backfill and reload |
| P4 | discovery, login, the gate, the router | login lands on the gate, the key opens it, the chat opens behind it, verified on the real server |
| P5a | message actions, room menu, room settings, join/create | a reader acts on a message and manages a room from the navigation |
| P5b | local search, settings, sessions and verification | search finds and jumps; a session is listed, verified, signed out |
| P5c | spaces, packs, invites, profile | a space expands; a pack is kept; an invite is answered |
| P6 | service worker, offline, notifications, language, accessibility | offline reload works; the measurements are reported |

The project is done when every line of Part 2 is present and verified at rung 5, the open defects are
empty, the gate is green with no budget raised, and a reader can start from this file alone.

## 3.13 Open decisions

These are the user's to make, not the agent's:

- The exact copy and tone for each language.
- Whether the first paint of a room should show the cached message window before the start reply.
- Whether the dialog entrance should animate at all, and how long.
- The scope cut for the first usable release.

Until answered, the design defaults to the conservative option and records the choice in the commit.

---

# Part 4 — Working tree

## Commands

```text
npm run check       # the single gate: types, Prettier, Oxlint/Stylelint, tests, build, audit, contracts
npm run dev         # build, serve dist/ on 127.0.0.1:5172, watch src/scripts and live reload
npm run serve       # serve an existing dist/ on 127.0.0.1:5172 (PORT/HOST override)
npm run format      # write Prettier across src, scripts, test and the root JSON/YAML
npm run format:check
node --test test/catalog.test.ts   # one pure test file
npm run features -- <web-features id> --require 2026
npm run features -- <web-features id> --floor chrome=156,firefox=157,safari=27
```

Prettier checks the tracked source and root configs. It does not reformat embedded HTML inside the
`html` tagged templates; that whitespace is significant. `AGENTS.md`, `features.md`, `past/`, `dist/`,
`build/` and the lockfiles are not formatted by the gate.

## Map and current boundary

- `src/pages/` — one build-time view per page (the chat at the locale root); `src/layouts/` — document,
  chat and auth shells; `src/components/` — pure markup returned as `Html`, shared with the client, with
  `surfaces.ts` holding the dialog/floating bodies; `src/catalogs/` — typed copy; `src/styles/style.css` — the
  entry that imports `tokens`, `reset`, `base`, `layout`, `components`, `navigation`, `timeline`, `composer`,
  `surfaces` and `motion`; `src/lib/` — HTML escaping, catalog, assets; `src/core/types.ts`, `state.ts`,
  `regions.ts`, `surfaces.ts`, `locales.ts`, `rooms.ts`, `messageGroups.ts` and `mock.ts` — page state, ids,
  locale paths, room factories, grouping and deterministic mock data; `src/client/` — main/app, guard,
  prepaint, auth, chat, storage, session, prefs, store, actions, the surface controller, regions (navigation,
  header, timeline, composer) and position.
- `/` is the one-time language entry. `/en/` and `/zh-CN/` are the locale roots; the chat is the locale
  root, and the other pages sit under the prefix. `/` and `/en/` are English.
- `scripts/pages.ts` — root router plus locale pages; `scripts/build.ts` — esbuild stylesheet, guard,
  prepaint, client, hashed icon, pages and manifest; `scripts/dev.ts` — live-reload server that runs each
  build in a fresh child; `scripts/static.ts` — the 5172 server; `scripts/audit.ts` — minified-page and
  asset comparison; `scripts/contracts.ts` — C1, C4–C8; `scripts/features.ts` — platform check;
  `scripts/review.ts` — dev-only review artifact; `scripts/watermark.ts` — watermark generator.
- The tree is a build-time static shell plus a client mock UI. There is no `src/worker` or `src/protocol`,
  and no Matrix import; the client reads `src/core/mock.ts` and the guard validates the mock session. C2
  and C3 wait for the real runtime. The SDK dependencies are not imported.
- The generated chat page is the empty shell. The dev-only `/review/` artifact uses the same empty shell
  and injects the deterministic mock rooms, account and messages from the client; it is not part of
  `renderPages()` or the production audit. The stylesheet has no visible borders or dividers; the navigation
  action block is a menu surface and section labels are bold. The frontend-design skill owns the visual
  review; do not add a second convention.
- The client is a mock: `Load older` loads one local page of older rows; `Copy link` points at addresses the
  build does not serve. They are kept as review artifacts, not shipped behavior.

## Generated and reference-only

- `dist/` and `build/manifest.json` are generated; the build and audit own them. Never hand-edit.
- `past/` is reference only. It is never shipped and its implementation is not brought back.
- `.omp/` holds the project context, skills, config and ignored worktrees.

## Verification

The gate is the whole operational contract: a claim names the rung it was verified at, and a stylesheet
read is not a browser run. C9 is the feature check plus `features.md`; C10 is the browser first-paint run
and is not part of `npm run check`; C12 is the pure review-state contract and C13 is the grouped-message
contract, both part of it. The mock UI has
a Chromium surface pass at 390, 856 and 1280, light and dark, plus the generated scriptless structure and
the pure tests. Worker and real-server claims wait for Matrix. The client and stylesheet budgets are
deferred until the UI is complete, not raised.

## Open defects

1. **The tree has no worker.** C2/C3, the protocol, account data, crypto and the real gate wait for P1. The
   current client is a mock, not a product claim.
2. **The review artifact is outside the production gate.** `scripts/review.ts` writes `/review/` and
   `/review/zh-CN/`, and `src/styles/watermark.svg` is generated by `scripts/watermark.ts`; neither is
   compared by `npm run check`. The review page is intentionally dev-only and must not be read as a
   production page.
3. **Budgets are deferred.** C6 enforces neither the client nor the stylesheet budget until the UI is
   complete; the current sizes are reported by the build rather than failing the gate.
4. **Settings reset is absent.** A reset needs the worker's crypto/session command; until then the control
   is not rendered rather than being a second destructive action.

## Visual regression log

Every layout refactor re-checks these against the before crop. They have regressed before:

| area | reference that must survive |
|---|---|
| grouped message | avatar on the last row; sender name on the first; inner bubble corners chain |
| bubble | content fit to `--bubble-max`, message spacing, unread reveal, faint reaction chip |
| page | watermark tile under the chat, unchanged opacity and placement |
| chrome | topbar/navigation glass, account card, popover and context-menu glass |
| composer | action alignment, tray height, send button and input growth |

- **2026-11-14, `/review/` message row.** The chat refactor moved Alice's grouped avatar from the last
  group row to the first line and dropped the inner corner chain. Resolved: the avatar is on the group end,
  the bubble chain uses `--bubble-inner`, and C13 guards both. The before crop stays the reference.
