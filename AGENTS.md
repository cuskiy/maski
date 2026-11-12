# AGENTS.md

## 0. IMPORTANT — READ FIRST

This section is the user's brief and working rules. It outranks every section below. Do not edit it without the user's explicit instruction.

### 0.1 Working rules

1. 思考方案或写代码前，必须查询最新官方资料和相关项目（包括 `git/`）的代码。
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

### 0.3 Changes after the brief

- Action cards and room settings are dialogs, not content-area views (section 11). This changes the brief's "right side shows content".
- Markdown: only `formatted_body` is rendered; `body` is not parsed (section 20). This narrows "can render markdown content".
- Multi-language and multi-account: catalog boundary from day one; one account in v1 (section 20). This resolves "consider whether to add".
- Narrow navigation: a home screen plus a room screen, not a drawer (section 10). This is the chosen reading of "nav hides and the top bar switches back".

The brief stays unchanged. If you want it amended, say so; do not edit it unilaterally.

### 0.4 Design record

Two kinds of design:

- Project design: the client's content and behavior. Scope, screens, flows, navigation, dialogs, visual language, CSS, editor, states, accessibility, i18n.
- Engineering design: how the code is written. Modules, data model, storage, worker, store, rendering, build, tests.

Current phase: engineering design. Project design is complete in sections 1-19 and 23-33. Sections 20-22 are earlier code-level notes; `docs/data.md`, `docs/worker.md`, and `docs/ui.md` supersede them. `docs/` is the current engineering design. No application code or tests are written until the matching design document is current.

The thematic order is: stack, language, code rules (1-8); visual language (9); shell and dialogs (10-11); routing (12); local-first and security (13-14); verification and exceptions (15-16); open decisions (17); sources and reference checkouts (18-19); earlier data/worker/store notes (20-22); composer, stickers, auth, rooms, search, notifications, settings, static shell (23-33).

### 0.5 Documentation map

`AGENTS.md` is the primary file: user requirements, rules, settled product decisions, and how to read the project. `docs/` is the engineering design.

Read in this order:

1. 0.1-0.7 in this file.
2. `docs/README.md` for the index and principles.
3. `docs/architecture.md`, `docs/code-organization.md`, `docs/state.md`, `docs/config.md`.
4. The domain document for the task: `data`, `worker`, `ui`, `i18n`, `security`, `build`, `testing`.
5. `docs/roadmap.md`, `docs/decisions.md`, `docs/references.md` when planning or changing a decision.

`AGENTS.md` wins on user requirements, rules, and product behavior. `docs/` wins on implementation detail. Sections 20-22 are earlier notes; the data, worker, and UI documents supersede them. `blog/` is a visual reference only. `git/` is read-only reference code (section 19).

When a decision changes, update 0.6, the matching AGENTS section, the matching doc, and `docs/decisions.md` in the same change. Do not create a second implementation of an existing boundary.

### 0.6 Decision register

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
| E27 | The account card, the emoji and sticker panel, and the action menu are three separate surfaces: the card unfolds in the navigation, the panel floats over the composer with one instance at a time, the menu opens at the pointer. | 10, 11, 25 |
| E22 | Read state is one call: `setRoomReadMarkers` moves the receipt and the fully read marker together, and the timeline draws the marker where it sits. | 20, `worker`, `ui` |
| E23 | Display names are disambiguated with the MXID when two members of a room share one. The count comes from the room summary, not the locally loaded members. | `data`, `ui` |
| E20 | Outgoing events are built in one place: reply mentions the replied-to sender, every text message carries `m.mentions`, an edit carries the prefixed fallback body, a redaction goes through the SDK's redaction path. | 14, 24, `worker` |

**Open decisions.**

| ID | Decision | Where |
| --- | --- | --- |
| O1 | Automatic redirect from `/` to the browser language shell. v1 stays English with a visible switch. | 17, `i18n` |
| O2 | SDK worker spike: Vite worker build, SDK import graph, rust crypto wasm, login/decrypt, and key gate. Must pass before implementation; no main-thread fallback. | `worker` |
| O3 | Authenticated video: media-only service worker proxy or blob download. | `build` |
| O4 | Pack authoring and editing. | 25 |
| O5 | Room member kick/ban moderation. | 29 |
| O6 | Enabling encryption on an existing room. | 29 |
| O7 | Password reset and account deactivation. | 26 |
| O8 | Push gateway for a closed page. | 31 |
| O9 | Project license. | 32 |

### 0.7 Status and precedence

- Project design: complete in sections 1-19 and 23-33.
- Engineering design: current in `docs/`; implementation follows it.
- Application code: implemented in `src/`; unit tests in `test/`; `npm run check` passes.
- Verified locally: worker/SDK/rust wasm on Chromium; registration with UIA, landing/server/methods auth steps, recovery setup and unlock, fast reload from local data, second-tab read-only, outbox send and retry, room list collapse, toast, encrypted text and image, re-login with backup restore, composer format menu, picker, wide and narrow shells, no-JS shells, and no CSP violation against a local Synapse.
- Not yet verified: Firefox/Safari, SSO against a real identity provider, notifications, two-device SAS, offline reload, GitHub Pages subpath, video/audio.
- `blog/`: unchanged reference.
- Open decisions: 0.6 and `docs/decisions.md`.

Precedence:

1. 0.1 working rules; not editable.
2. 0.6 settled decisions and 0.3 changes after the brief.
3. 0.2 original brief where not superseded.
4. Thematic AGENTS sections.
5. `docs/` implementation detail.
6. Reference code in `git/` and other projects.

If code and docs disagree later, the code and its tests win for implementation; user rules still win. Update the docs. Nothing is implemented until the matching design document is current.

Rules for the maski Matrix client. `blog/` is a separate reference project and keeps its own `AGENTS.md`. Where this file conflicts with general practice, this file wins.

## 1. Stack

- Vite and TypeScript. No UI framework, component library, CSS framework, state library, router library, i18n library, or date library.
- `matrix-js-sdk` owns the protocol, sync, and crypto. No other large runtime dependency.
- Sanitization uses DOMPurify. It is the only non-SDK runtime dependency. Never hand-roll an HTML sanitizer.
- Unit tests with Vitest. Browser tests with Playwright.
- npm, ESM, current Node LTS. Static output, no backend, no server rendering.

## 2. Language

- Code, identifiers, comments, commit messages: English.
- User-facing copy lives in typed catalogs and may be any language. Do not hard-code copy in components.
- English is the source catalog and the fallback. Other locales translate it; a missing entry falls back to English and never shows a key.
- The interface language is a local setting, switchable at runtime; changing it updates `lang` and `Intl` formats immediately. Message content is independent of the interface language.
- Each supported locale has a static HTML shell: `/` is English, `/<locale>/` is the translation. Catalogs are compiled into the bundle; there is no runtime translation fetch.
- No Chinese in code. Test fixtures may contain non-English text when the behavior depends on it.
- Use `Intl.DateTimeFormat`, `Intl.NumberFormat`, `Intl.PluralRules`, and `Intl.Segmenter`. No hand-built date, number, or plural logic.
- No sentence concatenation. A translated sentence is one catalog entry with parameters.

## 3. TypeScript

- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `isolatedModules`.
- No `any`, no non-null assertions, no enums, no parameter properties, no casts that silence the compiler.
- Guard every external boundary: sync payloads, IndexedDB records, URL params, `postMessage`, `JSON.parse`.
- `tsc --noEmit` passes.

## 4. Code shape

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
- `npm run build`: code checks, then the Vite build.
- `npm run check`: code, lint, tests, build, output audit.
- A rule is turned off only in `.oxlintrc.json` with a stated reason, never inline and never per call site.
- Prettier is not used: formatting is stable by hand, and adding a formatter would rewrite the tree without finding defects.
- No `!important`, no vendor prefixes, no `outline: none`.
- A check that did not run is not a check that passed.

## 7. Platform

- Target current Chrome, Firefox, and Safari. No polyfills for old versions.
- Use native features: `<dialog>`, popover, `<details>`, container queries, `color-mix()`, `light-dark()`, `Intl`, `BroadcastChannel`, Web Locks, `navigator.onLine`, Notification, Selection and Range, ResizeObserver, IntersectionObserver.
- A feature missing from one supported browser needs a working fallback or is not used.
- No external design assets: font files, icon packages, third-party scripts. System font stack.
- Keep the main thread free: no synchronous network, no long loops in event handlers, no layout thrash.

## 8. HTML

- The HTML file contains no CSS or JS. No `<style>`, `style=`, `on*=`, or inline `<script>`.
- CSS and JS enter through the Vite entry and are emitted as external files.
- The static shell is section 33: a boot state, a full-page `noscript`, and localized title and description per locale.
- Build text with `textContent`. `innerHTML` is only for sanitized message HTML.
- One `h1` per page, landmarks, labeled navigation and controls, `lang` on `<html>`.
- External links carry `rel="noopener noreferrer"`.

## 9. CSS

- The visual language comes from `blog/AGENTS.md` and `blog/src/assets/style.css`. Copy the token table, not the blog component rules.
- Grouping comes from distance, similarity, and shared region. No borders or shadows for that job.
- No separate phone and desktop layouts. One fluid shell.
- Every color, font, type step, space, radius, border, duration, and layout size is a token in `:root`.
- Rules use tokens. A raw length needs a content reason and still becomes a token.
- `color-scheme: light dark;` with `light-dark()`.
- Two inks and paper. A surface declares an ink ratio and derives its text tone. No literal colors in rules.
- Fluid layout: `clamp()`, `minmax()`, `auto-fit`, container queries. No width media query when a container query works.
- `min-inline-size: 0` on text-holding flex and grid children. `overflow-wrap` for long tokens. Test long words, URLs, and CJK.
- No fixed height on text containers. Use `100dvh`, not `100vh`.
- Motion uses transform, opacity, and color only. Short, interruptible, compositor-friendly. Off under `prefers-reduced-motion`.
- Focus is always visible. Targets are at least 24px.

## 10. Layout

- Shell: navigation on the left, content on the right. Content follows the selection.
- Navigation top: client actions such as search, new message, join, create, and settings; each opens a dialog. Below: collapsible invites, favorites, direct messages, rooms, and low priority. Collapse state persists locally.
- Selecting a room updates the content region. On narrow widths the navigation is the home screen; a room is the next screen with a back control, and back returns to the home screen with its scroll and collapse state. On wide widths the navigation stays visible and the content shows the selected room or an empty state.
- The room header holds the room settings entry.
- Use `<details>` for collapsible sections. Dialog behavior is in section 11.
- Messages use Telegram-like bubbles. Own and other bubbles take different surface ratios, never shadows or literal colors. Group by sender and time.
- Incoming messages with a sanitized formatted body render it; plain bodies stay verbatim.
- Pending messages carry a left-side status marker. Failed messages expose retry.
- The composer grows with content to a tokenized cap. Enter inserts a newline; the send button or Ctrl/Cmd+Enter sends.
- Rich text comes from selecting text and choosing a style in a context menu, not from markdown syntax. The written text stays verbatim.

## 11. Dialogs

- Settings, search, new message, join, create, and room settings are dialogs, not content routes.
- Room settings opens from the room header. Global settings has no room submenu.
- Dialog state is a query parameter on the current route: `dialog=settings`, `dialog=search&q=...`, `dialog=new-message`, `dialog=join`, `dialog=create`, `dialog=room-settings`. The URL is the only open state.
- Opening pushes one history entry. Back closes the dialog before the route changes. The close button takes the same path. A deep-linked dialog closes with replace, so the user stays in the app. Refresh keeps the dialog and its query.
- One dialog at a time. A destructive action shows an inline confirmation in the same dialog, never a second dialog.
- Use native `<dialog>` and `showModal()`. The browser owns the focus trap, inert background, Escape, and focus return. No custom focus trap.
- Shell: title bar, scrollable body, footer. Fluid width capped by `--modal-max`; height capped by `100dvh` minus the shell margin. The same dialog at every width: near-full with a visible backdrop on narrow, centered on wide.
- The backdrop uses a scrim token. The surface uses `--surface` and its derived text. Radius from a token. No shadow.
- Entry is opacity only, using the dialog duration token, and off under reduced motion. No shift, no scale.
- Lock background scroll with `html:has(dialog[open])`.
- Forms keep drafts in local state. A request never blocks opening or closing; status appears inline.
- Search keeps its query in `q`. Typing uses replace, not one history entry per keystroke. Selecting a result closes the dialog and opens the room at the event.
- Quick profile and image preview use a small dialog or popover only when no other dialog is open.

## 12. Routing and hosting

- The router supports hash and history modes, chosen at build time. Hash is the default for GitHub Pages.
- The locale is a path prefix (`/` English, `/<locale>/` translation); the router reads it and the language switch updates it.
- Dialog state is a query parameter on the current route, not a path segment.
- The base path is configurable. No absolute `/` asset URLs.
- History mode emits a `404.html` fallback per locale, or a root fallback that serves the matching shell.
- Routes are explicit and few. Room IDs are encoded.
- The build is a static directory. No server rewrite is assumed.

## 13. Local-first

- The UI reads only from the local store. It does not import `matrix-js-sdk`.
- The SDK adapter owns network, sync, crypto, and writes normalized data to the store. The boundary is explicit.
- Startup renders from the local store before the network. Offline is a normal state, not an error screen.
- Offline: viewing, search, settings, and queued sends work. `navigator.onLine` and sync failures drive the state.
- Send is optimistic: append to the store, persist to the outbox, return. The sender retries with backoff; `txn_id` prevents duplicates.
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

- Unit tests: store, outbox, router, sanitizer, search, i18n, base and route handling.
- Playwright: login, registration, sync, send, offline queue and retry, E2EE decrypt, offline search, collapse persistence, both routing modes, subpath base, narrow and wide widths, both color schemes, keyboard, reduced motion, dialog focus and history.
- Measure computed styles, overflow, and overlap in a real browser. No eyeballing.
- Report what was checked and what was not.

## 16. Exceptions

- `connect-src *` because homeservers are user-supplied.
- One shell breakpoint switches between the home screen and the room screen on narrow widths; every other layout change is fluid.
- The app requires JS; the static shell carries a full-page `noscript` overlay.

## 17. Open decisions

- Automatic redirect from `/` to the browser's language shell. Default stays English; v1 has no auto-redirect and always shows a language switch.

## 18. Sources

- Check current official documentation before choosing an API, protocol feature, or dependency. Use the Matrix spec, matrix-js-sdk docs and source, MDN, and browser support tables.
- Read the implementation when the prose is vague. The code wins.
- Look at Element or another maintained client for a working reference, not a pattern to copy.
- State the source and the date in the discussion. Do not present an unverified API as settled.
- Confirm a browser feature in all three targets before designing around it.

## 19. Reference checkouts

- `git/matrix-js-sdk` is a shallow clone of `matrix-org/matrix-js-sdk`, branch `develop`.
- `git/cinny` is a shallow clone of `cinnyapp/cinny`, branch `dev`.
- Read them for protocol details, API shapes, and client structure. Do not import, build, lint, format, type-check, or test anything under `git/`.
- Exclude `git/` from Vite, TypeScript, ESLint, Stylelint, and test discovery.
- Do not edit the clones. Refresh with `git -C git/<name> pull --ff-only`.
- Cite the commit hash when referencing a file: `git -C git/<name> rev-parse --short HEAD`. Current checkouts: matrix-js-sdk `14a114e`, cinny `474400c` (2026-11-11).
- The app rules win over any pattern found there.

> Engineering design note — deferred. Sections 20-22 are code-level notes from earlier discussion, not current project design. Revisit them when coding starts.

## 20. Data model

**Source of truth.** The UI reads a projection store. The worker owns `matrix-js-sdk`, sync, crypto, and writes Matrix-derived stores. The main thread owns the outbox and UI stores. The UI never imports `matrix-js-sdk`.

**Account database** `maski-<hash(userId)>`:

| store | key | indexes | contents |
| --- | --- | --- | --- |
| `session` | `id` | | access token, user, device, base URL |
| `meta` | `key` | | schema version, revision, sync token, sync state |
| `rooms` | `roomId` | `lastTs` | name, avatar, membership, unread, last event, isDirect, tags, hasOlder |
| `events` | `eventId` | `[roomId, ts, eventId]`, `tokens` multiEntry, `roomId` | normalized timeline row |
| `members` | `[roomId, userId]` | `roomId` | display name, avatar, membership, power |
| `relations` | `relationEventId` | `targetEventId` | edits, reactions, redactions |
| `media` | `mediaKey` | `lastUsedAt` | cached blobs |
| `outbox` | `txnId` | `[roomId, createdAt]`, `status` | pending sends |

**UI database** `maski-ui`:

- `settings`: locale, collapse state, last account, layout.
- `drafts`: per account and room, body, formatted body, reply target.
- `scroll`: per account and room, event ID, offset, at bottom.

**Event record.** `eventId`, `roomId`, `senderId`, `senderName`, `ts`, `type`, `kind`, `body`, `formattedBody`, `media`, `replyTo`, `mentions`, `edited`, `redacted`, `encrypted`, `decryptionError`, `reactions`, `txnId`, `searchText`, `tokens`.

- `kind`: text, emote, notice, image, file, audio, video, membership, state, redacted, encrypted, unsupported.
- `formattedBody` is stored raw and sanitized at render.
- No raw event JSON. The SDK store is the protocol archive; the projection is display data. If the projection is lost, rebuild from the SDK store or resync.

**Relations.** Store edits, reactions, and redactions as relation records and apply them to the target event. They can arrive before the target; keep them and apply when it lands. An edit updates the target and the room preview if the target is the last row; it does not reorder the room. A reaction updates counts and the current user's flag. A redaction clears the body and marks the row.

**Outbox.**

- One record per `txnId`; one in-flight message per room.
- Retry with the same `txnId`; Matrix scopes it to a device and endpoint.
- The main thread writes it; the worker reads it.
- The pending row shows on the left. A failure exposes retry.
- Remove the record when the remote event with the same `unsigned.transaction_id` lands.

**Writer split.** Worker: session, meta, rooms, events, members, relations, media. Main: outbox, settings, drafts, scroll. No store has two writers. The worker reads the outbox and never writes it. The main reads projection stores and never writes them. Logout is a lifecycle exception: main closes its account DB connection; worker deletes the account DB; main clears UI drafts/scroll and the last-account pointer.

**Delta.**

- The worker commits a batch with `meta.revision`, then posts `{ revision, rooms, events, members, removedRooms, syncState }`.
- The main applies records idempotently. A revision gap or worker restart triggers a re-read from IndexedDB.
- The initial render reads a consistent snapshot from `meta`, `rooms`, and the active timeline before the worker starts.
- Typing is ephemeral and is not persisted. Outbox status is a separate message.

**Startup.**

- Main reads `maski-ui`, opens the last account DB if it exists, and reads the local snapshot; it does not mount room content yet. It acquires the Web Lock and starts the adapter/worker with boot/connecting.
- The worker restores the session, starts sync, and sends deltas.
- No session: auth. Session with an incomplete key gate: gate. Completed: shell from the local snapshot. No auth or cached-message flash.
- A second tab is read-only or waits. If the worker fails, the projection stays readable and the outbox queues.
- `navigator.storage.persist()` is requested on the main thread. If denied, the UI says the cache may be evicted.

**Sync token.**

- The worker stores the projected sync token in `meta`.
- If it differs from the SDK store's saved token after a crash, rebuild the derived stores from the SDK store.
- Keep `outbox` and `session` across rebuilds.

**Search.**

- Index `body` tokens in the event record.
- Normalize with NFKC, lowercase, strip diacritics; segment with `Intl.Segmenter`.
- Query tokens as prefix ranges on the multiEntry index, intersect, sort by `ts` desc, limit 50.
- Update on edit and redaction.
- Search covers synced local events; no server search.

**Migrations.**

- Bump the account DB version for schema changes; drop and rebuild derived stores; keep `outbox` and `session`.
- A rebuild is visible, not silent.
- Do not delete the SDK or crypto stores on a projection rebuild.

**Plaintext.**

- The projection stores decrypted text and cached media for offline viewing and search.
- Device keys sit in the same profile, so this adds no new attacker beyond profile access. The main thread never reads the session or crypto stores.
- XSS is contained by CSP and one sanitized render path.

**Resolved decisions.**

- UI source: projection store, not SDK objects.
- SDK placement: dedicated worker required; no main-thread SDK or token; sync may run during the key gate, but the shell does not. The UI does not change.
- Markdown: render `formatted_body` only; never parse `body` as markdown.
- Sanitizer: DOMPurify.
- Multi-account: one account in v1; per-account DB by user ID.
- Multi-language: English source and fallback; `zh-CN` translation; language switch.
- Cold offline start: no shell service worker in v1; a media-only service worker may proxy authenticated video; offline applies after the page loads.

## 21. Worker protocol

**Envelope.** One dedicated `Worker` per active tab. Main to worker commands carry `id`; the worker replies with the same `id` and `{ ok: true, data }` or `{ ok: false, error: { code, message, retryable } }`. Main also sends `{ type: "ack", revision }` without an `id`. Worker events carry no `id`. Send plain error objects, not `Error`; the SDK's worker does the same. Unknown messages are logged and ignored.

Error codes: `bad_request`, `not_logged_in`, `network`, `rate_limited`, `crypto`, `internal`.

**Start handshake.**

1. Main opens `maski-ui` and the last account DB if it exists, reads the local snapshot, and does not mount room content yet. The worker owns account DB creation and upgrades.
2. Main requests Web Lock `maski-<hash>` with `ifAvailable`.
3. If the lock is held, the tab is read-only: no worker, no sending, banner shown.
4. Otherwise, the main constructs the adapter, which starts the worker with `new Worker(new URL("./matrix.worker.ts", import.meta.url), { type: "module" })` and sends `start` with `{ accountHash }` from `maski-ui.lastAccountHash`.
5. Worker opens the account DB, restores the session, starts sync, and posts `ready` with `{ session, revision, syncState }`. The session summary includes `accountHash`.
6. Main compares `revision` with its snapshot; on a mismatch it re-reads the projection.
7. If a session exists, main calls `recoveryStatus`; a session without a completed key path stays in `key-gate`. Sync may continue for device lists and SAS while the shell is gated.

Commands that hit the network default to a 30s timeout. `start` and sync are long-lived and have no timeout.

**Commands.**

| command | payload | reply | notes |
| --- | --- | --- | --- |
| `start` | `{ accountHash? }` | `{ started: true }` | `ready` follows |
| `login` | `{ baseUrl, identifier, password }` | `{ session }` | summary includes `accountHash` |
| `register` | `{ baseUrl, username, password }` | `{ session }` or `{ uia }` | UIA later |
| `logout` | `{}` | `{}` | clears SDK, crypto, account DB |
| `retrySync` | `{}` | `{}` | calls `retryImmediately()` |
| `send` | `{ txnId }` | `{ queued: true }` | worker reads the outbox row |
| `retry` | `{ txnId }` | `{ queued: true }` | resets the attempt count |
| `paginate` | `{ roomId, direction, limit }` | `{ added, reachedStart }` | delta event follows |
| `jump` | `{ roomId, eventId }` | `{ found }` | delta event follows |
| `markRead` | `{ roomId, eventId }` | `{}` | receipt sent in the background |
| `typing` | `{ roomId, typing }` | `{}` | debounced by the main thread |
| `media` | `{ mediaKey, mxc, width, height, method, file? }` | `{ buffer, mime }` | transfer the buffer |
| `setOnline` | `{ online }` | `{}` | on true call `retryImmediately()` |
| `stop` | `{}` | `{}` | stop the client |

**Events.**

| event | payload | notes |
| --- | --- | --- |
| `ready` | `{ session, revision, syncState }` | after start or login |
| `delta` | `{ revision, rooms, events, members, removedRooms, syncState }` | changed records |
| `reload` | `{ revision }` | initial sync or rebuild; main re-reads the DB |
| `outbox` | `{ txnId, status, eventId?, error?, attempts? }` | main updates the outbox row |
| `typing` | `{ roomId, userIds }` | ephemeral |
| `sync` | `{ state }` | sync state change |
| `progress` | `{ phase, done, total }` | initial sync or cache rebuild |
| `fatal` | `{ code, message }` | worker unusable |
| `log` | `{ level, message }` | diagnostics, no secrets |

**Backpressure.**

- Main acks each applied delta with `{ type: "ack", revision }`.
- Worker keeps at most 8 unacked deltas. If the window is full, it coalesces changed records by key and sends one merged delta after an ack.
- `reload` is acked after the main re-reads the DB.
- Initial sync and schema rebuild use `reload`, not thousands of `delta` records.

**Media.**

- Main checks the `media` store first; on a miss it sends `media`.
- Worker fetches or decrypts, writes the `media` store, and returns `{ buffer, mime }` with the `ArrayBuffer` in the transfer list.
- Main creates a Blob URL and revokes it when the element is gone.

**Session.**

- Main sends credentials once; worker saves the session, starts sync, and returns only `{ userId, deviceId, displayName, avatar, accountHash }`.
- Main never receives the access token or keys.
- Logout clears the SDK store, crypto store, and account DB. After the reply, main clears UI drafts/scroll and the last-account pointer, then resets AppStore; main closes its account DB connection before the worker deletes it. The worker never writes the UI DB.

**Concurrency.**

- One `MatrixClient` per worker; one worker per active tab.
- Main holds the Web Lock for the tab lifetime. A second tab is read-only; it has no worker and cannot send. No `SharedWorker` in v1. A second tab refreshes to see new state.
- A worker crash reaches `fatal` or `onerror`; the main keeps the projection, shows a degraded state, and restarts the worker once. The outbox remains. If restart fails, show fatal with reload; no main-thread SDK fallback.

**Vite.**

- Use `new Worker(new URL("./matrix.worker.ts", import.meta.url), { type: "module" })`; Vite emits a separate chunk.
- Do not inline the worker. A separate chunk is cacheable and easier to audit.
- Main bundle must not import `matrix-js-sdk`; only the worker does.
- CSP needs `worker-src 'self'`. The worker's wasm and `connect-src` need a spike because the document meta CSP does not automatically govern the worker.

**Validation.**

- Type guards on both sides. A malformed command returns `bad_request`; a malformed event is logged and ignored.
- Wrap `postMessage`; a clone failure becomes an error reply, not an uncaught worker error.
- `onmessageerror` and `onerror` mark the worker degraded.
- Worker logs go through `log`; never include tokens, keys, or message bodies.

The SDK's own `IndexedDBStoreWorker` uses the same request/response shape (`seq`, `cmd_success`, `cmd_fail`) and sends plain error objects. Follow that pattern.

Sources: Vite Web Workers guide; MDN Transferable objects and Web Locks; `git/matrix-js-sdk/src/store/indexeddb-remote-backend.ts` and `indexeddb-store-worker.ts` at `14a114e` (2026-11-11).

## 22. Main-thread store and timeline

**Store shape.** One `AppStore` of plain data. No proxies, no state library, no observable graph.

- `connection`: worker and sync state.
- `rooms`: `Map<roomId, RoomView>`; room list order is derived.
- `activeRoomId`.
- `timeline`: `{ roomId, loaded, start, end, hasOlder }` for the active room.
- `outbox`: pending rows for the active room.
- `draft`: active room's draft and reply/edit target.
- `ui`: locale, collapse state, dialog state, search state.

The store is not persisted. IndexedDB is the source; the store is the active view. `hydrate()` reads the DB in one read transaction over `meta`, `rooms`, and the active window, then records the revision. `applyDelta()`, `applyOutbox()`, and `selectRoom()` are the only mutations. Views never mutate.

**Reference equality.** Unchanged room and event objects keep their references; changed ones get new objects. Renderers skip `item === previousItem`. This is the whole reactivity mechanism; no per-field dirty flags.

**Scheduling.** One `requestAnimationFrame` render after any change. Worker messages only apply to the store; they never render directly. Multiple deltas in one frame coalesce. A hidden tab skips rendering and renders once on visibility. A delta whose revision is not the previous revision plus one triggers a snapshot re-read instead of being applied.

**Regions.** Connection, room list, header, timeline, composer, dialogs. Each updates its own DOM. The composer and an open dialog own their local state and selection and are not re-rendered on unrelated store changes. The timeline and room list share one keyed list helper.

**Keyed list.**

- `render(container, items, { key, create, update, remove })`.
- Keeps `Map<key, node>`.
- Creates missing nodes in a `DocumentFragment`, updates changed items in place, moves only when order changes, removes missing nodes.
- Never replaces a node the user is selecting or focusing.
- Removed rows release object URLs and abort pending media.
- Used for room rows, timeline rows, reaction chips, and member rows.

**Timeline view.**

- Display items: day separators, event rows, read marker, new-message marker, older sentinel. Keys: `day:...`, `event:...`, `read:...`, `new:...`, `older`.
- Group flags come from neighbors: same sender, same day, within a time gap. A row updates in place when only flags or content change.
- Pending outbox rows are items with `pending:<txnId>`; they sort after remote events by `createdAt`. The remote echo with the same `txnId` removes the pending item.
- Own and other bubbles, reply preview, reactions, edited or redacted state, media, and status are parts of the row. Reaction chips are a nested keyed list.

**Window.**

- The store holds up to 2000 loaded events for the active room. Beyond that, drop the far end; IndexedDB can re-read it. The DOM renders a contiguous window of up to 300 display items.
- Near the top, the window shifts up by 50; near the bottom, down by 50. When it reaches the loaded start and `hasOlder`, the main sends `paginate`.
- Rows keep natural height. Shift by adding and removing rows at the edges and compensating scroll; no absolute-positioned virtualization.
- Switch room by dropping the previous DOM window and reading the new room from IndexedDB.
- `content-visibility: auto` is not used for the timeline. The bounded window makes it unnecessary and it complicates anchoring. It may be used on long static lists.

**Scroll.**

- `overflow-anchor: none` with manual anchoring. `overflow-anchor` is baseline 2026; manual control is deterministic.
- Before a prepend or window shift, record the first visible row's key and `getBoundingClientRect().top`; after the DOM update, adjust `scrollTop` by the delta.
- At the bottom, a new message keeps the bottom. Scrolled up, it increments the new-message count and shows the pill.
- On room switch, restore `{ eventId, offset }` from `ui`; if the event is not loaded, load around it from IndexedDB.
- Image load and `ResizeObserver` use the same anchor compensation when not at the bottom; at the bottom, stay pinned.
- `overscroll-behavior: contain`; no smooth scrolling.

**Room list.**

- Sections: invites, favorites, DMs, rooms. Sections derive from membership, `isDirect`, and `tags`; `<details>` carries the open state from `ui`.
- Rows sort by `lastTs` inside each section; the keyed list moves nodes on reorder and preserves focus.
- Unread and highlight badges, muted state, active room, and relative time are parts of the row.

**Inactive rooms.** Apply only the room summary from a delta. Event details stay in IndexedDB and are read when the room becomes active. This keeps main-thread memory bounded.

**Media.**

- A `MediaCache` keyed by `mediaKey`, ref-counted by visible rows, object URLs revoked at zero, LRU cap.
- Images use fixed dimensions or `aspect-ratio` to avoid layout shift; `loading="lazy"`, `decoding="async"`.

**Composer and dialogs.** They are not part of the keyed timeline. The composer keeps its own selection and draft; store writes are debounced. An open dialog keeps its local form state. Both update only on room switch, draft load, or dialog open.

**Accessibility.**

- Timeline is an `<ol>` with an accessible label; rows are `<li>`.
- New-message announcements use a separate visually hidden live region; do not mark the whole timeline live.
- Focus and selection survive row updates because nodes are not replaced.
- Message actions are reachable by keyboard; a visible menu button and the context-menu key path both work.

**Reading.** Use `IDBIndex.getAll` with the `[roomId, ts, eventId]` range and a count for a window. Use `getAllKeys` or cursors for search. A `DocumentFragment` batches new nodes; MDN notes its speed benefit is often overstated, so use it for clarity, not as a performance claim.

**Ordering.** Sort by `[origin_server_ts, eventId]`. The SDK also falls back to timestamps across timelines (`compare-event-ordering.ts`); do not claim exact server order.

Sources: MDN `IDBIndex.getAll`, `DocumentFragment`, `overflow-anchor`, `content-visibility`, `requestAnimationFrame`, `IntersectionObserver`, `ResizeObserver`; `git/matrix-js-sdk/src/models/compare-event-ordering.ts` at `14a114e`; `git/cinny/src/app/features/room/RoomTimeline.tsx` for pagination and decryption behavior, not its React structure.

## 23. CSS system

Project design. Section 9 holds the rules; this maps them to maski. The base is `blog/AGENTS.md` 2.1-2.9 and `blog/src/assets/style.css`. Copy the base token table, not the blog component rules.

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
| dialog | `--surface` | `--surface-text` |
| popover | `--surface` + `--rule` | `--surface-text` |
| login form | `--page` | `--page-text` |

No literal colors outside tokens. Own and other bubbles differ by one shallow step, not by hue.

**Spacing roles.**

| role | padding |
| --- | --- |
| surface: bubble, dialog | `--space-4` |
| control: input, button, navigation action | `--space-3` |
| compact: room row, member, reaction chip | `--space-2` `--space-3` |

Section gaps use `--space-6`; a message group uses `--space-4` between groups and `--space-1` within. One role, one value.

**Type.**

- The blog five steps; root 100%; every step `clamp()`; no new sizes.
- Room name `--text-md` at 600; preview `--text-sm` muted; time `--text-sm` muted, tabular.
- Content header `--text-lg`; dialog title `--text-xl`; message body `--text-md`; sender and time `--text-sm`; day and state rows `--text-sm`.
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
- Media: radius, surface placeholder, aspect ratio, lazy; no shadow. Attachments add video, audio, and file cards; progress and retry are visible.
- Auth page: `--page`, centered at `--auth-max`; inputs `--surface`; a compact language switch; no card or shadow. Encryption setup uses the dialog shell.
- Sessions: compact rows; current device marked; Verify and Sign out are text actions; bulk sign-out sits at the end and uses a confirmation. No color; last active is muted.
- Room list: section headers `--text-sm` muted; rows compact; active `--surface-active`; unread name weight; mention `--badge-strong`; muted mark; invite rows use the surface. No card.
- Timeline: group gaps `--space-4` and `--space-1`; day separators `--text-sm` muted; read marker `--rule`; new-message pill surface; action menus surface plus `--rule`; typing muted; mentions `--mark`.
- Room settings: dialog shell; sections are headings and space; member rows compact; notification choices are a radio group; leave is a text action with inline confirmation. No card per section.
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
- One dialog at a time; destructive confirmations are inline.

**Motion.**

- `--ease`; hover and active swap a color pair; dialog and new-message pill use opacity; bubbles never transform.
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

Sources: `blog/AGENTS.md` 2.1-2.9 and `blog/src/assets/style.css`; MDN `light-dark()` (Baseline 2024) and container queries. The token table is copied; the component rules are not.

## 24. Composer

Project design. The composer is a message input, not a document editor.

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

- "Attach files" in the left menu opens the file picker: images, video, audio, files; multiple selection. While editing, attachments and stickers are disabled; emoji stays available.
- A tray above the composer shows thumbnails or cards; each can be removed; upload progress, cancel, retry. Each file sends as its own message in selection order. The send icon sends the tray; the composer text, if any, follows as a separate text message after the files; captions and albums are out of scope v1 and stated, not hidden.
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

- The picker is a labeled popover or dialog; search focus; arrow keys; Enter inserts or sends; Escape closes; focus returns to the composer.
- Sticker images have alt from body or shortcode; custom emoji have alt; pack avatars are labeled.
- Grid items are buttons with accessible names; recent and pack tabs are tabs.
- No color-only states; progress has text.

**Protocol notes.** Matrix v1.19 defines `m.room.image_pack` and `m.image_pack.rooms`; the unstable identifiers are `im.ponies.room_emotes` and `im.ponies.emote_rooms`. Shortcodes match `[a-zA-Z0-9-_]+` and are case-sensitive. Custom emotes are `<img data-mx-emoticon>` with an MXC `src`; stickers are `m.sticker` with `body` and `info`. Pack media is not encrypted; the UI warns. Cinny's `app/plugins/custom-emoji` at `474400c` is a reference for the legacy identifiers, not a template.

Sources: Matrix v1.19 changelog and MSC2545 (`proposals/2545-emotes.md`); `m.sticker` spec; Cinny `app/plugins/custom-emoji` at `474400c`; checked 2026-11-11.

## 26. Login and first run

Project design. The auth screen is a page, not a dialog. The app shell appears only with a session.

**Entry.**

- No session: a full page with the maski mark, a sign-in form, and a "Create account" link. No nav, no card, no shadow. `/login` and `/register` are pages; a session redirects to `/` or the deep link.
- A compact language switch sits in the corner before login; it changes the locale prefix (`/` or `/zh-CN/`) without reload and falls back to English.
- Homeserver field is pre-filled `matrix.org`. Username accepts a localpart or a full `@user:server`; a full ID sets the server. Password has show/hide. Submit shows an inline error or a loading state.
- On submit, discovery runs first: `.well-known/matrix/client`, fallback to `https://domain`, then `/versions`. HTTPS is required except for localhost. Errors name the failing step.
- After discovery, show the server's login flows: password form and "Continue with SSO" when advertised. If only SSO is offered, show only that. The registration link appears only when the server allows it. After login, return to the room or route that opened the app.
- No password is stored. Credentials go to the worker once; the main thread never receives the access token.

**SSO.**

- "Continue with SSO" redirects to the server's SSO URL. The browser returns with a login token; the token is consumed once and removed from the URL; the worker completes login. Failures return to the auth page with the reason.
- SSO registration is out of scope; registration uses the password and UIA flow.

**Registration.**

- Same page, "Create account"; the homeserver persists.
- Username, password, confirm. Server password-policy errors show inline.
- UIA: support `m.login.dummy`, `m.login.terms`, and `m.login.registration_token`. Terms show the server's policy links and require accept; the token has a field.
- Unsupported stages (`m.login.recaptcha`, email, msisdn) show a clear message and a link to the server's registration page. No third-party script is loaded.
- Registration disabled: say so; suggest another server or the admin.
- Success with a session enters the app; success without one goes to sign-in with the username filled.

**Session restore and expiry.**

- On load, a stored session with a completed key gate goes straight to the shell with cached data and a connecting state; a session without one goes to the gate. No login flash.
- Soft logout or an expired token keeps the shell and cached data, and opens a re-login dialog with server and username filled. Reuse the device ID so the crypto store continues. If the server forces a new device, the recovery setup runs again.
- Explicit logout confirms, warns that local encrypted history and device keys are removed unless backed up, clears local stores, and returns to the auth page.

**First-run encryption setup.**

- After login, a mandatory key gate appears while sync starts. The app shell is not interactive until one path completes. The gate returns on every login until a key is set.
- New account: "Create your recovery key." Optional passphrase; generate a recovery key; show it once with copy and download; require "I saved it"; set up secret storage, cross-signing, and key backup. This is the only path at registration; it is the reset path.
- Existing account without a key: wait for another device if one exists, or reset. The recovery-key option is unavailable.
- Existing key: three options.
  1. "Use recovery key": one field accepts a recovery key or passphrase; restore the backup, verify the device, enable the backup.
  2. "Wait for another device": shown when another device exists; request verification from the user's other devices; show "Waiting for another device…"; cancel returns to the three options. On success, keys sync, the backup is restored, and the device is verified.
  3. "Reset key": destructive; confirm; create a new secret storage key, cross-signing keys, and backup; warn that old encrypted history may be lost and verified contacts see a security alert. Then show the new key once.
- If UIA asks for the account password during setup or reset, ask on the gate and discard it.
- If the key is valid but there is no backup, offer to create one and warn that older history may stay unavailable.
- The wait path uses SAS: the new device shows the emoji grid and a confirm button; the already set-up device receives a "new session wants to verify" request with accept/decline, then the same emoji grid. Both confirm.
- The gate cannot be skipped. The user can sign out; sync can run behind, but no room or message is interactive until the key path completes.
- Recovery key display: monospace on a `--code` surface; copy and download; warning; never logged or persisted in the UI.
- The recovery key verifies the device through cross-signing; SAS is used only for the wait path.

**Settings > Security.**

- This device: verified or not; set up.
- Recovery key: set up or change; the old key stops working after a reset.
- Key backup: on or off, last backup, restore.
- Reset recovery: strong confirmation; warns that verified contacts see a security alert and old backups are lost.
- Sessions: the current device is marked "This device"; other sessions show name, last active, and verification status. Actions are Verify, Sign out, and Sign out all other sessions.
- Verify uses SAS with the chosen device; both sides compare the emoji grid and confirm.
- Sign out one session: confirm, then UIA password if asked. The session is invalidated and will need to sign in again. Data already downloaded on that device may remain; this is not a remote wipe.
- Sign out all other sessions: one action with a confirmation that names the count. UIA password if asked. The current device stays signed in and the key backup is unchanged. The other devices will need to sign in again. Data already downloaded on those devices may remain.
- The current device cannot be kicked from this list; use Account > Log out for that.
- Offline: show the last known list, disable Verify and Sign out, and say why. UIA stages other than password show a clear message.

**Visual.**

- Auth page `--page`; form capped at `--auth-max`; inputs `--surface`; labels `--text-sm`; primary action a surface control; no card, no shadow, no accent.
- Brand `--text-2xl`; a short line below, no marketing.
- SSO is a secondary control; register is a text link.
- Encryption setup is a full-page gate, centered at `--auth-max`; options are rows; Reset key is last and marked destructive; recovery key uses `--code`; the wait state shows the emoji grid. No card, no shadow, no color.
- Errors: `--text-sm`, strong, `aria-live`; no color-only.

**Accessibility.**

- Labels and `autocomplete`; password show/hide has a label.
- Errors linked with `aria-describedby`; `aria-busy` on submit; focus moves to the first error.
- The SSO redirect preserves the return path; no password in the URL.
- Setup gate options are a labeled list; Reset key has a confirmation; the waiting state is announced; the emoji grid has text names; both devices confirm.
- The setup gate uses normal page focus; recovery key reveal and copy; the reset confirmation is native `<dialog>`.
- No autofocus on touch; focus the first field on a fine pointer.

**Out of scope.**

- Password reset, account deactivation, multi-account, SSO registration, captcha/email/msisdn UIA, session renaming, and session IP or location.

**Protocol notes.** Discovery `.well-known/matrix/client`; `/versions`; `/login` flows; `/login/sso/redirect`; `m.login.token`; `/register` UIA; `m.login.dummy`, `m.login.terms`, `m.login.registration_token`; `initRustCrypto`; `getSecretStorageStatus` and `isSecretStorageReady`; `bootstrapSecretStorage`; `bootstrapCrossSigning`; `resetKeyBackup`; `checkKeyBackupAndEnable`; `loadSessionBackupPrivateKeyFromSecretStorage`; `decodeRecoveryKey` and `deriveRecoveryKeyFromPassphrase`; `requestOwnUserVerification` and the SAS verification request events; `getDevices`, `deleteDevice`, `deleteMultipleDevices`, `CryptoEvent.DevicesUpdated`, `getDeviceVerificationStatus`, and `requestDeviceVerification`. The worker owns tokens, keys, and crypto; the main sees session summaries and the one-time recovery key display.

Sources: Matrix spec login, registration, UIA, and SSO; matrix-js-sdk README and crypto API; Cinny `app/pages/auth`, `app/components/SecretStorage.tsx`, and `DeviceVerificationSetup.tsx` at `474400c`; checked 2026-11-11.

## 27. Room list and navigation

Project design. On narrow widths the navigation is the home screen; on wide it is a column. The same sections appear in both.

**Sections.** Invites, Favorites, Direct messages, Rooms, Low priority. Each is a `<details>`; open state is remembered. Empty sections are hidden except Rooms; an empty Rooms section shows "Join or create a room." Section headers show their count.

**Rows.** Avatar, name, last-event preview, time, unread count, mention badge, muted mark. The active room uses `--surface-active` and `aria-current="page"`. Preview is text, "Image", "Video", "File", "Sticker", "Encrypted message", "Message deleted", or a membership line. Time is relative today and a date otherwise. Unread makes the name stronger; mentions use the strong badge; muted keeps the count but suppresses notifications. No color coding.

**Order.** Invites first, then Favorites, DMs, Rooms, Low priority. Within a section, last activity descending. Favorites and low priority come from room tags; DMs from `m.direct`; mute from push rules. Manual ordering is later.

**Actions.** Top action rows: Search, New message, Join room, Create room, Settings. A row menu (right-click or a visible button) has Mark read/unread, Favorite, Mute, Leave, Copy link. Room settings stays in the room header. Invite rows show inviter, room name and avatar, encryption state, Accept, and Decline. New message opens the dialog in section 29.

**Empty and edge states.** No room selected on wide: restore the last room, otherwise a calm empty panel with the top actions. No invites or favorites: hide the section. Mark unread is local until the next sync; the UI does not pretend it is server state.

**Visual.** Section headers `--text-sm` muted; rows compact; active `--surface-active`; unread stronger name; mention `--badge-strong`; muted mark; invite rows use the surface; no card, no shadow, no color.

**Accessibility.** Lists have labels; the active room has `aria-current`; unread count is in the accessible name; `<details>` summaries are keyboard reachable; row menus and invite buttons have labels.

## 28. Room and timeline

**Header.** Back on narrow; room avatar and name; topic muted; room settings entry. Encryption state is in settings, not a badge cluttering the header.

**Intro.** An empty or new room shows avatar, name, topic, member count, encryption state, "This is the beginning", and an invite action. No card.

**Rows.** Messages, media, stickers, membership and state events, encrypted failures, redactions, unsupported events. Group by sender and day; avatar and name only at group start; day separator; read marker and new-message divider between rows.

**Actions.** Reply, React, Edit (own text), Redact (own or permission), Copy text, Copy link. A menu appears on hover or focus and on right-click; keyboard reachable. React opens the Unicode emoji picker; custom emoji reactions are out. Reply shows a quote and jumps to the target, loading around it if needed. Edits show "edited"; no history. Redactions show "Message deleted". Encrypted failures say so and offer a key hint, never blank.

**Live.** Typing indicator at the bottom; read receipt sent when the room is visible and at the bottom; new-message pill when scrolled up; jump to bottom; load older 50 with a loading row; jump to an event highlights it briefly. No blocking.

**Mentions.** Messages with `m.mentions` for the current user get a `--mark` background; the room list mention count uses the strong badge. No color.

**Tombstone.** A replaced room shows a banner "This room has been replaced" with Join; the composer is disabled.

**Visual.** Own and other bubbles as in section 23; no tails; stickers have no bubble; membership and state are muted lines; day separators are muted text; read marker uses `--rule`; new-message pill is a surface; action menu surface plus `--rule`; typing muted; mention `--mark`; no shadow or color.

**Accessibility.** Timeline is an `<ol>` with a label; rows are `<li>`; action and reaction buttons have names; new messages use a separate live region; the new-message pill is a button; jump-to-event keeps focus and announces the target.

## 29. Room settings, join, create, invites

**Room settings.** A dialog from the room header, one at a time. Sections:

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

## 33. Static shell and no-JS

Project design. The app is a client for Matrix sync and encryption; it needs JavaScript. The HTML around it is static and localized.

**Shells.** `/` is the English shell; `/<locale>/` is the translated shell (`/zh-CN/`). Each shell is static HTML with its own `<html lang>`, title, description, canonical, alternate `hreflang` links, manifest, theme colors, and external CSS/JS. Assets are shared and hashed. The JS bundle carries the catalogs; there is no runtime translation fetch. The router reads the locale prefix; the language switch updates it without reload, and a reload loads the matching shell.

**Default.** English is the default and fallback. Automatic redirect from `/` based on browser language is open; v1 does not redirect. A visible language switch is always present on the auth page and in Settings. If auto-redirect is added later, it must be a script for JS-enabled visitors; no-JS visitors stay on English, and a meta refresh is not used because it cannot choose by language.

**Boot.** The app root contains a localized boot state (brand and loading text) that the app replaces on mount. It is static HTML with classes from the external stylesheet; no inline CSS or JS. If the app fails to mount, the boot text remains; no blank page.

**No-JS.** A full-page `<noscript>` overlay covers the boot. It contains:

- the maski mark and one `h1`;
- a short explanation that Matrix sync and end-to-end encryption run in the browser and require JavaScript;
- "Enable JavaScript and reload";
- a static language link to the other shell (`/` or `/zh-CN/`);
- no app controls, no login form, no fake progress.

The overlay is a normal region styled by the external CSS, fixed and scrollable on narrow screens. The blog's `noscript-note` is the reference for tone; the app needs a full-page version because the whole interface is script-dependent.

**Why not render the app statically.** The client reads local IndexedDB, syncs, decrypts, and sends; there is no meaningful static app. The static shell explains the requirement instead of showing a broken shell. Login, rooms, and messages never appear without JS.

**Audit.** Each shell has one visible `h1` in the active state; the noscript `h1` is hidden when JS is on, and the app's `h1` is not rendered when JS is off. The output audit checks the static shells for inline CSS/JS, localized title and `lang`, alternate links, and the noscript content.

Sources: `blog/src/pages/search.ts`, `blog/src/pages/music.ts`, `blog/src/pages/about.ts`, and `blog/src/assets/style.css` `.noscript-note`; `blog/AGENTS.md` 1.6 and 2.6; Vite static build and HTML entry points; checked 2026-11-11.
