# AGENTS.md

## 0. IMPORTANT — READ FIRST

This section is the user's brief and working rules. It outranks every section below. Do not edit it without the user's explicit instruction.

### 0.1 Working rules

1. 思考方案或写代码前，必须查询最新官方资料和相关项目（包括 `past/git/`）的代码。
2. 本文件里的设计讨论不一定是最终方案，可能变动；不要盲目相信。
3. 讨论不充分前，不要写代码。
4. AI 与用户的讨论要及时记录，放在用户要求和项目规则下面。用户的要求和本规则不能直接修改。

### 0.2 Original brief (verbatim, initial requirements)

```text
开发的主要技术框架只有 vite 和 typescript。样式和 HTML 设计你可以参考 blog/ 里面的。CSS 和 JS 都应该积极合理地采纳原生的现代功能，在 Chrome / Firefox / Safari 的较新版本中可以正常使用。我们不对老版本浏览器的兼容。代码要实现正确，保持最佳实践，但是不要照搬大厂或者主流代码，不要写样板代码。代码还需要以人类可读性为最重要的目标之一。配合严格的 TS / ESlint 等检查，确保网站在开发时产出高质量代码，不出错。
代码只能是英文。内容可以是多语言。
不必要时不要添加注释。注释如何添加应该规范处理。同时避免长废话注释，带有标点符号修饰的注释。
代码和文档避免 LLM 痕迹。
网站 HTML 文件里面不包含任何 CSS 和 JS 代码。CSS 和 JS 代码必须要外部引入。
网站使用 # 路由或者动态路由，可以配置。
网站可以独立的在 GitHub 搭建。
关于设计，请你务必严格地按照我们的设计观念，而不要受主流或者通用观念影响。
关于样式，你必须要研究我们的视觉设计。我们以“流体设计”和“格式塔心理学”为主要依据。网页样式始终保持正常，在适应大小时可以利用自动重排和连续缩放为工具，但是要避免意外的例如说撑破容器，元素重合，位置不正确等问题。网站使用 color-scheme: light dark; 以及 light-dark() 写法来实现跟随系统暗色模式。网站的所有颜色，字体，大小，间距等使用统一在 :root 处管理变量。网站不使用外部依赖如导入字体。需要精简合理的写法，避免冗余设计，不需要 -webkit 这种兼容写法。网站的主要视觉设计可以参考 blog/。动画应该足够快，避免让人看到掉帧，要不容易引起注意。
网站的页面设计，左边为导航区，右边为内容区。右边内容区随着左边导航选择而改变。先说左边导航栏设计，最上面是客户端功能按钮/卡片，比如说设置/搜索消息/加入房间/创建房间等等。点击后会弹窗或者显示到内容区（需讨论）。下面的频道/房间/私聊使用折叠设计，记忆上次折叠，展开后可以选择房间/频道。点击左边卡片/按钮后，右边会显示内容。我们虽然没有手机和电脑版设计，但是可以用 auto-fit, clamp, minimax, 容器查询等来根据尺寸变化，尽量保证任何尺寸下都能使用。当尺寸足够小的时候，导航区会隐藏，点击内容区顶栏功能区可以切换到导航区，点击按钮跳转到对应内容区。关于房间设置的入口是收集起来放到设置里面的一个子菜单内，还是放到房间顶栏导航区里点击后弹窗 or 内容区跳转需要讨论。聊天内容区中，我们用着类似于 Telegram 的气泡设计。输入框会随着内容变多稍微增大，但有上限。我们不支持 markdown 语法输入，用户写的任何内容都会原封不变的被自己和其他人看到。而是选中文本右键选择样式。可以渲染 markdown 消息内容。
主线程 UI 应该只使用本地数据。目前绝大多数 Matrix 都很卡顿，远远没有 Telegram 流畅。我们的客户端应该是这样的，页面加载后就可以离线使用。当浏览器 offline 或者检查服务端无法连接，就会进入离线模式。客户端的查看消息，按照内容搜索消息，以及所有不需要服务端参与的客户端设置都不需要联网就能用。消息点击即可发送，左边会有标记提醒没有发送完。我们不应该有阻塞 UI 的设计，比如说动画无法打断，按钮无法响应的情况应该避免。
我们应该尽可能使用原生现代 API。要让客户端尽可能地降低占用，提高加载速度。我们暂时不打算支持通话和视频等功能。部分功能可以暂缺。多语言和多用户可以考虑是否一开始就需要添加支持。登录界面需要支持登录和注册。
这些内容应该整理好记在 AGENTS.md 里面
```

The brief is the starting point, not the final design. Later decisions are below. When a settled decision conflicts with the brief, record it in 0.3 and ask the user before changing 0.1 or 0.2.

Requirements the user added while planning the third attempt, verbatim, because they decide
how the whole interface is written:

> 每个页面都单独做，不要做 spa。……这次呢，不管是什么页面，没有 JS 的时候都可以用。比如说聊天页面，左边是空的导航区，只有设置，无 JS 依然可以点击设置，搜索等等，如果没有 JS，里面提示没有 JS。如果没有登录，就提示没有登录。右边的聊天区照旧。

> 这次的重构要围绕着无 JS 展开，每个页面都应该检查下是否应该是否合法。

> 邀请的话做到菜单按钮，但是这个低优先级先不做。忘记密码是真的重置流程，不过一开始可以不做，把登录以及强制密钥给做好，确保能用。频道的话这次变成这样，频道的折叠菜单里面的频道卡片点击后会在下方出现频道的群族。右键频道有菜单，到时候可以用弹窗弥补可能会缺失的功能。

The reading that governs the design: a page is a document that already renders its structure and
its readable content; a script fills data and drives flows. A capability that needs a script opens
its surface and says so, rather than looking like it works. Illegal states are not a case to build
for: a normal flow does not produce them, the page renders what it can, and the way back is part of
the flow, so the script draws it.

### 0.3 Changes after the brief

- Action cards and room settings are surfaces over the content, not content-area views (sections 10-11). This changes the brief's "right side shows content".
- Markdown: only `formatted_body` is rendered; `body` is not parsed (section 20). This narrows "can render markdown content".
- Multi-language and multi-account: catalog boundary from day one; one account in v1 (section 20). This resolves "consider whether to add".
- Narrow navigation: a home screen plus a room screen, not a drawer (section 10). This is the chosen reading of "nav hides and the top bar switches back".
- Multi-document site, not a single-page app: each screen is its own generated document (0.8 W2, section 12). This narrows the brief's "# 路由或者动态路由" to the room selection inside the chat document.
- Action surfaces are popovers rather than `<dialog>`, because a native dialog cannot open without a script and the user requires the action menu to open without one (0.8 W3, section 11). This changes the brief's "点击后会弹窗" only in mechanism, not in behaviour.
- Navigation has four sections — favorites, rooms, direct messages, channels — closed by default. Invites moved into the action menu, low priority is dropped for now (0.8 W6, W7).
- Login is a flow of documents with `?server=` as the only source of its server (0.8 W9); password reset is a later slice, and until it exists there is no forgot-password control (0.8 W11).
- Reference material stays under `past/`; the design stays at the root in this file (0.8 W13).

The brief stays unchanged. If you want it amended, say so; do not edit it unilaterally.

### 0.4 Design record

Two kinds of design:

- Project design: the client's content and behavior. Scope, screens, flows, navigation, dialogs, visual language, CSS, editor, states, accessibility, i18n.
- Engineering design: how the code is written. Modules, data model, storage, worker, store, rendering, build, tests.

Current phase: the third attempt. The second implementation is archived in `past/backup2/`
and is not a source to copy from; sections 1-19, 23-33 and the decision register are being
reissued against the script-free requirement (0.2.1, 0.8). The previous engineering documents
live in `past/docs/` and describe an architecture that is no longer the one being built; they
are history and a source of detail, not of structure. No application code is written until the
section that governs it says what it does.

The thematic order is: stack, language, code rules (1-8); visual language (9); shell and surfaces
(10-11); pages and hosting (12); local-first and security (13-14); verification and exceptions
(15-16); open decisions (17); sources and references (18-19); data, worker and store (20-22);
composer, stickers, auth, rooms, search, notifications, settings, pages and the script-free state
(23-33).

### 0.5 Documentation map

`AGENTS.md` is the primary file: user requirements, rules, product decisions, and the shape of the
implementation. Everything else is read from `past/`, which is not part of the build:

| path | what it is | how it is used |
| --- | --- | --- |
| `past/docs/` | engineering design of the second attempt | detail and history; its structure is not the structure being built |
| `past/backup/` | first attempt | history |
| `past/backup2/` | second attempt | history |
| `past/blog/` | the visual reference project | token table, CSS voice, static-page generation |
| `past/git/` | matrix-js-sdk and cinny checkouts | protocol and API reference (section 19) |

Read in this order: 0.1-0.8 in this file, then the section that governs the work, then
`past/docs/` for a detail this file leaves open, then the reference checkouts for a protocol
question. A path is cited as `past/git/matrix-js-sdk/src/…`, never as `git/…`.

`AGENTS.md` wins on requirements, rules and behaviour. `past/docs/` wins on nothing structural: a
claim there that contradicts this file is history. `past/blog/` is a visual reference only;
`past/git/` is read-only reference code.

When a decision changes, update 0.8, the matching section of this file, and the file it names, in
the same change. Do not create a second implementation of an existing boundary.

### 0.6 Decision register

The rows below are the history of the first two attempts. They are kept because a decision that
was reversed is worth reading. Where a row contradicts 0.8, 0.8 wins.

**User decisions after the brief.**

| ID | Decision | Source |
| --- | --- | --- |
| U1 | Enter always inserts a newline; only the send button or Ctrl/Cmd+Enter sends. No Enter-send default or v1 toggle. “默认一定不能回车发送”. | user |
| U2 | A key is required before the app is interactive. Use recovery, wait for another device with SAS, or reset. Registration has no key, so it only offers reset/create. “用户登录必须要有密钥”. | user |
| U3 | Settings has a Sessions list: verify, sign out one, and sign out all other sessions in one confirmed action. The current device stays. “踢出其他设备/一键踢出所有本设备之外设备”. | user |
| U4 | Interface language is switchable; English is the source catalog and fallback. “语言最好可以修改，en 兜底”; “国际开源产品”. | user |
| U5 | Settings stay minimal: Account, Notifications, Security, About. No Appearance; style and usage are fixed. “不需要那么多设置，客户端样式以及使用方式基本固定”. | user |
| U6 | Composer: left More menu, middle textarea, right send icon. The controls sit outside the bordered input surface. No permanent emoji, paperclip, or format buttons; the format strip is transient. “左边按钮召唤文本以外的功能，中间文本输入框，右边是发送按图案”. | user |
| U7 | Attachments, images, video, stickers, and custom emoji are in scope; stickers and emoji packs are first-class. “特别是表情包”. | user |
| U8 | Settings must feel comfortable and not squeezed on common screens. | user |
| U9 | Code organization, state, modules, content/code separation, and one configuration surface are decided before implementation. | user |
| U10 | Write the complete documentation first; obtain a task brief; no application code or tests while the design is in progress. | user |
| U11 | Images and videos do not load until the user clicks the preview; after loading, the image opens in the viewer. “图片和视频默认都不会主动加载，有一个 click to show preview”. | user |
| U12 | A direct room without its own room avatar uses the other user's avatar in the list and header. | user |
| U13 | Avatars are top-aligned: one per consecutive sender group, left for others and right for own. | user |
| U14 | The client fills the viewport; no outer page margins. | user |
| U15 | Composer focus is shown on the field border; no extra inner rectangle. | user |
| U16 | One shared action menu opens by right-click, long-press, or keyboard on messages and room rows. No hover-only actions and no desktop/mobile interaction split. | user |
| U17 | Sign-in is a landing page with Sign in and Create account, then a server choice, then the methods that server advertises: password first, other methods below, registration only when allowed. Different servers offer different methods. | user |
| U18 | Loading a session that was already unlocked goes straight to the shell from local data; no gate flash and no waiting for the server. | user |
| U19 | Room settings stay a dialog from the room header, and the header carries no encryption badge. Messages show their time on every bubble, state rows have no side lines, and the sidebar has no icon row at the top and no border against the content. | user |
| U20 | The sidebar bottom is the user avatar; it opens the action menu with search, new message, join, create, settings, profile, and sign out. | user |
| U21 | The picker keeps the search field wide, puts the emoji button on its left, and uses Emoji and Stickers tabs with a scrollable body. | user |
| U22 | Selecting text in the composer and right-clicking offers bold, italic, underline, strikethrough, and inline code. | user |
| U23 | Channels are first-class: a Matrix space is a channel, its child rooms are subgroups, the channel page lists them, and the active marker follows the content pane only. | user |
| U24 | A message being decrypted says it is decrypting; only a real failure says it cannot be decrypted. Deleted messages leave the timeline. | user |
| U25 | The composer also offers heading, quote, and code block on whole lines, and the same menu removes a style, with the current state shown. | user |
| U26 | The composer is three parts: attach, the field with an emoji control inside it, and send. With an empty field the third control offers stickers. No More menu and no format strip. | user |
| U28 | Sticker images follow the sticker module: shown in the timeline without a lightbox, the body as the accessible name and the shortcode as the tooltip. Mentions of the current user are marked, an emoji-only message takes the next type step, and the timestamp sits in the bubble's bottom right. | user |
| U29 | The room list is only rebuilt when its content changes, so a click is never lost to a render that detached the row under the pointer. | user |
| U27 | A styled draft renders in place. The field shows the formatted text when it is not being edited, and editing restores the plain text at the clicked position, so the caret can never drift from a styled copy. | user |

**Settled engineering decisions.**

Rows that describe `<dialog>`, the dialog query parameter, the channel page, the five-section
navigation, the revision/ack protocol, or a main-thread outbox are superseded by 0.8.

| ID | Decision | Where |
| --- | --- | --- |
| E1 | UI source of truth is a projection store; the SDK store and crypto store stay separate. One writer per store. | 20, `data` |
| E2 | Dedicated worker is required for SDK, sync, crypto, projection writes, and media. Sync may run during the key gate for device lists and SAS, but the shell stays gated. There is no main-thread SDK fallback; service worker is not the client. | 21, `worker` |
| E3 | Worker protocol: request/response with ids, delta/reload events, revision and ack window, plain error objects, ArrayBuffer media transfer. | 21, `worker` |
| E4 | One AppStore composition with slice modules; reference equality; one rAF render; keyed timeline with a bounded DOM window and manual anchoring. | 22, `state`, `ui` |
| E5 | Composer is a textarea with a text/mark/emoji-token model and live preview. No contenteditable, `execCommand`, EditContext, or editor framework. | 24, `ui` |
| E6 | Static per-locale shells; English at `/`, translations at `/<locale>/`; boot state and full-page no-JS overlay; catalogs compiled into the bundle. | 33, `i18n`, `build` |
| E7 | One configuration surface for app identity, homeserver, locales, routes, dialogs, limits, and links. Content lives in catalogs and CSS tokens, not in components. | `config`, `code-organization` |
| E8 | Plaintext projection and local search; tokens and keys stay in the worker; DOMPurify; CSP; profile data and pack media are server-visible. | `data`, `security` |
| E9 | Tests: Vitest units, Playwright browser flows, E2EE and offline scenarios, local homeserver. | `testing` |
| E10 | Reference checkouts are matrix-js-sdk `14a114e` and Cinny `474400c`; cite paths and commits. No copied code. | 19, `references` |
| E11 | A media-only service worker may proxy authenticated video; this is a spike, not a settled fact. | `build`, `security` |
| E12 | Fixed behavior: no theme, membership-row, density, or Enter-send toggles; images and videos are click-to-preview. | 32 |
| E13 | A completed session renders the shell from the projection before the worker starts: `lastAccountHash`, a cached session summary, and `keyGate:<hash>` in the UI DB. The worker starts in the background and a failed re-check downgrades to the gate. | `state`, `ui` |
| E14 | One container query on `body` at `44rem` switches home and room screens; dialogs sit outside the shell and respond to the same container. No width media query. | 9, 16, `ui` |
| E15 | CSP allows no inline script, so no hash or nonce. The output audit fails an inline script; a foreign inline script stays blocked. | 14, `security` |
| E16 | Layout tokens: `--action`, `--action-hover`, `--action-text` for the primary control, `--control` for input and button fills; navigation and content header use `--surface`, the timeline and composer use `--page`. | 23, `ui` |
| E17 | The worker owns the outbox delivery: one message in flight per room, retry with exponential backoff for transport, rate-limit and unknown errors, manual retry, cancel of a queued row. The main thread only writes the record. | 13, 20, `worker` |
| E18 | Transient feedback is one rendered live region. `ui.toast` is the only user-visible error and confirmation surface; internal state is never shown to the user. | `ui`, `state` |
| E19 | Commands that need the client wait for the worker's readiness instead of failing during the boot window; session commands are exempt. | 21, `worker` |
| E21 | A relation reaches its target through the sync stream, not the timeline: the SDK aggregates a reaction or an edit into its parent and an encrypted one is readable only after decryption, so the worker reads every sync event, decrypts it, and applies the relation. Annotations are stored, deduplicated, and withdrawn by redacting them. | `worker` |
| E24 | A keyed row that cannot be updated in place returns the node that replaced it, so the list never re-inserts a detached row. | 22, `ui` |
| E25 | Every projection read is scoped to the open room, newest 2000 rows; a delta for another room is dropped. | 20, `state` |
| E26 | A closed `<details>` section wraps its rows in a box that is `display: none`, because a row with an explicit display keeps layout and swallows clicks otherwise. Sections are open until the user closes them. | 10, `ui` |
| E28 | An own message is projected from its remote echo: the SDK replaces the local echo in place, so the timeline never announces it again and only a real id is written. | `worker` |
| E29 | A rebuild writes events and relations instead of clearing them, because the SDK window only holds the last pages and a rebuild can race an echo. | `worker`, `data` |
| E30 | A deep link is never rewritten from a projection read; an unknown room shows the empty panel, a partial first sync cannot drop the route. | 12 |
| E31 | The shell waits for the local projection behind one full-screen loading state that is already in the static HTML, so the first paint contains rooms, avatars and the open timeline. | 33, `ui` |
| E32 | A rebuild writes rooms, events and relations and never clears them; a room disappears only on an explicit leave. `m.direct` is kept in the projection so a restart cannot reclassify a direct message. | 20, `worker` |
| E33 | One scroll anchor holds the position: a message row, restored after a page, a window shift, a decoded picture or a row that stops decrypting. Media boxes keep their size through two quiet retries. | 22, `ui` |
| E34 | Avatars and other cached media are read from the account database on the main thread; the worker is asked only on a miss. A room with an avatar never draws its letter first. | `ui`, `data` |
| E35 | Media messages carry no bubble; their time is a chip on the picture. The emoji panel is one scrolling surface (emoji then stickers) above the emoji button, and a surface fades in on open and out on close. | 23, 25 |
| E27 | The account card, the emoji and sticker panel, and the action menu are three separate surfaces: the card unfolds in the navigation, the panel floats over the composer with one instance at a time, the menu opens at the pointer. | 10, 11, 25 |
| E22 | Read state is one call: `setRoomReadMarkers` moves the receipt and the fully read marker together, and the timeline draws the marker where it sits. | 20, `worker`, `ui` |
| E23 | Display names are disambiguated with the MXID when two members of a room share one. The count comes from the room summary, not the locally loaded members. | `data`, `ui` |
| E20 | Outgoing events are built in one place: reply mentions the replied-to sender, every text message carries `m.mentions`, an edit carries the prefixed fallback body, a redaction goes through the SDK's redaction path. | 14, 24, `worker` |

**Open decisions.**

| ID | Decision | Where |
| --- | --- | --- |
| O1 | Automatic redirect from `/` to the browser language shell. v1 stays English with a visible switch. | 17, `i18n` |
| O2 | SDK worker spike under esbuild: the worker entry, the SDK import graph, the rust crypto wasm through `initAsync(url)`, login and decrypt. It must pass before the data layer is written; there is no main-thread fallback. | `worker`, 34 |
| O3 | Authenticated video: media-only service worker proxy or blob download. | `build` |
| O4 | Pack authoring and editing. | 25 |
| O5 | Room member kick/ban moderation. | 29 |
| O6 | Enabling encryption on an existing room. | 29 |
| O7 | Password reset and account deactivation. | 26 |
| O8 | Push gateway for a closed page. | 31 |
| O9 | Project license. | 32 |

### 0.7 Status and precedence

- Design: this file. Sections 1-19 and 23-33 are reissued for the script-free, multi-document
  shape; 0.8 holds the decisions that the third attempt is built on.
- Implementation: P0 (the pipeline) is in place — `scripts/build.ts`, `scripts/pages.ts`,
  `scripts/audit.ts`, `scripts/features.ts`, `src/lib`, `src/catalogs`, `src/layouts`,
  `src/components`, the router and chat pages, and the stylesheet. P1 onwards is not started.
- Checks: `npm run check` runs `tsc --noEmit`, type-aware Oxlint, Stylelint, Vitest, the esbuild
  bundle, the page generator and the audit, and passes.
- Verified in earlier attempts, not in this one: worker/SDK/rust wasm on Chromium, registration
  with UIA, the key gate, SAS verification, sessions, E2EE text and image, media upload, the
  composer format menu, the picker, the wide and narrow shells, and a CSP that raises no
  violation against a real homeserver.
- Never verified in any attempt: Firefox, Safari, SSO against a real identity provider,
  notifications, two-device SAS, offline reload, a GitHub Pages subpath, video and audio.
- Open decisions: 0.6, 0.8 and the open list at the end of 0.8.

Precedence:

1. 0.1 working rules; not editable.
2. 0.6 settled decisions and 0.3 changes after the brief.
3. 0.2 original brief where not superseded.
4. Thematic AGENTS sections.
5. `docs/` implementation detail.
6. Reference code in `git/` and other projects.

If code and docs disagree later, the code and its tests win for implementation; user rules still win. Update the docs. Nothing is implemented until the matching design document is current.

Rules for the maski Matrix client. `past/blog/` is a separate reference project and keeps its own `AGENTS.md`. Where this file conflicts with general practice, this file wins.

### 0.8 Decisions for the third attempt

These supersede any earlier row they contradict. Each names the section that spells it out.

| ID | Decision | Where |
| --- | --- | --- |
| W1 | Skeleton in HTML, appearance in CSS, behaviour in JS. Every page is a document whose structure and controls are written by the generator and styled by the stylesheet, so it is complete to look at with no data and no script. A script fills data and runs flows; it never creates the frame. | 4, 8, 9, 33 |
| W2 | Multi-document, not a single-page app. Screens are their own documents; a room is `#/room/<id>` inside the chat document, because a room is local data with no server-addressable URL. | 12 |
| W3 | Action surfaces are native popovers declared in the markup, not `<dialog>`: a dialog needs `showModal()`, so it cannot open without a script, and the action menu must. | 11 |
| W4 | The store is a key table and a region names the keys it reads, so a change repaints only what depends on it. No whole-shell render. | 22, 4 |
| W5 | The worker owns the account database; the main thread owns the settings database only and no message row. A queued message is written by the worker and read back in the room window. | 20, 4 |
| W6 | The navigation has two areas: a menu area of client actions at the top, and a rooms area below it holding four sections — favorites, rooms, direct messages, channels — closed by default, with the open state remembered per account. Invites are one entry with a count in the menu area. Low priority is not in this version. | 10, 27 |
| W7 | A channel is a space. Activating its card expands it in place and shows its child rooms as cards in the same section, one level; it does not change the content pane, which only a room selection changes. The context menu (right-click, menu key, long press) opens on the channel card. Child rooms live under their channel and are not repeated in the rooms section. | 10, 27 |
| W8 | The home page (`/`) is a router, not a screen: it decides between the sign-in flow and the chat page and moves with `replace()` behind a short, interruptible transition. Without a script it says so and offers both ways as plain links inside `<noscript>`. A direct entry to `/chat/` without a session shows one note, "not signed in", where the timeline would be. | 12, 33 |
| W9 | Login is a flow of documents. `/login/` chooses the server; the server's advertised flows decide whether the next document is `/login/password/` or `/login/sso/`. `?server=` is the only source of that state. | 12, 26 |
| W10 | The key gate is its own document (`/key/`) and it is mandatory: the chat page is not interactive until it completes. Login and the gate working end to end come before every other feature. | 26 |
| W11 | Password reset is a real flow but a later slice. Until it ships the password page carries no forgot-password control, rather than a link that apologises. | 26 |
| W12 | Pages are generated from functions and the output is committed: `scripts/pages.ts` writes every document for every locale, and the audit regenerates and fails on any byte difference. One source, checked-in output, no dev-time generator. | 33 |
| W13 | Reference material is read from `past/`: `past/docs/`, `past/backup/`, `past/backup2/`, `past/blog/`, `past/git/`. The root holds this file, the configuration, the sources and the generated pages. | 0.5, 19 |
| W14 | esbuild is the bundler, behind `scripts/build.ts`. It has no opinion about HTML, so the generator owns the documents and esbuild owns the bytes. The crypto wasm loads through an explicit `initAsync(url)` with the hashed path from the manifest. | 6, 34 |
| W15 | Every page has one `h1`, semantic landmarks, region ids from a single module, and a `<noscript>` note naming what needs a script. The page audit checks each document for exactly that. | 8, 33 |
| W16 | An action that needs a script is a `<button>`; a navigation is an `<a href>`. No anchor exists that only a script can make work, and no button pretends to submit. A way back into a flow is rendered by the script, and the static page carries the note instead. | 8, 12, 26 |
| W17 | esbuild is the bundler behind `scripts/build.ts`. JS and CSS are minified, every asset we reference ourselves carries a content hash, and `static/` holds only the names the platform itself asks for (`/favicon.ico`, `/robots.txt`, `/sw.js`, `/404.html`). | 6, 34 |
| W18 | The shell is precached by a service worker: navigation is cache-first with a background revalidate, hashed assets are immutable, and homeserver traffic is never cached. A reload paints from cache before the network answers. | 34 |
| W19 | Layouts and components are functions that return markup: a base layout owns `<head>` and an empty `<body>` slot, a page fills it, a component takes explicit data and touches no global state. Behaviour attaches to the regions those functions name. | 34 |
| W20 | No text lives in a layout or a component, not even a title: every string arrives from the catalog of the locale being written, and a missing key is a compile error. English is generated twice, at `/` and at `/en/`, and the second declares `/` as its canonical. | 2, 33, 34 |
| W21 | A plan is a hypothesis. When a part cannot be made to work after two adaptations, it is redesigned or rewritten instead of carried: the thresholds are in section 35, and a rewrite of one module is the normal repair, not a failure. | 35 |
| W23 | Every screen is its own document at an extensionless address: `/`, `/server/`, `/login/`, `/login-oauth/`, `/register/`, `/reset/`, `/key/`, `/chat/`, each also under `/<locale>/`. Each page is written as `<name>/index.html`, so a static host serves `/chat/` and a reload there is just a file. A room is selected inside the chat document with `#/room/<id>`: `/zh-CN/chat/#/room/<id>`. | 12 |
| W24 | The home page is a loading page and nothing else: the mark above, a spinner below, and the `<noscript>` note. It resolves the locale once (stored choice, else the browser language) and then moves on with `replace()`. A stored choice is never overridden by the browser language again. | 12, 33 |
| W25 | The chat page renders no data without a session: the frame stays browsable, the content pane says "not signed in", and the router is what moves a reader to the login flow. | 10, 12 |
| W26 | With no room selected the content pane renders no room at all: no header content, no timeline, and the composer is present but cannot send. | 10, 28 |
| W28 | The composer has four parts: attach, sticker, the field (with the emoji control inside it at the field's end), send. The attach and sticker controls are ordinary buttons; the emoji control inserts a plain character at the caret, and the sticker control sends an `m.sticker`. | 24, 25 |
| W29 | Paste and the attach control both feed one tray above the field: several files at once, each removable. A picture is sent as its own `m.image` in order, and a text draft follows as a separate `m.text`; there are no captions and no albums. | 25 |
| W30 | A media message has no bubble surface. Its time sits at the bottom right of the picture, and a single-line text bubble grows so the time shares that line instead of wrapping to the next. | 23, 28 |
| W31 | The first paint is the final frame. There are no skeleton rows, no shimmer and no placeholder copy that a script later replaces; data appears in place, and the geometry of the frame does not move when it does. | 33, 9 |
| W27 | Room actions live in the room card's context menu in the navigation. The room header is back on narrow, then the room name and its topic, and nothing else: no menu and no control for the room, because with no room there is no target for one. On a narrow screen the room menu is therefore reached by going back to the navigation, which is one screen away. | 27, 28, 29 |
| W22 | Only platform features that Chrome, Firefox and Safari all ship in 2026 are used, each one recorded in the ledger (section 38), and the newest such feature is preferred over a workaround. No vendor prefix, no polyfill, no `@supports` branch that exists to paper over an engine. A feature counts only when every declaration we write is supported, which is checked on MDN when the rule is written. | 7, 9 |

Open for the third attempt:

| ID | Decision | Where |
| --- | --- | --- |
| O10 | Password reset is not built now: no `reset/` document and no forgot-password control until the flow exists. The page and its endpoints stay open. | 26 |
| O12 | Pack authoring and the picker's storage of recents and favourites: **in scope**, to be built after the chat works. | 25 |
| O13 | Enabling encryption on an existing room and member moderation: **in scope**. | 29 |
| O14 | Push gateway for a closed page and a notification centre: **in scope**. | 31 |
| O15 | Bundle size work: split points and the SDK chunk: **in scope**, measured once the data layer exists. | 6, 34 |

## 1. Stack

- TypeScript, bundled by esbuild. No UI framework, component library, CSS framework, state library,
  router library, i18n library, or date library. Vite is not used: the pages are generated, the assets
  are hashed by the build, and a bundler that owns HTML entry points fights both.
- `matrix-js-sdk` owns the protocol, sync, and crypto. No other large runtime dependency.
- Sanitization uses DOMPurify. It is the only non-SDK runtime dependency. Never hand-roll an HTML sanitizer.
- Build-time only: esbuild, `html-minifier-terser`, Vitest, Playwright, Oxlint, Stylelint, TypeScript.
  None of them reaches the browser.
- npm, ESM, current Node LTS. Static output, no backend, no server rendering.

## 2. Language

- Code, identifiers, comments, commit messages: English.
- User-facing copy lives in typed catalogs and may be any language. A layout or a component takes
  every string as a parameter and holds no literal copy, not even a title or an `aria-label`.
- English is the source catalog and the fallback. Other locales translate it; a missing entry falls back to English and never shows a key.
- The interface language is a local setting, switchable at runtime; changing it updates `lang` and `Intl` formats immediately. Message content is independent of the interface language.
- Each supported locale has static pages. English is generated at both `/` and `/en/`, with `/` as the
  canonical of the two; other languages live at `/<locale>/`. Catalogs are compiled into the pages and
  into the bundle; there is no runtime translation fetch and nothing is translated on the client.
- No Chinese in code. Test fixtures may contain non-English text when the behavior depends on it.
- Use `Intl.DateTimeFormat`, `Intl.NumberFormat`, `Intl.PluralRules`, and `Intl.Segmenter`. No hand-built date, number, or plural logic.
- No sentence concatenation. A translated sentence is one catalog entry with parameters.

## 3. TypeScript

- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `isolatedModules`.
- No `any`, no non-null assertions, no enums, no parameter properties, no casts that silence the compiler.
- Guard every external boundary: sync payloads, IndexedDB records, URL params, `postMessage`, `JSON.parse`.
- `tsc --noEmit` passes.

## 4. Code shape

Three structural rules outrank the rest of this section. A change that breaks one is rejected
even when it is shorter or reads better.

**One owner per fact.** Every row and every counter has exactly one writer. The worker owns the
account database: it writes the queued message, the remote message, the room and the member, and
the main thread writes none of them. The main thread owns the interface state and the settings
database. A rule a reviewer has to remember, such as "the main thread writes the row and the
worker deletes it", is a defect: ownership belongs in the module that holds the connection.

**Subscribe to what you draw.** The main-thread store is a set of keys, and a region names the
keys it reads and is redrawn only when one of them changes. A keystroke cannot rebuild the
navigation, and a room list change cannot rebuild the timeline. Redrawing a region that did not
change is not a style question: it is how a caret, a selection and a scroll position get lost.

**Both directions of the timeline, from the start.** Sync appends after the room cursor and
revisits the tail; backfill prepends, where the cursor is blind, and stops at the first stored
id. A projection that reads forward only cannot grow history later without dropping pages, so
the second pass belongs in the first version of the file.

**Skeleton in HTML, appearance in CSS, behaviour in JS.** The generator writes every visible
structure and control; the stylesheet gives it its shape; a script only fills data and runs flows.
A frame built by a render function is a page that does not exist until the script does. A
capability that needs a script is a `<button>`, never an `<a>` that does nothing, and the page says
in a `<noscript>` note what is missing: nobody has to guess whether a control works.

- Readability first: domain names, straight-line code, early returns, explicit data.
- Correct before clever. A shortcut that loses an edge case is a bug.
- No boilerplate layers that only forward calls. No abstraction before the third repetition.
- Prefer the platform to a dependency. Prefer a small function to a class when there is no state.
- No dead code, unused export, TODO, FIXME, stub, or placeholder behavior.
- Do not copy patterns from large clients when a smaller shape fits.

## 5. Comments and docs

- A comment only states a fact the code cannot: a protocol quirk, a security boundary, a browser behavior, an invariant.
- One line, English, no trailing punctuation, no banner, no JSDoc repeating the signature, no commented-out code.
- Put decisions in this file or `docs/`. Do not narrate them in code.
- Docs are direct and specific. No introduction, no summary that repeats the list, no "comprehensive", "robust", "seamless", or "leverage", no emoji.

## 6. Checks

- `npm run code`: `tsc --noEmit`.
- `npm run lint`: type-aware Oxlint with the `correctness`, `suspicious` and `perf` categories plus the project rules, warnings denied; then Stylelint with the standard preset and zero warnings.
- `npm test`: Vitest.
- `npm run build`: code checks, then esbuild for the bundles and `static/`, then the page generator.
- `npm run pages`: regenerate every document from `src/pages/`.
- `npm run assets`: the esbuild bundle and the copy of `static/`, writing the manifest the generator reads.
- `npm run check`: code, lint, tests, build, output audit, page audit.
- A rule is turned off only in `.oxlintrc.json` with a stated reason, never inline and never per call site.
- Prettier is not used: formatting is stable by hand, and adding a formatter would rewrite the tree without finding defects.
- No `!important`, no vendor prefixes, no `outline: none`.
- A check that did not run is not a check that passed.

## 7. Platform

- Target current Chrome, Firefox, and Safari. No polyfills for old versions.
- Use native features: popover, `<details>`, container queries, `color-mix()`, `light-dark()`, `Intl`, `BroadcastChannel`, Web Locks, `navigator.onLine`, Notification, Selection and Range, ResizeObserver, IntersectionObserver.
- A feature missing from one supported browser needs a working fallback or is not used.
- Popover (`popovertarget`, `popover="auto"`, `::backdrop`) and `<details>` carry the interaction
  that must exist without a script; both are confirmed in all three targets before they are used
  for a surface the design depends on.
- A feature is used when Chrome, Firefox and Safari all ship it in 2026, checked one by one and
  recorded in section 38. Two that were planned are out: cross-document view transitions, because
  Firefox does not ship them, and anchor positioning as a design dependency, because Chrome and
  Safari are still partial.
- No vendor prefix, no polyfill, no compatibility shim, and no `@supports` branch that only exists
  because an engine is behind. If a feature cannot be used plainly, it is not used.
- No external design assets: font files, icon packages, third-party scripts. System font stack.
- Keep the main thread free: no synchronous network, no long loops in event handlers, no layout thrash.

## 8. HTML

- Every page is a document with its own markup: structure and readable content exist before a script runs.
- The markup is semantic: `header`, `nav`, `main`, `ol`/`li` for the timeline and the room list, `form` with `label`, `details`/`summary` for the sections, `popover` for the action surfaces, `a href` for every navigation.
- No CSS and no JavaScript in the document. The generator writes one external stylesheet and one external script reference per page.
- Each document carries its locale's `lang`, title, description, canonical and alternate links, theme colours and manifest.
- A region a script fills has an empty state in the markup: an empty list, a placeholder row, or nothing at all.
- A navigation is an `<a href>` and works with a script off. An action that needs a script is a `<button>`. There is no anchor whose href is a placeholder and no button that pretends to submit a form.
- A page whose data needs a script carries one `<noscript>` element naming what is missing, placed where that content would appear. It is not a full-page overlay.
- Region ids come from one module (`src/pages/regions.ts`), so the generator and the scripts cannot disagree about a name.
- Build text with `textContent`. `innerHTML` is only for sanitized message HTML.
- One `h1` per page, landmarks, labelled navigation and controls, `lang` on `<html>`.
- External links carry `rel="noopener noreferrer"`.

## 9. CSS

- The visual language comes from `past/blog/AGENTS.md` and `past/blog/src/assets/style.css`. Take the token table and the CSS voice; write our own rules. Our stylesheet is our own, influenced by it, never a copy of it.
- Grouping comes from distance, similarity, and shared region. No borders or shadows for that job.
- No separate phone and desktop layouts. One fluid shell.
- Every color, font, type step, space, radius, border, duration, and layout size is a token in `:root`.
- Rules use tokens. A raw length needs a content reason and still becomes a token.
- All appearance is written here. Markup carries no `style` attribute and no layout class invented by
  a script; when a value is genuinely per row, such as a media aspect ratio, a script sets one custom
  property and this file decides what it means.
- `color-scheme: light dark;` with `light-dark()`.
- The design is our own: no borrowed component library, framework or dashboard pattern, and no
  engine-only feature. The platform is used at its newest, but only where the three engines agree.
- Two inks and paper. A surface declares an ink ratio and derives its text tone. No literal colors in rules.
- Fluid layout: `clamp()`, `minmax()`, `auto-fit`, container queries. No width media query when a container query works.
- `min-inline-size: 0` on text-holding flex and grid children. `overflow-wrap` for long tokens. Test long words, URLs, and CJK.
- No fixed height on text containers. Use `100dvh`, not `100vh`.
- Motion uses transform, opacity, and color only. Short, interruptible, compositor-friendly. Off under `prefers-reduced-motion`.
- Reach for the platform before writing a rule around it: a native sizing, anchoring or transition
  feature replaces a measurement or a script. The feature must be supported by all three engines in
  2026 and be written without a prefix; otherwise the plain approach is the approach.
- Before a new property or function enters this stylesheet, its support is checked and the engines
  that ship it are named in the change. A partially supported feature is used only in the part that
  is fully supported.
- Focus is always visible. Targets are at least 24px.

## 10. Layout

- One shell, two panes: navigation left, content right. Content follows the selection.
- The navigation has two areas. The **menu area** at the top holds the client actions — search, new message, join, create, settings — as popover triggers (section 11), with one invite entry carrying a count. Each of these opens without a script and says in its body what it needs.
- The **rooms area** below holds four `<details>` sections: favorites, rooms, direct messages, channels. Closed by default; the open state is remembered per account. An empty section is hidden; the rooms section is always present.
- A channel is a space. Activating its card expands it in place and shows its child rooms as cards inside the same section, one level deep, never a nested `<details>` and never a second list. Expanding a channel does not touch the content pane.
- Selecting a room — from any section, including under a channel — updates the content region and the URL, as `#/room/<id>`.
- The hash decides the narrow screen. `/chat/` with no room shows the navigation alone; `/chat/#/room/<id>` shows the room alone, and back returns to `/chat/`. A hash with no id, or with an id that is not in the database, is the same as none: the navigation on narrow, the empty pane on wide. On wide widths both are visible at once, and the hash only decides what the content pane holds.
- Room header, left to right: a back control that only exists on narrow, then the room title with its topic. Nothing else. Room settings and the other room actions live in the room card's context menu, one screen away on narrow. With no room there is no header content at all.
- Content states in order: no session → "not signed in" where the timeline would be, and no data rendered anywhere; key gate incomplete → the same place says the key is not set; no room → no header, no timeline, a composer that cannot send; a room → header, timeline and composer. No extra controls.
- Messages use Telegram-like bubbles. Own and other bubbles take different surface ratios, never shadows or literal colors. Group by sender and time.
- Incoming messages with a sanitized formatted body render it; plain bodies stay verbatim.
- Pending messages carry a left-side status marker. Failed messages expose retry.
- The composer grows with content to a tokenized cap. Enter inserts a newline; the send button or Ctrl/Cmd+Enter sends.
- Rich text comes from selecting text and choosing a style in a context menu, not from markdown syntax. The written text stays verbatim.

## 11. Action surfaces

- Settings, search, new message, invite, join, create, room settings and the room and channel menus are popovers in the document. They are not routes and they are not `<dialog>`.
- Declared in the markup: `<button popovertarget="settings">` next to `<section popover="auto" id="settings">`. Opening, Escape, click-outside, focus entry and focus return belong to the browser.
- The body starts as the truthful no-script note: what this surface does, and that it needs a script. With a session the script replaces the body with the real content. A surface always opens and always says something true.
- `popover="auto"` closes the open surface when another opens, so only one is on screen.
- No URL state and no history entries: a surface is a transient layer, and a reload returns to the page underneath.
- Shell: title bar, scrolling body, footer. Width capped by `--modal-max`; height capped by `100dvh` minus the shell margin. Near-full on narrow, centered on wide.
- The backdrop uses the scrim token through `::backdrop`; the surface uses `--surface` and its derived text, radius from a token, no shadow.
- Entry is opacity only, using the surface duration token, and off under reduced motion.
- A destructive action shows an inline confirmation inside the same surface, never a second surface.
- Forms keep drafts in their own state; a request never blocks opening or closing; status appears inline.

## 12. Pages and hosting

- The site is a set of documents. Each page exists for each locale, so a new language adds documents, never a code path.
- Pages, one document each, written as `<name>/index.html` so the address has no extension: `/` the router, then `/server/`, `/login/`, `/login-oauth/`, `/register/`, `/reset/`, `/key/`, `/chat/`, plus `/404.html`. A locale prefix puts a translation at the same address under `/<locale>/`.
- The address is the file, so a static host serves every page without a rewrite rule, and a reload on `/chat/` lands on a real document rather than a fallback.
- The router decides between the login flow and the chat from the session in the database, and moves with `replace()` so the back button never returns to it. It also resolves the locale once: a stored choice wins; otherwise the browser language picks the directory and the choice is stored. After that the browser language never changes the language again. Without a script the page is the mark, a spinner and a note.
- Rooms are not pages. A room is local data with no server-addressable URL, so the chat document selects one with `#/room/<id>`, encoded. Back and forward then walk the rooms the reader visited without reloading the document. The same hash decides the screen on a narrow viewport: no hash is the navigation, a hash is the room.
- The state a page needs comes from its own URL or from local storage: the password page needs `?server=`, the gate needs a session.
- A normal flow never lands on a page whose state is missing, and there is no machinery for the case: the page renders what it can, a script renders the way back into the flow, and `<noscript>` says a script is needed.
- The base path is configurable. A page references assets by the path the generator wrote; no absolute `/` in a document or a stylesheet.
- The build is a static directory and no server rewrite is assumed. `404.html` repeats the chat document of the default locale.
- A deep link is never rewritten from a projection read: an unknown room shows the empty panel, and a partial first sync cannot drop the route.

## 13. Local-first

- The UI reads the projection through the worker and never imports `matrix-js-sdk`. The projection on
  disk is the source; the store in memory is the current view of it.
- The worker owns the network, sync, crypto and every write to the account database. The main thread
  owns `maski-ui` and nothing else.
- Startup renders from the local projection before the network. Offline is a normal state, not an
  error screen.
- Offline: viewing, search, settings, and queued sends work. `navigator.onLine` and sync failures drive the state.
- Send is optimistic because the worker writes the row first and posts the window back. The sender
  retries with backoff; `txn_id` prevents duplicates.
- No timeline or navigation handler awaits the network. No `alert`, `confirm`, or `prompt`. No long synchronous work.
- Search is local: inverted index, `Intl.Segmenter`, case and diacritic normalization.
- Settings are local. Only data that must sync is written to the homeserver.
- Namespace storage by user ID so multi-account can be added without a migration.
- One tab owns the crypto store through Web Locks. Other tabs say so.
- Media: fetch with `Authorization`, use blob URLs, load on visibility, revoke. No token in a URL.
- E2EE: rust crypto, secret storage, key backup, recovery key. Login requires a key: use recovery, wait for another device with SAS, or reset. The app is not interactive until one path completes.
- The first screen supports password and SSO login, registration, and first-run encryption setup.
- Code-split the SDK and wasm. The shell and the local snapshot render first.
- Render the timeline as keyed rows. One event updates one row, not the list. Keep a bounded window and scroll anchoring.
- A missing feature is absent from the UI, not a dead control.
- Scope: room list, timeline, composer, edits, redactions, replies, reactions, membership events, local search, notifications, stickers, custom emoji, attachments. Send and receive images, video, audio, files; send text, emote, notice, reply, edit, redaction, and reaction. No calls, video calls, threads, spaces, or push gateway in v1 unless decided otherwise.
- If the SDK runs on the main thread, yield between batches and never render synchronously from a sync callback.

## 14. Security

- Treat events, profiles, room names, and formatted bodies as untrusted.
- Sanitize `formatted_body` with an allowlist. Allowed tags: `p`, `br`, `strong`, `b`, `em`, `i`, `u`, `del`, `s`, `code`, `pre`, `blockquote`, `ul`, `ol`, `li`, `a`, `hr`, `table`, `thead`, `tbody`, `tr`, `th`, `td`.
- Strip scripts, event handlers, `style`, `class`, `id`, `javascript:` URLs, ordinary images, headings, and unknown tags. Keep the text when only the tag is dropped. Strip `mx-reply` content entirely.
- `img` is allowed only with `data-mx-emoticon`, an `mxc://` src, and `alt`, `title`, `height`, `width`; render it at emoji size. Strip every other image. The attribute value is ignored.
- Allow links only for `http:`, `https:`, and `matrix.to`; add `rel="noopener noreferrer"` and `target="_blank"` for external links. Ordinary inline images are not rendered in v1.
- CSP: `script-src 'self' 'wasm-unsafe-eval'`; `style-src 'self'`; `img-src 'self' blob: data:`; `worker-src 'self'`; `object-src 'none'`; `base-uri 'none'`; `form-action 'self'`. `connect-src` reaches the homeserver; arbitrary homeservers force `*`.
- No analytics, third-party requests, or external assets.
- Search indexes are local plaintext; notification previews can expose decrypted text, so the preview toggle and local-only notice are explicit.
- Profile display names and avatars are server-visible and not encrypted.
- SSO login tokens are consumed once and removed from the URL; recovery keys are shown once and never logged or persisted in the UI.
- Credentials, tokens, and keys are not persisted in the main thread; the worker owns them. The main sees session summaries and the one-time recovery key display.
- Logout clears the local store, crypto store, and session.
- Kicking a session invalidates its access token; bulk sign-out requires UIA. The account password used for UIA is not persisted.
- Do not log tokens, keys, or message bodies.

## 15. Verification

- Unit tests: projection in both directions, store subscriptions, sanitizer, search tokens, i18n,
  page generation and the rule that a control says what it needs.
- Playwright: each page with scripts off, the login flow, the gate, sync, send, retry, E2EE decrypt,
  collapse persistence, a subpath base, narrow and wide widths, both color schemes, keyboard,
  reduced motion, popover open and close.
- Measure computed styles, overflow, and overlap in a real browser. No eyeballing.
- Report what was checked and what was not.

## 16. Exceptions

- `connect-src *` because homeservers are user-supplied.
- One shell breakpoint switches between the home screen and the room screen on narrow widths; every other layout change is fluid.
- A page without a script keeps its structure and says what is missing: no overlay, no apology, and no control that pretends to work.

## 17. Open decisions

- Automatic redirect from `/` to the browser's language shell. Default stays English; v1 has no
  auto-redirect and always shows a language switch.
- The open list for the third attempt is at the end of 0.8.

## 18. Sources

- Check current official documentation before choosing an API, protocol feature, or dependency. Use the Matrix spec, matrix-js-sdk docs and source, MDN, and browser support tables.
- Read the implementation when the prose is vague. The code wins.
- Look at Element or another maintained client for a working reference, not a pattern to copy.
- State the source and the date in the discussion. Do not present an unverified API as settled.
- Confirm a browser feature in all three targets before designing around it.

## 19. Reference checkouts

- `past/git/matrix-js-sdk` is a shallow clone of `matrix-org/matrix-js-sdk`, branch `develop`.
- `past/git/cinny` is a shallow clone of `cinnyapp/cinny`, branch `dev`.
- Read them for protocol details, API shapes, and client structure. Do not import, build, lint, format, type-check, or test anything under `past/`.
- Exclude `past/` from TypeScript, Oxlint, Stylelint, Vitest and the build.
- Do not edit the clones. Refresh with `git -C past/git/<name> pull --ff-only`.
- Cite the commit hash when referencing a file: `git -C past/git/<name> rev-parse --short HEAD`. Current checkouts: matrix-js-sdk `14a114e`, cinny `474400c` (2026-11-11).
- The app rules win over any pattern found there.

> Engineering design note — deferred. Sections 20-22 are code-level notes from earlier discussion, not current project design. Revisit them when coding starts.

## 20. Data model

Engineering design. One database owner: the worker opens, writes and closes the account database.
The main thread opens only `maski-ui`.

**Account database** `maski-<hash(userId)>`:

| store | key | indexes | contents |
| --- | --- | --- | --- |
| `meta` | `key` | | session, revision, per-room cursor, `m.direct`, oldest row |
| `rooms` | `roomId` | | name, avatar, topic, membership, unread, preview, flags, `hasOlder` |
| `events` | `id` | `byRoom`, `byRoomTs` `[roomId, ts, id]`, `byStatus`, `byToken` (multi-entry) | one row per message |
| `members` | `[roomId, userId]` | `byRoom` | display name, avatar, membership, power |
| `media` | `key` | | cached blob and mime, keyed by `mxc@size` |

**UI database** `maski-ui`: `settings` (locale, last account, key ready, collapse state), `drafts`
(per account and room), `recent` (emoji and stickers).

**A message row** carries `id, roomId, sender, name, avatar, ts, kind, body, html, media, reply,
edited, reactions, mentions, status, error, encrypted, membership, tokens`. `html` is stored raw
and sanitized at render. `tokens` is the search index: NFKC, lowercase, diacritics stripped, split
on non-word characters.

**The projection has two directions.** A sync appends, so a forward pass reads every event after
the room cursor and re-reads the last thirty rows, because an edit, a reaction or a redaction
changes an older row without adding one. Backfill prepends, where the cursor is blind, so a
backward pass walks from the start of the live timeline and stops at the first stored id. Both
write rows; neither clears the store.

**The queued message is an ordinary row.** The worker writes it under its transaction id before the
request, so the room window already shows it with `status: queued`. The remote echo arrives with
the same transaction id and replaces the row; the `~room:txn` local echo the SDK writes is skipped.
A failed send leaves the row with `status: failed` and an error; retry resets it, discard deletes it.

**Relations come from the SDK aggregate.** Reactions and edits are read at projection time from
`room.relations`, so there is no second store to replay. An annotation counts once per sender per
key; `me` is the viewer, never the author.

**Read state** is one call: `setRoomReadMarkers` moves the receipt and the fully read marker
together. The room row keeps the receipt id so the timeline can draw where reading stopped.

**A rebuild never deletes.** A migration or a lost cursor writes rooms, events and members again;
a room disappears only on an explicit leave.

**Drafts are local.** A draft never reaches the homeserver and is never projected; it lives in
`maski-ui` per account and room, cleared on send.

## 21. Worker protocol

**Threads.** One dedicated worker per tab, created on demand: not at boot for a reader who has no
session (0.8 W14). It owns `matrix-js-sdk`, sync, crypto, media and the account database.

**Envelope.** A command carries an `id`; the reply repeats it with `{ ok: true, data }` or
`{ ok: false, error }`, where `error` is a plain string. Events carry no id. Unknown commands and
malformed events are logged and ignored.

| command | reply | notes |
| --- | --- | --- |
| `start` | `{ session, keys, rooms }` | opens the database and restores the session; sync starts after the reply |
| `discover` | `{ baseUrl, password, registration }` | `.well-known`, `/versions`, `/login` flows |
| `login` | `{ session, keys }` | one call, credentials never stored on the main thread |
| `register` | `{ session, keys }` or UIA stages | terms, token and password stages |
| `keyStatus` | `{ ready }` | secret storage ready or not |
| `unlock` / `resetKey` | `{ ready }` / `{ key, ready }` | the recovery key is returned once, to display |
| `rooms` | `{ rooms }` | the whole list; small and cheap |
| `open` | `{ window }` | the newest window for a room |
| `older` | `{ window }` | one page of backfill, sized by what the interface holds |
| `send` | `{}` | the row is written before the request; `outbox` events follow |
| `media` | a blob | worker decrypts and caches; `ArrayBuffer` is transferred |
| `markRead`, `typing`, `search` | `{}` / rows | never awaited by a render |

**Events.** `session`, `rooms`, `window`, `outbox { txnId, status, error }`, `connection { state }`,
`keys`, `typing { roomId, users }`, `fatal`.

**No revision window.** There is no ack protocol in this attempt: a pass posts a room list and, if
the room is open, its window. The payload is bounded, so a lost event costs one window, not a
rebuild. That is the deliberate trade: fewer moving parts, one snapshot per pass.

**Failure.** A worker error marks the connection degraded and restarts the worker once; the
projection on disk is untouched, so the interface keeps showing the last known state. There is no
main-thread SDK fallback.

**Media.** The worker fetches with `Authorization`, decrypts when the row carries a `file` object,
caches under `mxc@size`, and returns a blob. A thumbnail of an encrypted original is ciphertext, so
an encrypted image, video or sticker asks for the original size and the element scales it.

## 22. Main-thread store

Engineering design. A key table, not a render pass.

```ts
interface State {
  phase: "boot" | "auth" | "gate" | "ready";
  session: Session | null;
  rooms: Room[];
  roomId: string | null;
  messages: Message[];
  hasOlder: boolean;
  connection: "connecting" | "online" | "offline" | "error";
  keysReady: boolean;
  typing: string[];
  notice: string;
}
```

- `set(patch)` compares each key by reference and notifies only the keys that changed.
- `subscribe(key, listener)` returns an unsubscribe. A region subscribes to the keys it reads.
- Regions: navigation (rooms, roomId), header (roomId, rooms, typing), timeline (messages, roomId,
  hasOlder), composer (roomId, connection), surfaces (their own local state).
- The composer and an open surface own their state and are never re-rendered by a store change.
  That is what keeps the caret and the selection.
- The store is not persisted; the worker's database is the source. A page load asks `start` and
  then `open` for the room in the hash.

**Timeline rendering.** Rows are keyed by message id and updated in place. Day separators, the read
line and the older control are display items with their own keys. New rows append; a backfill
prepends and the scroll position is restored from a recorded anchor, whether the list grew or the
server had nothing older.

**One owner per fact.** The main thread writes no message row: it sends `send`, and renders the
window that comes back. Optimistic display is therefore not a second model, it is the row the
worker wrote.

## 23. CSS system

Project design. Section 9 holds the rules; this maps them to maski. The base is `past/blog/AGENTS.md` 2.1-2.9 and `past/blog/src/assets/style.css`: the token ladder and the restraint, re-derived for this client rather than transplanted.

**Rejected.**

- Elevation and shadows; accent or primary colors; 8px spacing grids; 12-column grids; width media queries; fixed sidebar widths; a card around every group.
- Pill inputs and pill buttons; gradients, glass, skeleton shimmer; hover lift or scale; colored status dots; icon fonts.
- CSS frameworks and utility classes; per-component token overrides.

**Applied.**

- Two inks and paper. A surface declares an ink ratio and derives its text; steps stay shallow, wider in dark.
- Hierarchy from size, tone, and space pointing the same way.
- Grouping from distance, similarity, and shared region. Borders and shadows do not group.
- One fluid shell. Width is the only coordinate; one container query, no phone and desktop split.
- Motion only color, opacity, and transform; short and interruptible.

**Tokens.** Copy the blog base tokens (page and ink, surfaces, text tones, fonts, leading, type, spacing, rule, radius, icon, avatar, page padding, ease). Do not copy blog component tokens such as friend, track, wave, panel, meta, art, or input sizes. Add:

- `--nav-width: clamp(14rem, 22vw, 20rem)`.
- `--auth-max: 26rem`.
- `--bubble-max: 42rem`.
- `--modal-max: 42rem`.
- `--composer-max: 12rem`.
- `--scrim: color-mix(in oklab, var(--ink) 32%, transparent)`.
- `--bubble-other: var(--surface)`, `--bubble-other-text: var(--surface-text)`, `--bubble-other-text-muted: var(--surface-text-muted)`.
- `--bubble-own: var(--surface-hover)`, `--bubble-own-text: var(--surface-hover-text)`, `--bubble-own-text-muted: var(--surface-hover-text-muted)`.
- `--badge-strong: color-mix(in oklab, var(--ink) 88%, var(--page))`, `--badge-strong-text: var(--page)`.
- `--sticker-max: 10rem`.
- `--emoji-size: 1.35em`.
- `--picker-max: 34rem`.
- `--picker-max-block: 24rem`.
- `--picker-cell: 2.4rem`.
- `--control: color-mix(in oklab, var(--ink) 8%, var(--surface))`, the fill for inputs and buttons.
- `--action: color-mix(in oklab, var(--ink) 88%, var(--page))`, `--action-hover: color-mix(in oklab, var(--ink) 76%, var(--page))`, `--action-text: var(--page)`, the primary control.
- `--radius-full: 999px`.
- `--ease` stays; reduced motion zeroes it.
- The shell breakpoint is `44rem`, a literal in the container query because container queries cannot read a custom property. This is the one breakpoint; record the reason.

**Surface map.**

| region | surface | text |
| --- | --- | --- |
| navigation | `--surface` | `--surface-text` |
| content header | `--surface` | `--surface-text` |
| active room row | `--surface-active` | `--surface-text` |
| timeline | `--page` | `--page-text` |
| other bubble | `--bubble-other` | `--bubble-other-text` |
| own bubble | `--bubble-own` | `--bubble-own-text` |
| composer bar | `--page` | `--page-text` |
| composer input | `--surface` | `--surface-text` |
| action surface | `--surface` | `--surface-text` |
| popover | `--surface` + `--rule` | `--surface-text` |
| login form | `--page` | `--page-text` |

No literal colors outside tokens. Own and other bubbles differ by one shallow step, not by hue.

**Spacing roles.**

| role | padding |
| --- | --- |
| surface: bubble, action surface | `--space-4` |
| control: input, button, navigation action | `--space-3` |
| compact: room row, member, reaction chip | `--space-2` `--space-3` |

Section gaps use `--space-6`; a message group uses `--space-4` between groups and `--space-1` within. One role, one value.

**Type.**

- The blog five steps; root 100%; every step `clamp()`; no new sizes.
- Room name `--text-md` at 600; preview `--text-sm` muted; time `--text-sm` muted, tabular.
- Content header `--text-lg`; surface title `--text-xl`; message body `--text-md`; sender and time `--text-sm`; day and state rows `--text-sm`.
- Message bodies `text-wrap: pretty`; headings `balance`; line width comes from `--bubble-max`; do not add another max width inside the bubble.
- No font size changes to fake hierarchy.

**Layout.**

- Shell `100dvh`, grid: `--nav-width` plus `minmax(0, 1fr)`.
- Content rows: header auto, timeline `1fr`, composer auto; `min-block-size: 0` on scroll areas.
- One container query at `44rem` on the shell: `data-view="home"` shows navigation; `data-view="room"` shows content. No width media query elsewhere.
- Timeline and composer span the full content width; bubbles cap at `--bubble-max`; own right, other left.
- Dialog `inline-size: min(100% - 2 * var(--space-5), var(--modal-max))`; `max-block-size: 100dvh - 2 * var(--space-5)`; internal scroll.
- Composer bar: three columns `auto minmax(0, 1fr) auto`; left and right controls sit outside the bordered text field; all align at the end. The bar stays three parts at every width.
- Composer grows to `--composer-max`, then scrolls.
- Media max 100%; code scrolls; long words wrap; no fixed text heights.
- `100dvh` only, never `100vh`.
- Navigation home screen: action rows use `auto-fit minmax(min(8rem, 100%), 1fr)`; each row is transparent at rest and uses `--surface-hover` on hover. They are rows, not cards.
- Room sections use `<details>`; the open state comes from `ui`.

**Chat specifics.**

- Own and other: alignment plus one surface step; no tails, no accent color, no shadow.
- Group by sender and day; avatar and name only at group start; consecutive bubbles tighten to `--space-1`. Avatars are top-aligned, left for others, right for own.
- Day separator: muted label, no heavy line. Read and new markers: label plus `--rule`.
- Membership and state: `--text-sm` muted, one line, no bubble.
- Pending and failed: left marker with text or icon, no color; retry visible.
- Unread count stays neutral; mentions use `--badge-strong` and `--badge-strong-text`.
- Stickers: no bubble; image only, capped by `--sticker-max`, aspect preserved, radius; sender and time muted; click opens the image viewer; reduced motion shows a static frame.
- Custom emoji: inline images at `--emoji-size`, aligned with text; alt or shortcode fallback; emoji-only messages use the next type step.
- Picker: surface plus `--rule`, no shadow; pack strip, search, tabs, and a fluid grid of `--picker-cell`; max `--picker-max` wide and `--picker-max-block` tall.
- Media: radius, aspect ratio, lazy, no bubble surface and no shadow; the time is a chip at the picture's bottom right. Attachments add video, audio and file cards; progress and retry are visible.
- A bubble is shrink-to-fit and the time is a floated inline element at the end of the text with `white-space: nowrap`, so a one-line message grows to keep the time on that line and a longer message lets it sit at the bottom right.
- Auth page: `--page`, centered at `--auth-max`; inputs `--surface`; a compact language switch; no card or shadow. The key gate uses the page, not a surface.
- Sessions: compact rows; current device marked; Verify and Sign out are text actions; bulk sign-out sits at the end and uses a confirmation. No color; last active is muted.
- Room list: section headers `--text-sm` muted; rows compact; active `--surface-active`; unread name weight; mention `--badge-strong`; muted mark; invite rows use the surface. No card.
- Timeline: group gaps `--space-4` and `--space-1`; day separators `--text-sm` muted; read marker `--rule`; new-message pill surface; action menus surface plus `--rule`; typing muted; mentions `--mark`.
- Room settings: surface shell; sections are headings and space; member rows compact; notification choices are a radio group; leave is a text action with inline confirmation. No card per section.
- Search: input is a surface control; result rows reuse room and message rows; matches use `--mark`; room name muted. No card.
- Notifications: settings rows with status text and a switch; unread badges stay neutral, mentions strong. No color.
- Settings: single scroll with section headings and rows; no cards; the Language row uses a text control; profile is a small surface; About is prose. No color.
- Boot and no-JS: the boot text uses the auth page layout; the noscript overlay is fixed, covers the boot, scrolls on narrow, and uses the same tokens. No inline styles.
- Message HTML uses a prose scope for paragraphs, lists, quotes, tables, code, and inline marks. No headings; the sanitizer drops them. Ordinary inline images are not rendered; custom emoji are.
- Code: `--code`, mono, radius, scroll.
- Links: underline in the muted tone, currentColor on hover.
- Selection: `--mark`. Focus: `--focus` at 2px.

**Dialogs and menus.**

- Dialog: scrim, surface, radius, no shadow; opacity entry with `--ease`; reduced motion off.
- Popover: surface plus `--rule`, no shadow, small, flips to fit.
- One surface at a time; destructive confirmations are inline.

**Motion.**

- `--ease`; hover and active swap a color pair; a surface and the new-message pill use opacity; bubbles never transform.
- No layout transitions and no scroll animation. Reduced motion zeroes the duration.

**Accessibility.**

- Contrast, visible focus, 24px targets, one `h1`, landmarks, labels, `aria-current`, skip link.
- No color-only status. Message text is selectable; never `user-select: none` on it.
- `prefers-reduced-motion` zeroes motion.

**Mainstream rejected in practice.**

- A Telegram clone: no colored own bubbles, tails, shadows, or status dots.
- A dashboard: no fixed sidebar, card grid, elevation, or accent color.
- A form library: no pill inputs or pill buttons; controls are surfaces with token radii.
- A settings app: no card per section; sections are headings and space.

Sources: `past/blog/AGENTS.md` 2.1-2.9 and `past/blog/src/assets/style.css`; MDN `light-dark()` (Baseline 2024) and container queries. The token ladder is the reference; the component rules are not.

## 24. Composer

Project design. The composer is a message input, not a document editor.

**Bar.** Four parts, left to right: attach, sticker, the field with the emoji control inside it at the field's end, send. The emoji control opens the picker and inserts a plain character at the caret; the sticker control opens the sticker tab and sending there produces an `m.sticker` event, while an emoji in the field stays text. The tray for pasted or attached files sits above the field (section 25).

**Shape.** A plain `<textarea>` plus a live formatted preview. The textarea holds the exact text; it never holds markup. Selecting text and applying a style records marks over ranges; the preview shows the message as it will be sent. The preview appears only when at least one mark exists.

Native undo, IME, paste, selection, and platform text behavior stay with the browser. There is no contenteditable, no `execCommand`, and no editor framework. A WYSIWYG contenteditable is the mainstream choice; it is rejected because it makes those behaviors brittle and either needs a framework or a deprecated command. The mark model is small and local.

**Marks.** Bold, italic, underline, strikethrough, inline code; clear formatting. No block formatting, links, or colors in v1.

**Menu.** Right-click a non-collapsed selection opens a small formatting menu at the pointer. A transient formatting strip appears above the textarea while text is selected and opens the same menu. There is no permanent format button in the composer bar. Each mark shows active or mixed state; click toggles; clear removes all. Escape or outside click closes; focus returns with the selection intact. The menu has no copy, cut, or paste; keyboard clipboard shortcuts remain. Touch uses the selection strip; the mouse context menu is the shortcut.

**Shortcuts.** Ctrl/Cmd+B, I, U; Ctrl/Cmd+Shift+X for strikethrough. Inline code is menu-only. Shortcuts act on the current selection and update the preview.

**Marks over text.**

- Marks anchor to characters. Typing inside or immediately after a marked run inherits its marks; typing at the leading edge is plain. Deleting shrinks or removes the mark. Replacing a selection inherits the mark of the character before the selection. Pasted text is plain and follows the same rule.
- New text does not become marked just because the caret is near a mark without a preceding marked character.
- Marks can overlap; the preview and output nest them.

**Custom emoji tokens.** The picker inserts `:shortcode:` as literal text and links that range to the pack image. The textarea shows the shortcode; the preview renders the image. Editing the shortcode text breaks the token; deleting it removes the token. Send puts the shortcode in `body` and `<img data-mx-emoticon>` in `formatted_body`.

**Undo.**

- One history for text and marks per room session; undo and redo restore text, marks, and selection. Native textarea undo is suppressed so marks cannot drift.
- IME composition is not snapshotted per keystroke; a snapshot is taken at composition end.
- History clears on send. Switching rooms keeps the draft but resets the open history.

**Preview.**

- A bubble above the composer using the own-bubble surface and text. No avatar, name, or time. A small muted "Preview" label.
- Updates on text and mark changes; not editable; does not take focus. Appears only when marks exist; disappears when all marks are cleared.
- Counts toward the composer height cap.

**Send.**

- Enter inserts a newline. Shift+Enter also inserts a newline. Ctrl/Cmd+Enter sends. The send button always sends.
- There is no Enter-to-send default. v1 has no toggle; if one is added later, it is opt-in and off by default.
- The virtual keyboard return key is labelled for newline with `enterkeyhint="enter"`; it never sends.
- Enter during IME composition never sends.
- Pasting multiline text never sends.
- Empty or whitespace-only text cannot send by itself. With attachments in the tray, the send button is enabled even when the text is empty.
- Offline sends queue; the composer clears immediately; the outbox row shows pending. No spinner in the composer.
- `body` is the exact textarea text. `formatted_body` is generated only when marks or custom emoji exist, from `strong`, `em`, `u`, `del`, `code`, `br`, and `img data-mx-emoticon`; text is escaped; newlines become `br`. No markdown and no autoformat.
- The preview is the message others should see, subject to their renderer.
- After send, text, marks, preview, and reply or edit state clear; focus stays.

**Reply and edit.**

- Reply banner shows sender and snippet; edit banner shows the target. Both have cancel and are part of the draft.
- Editing loads the plain body and supported inline marks from the source. Block formatting is flattened to text; the banner says so. Do not silently drop it.
- Cancel restores the draft before reply or edit.

**Drafts.**

- Per room: text, marks, reply or edit target, updated time. Local only; restored on switch and reload; cleared on send or cancel.
- A draft with marks shows the preview when the room opens.
- Undo history is not persisted.

**Size and states.**

- Grows with content to `--composer-max`, then scrolls. No fixed height; the preview counts. The three parts stay; only the textarea shrinks.
- Disabled with a visible reason when the user cannot send (not joined, no permission, read-only room).
- Near the server event size limit, show an inline error before send.
- Failed send: the outbox row exposes retry; the composer does not restore the text.
- Offline: sends queue; no blocking.

**Visual.**

- Composer bar: `--page`; three parts: left More icon button (plus), middle textarea (`--surface` control, `--surface-text`, placeholder muted, focus ring), right Send icon button (arrow up). Both icon buttons are square, `--surface` at rest and `--surface-hover` on hover; Send is disabled when there is no text and no attachment. The selection formatting strip sits above the textarea, `--surface` plus `--rule`, no shadow.
- Marks are not visible in the textarea; the preview shows them in the own bubble.
- Preview: own bubble surface and text; inline code `--code`; no metadata.
- Menu: `--surface` plus `--rule`, no shadow; active mark `--surface-active`; mixed state a dash; focus ring.
- Menu flips to fit; never full-screen.
- Reply and edit banner: muted text and a cancel button; no card.
- Preview label: `--text-sm` muted.

**Accessibility.**

- Textarea has a visible or hidden label "Message"; the left button is "More"; the right button is "Send" with a Ctrl/Cmd+Enter hint; the selection strip's format button has a label.
- `enterkeyhint="enter"` keeps the virtual keyboard return key as newline.
- Menu items are buttons with `aria-pressed` or `aria-checked`; mixed state is announced.
- Escape closes; focus returns; shortcuts do not trap.
- Preview is a labeled supplementary region; it is not announced on every keystroke.
- No color-only mark state.

**Out of scope.**

- WYSIWYG contenteditable, markdown input, block formatting, links, colors, ordinary inline images, mentions and autocomplete, threads. Attachments are a separate tray, not part of the text composer.
- The composer does not interpret `**`, `_`, `#`, or backticks; they stay literal.

**Incoming rendering.** The preview and timeline use the same sanitized renderer. `formatted_body` is rendered; `body` is not parsed as markdown. The allowlist is in section 14. Custom emoji render; ordinary inline images and unknown tags do not. If the sanitized fragment is empty, fall back to the plain body.

Sources: MDN `contenteditable`, `execCommand` (deprecated; notes undo preservation), `EditContext` (experimental, not baseline), `beforeinput`, `Selection`, and Clipboard API; `git/cinny/src/app/components/editor` at `474400c` uses Slate and block formatting, which we deliberately do not copy.

## 25. Stickers, emoji, and attachments

Project design. The sticker and emoji picker is a first-class surface, not a settings screen.

**Entry.** The left button in the composer bar opens a small menu with "Emoji & stickers" and "Attach files"; the textarea is the middle; the send icon is the right. The menu is a popover, surface plus `--rule`, no shadow. Choosing Emoji & stickers opens a panel with Emoji and Stickers tabs; the last tab is remembered. Choosing Attach files opens the file picker. The panel is above the composer; on narrow it is near full width above the keyboard with internal scroll. It never covers the whole timeline.

**Picker anatomy.**

- Search, tabs, and a Manage link.
- A pack strip: Recent, Favorites, then global packs, current-room packs, and space packs when spaces exist. Pack avatar falls back to the room avatar, then the first image; the name is in the tooltip and accessible label.
- A fluid grid; images lazy and aspect-preserved; keyboard navigation.
- Recent and Favorites are per account, separate for emoji and stickers. A star on a grid item adds or removes it; Favorites follows Recent.
- Search filters the active tab by shortcode or body, or Unicode name; results group by pack. Typed text is never converted automatically.

**Stickers.**

- Click sends immediately. If a reply target is active, send as a reply and clear it; the text draft remains. While editing, the sticker tab is disabled with "Finish editing first".
- The pack header shows name, image count, attribution, source, and "Use in all rooms" or "Remove from all rooms".
- A sticker is `m.sticker`: no bubble, image only, capped by `--sticker-max`, aspect preserved; sender and time muted; click opens the image viewer; reply, react, and redact work as on normal messages. A failed image falls back to the body or shortcode.
- Offline: the event queues; the image is already hosted; the cached image previews with a pending marker and retry.
- Animated stickers play; under reduced motion show a static frame. No sound.

**Emoji.**

- Emoji tab: Recent, custom packs, then Unicode categories. Clicking a Unicode emoji inserts the character at the caret. The panel stays open for multiple inserts; the textarea selection is preserved.
- Clicking a custom emoji inserts `:shortcode:` as literal text and links that range to the pack image. The preview replaces the range with the image; `body` keeps the shortcode; `formatted_body` carries `<img data-mx-emoticon src="mxc://..." alt="body or shortcode" title="shortcode" height="32">`.
- Typing `:shortcode:` by hand never auto-converts. Editing the shortcode text breaks the token; deleting it removes the token.
- Incoming custom emoji render inline at text size, with alt or shortcode fallback. Emoji-only messages render at the next type step, capped; no per-message toggle.
- Skin tones follow the OS emoji keyboard; no in-app skin-tone picker in v1.
- Custom emoji reactions are out of scope v1; Unicode reactions remain.

**Pack sources and order.**

- Room packs: `m.room.image_pack` state in the current room; available there by default.
- Global packs: `m.image_pack.rooms` account data; available everywhere and ordered first.
- Space packs: the spec suggests canonical space packs; spaces are out of scope v1, so skip and document.
- Legacy packs: `im.ponies.room_emotes`, `im.ponies.emote_rooms`, and the legacy user pack are read for compatibility; global enable writes both stable and legacy account data.
- Order: global, current room, space. Within a pack, shortcode order; Recent first. Duplicate shortcodes show the pack name; insertion uses the selected image.

**Pack management.**

- Settings > Emoji & stickers: "In this room" (room packs, add to all rooms), "Your packs" (global, remove), "Available in your rooms" (browse and add), and pack details: usage, attribution, source, image count, and a warning that pack media is not encrypted.
- "Add to all rooms" writes the stable and legacy account data.
- Creating or editing packs is out of scope v1; pack authoring later.
- Pack changes update the picker live; removed packs disappear; broken images show a placeholder.

**Attachments.**

- The attach control opens the file picker: images, video, audio, files; multiple selection. A paste into the composer also lands in the tray, with several files at once. While editing, attachments and stickers are disabled; emoji stays available.
- A tray above the field shows thumbnails or cards; each can be removed; upload progress, cancel, retry. Sending the tray sends each file as its own message in order — a picture is an `m.image` carrying no caption — and the text draft, if any, follows as a separate `m.text`. Albums are out of scope and captions are not offered, rather than half-implemented.
- Image: local preview, dimensions, thumbnail; click opens a viewer with download and close.
- Video: poster frame, native controls, no autoplay; fullscreen native.
- Audio: native player with duration; no waveform v1.
- File: card with name, size, type; download.
- Offline: files queue in the outbox with local blobs; upload when online; progress; no blocking.
- E2EE rooms: attachments are encrypted; pack media is not; the pack detail warns.
- Size limits and server errors show inline; failed uploads expose retry; no silent fallback.
- Authenticated media: images use cached blobs; video uses a same-origin streaming proxy; pack images are cached; technical details to verify.

**Visual.**

- `--sticker-max` for stickers; no bubble; image radius; no shadow.
- `--emoji-size` for inline custom emoji; `--picker-cell`, `--picker-max`, `--picker-max-block` for the picker; surface plus `--rule`, no shadow.
- Sticker rows: sender and time muted; reactions and replies normal.
- Pack warning: muted text, no color.
- Attachments: media radius; file card surface; progress line; no shadow.

**Accessibility.**

- The picker is a labeled popover; search focus; arrow keys; Enter inserts or sends; Escape closes; focus returns to the composer.
- Sticker images have alt from body or shortcode; custom emoji have alt; pack avatars are labeled.
- Grid items are buttons with accessible names; recent and pack tabs are tabs.
- No color-only states; progress has text.

**Protocol notes.** Matrix v1.19 defines `m.room.image_pack` and `m.image_pack.rooms`; the unstable identifiers are `im.ponies.room_emotes` and `im.ponies.emote_rooms`. Shortcodes match `[a-zA-Z0-9-_]+` and are case-sensitive. Custom emotes are `<img data-mx-emoticon>` with an MXC `src`; stickers are `m.sticker` with `body` and `info`. Pack media is not encrypted; the UI warns. Cinny's `app/plugins/custom-emoji` at `474400c` is a reference for the legacy identifiers, not a template.

Sources: Matrix v1.19 changelog and MSC2545 (`proposals/2545-emotes.md`); `m.sticker` spec; Cinny `app/plugins/custom-emoji` at `474400c`; checked 2026-11-11.

## 26. Login and first run

Project design. Login is a flow of documents, and the key gate is a document of its own. Each page
renders its structure without a script (0.8 W1, W9, W10).

**Pages.**

| page | what it does | without a script |
| --- | --- | --- |
| `/login/` | asks for the homeserver, probes it, decides the next page | the form stays, with a note that the probe needs a script |
| `/login/password/?server=…` | username, password, sign in; then create account, more methods, forgot password | the form stays, with a note; the button submits nothing |
| `/login/sso/?server=…` | the flows the server advertises, as buttons | a note: this server signs in through the browser |
| `/login/register/?server=…` | account creation and its UIA stages | the form stays, with a note |
| `/key/` | the mandatory gate | a note, and the way back to the sign-in page |

**The server page.** Submit resolves `.well-known/matrix/client`, falls back to the origin, reads
`/versions` and the `/login` flows. Password offered → the password page. Only single sign-on
offered → the SSO page. Errors name the step that failed, in place, and the form stays usable.

**The password page.** The title names the server and offers a change link back to `/login/`.
Below the form, in this order: **Create account** when the server allows registration, **More
sign-in methods** when it advertises more than password, **Forgot password** once the reset flow
exists (0.8 W11). The SSO page renders its buttons from the flows, because only the server can say
what exists; a script-free reader gets a sentence instead of a disabled button.

**Back into the flow.** The password, SSO and register pages take `?server=` as their only source of
the server, validated as an absolute `https://` URL or `http://` on localhost. The way back to
`/login/` is rendered by the script, because it is part of the flow and not of the navigation; the
static page carries a `<noscript>` note instead. A reader who arrives without the query is not
given a special screen: the page keeps its form and the script offers the way back.

**The key gate.** Mandatory after every login and every new device: the chat page stays a skeleton
until one path completes. Three paths: the recovery key or passphrase; wait for another device with
SAS; or start over, which creates new secret storage, cross-signing keys and a backup, and warns
that older encrypted history may be lost and contacts will see a security alert. Registration only
offers the last one. The recovery key is shown once, monospace on the code surface, with copy and
download, and is never logged or persisted.

**What the worker keeps.** Credentials go to the worker once; the main thread never receives the
access token, the secret-storage key or any key material. It sees a session summary and, once, the
recovery key to display.

**Sessions and signing out.** Settings lists the sessions, marks the current device, and offers
verify, sign out one, and sign out all others in one confirmed action. Signing out others needs UIA
with the account password, which is used for that request and not kept. An expired or revoked token
returns the reader to `/login/` with the server filled in.

**Reset later.** Password reset (O10) becomes a real flow with its own page; until then the control
is absent rather than present and empty.

## 27. Room list and navigation

Project design. Four sections, each a `<details>`, closed by default, the open state remembered
per account. A section with no rows is hidden; the rooms section is always present.

**Sections.** Favorites (`m.favourite`), Rooms, Direct messages (`m.direct`), Channels (spaces).
Invites are not a section: the action menu carries one invite entry with a count, and accepting or
declining happens inside that surface. Low priority is not in this version.

**Rows.** Avatar, name, last-event preview, time, unread count, mention badge, muted mark. The
active room uses `--surface-active` and `aria-current="page"`. The preview is text, or "Image",
"Video", "File", "Sticker", "Encrypted message", "Message deleted", or a membership line. Unread
makes the name stronger; mentions use the strong badge; muted keeps the count and suppresses
notifications. No color coding.

**Channels.** A channel is a space, shown as a card. Activating the card expands it and reveals its
child rooms as cards directly below it inside the same section, one level deep; it does not select a
room and does not change the content pane. The context menu (right-click, the menu key, a long
press) opens on the same card. Child rooms live under their channel only and are not repeated in
the rooms section.

**Order.** Sections in the order favorites, rooms, direct, channels; inside a section, last
activity descending.

**Actions.** The action menu holds search, new message, invite, join, create, settings, and the
invite list. A room row menu holds room settings, mark read or unread, favorite, mute, leave and copy
link. The room header carries no settings entry (0.8 W27).

**Visual.** Section headers `--text-sm` muted with a count and a disclosure chevron; rows compact;
active `--surface-active`; no card, no shadow, no color.

**Accessibility.** Lists carry labels; the active room carries `aria-current`; the unread count is
in the accessible name; `<details>` summaries and the expand control are keyboard reachable; the
context menu is reachable by the menu key, never by the pointer alone.

## 28. Room and timeline

**Header.** Back on narrow, then the room avatar, the name and the topic, muted. No menu and no third control at all (0.8 W27): the room card's context menu holds settings, mute, favorite, leave and copy link. Encryption state is a line inside room settings, never a badge here.

**Intro.** An empty or new room shows avatar, name, topic, member count, encryption state, "This is the beginning", and an invite action. No card.

**Rows.** Messages, media, stickers, membership and state events, encrypted failures, redactions, unsupported events. Group by sender and day; avatar and name only at group start; day separator; read marker and new-message divider between rows.

**Actions.** Reply, React, Edit (own text), Redact (own or permission), Copy text, Copy link. A menu appears on hover or focus and on right-click; keyboard reachable. React opens the Unicode emoji picker; custom emoji reactions are out. Reply shows a quote and jumps to the target, loading around it if needed. Edits show "edited"; no history. Redactions show "Message deleted". Encrypted failures say so and offer a key hint, never blank.

**Live.** Typing indicator at the bottom; read receipt sent when the room is visible and at the bottom; new-message pill when scrolled up; jump to bottom; load older 50 with a loading row; jump to an event highlights it briefly. No blocking.

**Mentions.** Messages with `m.mentions` for the current user get a `--mark` background; the room list mention count uses the strong badge. No color.

**Tombstone.** A replaced room shows a banner "This room has been replaced" with Join; the composer is disabled.

**Visual.** Own and other bubbles as in section 23; no tails; stickers have no bubble; membership and state are muted lines; day separators are muted text; read marker uses `--rule`; new-message pill is a surface; action menu surface plus `--rule`; typing muted; mention `--mark`; no shadow or color.

**Accessibility.** Timeline is an `<ol>` with a label; rows are `<li>`; action and reaction buttons have names; new messages use a separate live region; the new-message pill is a button; jump-to-event keeps focus and announces the target.

## 29. Room settings, join, create, invites

**Room settings.** A surface from the room card's context menu, one at a time. Sections:

- General: avatar, name, topic; editable with permission; save and cancel; inline errors. Uploaded avatar uses the media flow.
- Members: list with avatar, name, role; search; invite by Matrix ID; no kick or ban in v1.
- Notifications: All messages, Mentions only, Mute. Writes the room push rule; muted rooms show the mark in the list.
- Encryption: status only. Encryption is chosen at creation; enabling it on an existing room is out of scope v1.
- Leave: inline confirmation; leaving removes the room from the list and clears its local cache. It does not delete the room for others.
- Without permission, fields are read-only and actions are hidden. Current-device sessions stay in Settings > Security.

**Join.** A dialog takes a room ID or alias; join; errors for not found, banned, knock, or unsupported space; success opens the room.

**Create.** A dialog has name, topic, visibility (private or public), invite IDs, and an Encrypt toggle. Encryption defaults on; the toggle warns that it cannot be turned off. Success opens the room; errors inline.

**New message.** A dialog takes a Matrix ID; reuse an existing DM or create a direct room with encryption; open it. Errors inline.

**Invites.** The room list section handles accept and decline. Accept joins and opens the room; decline leaves or rejects. Inviter, room name and avatar, and encryption state are shown.

**Visual.** Room settings uses the dialog shell; sections are headings and space, not cards; member rows are compact; notification choices are a radio group; leave is a text action with an inline confirmation; no color or shadow.

**Accessibility.** Dialog focus and Escape; member search and invite labels; notification radio group; leave confirmation; errors announced.

Sources: Matrix spec rooms, tags, push rules, and membership; matrix-js-sdk room, timeline, pagination, relations, and state APIs; Cinny room list, timeline, and room settings components at `474400c`; checked 2026-11-11.

## 30. Search

Project design. Search is local and offline. The dialog is `dialog=search&q=...`; the query is the URL state.

**Entry.** The top navigation Search action opens the dialog; the input is focused. An empty query shows "Type to search"; there are no recent searches in v1. A room filter defaults to All rooms; options are joined rooms. No date or sender filters in v1.

**Results.** Each result shows room avatar and name, sender, date, and a snippet with matches marked. Results sort by recency and cap at 50; the count says "N results" or "First 50". Clicking opens the room at the event and closes the dialog; the event is highlighted briefly; if it is not loaded, the room loads around it.

**Scope.** Indexed local events that have been synced: message text, media captions and filenames, and sticker body. Membership and state events are not results. Redacted events and decryption failures are excluded. Edits update the index; redactions remove it.

**Matching.** Tokens from section 20: NFKC, lowercase, diacritics, and `Intl.Segmenter`. All query tokens must match. No operators, phrases, or markdown.

**States.** Indexing shows "Searching local messages…"; no results says so; a broken index says so and offers retry. Offline search works; selecting a result reads the local projection.

**Visual.** The input is a surface control; result rows reuse room and message rows; matches use `--mark`; room name is muted; no card, no shadow, no color.

**Accessibility.** Labeled input; result count is `aria-live`; results are a list; arrow keys move; Enter opens; Escape closes; focus returns to the trigger.

## 31. Notifications

Project design. Notifications are local to an open page; there is no push gateway in v1.

**In-app.** Unread and mention badges in the room list; title `maski (N)` with the unread total; no notification center in v1. The room is marked read when viewed at the bottom.

**Desktop.** Settings > Notifications has a "Desktop notifications" row with permission status and an Enable action. Permission is requested only from that user gesture. Feature-detect the Notification API and the secure context; if it is unavailable or denied, say so and keep in-app only. A "Show message preview" toggle controls OS content; it defaults on, with a privacy note.

**When.** Notify only when the page is hidden or unfocused, and the room mode is All messages or Mentions only. Never for own messages, edits, reactions, redactions, or membership changes. Room settings own the mode; mute shows the mark in the list.

**Content.** Room name, sender, and a plain preview: text, "Image", "Video", "File", "Sticker", "Encrypted message". No HTML. One notification per room, tagged by room ID and replaced by the next. Clicking focuses the window, opens the room or event, and closes the notification.

**Privacy.** Previews can expose decrypted text on a lock screen; the toggle hides message content, leaving sender and room. No push gateway, so a closed page receives nothing; the UI says local-only.

**Visual.** Settings rows with status text and a switch; unread badges stay neutral, mentions strong; no color.

**Accessibility.** Permission status is announced; in-app badges are in accessible names; OS notifications are outside our control; no color-only state.

Sources: MDN Notification API (limited availability, secure context, user gesture) and Page Visibility API; Matrix push rules; matrix-js-sdk push rules and read-marker APIs; checked 2026-11-11.

## 32. Settings, profile, and about

Project design. The client's style and usage are fixed; settings change account data and local preferences, not the interface.

**Settings.** One dialog from the navigation, `dialog=settings`, single scroll with section headings: Account, Notifications, Security, About. There is no Appearance section and no theme, membership-row, density, or Enter-send toggle. Images and videos show a click-to-preview and do not load until clicked; membership and state rows show; theme and motion follow the system; Enter always inserts a newline. A Language row at the top of Account switches the interface immediately: English or 简体中文. English is the default and the fallback when a translation is missing. The choice is local, there is no reload, and `lang` and `Intl` formats update. The choice changes the locale path (`/` or `/zh-CN/`); on reload the matching static shell loads. The dialog uses `--modal-max`, is near-full on narrow, scrolls internally, and has no cards.

**Account.**

- Avatar, display name, MXID. Name and avatar are editable; avatar upload uses the media flow. MXID is read-only and copyable.
- Save and cancel; server errors inline; empty name rejected.
- Log out at the bottom: confirm; warn that local encrypted history and device keys are removed unless backed up; clear local stores; return to auth.
- Changing display name or avatar is server-visible and not encrypted; say so in the section.

**Profile.**

- Opened from a sender name or avatar, a member row, or a mention; a small dialog or popover, one at a time. Avatar, display name, MXID, verification status.
- Verification status: verified, not verified, or identity changed; text, no color.
- Actions: Message, Verify, Copy MXID. Message opens or creates an encrypted DM. Verify starts a user-to-user SAS verification in a DM; if there is no DM, create or reuse one; the other side accepts, both compare emoji and confirm; status updates. Identity changed shows "Verify again".
- The current user's profile editing lives in Account; no separate self-profile.
- No block, ignore, kick, or ban.

**About.**

- Version, source link, Matrix and matrix-js-sdk credits, dependency licenses, and the privacy statement: no analytics, no third-party requests, local-only notifications, local search, and no push gateway.
- Links open externally with `rel="noopener noreferrer"`; no request until clicked.
- Do not claim an app license unless one exists; show dependency licenses.

**Visual.** Settings uses the dialog shell; section headings and rows; no cards; controls are surface; switches and radio groups only where the section needs them; the Language row uses a text control; no color. Profile is a small surface; no shadow. About is prose with links.

**Accessibility.** Dialog focus and Escape; section headings; labels; the Language control has a label; profile actions; about links; logout confirmation; status is text, not color.

**Out of scope.** Password change or reset, account deactivation, multi-account, per-room profiles, block or ignore, theme or density or media or Enter toggles, notification center, and push gateway.

**Protocol notes.** Profile: `getProfileInfo`, `setDisplayName`, `uploadContent`, `setAvatarUrl`, `getUserVerificationStatus`, `requestVerificationDM`, and the `VerificationRequest` SAS events. Settings are local; room notification modes and security are sections 31 and 26.

Sources: Matrix profile and verification spec; matrix-js-sdk profile and crypto APIs; Cinny settings and profile components at `474400c`; checked 2026-11-11.

## 33. Pages and the script-free state

Project design. Every page is generated and static, and its structure exists without a script.

**Generation.** `scripts/pages.ts` builds each document from a function in `src/pages/` with the
catalog and the config: one document per page per locale. English is generated twice, at `/` and at
`/en/`, with `/` as the canonical of both; another language is one catalog and one config entry,
never a hand-written document. The output is committed, so the repository holds what is served, and
the page audit regenerates and fails on any byte difference.

**The home page is a loading page.** The mark, a spinner, the `<noscript>` note. It carries no
navigation, no form and no apology: it decides the locale and the destination, then leaves.

**No placeholder rows.** The frame a script finds is the frame the reader sees. There is no skeleton list, no shimmer and no sample text; a list that has no data is empty, and rows appear in it when they exist, at the size they keep. A picture reserves its box from the event's dimensions, so a decoded image fills space that was already there.

**Markup is the skeleton.** Each page is written by the generator: navigation actions as popover
triggers, the two navigation areas, the four sections as `<details>`, the room header slots, the
empty timeline, and the composer with its controls. Every one of them is styled, so the page is
complete to look at with no data and no script. Scripts fill regions and drive flows; they never
create the frame.

**Honest controls.** A navigation is an `<a href>` and works with a script off. An action that
needs a script is a `<button>`: it opens its surface, and the surface says what it needs. A flow
control that only exists inside the flow, such as the way back to `/login/`, is rendered by the
script.

**One note per page.** Where a page's data needs a script, a `<noscript>` element says so at the
place the content would appear. There is no full-page overlay: the skeleton, the sections and the
menu are worth showing.

**Audit.** For every page and locale: the document exists, carries `lang` and a title, has no inline
CSS or JS, contains the region ids from `regions.ts`, has one `h1`, carries a `<noscript>` note when
its content needs a script, and holds no anchor whose target is a placeholder. The generated files
equal the generator's output.

Sources: `past/blog/src/components/layout.ts`, `past/blog/src/lib/html.ts`, `past/blog/src/pages/`;
MDN popover API and `::backdrop`; checked 2026-11-12.

## 34. Build, assets and caching

Engineering design. One build script owns the pipeline; nothing in `src/` knows which bundler runs.

**Tree.**

```
static/                 copied verbatim to the site root
src/assets/             imported by modules and CSS, hashed by the bundler
src/lib/html.ts         escape-by-default template tag
src/lib/assets.ts       asset(path) from the build manifest
src/layouts/base.ts     doctype, head, empty body slot
src/layouts/app.ts      menu area, rooms area, content pane
src/layouts/auth.ts     centred column for the login pages
src/components/         nav, sections, room header, timeline, composer, surface, language
src/pages/              one function per page, composing layout and components
src/pages/regions.ts    region ids shared by pages and client code
src/client/             store, worker client, router, behaviour per region
src/worker/             SDK, database, projection
scripts/build.ts        esbuild entries, minify, metafile, static copy
scripts/pages.ts        generate pages from functions, one per page per locale
scripts/audit.ts        output and page audit
```

**Layouts and components.** The base layout writes `<head>` and an empty `<body>`; it never carries
content, so every page composes into it. A page function chooses a layout and passes components. A
component is a function of explicit data that returns markup; it reads no global state and cannot
change it. Behaviour lives in `src/client/` and attaches to the regions the components name.

**Names.** Anything we reference ourselves is content-hashed: `assets/[name]-[hash][ext]` from
esbuild's `entryNames` and `assetNames`, so a URL never changes meaning and can be cached forever.
`static/` exists for the handful of paths the platform itself requests and that therefore cannot be
hashed: `/favicon.ico`, `/robots.txt`, `/sw.js`, `/404.html`. A file that is both platform-probed and
ours, favicon being the only one, is copied twice: the stable path for the probe, the hashed path for
our `<link rel="icon">`. `url()` inside CSS is rewritten by the bundler; `import` in a module yields
the hashed URL; the generator reads the metafile through `asset(path)`.

**Paths the page hands to the client.** The worker, the crypto wasm and the service worker cannot be
imported at build time by the page: the page writes them into `<meta>` tags from the manifest
(`maski:worker`, `maski:wasm`, `maski:sw`). The client reads a tag, so there is no generated module
and no import-time dependency on the build.

**Text comes from the catalog.** A layout or a component takes every string as a parameter — title,
labels, placeholders, notes, `aria-label`, document title, description. A typed catalog makes a
missing key a compile error, and the generator passes the catalog of the locale it is writing. No
literal copy exists in `src/layouts/` or `src/components/`, so a language is data, not a code path.

**Minification.** esbuild minifies JS and CSS. HTML goes through `html-minifier-terser` with
`collapseWhitespace: "conservative"` and `removeComments: true`, which is what `past/blog/` does; the
generator still writes whitespace that does not carry meaning, because a minifier is a backstop and
not a licence to lean on it. A unit test renders a sample page twice, once minified and once not, and
fails when the visible text differs.

**Caching.** Hashed assets are immutable. Pages are served by the service worker cache-first with a
background revalidate, so a reload paints the shell before the network answers and works offline;
the worker's database then supplies rooms and messages. Homeserver requests are never cached: data
belongs to the account database, not to HTTP.

**Service worker.** Generated by the build with the manifest inlined, so its bytes change exactly when
the shell does. Install precaches the pages of the locale and the hashed assets; `activate` drops
older caches; navigation falls back to the cached page; `skipWaiting` and `clients.claim` keep one
version live. Registration happens only in a production build, and the page calls
`registration.update()` on load so a deploy reaches an open tab.

**Dev.** esbuild's watch context plus a small static server: rebuild on change, regenerate pages, full
reload. No HMR and no dev-time service worker, because the page a dev sees should be the page the
generator wrote.

**Verification.** `scripts/audit.ts` checks: every page exists for every locale, `static/` matches the
platform paths, every referenced asset exists in the manifest, no referenced name is unhashed except
the platform list, the precache list equals the pages plus their assets, and the generated files
equal the generator's output.

## 35. How the work is sequenced

Engineering design. Six phases, each ending in something that runs in a browser. A phase is not
started before the one before it has an exit, and no phase leaves behind a second implementation to
be cleaned up later.

**P0 — Pipeline.** Done: `scripts/build.ts` (esbuild, hashing, `static/` copy, minification),
`scripts/pages.ts`, `scripts/audit.ts`, `scripts/features.ts`, `src/lib/{html,assets,catalog}.ts`,
both layouts, six components, the router and chat pages, and one stylesheet. Exit met: the build
writes hashed bundles and four generated pages, the audit passes, and `/chat/` renders the whole
frame with scripts disabled at wide and narrow widths and in both colour schemes. Known issue for P2:
the navigation rows paint a fill in a dark colour scheme that the computed styles do not explain;
the navigation is restyled in that phase anyway.

**P1 — Crypto in a worker.** The worker entry with `matrix-js-sdk` and the rust wasm, `initAsync` on
the hashed wasm path, login against a real homeserver, decrypt one message. Exit: a browser run
proves it. If esbuild cannot produce a working worker, the decision is a second bundler for that one
entry, recorded in 0.8; the page architecture does not depend on the answer.

**P2 — Every page, no data.** The remaining pages (`server`, `login`, `login-oauth`, `register`,
`reset`, `key`, `chat`, `404`), the components, the stylesheet, the popover surfaces with their
notes. Exit: every page is complete with scripts off, the audit is green, and no
control is dead.

**P3 — Data.** Database, projection in both directions, worker protocol, the keyed store, the
navigation sections, the timeline, the composer. Exit: a real account lists rooms, reads history,
sends text, and keeps its place through a backfill and a reload.

**P4 — Login and the gate.** Discovery, password and UIA registration, the mandatory gate with
unlock and reset, the router page. Exit: a fresh account registers, sets up a recovery key, and signs
in again on a new device with it.

**P5 — Beyond text.** Media with click-to-preview, stickers and emoji, search, settings, sessions
and verification, channels.

**P6 — Fast and offline.** The service worker, the collapse of a reload to a paint, notifications,
the language switch, the accessibility pass and the measurements the design asks for.

**When to stop and redo.** These are not warnings, they are the exit conditions of a bad line of
work:

1. The same boundary needs a third workaround. Two adaptations are a design that is merely awkward;
   the third means the boundary is wrong, so it is redesigned.
2. The same defect returns after being fixed in two different places. It has two owners; find the
   duplicate and delete one, rather than fixing it a third time.
3. A phase's exit cannot be reached with the tools it was planned with. Change the tool for that one
   job and record why; do not bend the architecture around it.
4. A generated artefact has to be hand-edited to work. The generator is wrong; the artefact is
   output and is never touched.
5. A "temporary" second path outlives its phase. It is deleted or promoted in the same change.

Rewriting one module when it hits one of these is the normal repair. Rewriting the tree is what
happens when they are ignored.

## 36. Module map

Engineering design. One direction of dependency, stated once so a module cannot grow a second job.

```
src/catalogs/     pure data: one typed object per language
src/lib/          html.ts (escape-by-default tag), assets.ts (asset()), catalog.ts (typed lookup)
src/layouts/      base.ts (doctype + head + empty body slot), app.ts, auth.ts
src/components/   markup only, parameters in, string out, no state
src/pages/        one function per page: pick a layout, pass components and catalog values
src/client/       store, worker client, router, one module per region that attaches behaviour
src/worker/       api, session, database, projection, media, rooms, keys
scripts/          build, pages, audit
```

Rules of the map:

- `catalogs` depends on nothing. `lib` depends on nothing but the platform. `components` and
  `layouts` depend on `lib` and on parameters. `pages` depend on layouts, components and catalogs.
- `pages` are build-time only: nothing in `pages/`, `layouts/`, `components/` or `catalogs/` is
  shipped to the browser. The browser gets `client/` and `worker/`.
- `client/` never imports `worker/`; the two talk through `protocol/` messages only. Neither imports
  `pages/`; the link between markup and behaviour is `pages/regions.ts`, a module of string ids that
  both sides may import.
- `worker/` never imports `client/` or any UI module. It owns the SDK, the database and crypto.
- A module that needs a fact from another layer asks for it; it does not read that layer's storage.

**What each reference contributed, and what it did not.**

- `past/blog/`: static pages generated from functions, escape-by-default markup, content-hashed names,
  a service worker with a build-stamped asset cache, esbuild plus `html-minifier-terser`. It solved
  the same build problem at a smaller scale, so the pipeline follows its shape. It has no client
  state, no worker and no crypto, so nothing about our data layer comes from it.
- `past/backup/`: the first attempt. It is read for what went wrong — code written before the data
  shape existed. No module is revived.
- `past/backup2/`: the second attempt. It is read for the boundaries that failed: one store redrawing
  every region, two writers on one database, a forward-only projection. The names of the modules are
  familiar; the structure is deliberately not.
- `past/git/matrix-js-sdk`: the protocol and crypto behaviour, quoted by path and commit. Never
  imported, never built.
- `past/git/cinny`: how a client reads Matrix state and how it structures a room list. A reference for
  protocol questions, not a template for our modules.

**Measured before planning.** esbuild bundles `matrix-js-sdk` with the rust crypto into a 1.26 MB
minified ESM worker entry in one pass, with no plugin and no polyfill; the bundle keeps the
`new URL("./pkg/matrix_sdk_crypto_wasm_bg.wasm", import.meta.url)` expression, so the worker calls
`initAsync(asset("…wasm"))` first and the wasm resolves from the hashed path the build wrote.

## 37. The implementation, file by file

Final plan for the third attempt. Each line names a file, its job, and what it may not do. A file is
written to this shape before the one that imports it.

**Build-time only.**

| file | job | may not |
| --- | --- | --- |
| `src/lib/html.ts` | `html` tag: escapes every value, flattens arrays, renders `null`/`undefined`/`false` as nothing, `raw()` for trusted markup | touch the DOM |
| `src/lib/assets.ts` | `asset(path)` from the build manifest; the only way a page learns a hashed name | invent a path |
| `src/lib/catalog.ts` | `Catalog = Record<Key, string>`, `t(catalog, key, params)`; a missing key fails the type check | fall back to English at runtime |
| `src/catalogs/en.ts` | the source catalog, grouped `app`, `nav`, `sections`, `room`, `composer`, `auth`, `gate`, `errors` | contain markup |
| `src/catalogs/zh-CN.ts` | the same type, translated | drift from the key set |
| `src/layouts/base.ts` | doctype, `head` (locale, title, description, canonical, alternates, theme, manifest, stylesheet, script), an **empty body slot** | contain any page content |
| `src/layouts/app.ts` | the chat frame: menu area, rooms area, content pane | decide anything about data |
| `src/layouts/auth.ts` | centred column, language switch, the note slot | contain a form |
| `src/components/nav.ts` | menu action buttons with `popovertarget`, the invite entry, four `<details>` sections | read state |
| `src/components/sections.ts` | a section with its rows, and a channel row that expands to its child rooms | build a second list |
| `src/components/header.ts` | back control, room name and topic slots, room menu | print an empty heading |
| `src/components/timeline.ts` | the list element, the empty state, the older control, the note | create a message row |
| `src/components/composer.ts` | field, emoji control, send control, as static markup | wire behaviour |
| `src/components/surface.ts` | a popover shell with a title, body and a note | assume a session |
| `src/pages/regions.ts` | the region ids, as `const REGION = {…} as const` | hold anything else |
| `src/pages/*.ts` | one function per page: layout, components, catalog values, the page's `<noscript>` note | branch on a session |
| `scripts/pages.ts` | for each page and locale, render and write; `/` and `/en/` both English | hand-edit output |
| `scripts/build.ts` | esbuild entries (client, worker), CSS, `static/` copy, wasm copy, manifest, minify | know a page's markup |
| `scripts/audit.ts` | output and page audits (33, 34) | be optional |

**Runtime.**

| file | job | may not |
| --- | --- | --- |
| `src/protocol/messages.ts` | the command and event unions | import a runtime module |
| `src/client/main.ts` | read `data-page`, import that page's behaviour, start the store | render markup |
| `src/client/store.ts` | `get`, `set` (per key), `subscribe(key)` | hold DOM nodes |
| `src/client/worker.ts` | spawn the worker from `<meta name="maski:worker">`, request/response, events | import the SDK |
| `src/client/router.ts` | the `/` decision, the room hash, `replace` and `pushState` | rewrite a deep link |
| `src/client/nav.ts` | fill sections, keyed rows, channel expansion, collapse persistence | rebuild the list on an unrelated change |
| `src/client/timeline.ts` | keyed rows, day separators, read line, backfill anchor | own message data |
| `src/client/composer.ts` | draft, send, typing, the grow cap | touch the store per keystroke |
| `src/client/surfaces.ts` | fill each popover body per page state | open a second surface |
| `src/worker/api.ts` | command dispatch, one handler per command | import UI |
| `src/worker/session.ts` | client, crypto (`initAsync` on the hashed wasm), sync, token storage | log a secret |
| `src/worker/db.ts` | the account database and its indexes | be opened by anyone else |
| `src/worker/project.ts` | forward and backward passes, room summary | clear a store |
| `src/worker/normalize.ts` | event to row: media, edits, annotations, membership, tokens | read the network |
| `src/worker/media.ts` | authenticated fetch, decrypt, cache | put a token in a URL |
| `src/worker/rooms.ts` | join, leave, create, direct, tags, mute | build markup |

**Pages and their regions.** Every page carries `REGION.nav` and the note slot; the chat page adds
`REGION.sections`, `REGION.header`, `REGION.timeline`, `REGION.composer` and one surface per menu
entry; the auth pages carry `REGION.form` and `REGION.flowBack` (rendered by the script).

**Stylesheet order.** `:root` tokens, reset, base typography, layout frame, navigation, content,
timeline, composer, surfaces, pages (router, auth, gate), states (empty, note, disabled), reduced
motion. One file; a rule appears once.

**Tests.** Projection both directions; store notification granularity; catalog key parity between
locales; page generation per page and locale (ids, one `h1`, one note, no inline CSS/JS, no
placeholder `href`); minified and unminified text equality; sanitizer allowlist; search tokens.

## 38. Web platform ledger

The source of truth is the **web-features dataset** (`npm run features -- <id>`), which carries
Baseline status and the engine version for each feature. `@mdn/browser-compat-data` is installed
beside it for a property the dataset does not name. Nothing in this section is remembered from an
article: the table below is the dataset's output, checked 2026-11-13.

A row is usable when Baseline is reached during 2026 or earlier **and** the engine version is not
above the browser the user runs (Firefox 157). `npm run features -- <id> --require 2026` exits
non-zero when a feature fails that test, so a new property can be checked in the same command that
would be used in review.

### Usable

| feature | Baseline | Chrome | Firefox | Safari |
| --- | --- | --- | --- | --- |
| popover, `popovertarget` | 2025-01-27 | 116 | 125 | 17 |
| invoker commands (`command`, `commandfor`) | 2025-12-12 | 135 | 144 | 26.2 |
| `field-sizing` | 2026-06-16 | 123 | 152 | 26.2 |
| `details`, `<details name>` | 2024-09-03 | 120 | 130 | 17.2 |
| `::details-content` | 2025-09-16 | 131 | 143 | 18.4 |
| `@scope` | 2026-03-24 | 143 | 146 | 26.4 |
| container queries | 2023-02-14 | 105 | 110 | 16 |
| container style queries | 2026-05-19 | 111 | 151 | 18 |
| `color-mix()` | 2023-05-09 | 111 | 113 | 16.2 |
| `light-dark()` | 2024-05-13 | 123 | 120 | 17.5 |
| `@starting-style` | 2024-08-06 | 117 | 129 | 17.5 |
| `sibling-index()`, `sibling-count()` | 2026-08-18 | 138 | 154 | 26.2 |
| same-document view transitions | 2025-10-14 | 111 | 144 | 18 |
| `content-visibility` | 2025-09-15 | 108 | 130 | 26 |
| `scrollbar-gutter` | 2024-12-11 | 94 | 97 | 18.2 |
| nesting, `:has()`, `text-wrap: balance` | 2023–2024 | 105–120 | 117–121 | 15.4–17.5 |

### Not usable

| feature | dataset says |
| --- | --- |
| `text-box`, `text-box-trim`, `text-box-edge` | not Baseline: Chrome 133 and Safari 18.2 ship it, Firefox does not |
| cross-document view transitions | not Baseline: Firefox does not ship it |
| anchor positioning | not Baseline: Chrome 157, Safari 27, Firefox none |
| `interpolate-size`, `calc-size()` | not Baseline: Firefox and Safari do not ship it |
| `interestfor` | not Baseline |
| scroll-driven animations | Baseline 2026-10-27 with Firefox 159 — above the browser the user runs, so held |

### Held: available, not needed

`::details-content`, `@scope`, `sibling-index()`, container style queries and same-document view
transitions are all usable and all unused for now. Each is listed with the reason in the table below,
so the next reader does not add it thinking it was missed.

### What the corrections changed

- **`text-box` is out.** It was going to replace vertical-rhythm arithmetic; the dataset shows
  Firefox does not ship it, so the rhythm stays with spacing tokens.
- **`::details-content` and `@scope` are in principle usable**, but neither earns its place yet: the
  sections do not animate open and nesting already contains message markup.
- **The shell's container query is unnamed.** `@container (width < 44rem)` needs only Baseline 2023
  features, while a *named* query needs `container-name-queries` (Chrome 148, 2026-05-07) for no
  benefit, since there is one size container.

### How a feature earns its place

Before a new platform feature is used, four questions are answered in the change itself:

1. Does the design need the behaviour at all? A feature we do not need is not "free".
2. Does what we already have do the job? A native feature is preferred to a workaround, not to a
   thing that already works in one line.
3. Is the feature larger than the need? Anchoring, scoping and staggering are bigger concepts than a
   menu centred by layout.
4. Does it replace code or add a second way to do the same thing? One behaviour has one spelling:
   `popovertarget` opens a surface, so `commandfor` is not added beside it, and a feature is never
   written twice — once with the new property and once with the old.

| feature | verdict |
| --- | --- |
| `field-sizing: content` | used: it replaces a scroll-height measurement that would run on every keystroke |
| `popover` + `popovertarget` | used: the only way a surface opens without a script |
| invoker commands | not used: `popovertargetaction="hide"` already closes the same surface |
| `@scope` | not used: nesting under `.bubble-text` contains message markup already |
| `sibling-index()` | not used: nothing in the design staggers by position |
| `::details-content` | held: sections open instantly by design; animation is not wanted yet |
| `<details name>` | not used: sections open independently |
| `content-visibility: auto`, `scrollbar-gutter` | used where a long list or a scrollbar would shift the layout |

**Targets.** The user runs Firefox 157, so a feature whose Firefox version is above 157 is held even
when it is Baseline for the year. Verification runs in Chromium because its tooling is the fastest;
a Firefox or Safari check is stated as *not yet run* until it is run.
