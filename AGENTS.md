# AGENTS.md

This file is the whole design of the project, rewritten from the lessons of its first life. It has
three parts: **Rules**, the **User Core Requirements**, and the **Design**. Nothing here describes
the current working tree; the tree is an attempt at this design, not its definition.

Read in order. Part 2 is authority over Part 3. Part 1 is authority over both. A change that needs
one of them contradicted is a discussion, not an edit.

---

# Part 1 — Rules

## 1.1 The first principle

The reader's time and trust outrank every technical preference here.

- No white flash in a dark room, no layout shift while content arrives, no click lost because a node
  was replaced under the pointer, no error hidden in a console.
- Every wait is visible, and every visible wait can be cancelled. A control that appears must work.
- An error says what happened and what to do; internal state is not the reader's business.
- One extra step is a cost. One extra second is a cost. Slow is rude.

Every rule below exists to make this principle enforceable. A rule without a check is a wish; this
file says which checks enforce which promise.

## 1.2 Precedence

1. These rules.
2. Part 2, the user's core requirements. They are the user's words, never edited here.
3. Part 3, the design. It is the engineering record and the default answer.
4. The specification and the reference implementation, read from disk.
5. `past/` and earlier attempts. They are read, never shipped.

## 1.3 The working loop

A step is short and complete. It is one of:

1. **Read.** The module, the section of this file that governs it, and — for anything
   protocol-shaped — the specification on disk. Do not plan against code nobody read.
2. **Plan.** Name the approach and the smaller alternative. A change that needs a decision the user
   owns stops here and becomes a question.
3. **Implement.** Leave the tree coherent after every file. One job per module; one implementation
   per boundary.
4. **Run it.** The real page in a browser, the protocol test for the worker, a unit test for a rule
   that can be pure.
5. **Verify at the rung the change claims.** A claim one rung above its evidence is a reporting
   defect.
6. **Record.** A defect goes to an open-defect section with symptom, known facts, ruled out, next
   step. A decision goes to Part 2 or Part 3.
7. **Commit and push** one coherent change, the reason in the body.

Before a step is called done, the single check command passes: types, lint, tests, bundle, output
audit, contracts. A budget is never raised to make it pass.

### A bug report is its own loop

Reproduce it in the browser, find the root cause, fix the cause, re-run the same reproduction, commit
with the cause named. Two failed fixes on one symptom mean the boundary is wrong (1.7).

### Changing the design

The user's words live in Part 2 and are not edited. Engineering decisions live in Part 3 with their
reason; a decision that replaces an older one rewrites that paragraph. Adding a rule adds its row to
the contract table (1.8) and, when it can be checked, the check itself.

### What a step leaves behind

| a change that | also leaves |
|---|---|
| fixes a defect | the reproduction that failed before and passes after, named in the commit |
| adds behavior | a unit test for the rule, or a browser run whose assertion is the behavior |
| adds or moves a rule | its contract row and the check |
| changes a decision | the rewritten paragraph in Part 2 or Part 3, never a second description |
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

The first paint has its own evidence: a screenshot at load, a screenshot after the stored data
arrives, and the absence of a shift between them. "It looked fine" is not evidence.

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
- A comment states what the code cannot: a protocol quirk, a browser behavior, a security boundary, an
  invariant. One line, English, no decoration. Code, identifiers, commits and docs are English;
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
| C1 | one catalog key set per language; every key read; nothing empty | catalog test and contracts |
| C2 | every protocol command has a handler | contracts |
| C3 | the client never imports the SDK; the worker never imports the interface; a page never imports client code | contracts |
| C4 | every page has a language, one `h1`, a scriptless note, and the chat page carries its regions | page tests and contracts |
| C5 | every manifest name is hashed and present in the output | audit and contracts |
| C6 | client bundle and stylesheet budgets | contracts |
| C7 | no TODO marker, no console output, no Chinese outside the Chinese catalog | contracts |
| C8 | every screen exists in every language; English at the root | contracts |
| C9 | a new web feature is in `features.md` and passes the platform check | feature check and review |
| C10 | the first paint has no placeholder, no fade, no layout shift | browser first-paint run |

A budget is a decision, not a target. Raising one is a change to this file with the reason.

## 1.9 Review, commits, sessions

- Before a multi-file change is reported, it is read once against this file by a reader with no
  memory of writing it. The answer is a list of blockers.
- One commit is one coherent change, imperative, reason in the body, the contract or section named
  when it is not obvious. History is never rewritten. A mistake is corrected by the next commit.
- Every commit is a place a reader can stop: the tree builds, the gate passes, the documents agree.
- A session starts by reading this file, the open defects, and the status table. It ends green, the
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
- Adding a new feature because it is new, before the four questions in 3.10 are answered.

---

# Part 2 — 用户核心要求

这一部分是用户的话,是产品的承诺。不在这里编辑;变更先讨论。

## 2.1 产品

一个快、省、本地优先的 Matrix 客户端。页面加载后即可离线使用;看消息、翻历史、搜索、发送都不该被网络或动画卡住。绝大多数 Matrix 客户端卡顿,这个不能。

输出是静态目录:没有后端,没有服务端渲染。协议、同步、加密都在 worker;主线程只画。技术栈是 TypeScript + esbuild,外加 `matrix-js-sdk` 与 rust crypto wasm,以及消毒器;没有 UI 框架、组件库、CSS 框架、状态库、路由库、i18n 库、日期库、图标字体、外部字体。

## 2.2 速度与首帧

- 第一眼看到的就是最终画面。没有骨架屏,没有白闪,没有"先占位再替换",没有抖动。
- 本地数据先出。房间列表、分区状态、顶栏身份来自本地,不等待同步、不等待加密初始化。缓存的密钥门状态可以先画,后台的检查再纠正。
- 顶栏、标题、描述在首帧就有最终位置和最终颜色。标题和描述过长时截断,绝不换行。没有选中房间时顶栏仍在,身份区留空或显示一个转圈,不做淡入淡出,不做流动灰带。
- 加载是可见的、可取消的;没有空白等待。首帧不做入场动画;页面重绘可以有短动画,并遵守 reduced-motion。
- 折叠分区按账户记忆。列表原地更新,不重建节点;首帧的状态在绘制前应用。
- 刷新应该像无感刷新:该在的内容已经在,变化的内容只变一次。

## 2.3 界面

- **骨架交给 HTML,外观交给 CSS,业务逻辑才交给 JS。** HTML 不含内联 CSS/JS;样式表与脚本外部引入。
- 没有 JS 时页面是完整的:导航、顶栏、时间线区域、输入框都在,只是没有数据。需要 JS 的能力必须是 `<button>`,由面板说明缺少 JavaScript;不用 `<a>` 假装能点。
- 两墨一纸:表面声明墨的比例并据此推出文字色;浅色与深色各一套,用 `light-dark()`。所有颜色、字体、字号、间距、圆角、时长都是 token;规则只用 token。
- 流体布局:`clamp()`、`minmax()`、`auto-fit`、容器查询;不用宽度媒体查询。窄屏与宽屏是同一套布局的两种状态。
- 不用阴影、渐变、玻璃、卡片化仪表盘、大厂范式。
- 焦点永远可见;点击目标不小于 24px;动画短、可打断、只动 transform/opacity/color,reduced-motion 下关闭。
- 文案只陈述读者需要知道的事实。不解释他看得见的东西,不写空话、营销腔或机器腔。文案只在带类型的 catalog 里,缺键是编译错误。

## 2.4 弹窗与悬浮

这是两类,不是一类:

- **弹窗**:设置、搜索、新消息、邀请、加入、创建。用 `<dialog>`,虚化背景,背景不可操作,焦点被限制在弹窗内,关闭后焦点回到触发它的控件。背景点击、Escape、关闭按钮都能关闭。`closedby` 直接用,不做 JS 兜底。
- **悬浮**:房间菜单、语言菜单、表情/贴纸选择器、附件选择器。用 popover,不虚化背景,不限制焦点,点击外部关闭。

触发弹窗用声明式命令(`commandfor`),关闭也声明式;不需要 JS 就能打开和关闭。悬浮继续用 `popovertarget`。

## 2.5 聊天

- **左导航**:菜单区(搜索、新消息、邀请、加入、创建、设置)+ 房间区(收藏、房间、私聊、频道四个分区,默认只展开房间,状态按账户记忆,空区隐藏)。频道是 space,点击就地展开子房间,不改变右侧内容。房间行有头像、名称、预览、时间、未读/提及、静音、当前高亮;菜单在房间卡片上。
- **右顶栏**:窄屏返回、头像、标题在上描述在下、房间菜单。没有选中房间时 bar 仍在。
- **右内容**:没有房间时不渲染房间内容;有房间时顶栏、时间线、输入框。未登录在时间线位置说明;密钥门未完成说明密钥未设置;这两种状态由 JS 在知道会话之后画,静态页不预置。
- **时间线**:自己的消息靠右、他人的靠左;同一发送者连续段只显示一次头像和名字;图片/视频/贴纸没有气泡底色,时间是小标签;只有一行的文字气泡撑长,时间留在同一行;日期分隔、已读线、新消息提示是行间小元素;不能解密的消息说明原因;加载更早、跳转、新消息提示都不阻塞滚动。
- **输入框**:附件、贴纸、输入框、表情、发送。附件支持多选和粘贴,同一缓冲区,可移除、有进度、可取消、可重试。Enter 换行,Ctrl/Cmd+Enter 发送,输入法组字期间不发送。输入框随内容长高到上限后内部滚动。草稿按房间保存。发送顺序:文件一条一个消息,随后文字。
- 消息菜单:回复、回应、编辑、删除、复制文本、复制链接。右键、长按、键盘都能打开。

## 2.6 登录、密钥门、设置

- 服务器地址、`.well-known`、`/versions`、`/login` flows;密码登录、SSO、注册(含交互式认证阶段)。忘记密码在重置流程存在之前不出现。
- 密钥门强制。三条路径:恢复密钥/口令、另一台设备 SAS 验证、重新开始。注册后只有"重新开始"。恢复密钥只显示一次,等宽字体,可复制、可下载,不写日志。未完成前聊天页不可交互,也不渲染房间数据。
- 设置一个对话框:账户、通知、安全、关于。账户有头像、显示名、MXID、语言、退出登录;安全有设备验证、恢复密钥、备份、重置、会话列表(验证/登出单台/登出其他);通知有应用内徽章、标题总数、桌面通知(默认关闭、手势请求、可关预览);关于有版本、源码、许可、无统计。
- 房间设置从房间卡片菜单打开:概况、成员、通知模式、加密状态(只读)、离开。没有权限时只读。
- 个人资料从发送者、成员行或提及打开。

## 2.7 平台与安全

- Chrome、Firefox、Safari 三方在 2026-10 的版本内可用。Baseline 2026 是底线,不是上限;每个新特性都用检查命令核实,不靠记忆、不靠文章。只有三大浏览器都支持才用。
- 不满足三家的特性不用;`features.md` 只记录确实能用到的特性。
- 事件、资料、房间名、formatted_body 一律不可信;富文本过白名单消毒器。CSP 不允许内联脚本与内联样式;没有第三方请求,没有统计。
- token 与密钥只在 worker;主线程只看到会话摘要与一次性显示的恢复密钥。不记录 token、密钥与消息正文。
- 离线是正常状态:预缓存 shell,导航 cache-first 并后台更新;消息、房间、头像在 IndexedDB 里,由 worker 独占;homeserver 请求永不进 HTTP 缓存。

## 2.8 范围

- **先做**:登录与密钥门。
- **范围内**:房间与时间线、发送与接收、回复/编辑/删除/回应、媒体、贴纸与表情包、本地搜索、设置、会话与设备验证、频道、通知、离线。
- **不做**:通话与视频、线程、低优先级分区。邀请进菜单。

---

# Part 3 — Design

## 3.1 The model

Five decisions shape everything else:

1. **One writer per fact.** The worker owns the account database, the SDK and crypto. The main thread
   owns the UI database and the interface. A module asks another layer for a fact; it never reads
   that layer's storage directly.
2. **Local first.** The database is the source of the interface. A sync, a reload or an offline start
   reads the same projection. The network is an update, not a prerequisite.
3. **Deterministic restore.** On load, the cached session state decides the first frame; the worker
   verifies in the background and corrects the gate. The reader never watches a blank shell while
   crypto initializes.
4. **One protocol.** Client and worker never import each other; they speak commands and events. A
   command has an id and a reply; an event has no id.
5. **Every promise has a check.** A rule that no check enforces is a wish; the contract table in 1.8
   names the owner of each promise.

## 3.2 Architecture

Build time only: catalogs (pure data, one typed object per language), a tiny HTML builder (escaping by
default), asset records, layouts, components (markup in, string out), pages (one function per page,
region ids shared with the client), and scripts (build, pages, audit, features, contracts).

Runtime: `protocol/` (command and event unions), `client/` (store, worker client, router, one module
per region), `worker/` (api, session, db, projection, media, keys), and `src/styles/` (one stylesheet,
tokens first).

Dependency direction is one way: catalogs → lib → layouts/components → pages, build time only;
client and worker depend on protocol and core types, never on each other.

Each page is one document. `<body data-page>` tells the client what to boot. Region ids live in one
module imported by both the generator and the client, so the two cannot disagree.

## 3.3 Data

The account database is opened by the worker and nobody else. Its stores: session and per-room
cursor, rooms, events (indexed by room and by room+time), members, and media keyed by a content
address. The UI database holds locale, last account, collapse state, drafts, and recent emoji.

A message row carries identity, room, sender, name, avatar, time, kind, body, HTML, media, reply,
edited, reactions, mentions, status, error, encrypted flag, membership, and search tokens. The HTML
is stored raw and sanitized at render.

**The projection has two directions.** Forward: every event after the room cursor, plus the last
thirty rows, because an edit, reaction or redaction changes an older row without adding one.
Backward: after a scrollback, walk from the start of the live timeline and stop at the first stored
id, because the cursor marks the newest row and cannot see that direction. Neither pass clears a
store; a room disappears only on an explicit leave.

The queued message is an ordinary row, written under its transaction id before the request. The
remote echo carries the same id and replaces it. A failed send leaves a failed row with an error;
retry resets it, discard deletes it.

Relations come from the SDK aggregate at projection time, so there is no second store to replay. An
annotation counts once per sender per key, and `me` is the viewer.

Read state is one call that moves the receipt and the fully-read marker together; the room row keeps
the receipt id so the timeline can draw where reading stopped.

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

**Start order.** `start` is sent once, before any room is opened. The stored rooms paint from the
cached gate state; the start reply corrects the gate if the keys are gone. The room window is opened
only after the start reply, and the timeline waits for it instead of racing it.

**Failure.** A worker error marks the connection degraded and restarts it once; the projection on
disk is untouched. There is no main-thread SDK fallback.

## 3.5 UI

The store is a key table, not a render pass: phase, session, rooms, room id, messages, has-older,
connection, keys, typing. `set` compares each key by reference and notifies only changed keys. A
region subscribes to the keys it reads. Regions: navigation, header, timeline, composer, surfaces.

The composer and any open surface own their state and are never re-rendered by a store change; that
is what keeps the caret and the selection.

**Navigation** is built once. Rows are keyed by room id and moved only when order changes, so a sync,
a repaint or a reload never rebuilds the list under the pointer. Section state is per account, with
the old global map as the migration base; the default is rooms open, the rest closed.

**Topbar** has four cells: back (narrow only), room avatar, title over topic, room menu. The title
and topic truncate, never wrap. The bar stays when no room is selected. The identity area is
JS-only until real data exists; there is no static placeholder and no fade.

**Timeline** rows are keyed by message id and updated in place; day separators, the read line and
the older control are display items with their own keys. New rows append; backfill prepends and
restores the scroll position from an anchor, whether the list grew or the server had nothing older.
Opening another room resets the anchor and the pinned state. A receipt moves only while the newest
row is on screen.

**Composer** owns its draft, its tray, its height and its selection. The dialogs never cover it; the
overlays never steal its caret.

**Overlays are two kinds.**

- *Dialog*: a `<dialog>` with `showModal`, opened by `commandfor`, closed by `command`, `closedby`
  and Escape. The backdrop is `--scrim` plus a small `backdrop-filter` blur. The background is inert,
  the page scroll is locked with `:has`, focus starts inside and returns to the trigger. No JS is
  needed to open, close, or dismiss it. No JS fallback for `closedby`.
- *Popover*: a `popover="auto"` section with `popovertarget`, no backdrop, no focus trap, dismissed
  by an outside click. Menus and pickers are popovers; they position themselves from the trigger
  rect (anchor positioning is not in the platform floor yet).

The entrance of either uses `@starting-style` and `transition-behavior: allow-discrete`, never a
skeleton and never a fade on the initial page load.

## 3.6 First paint

The static document is the shell: markup, stylesheet, script tag, regions, scriptless note. It never
contains room data, a "not signed in" sentence, or a loading placeholder.

On the chat page:

1. The account's last gate state selects the interface phase; the stored rooms and per-account
   section state paint immediately.
2. The topbar is part of the static shell, at its final height and background. The avatar, title and
   topic appear when the room is known; the bar does not move when they do.
3. `start` is posted; the stored rooms event renders; the start reply corrects the gate; `open`
   follows and the timeline fills.
4. Nothing animates on this first pass. A sync that changes the list updates rows in place.
5. A page reload is the same path. A background sync is the quiet one: same rows, same positions.

The measured evidence is a screenshot at load, a screenshot after the data, and a comparison of the
topbar and list boxes between them.

## 3.7 Build, assets, and caching

Three entries — client, worker, stylesheet — bundled by esbuild, minified, content-hashed, with a
metafile the page generator reads. HTML minified. Output is a static directory, committed and
audited: the audit regenerates every page and fails on a byte of difference.

Assets are one of five things: a module import (hashed by the bundler), a stylesheet `url()` (hashed
by the bundler), a page asset named in the generator's list and resolved through the manifest, a file
the client needs by fixed name declared in a `<meta>` tag, or a platform file copied verbatim from
`static/`. Icons that follow `currentColor` are functions returning SVG, not files. The worker never
imports an asset. The generator never imports a browser module.

The crypto wasm is copied by the build with a hash of its bytes and served as `application/wasm`;
the worker initializes it explicitly before rust crypto.

The service worker is generated with the manifest inlined, so its bytes change exactly when the shell
does. Install precaches the locale's pages and hashed assets; navigation is cache-first with a
background revalidate; `skipWaiting` and `clients.claim` keep one version live; registration is
production-only with `updateViaCache: "none"`.

## 3.8 CSS

Tokens in `:root`: page and ink, a surface ladder, derived text tones, rule, mark, scrim, focus, the
type ladder, leading, spacing, radii, ease, and layout sizes. Rules only use tokens.

Surfaces: navigation and room header use the raised surface; timeline and composer use the page; own
bubbles are one step above the other bubble; overlays use the popover surface with a rule. The dialog
backdrop uses the scrim plus the blur.

One container query on the body switches the narrow shell; no width media query. `appearance: none`
on every control before styling. Focus is a visible outline at a small offset; never removed.

Animations are short, interruptible, and limited to transform, opacity and color; reduced motion
disables them. No shadow, no gradient, no glass.

## 3.9 Testing

Pure tests: projection in both directions, store notification granularity, catalog parity, page
generation per page and locale, sanitizer allowlist, search tokens, the overlay split.

Worker tests: login, sync, send, decrypt, the gate.

Surface tests: every page scriptless, the login flow, the gate, keyboard, reduced motion, dialog and
popover behavior, wide and narrow, both color schemes, subpath base.

Real-server tests: the whole flow on a device whose state is real, including the first paint and the
timing of rooms versus crypto.

The feature check: every new feature is looked up before it is written and recorded in
`features.md`; the check passes for the platform floor.

## 3.10 Platform

The authority is the `web-features` dataset, with MDN compatibility data for what it does not name,
and `features.md` is the project's recording of what it can use. The floor is the three browsers as
of 2026-10.

Four questions before a feature is used: does the design need the behavior; does what we have already
do the job; is the feature larger than the need; does it replace code or add a second spelling.

Current decisions: `<dialog>` and popovers split the overlays; `commandfor` opens and closes the
dialogs; `closedby` dismisses them, with no fallback; `backdrop-filter` blurs the backdrop;
`@starting-style` and `transition-behavior` handle entrances; `content-visibility` and `scrollend`
serve the timeline; same-document view transitions serve room changes; `:user-invalid` serves forms;
`Promise.withResolvers`, `Map.groupBy`, set methods and `AbortSignal.timeout` serve the code.

Rejected for this floor: anchor positioning, scroll-driven animations, `interpolate-size`,
`text-box`, cross-document view transitions, and Temporal, because at least one of the three engines
does not ship them.

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

## 3.12 Phases

| phase | work | exit |
|---|---|---|
| P0 | pipeline: build, pages, audit, features, layouts, components, router, chat pages, stylesheet | four generated pages, audit green, chat complete scriptless at both widths and both schemes |
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
