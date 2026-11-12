# maski

A Matrix client that keeps the interface on local data: the worker owns the protocol, the
main thread reads a projection and renders plain DOM.

## 0. The brief and the rules

### 0.1 Working rules

1. Read the latest official material and the reference checkouts in `git/` before choosing
   an API. Present nothing as settled that has not been checked.
2. A design note here is not final; it changes. Do not trust it blindly.
3. Discuss before writing code when the shape is unclear.
4. Record what the user decided, under the user's rules, in the same change. Do not edit the
   brief or these rules without being asked.

### 0.2 The original brief, verbatim

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
网站的页面设计，左边为导航区，右边为内容区。右边内容区随着左边导航选择而改变。先说左边导航栏设计，最上面是客户端功能按钮/卡片，比如说设置/搜索消息/加入房间/创建房间等等。点击后会弹窗或者显示到内容区（需讨论）。下面的频道/房间/私聊使用折叠设计，记忆上次折叠，展开后可以选择房间/频道。点击左边卡片/按钮后，右边会显示内容。我们虽然没有手机和电脑版设计，但是可以用 auto-fit, clamp, minimax, 容器查询等来根据尺寸变化，尽量保证任何尺寸下都能使用。当尺寸足够小的时候，导航区会隐藏，点击内容区顶栏功能区可以切换到导航区，点击按钮跳转到对应内容区。关于房间设置的入口是收集起来放到设置里面的一个子菜单内，还是放到房间顶栏导航区里点击后弹窗 or 内容区跳转需要讨论。聊天内容区中，我们用着类似于 Telegram 的气泡设计。输入框会随着内容变多稍微增大，但有上限。我们不支持 markdown 语法输入，用户写的任何内容都会原封不动的被自己和其他人看到。而是选中文本右键选择样式。可以渲染 markdown 消息内容。
主线程 UI 应该只使用本地数据。目前绝大多数 Matrix 都很卡顿，远远没有 Telegram 流畅。我们的客户端应该是这样的，页面加载后就可以离线使用。当浏览器 offline 或者检查服务端无法连接，就会进入离线模式。客户端的查看消息，按照内容搜索消息，以及所有不需要服务端参与的客户端设置都不需要联网就能用。消息点击即可发送，左边会有标记提醒没有发送完。我们不应该有阻塞 UI 的设计，比如说动画无法打断，按钮无法响应的情况应该避免。
我们应该尽可能使用原生现代 API。要让客户端尽可能地降低占用，提高加载速度。我们暂时不打算支持通话和视频等功能。部分功能可以暂缺。多语言和多用户可以考虑是否一开始就需要添加支持。登录界面需要支持登录和注册。
这些内容应该整理好记在 AGENTS.md 里面
```

### 0.3 What the brief left open, and what was decided

| Question in the brief | Decision |
| --- | --- |
| Actions open a dialog or the content area | A dialog. The content area holds one room and nothing else, so back and forward never fight a dialog. |
| Where room settings live | In the room header, as a dialog. Settings has no room submenu. |
| Narrow layout | The navigation *is* the home screen; a room is the next screen with a back control. One container query, no drawer. |
| Markdown | Not an input format. Selecting text and picking a style writes `formatted_body`; an incoming `formatted_body` is rendered, a plain body is shown as written. |
| Multi-language | From the start: `en` is the source catalog, `zh-CN` a translation, the language is switchable at runtime. |
| Multi-account | One account. The database is keyed by account hash so a second one is a later change, not a migration. |
| Calls and video | Out of scope. A missing feature is absent from the interface, never present and dead. |

### 0.4 Rules that came after the brief

| ID | Decision |
| --- | --- |
| U1 | Enter inserts a newline; the send button or Ctrl/Cmd+Enter sends. |
| U2 | A key is required before the shell is interactive: the recovery key or passphrase, or start over with a new one. A signed-in device whose keys are missing can take the key again from Settings. |
| U3 | Every control works and every missing feature is absent, so there are no placeholders and no dead rows in Settings. |
| U4 | The composer is three parts: attach, the field with an emoji control inside it, and send. An empty field with attachments still sends; an empty field with nothing shows stickers. |
| U5 | Styled text renders in place when the field is not focused; clicking it returns to editing at that character. |
| U6 | Right-click and long-press open the same menu. No hover-only control, no desktop and mobile split. |
| U7 | Images and stickers carry no bubble; the time sits as a chip on the picture. |
| U8 | Avatars are round but never cropped: the picture is scaled to fit. The letter is the resting state, so a room with an avatar never flashes its initial. |
| U9 | The navigation has no brand row and no identity row; the quick actions are always visible; the account is the last row and opens Settings. |
| U10 | Blur is subtle: the dialog backdrop is a scrim, a popover or menu is an opaque surface with a hairline, and nothing looks decorative. |
| U11 | A dialog fades in and out in under a fifth of a second and never re-fades when replaced; reduced motion removes it. |
| U12 | One dialog at a time, opened from the URL (`?d=`), closed by Escape, its own control, or Back. |

### 0.5 References, and how they are used

The Matrix specification is the basis for every protocol decision. Where the code and the
specification disagree, the code is wrong. `git/matrix-js-sdk` is the reference for API
shape and for the traps the prose does not mention; Element Web and Cinny are read for
behaviour, never for structure; `backup/` is the previous version of this project and holds
decisions this rewrite keeps.

`blog/` and `backup/` are the references for *design*: the token table, the surface ladder,
the spacing and type roles, the way grouping is done with tone and space rather than with
boxes and shadows. They are references, not templates.

A reference is read to understand a decision, then the decision is written in our own terms.
Nothing is copied: not a rule, not a component, not a file layout. When Element and this
project disagree about the interface, this project is right by construction, and the
difference is written down in `docs/decisions.md`. Cite the source and the date when a
discussion turns on a specific API.

### 0.6 Engineering decisions

| ID | Decision |
| --- | --- |
| E1 | The interface reads a projection and never the SDK; the worker owns sync, crypto and the projection writes. |
| E2 | A queued message is an ordinary message with a status, written by the main thread and deleted by the worker when the echo lands. No second pending model. |
| E3 | Relations are read from the room aggregate, not replayed from a relation store. |
| E4 | One projection pass per sync revisits the events after the room cursor plus the last rows, because a relation changes an older event in place. |
| E5 | Search runs in the worker against the database index. |
| E6 | Media is fetched with the access token in the worker, decrypted there, cached in the account database. |
| E7 | The build fails on inline script, inline style, `!important`, a vendor prefix, or the SDK in the main bundle. |
| E8 | The source audit fails on a catalog key nothing uses, a `t()` key that does not exist, or an import that crosses the worker and interface boundary. |
| E9 | The one visual source is the token table in `:root`, copied from `blog/`; rules take their values from it and never invent a literal. |
| E10 | Two static HTML entries, one per language, both real Vite entries; no post-processing step. |

## 1. The design

### 1.1 What it is

One visual language, taken from `blog/` and extended here: two inks and paper, surfaces made
by mixing ink into the page, hierarchy from tone and space, grouping from distance and
similarity. No elevation, no shadow, no accent colour, no gradients, no glass, no rounded
pill buttons, no card around every group. A rule is a hairline, used to separate regions that
otherwise would merge.

### 1.2 Token ladder

Every colour, size, space, radius and duration is a token in `:root`; a rule takes its values
from there and invents nothing. The tokens are the blog's, plus the ones a client needs:

- `--page`, `--ink`, and the surface ladder `--surface`, `--surface-hover`, `--surface-active`.
- Text tones per surface: `--page-text`, `--page-text-muted`, and the matching
  `--surface-text*`, `--surface-hover-text*`.
- Roles: `--bubble-other`, `--bubble-own`, `--field`, `--popover`, `--action`,
  `--media-chip`, `--scrim`, `--mark`, `--code`.
- Type: `--text-sm` to `--text-2xl`, each a `clamp()`; leading `--leading`,
  `--leading-tight`, `--leading-display`.
- Space: `--space-1` to `--space-7`; radius `--radius`, `--radius-lg`; `--rule`;
  `--ease`.

### 1.3 Surface map

| Region | Surface | Text |
| --- | --- | --- |
| Navigation | `--surface` | `--surface-text` |
| Room row, current | `--surface-active` | on-surface tone |
| Content header, timeline | `--page` | `--page-text` |
| Other bubble | `--bubble-other` | `--page-text` |
| Own bubble | `--bubble-own` | `--page-text` |
| Composer field | `--field` | `--page-text` |
| Dialog | `--surface` over `--scrim` | `--surface-text` |
| Menu, picker | `--popover` with `--rule` | `--page-text` |
| Sign in, gate | `--page` | `--page-text` |

Two bubbles differ by one shallow step, never by hue. Dark takes a slightly different step
from light, because the same jump reads weaker on a dark ground.

### 1.4 Spacing and type roles

- A surface (bubble, dialog) pads with `--space-3` to `--space-4`; a control with
  `--space-2` to `--space-3`; a compact row with `--space-1` to `--space-2`.
- One gap per role: `--space-1` inside a group, `--space-4` between groups,
  `--space-5` between sections.
- Room name in the navigation `--text-md`; preview and time `--text-sm` muted; header title
  `--text-lg`; dialog title `--text-lg`; message body `--text-md`; meta `--text-sm`.
- Headings balance their lines, paragraphs are set pretty, and a line is never widened by
  shrinking the type.

### 1.5 Layout

The shell is `100dvh`: navigation on the left, content on the right. One container query on
`body` at `44rem` turns the navigation into the home screen and a room into the next screen
with a back control. There is no second layout and no width media query.

The navigation carries the quick actions, then sections that remember whether they are open,
then the account row. The content carries the room header, the timeline, the composer. The
timeline and composer are centred at `--content-max`; a bubble is capped at `--bubble-max`.

### 1.6 Behaviour that the design fixes

- The room header is the room name, centred; the back control appears on a narrow window
  and the room settings control sits at the end. A membership line is not permanent chrome.
- A message groups by sender, day and a five-minute gap; only the first row of a group
  carries the name and the avatar, and the avatar sits on the sender's side.
- Media and stickers carry no bubble; the time is a chip on the picture.
- Pending and failed rows carry a quiet line under the bubble; a failed row is the control
  that fixes it.
- Dialogs are URL state, one at a time, native `<dialog>`, closed by Escape, by their own
  control or by Back. A destructive action confirms inside the same dialog.
- Menus open at the pointer for a right-click and for a long press; there is no hover-only
  control.
- The composer is three parts: attach, the field with the emoji control inside it, send.
  Enter inserts a newline. A themed draft is shown as it will be sent when the field is not
  focused.
- Motion is colour and opacity, never layout; `--ease` is under a fifth of a second and
  becomes zero under reduced motion.

## 2. Shape

```
src/
  core/        types, ids, IndexedDB schema, guards, text escaping
  protocol/    the command and event unions between the threads
  worker/      SDK, sync, crypto, projection, media, delivery, verification
  client/      the main-thread worker adapter
  store/       application state, selectors, local database reads
  ui/          DOM helpers, shell, timeline, composer, picker, dialogs, screens
  i18n/        catalogs and formatters
  styles/      one stylesheet
  app/         configuration, composition root
scripts/       the output audit, the source audit, the catalog normaliser
test/          unit tests and the browser flow
```

Dependencies flow one way: `app -> ui -> store -> core`, and `worker -> core`, `protocol`.
The interface never imports the SDK; the worker never touches the DOM or the UI store.

## 3. Ownership

| Fact | Owner | Readers |
| --- | --- | --- |
| Route, open room, open dialog | URL hash | app, shell |
| Client, sync, crypto, tokens | worker | worker |
| Rooms, messages, members, packs, media | account database, written by the worker | store |
| Queued message | account database, written by the main thread, replaced by the worker on echo | both |
| Drafts, settings, last account | `maski-ui` database, main thread | main thread |
| Render state | `state` in `store/state.ts` | UI |
| Object URLs | `ui/media.ts` | UI |
| Design values | `styles/style.css` `:root` | every rule |

One writer per store. The one shared store is `events`: the main thread writes a queued row
under its transaction id and the worker deletes that key when the echo arrives. The queue is
written before the command is sent, so the delete cannot arrive first.

## 4. Known gaps

Absent on purpose, so the interface has no dead control: threads, spaces, calls, a push
gateway, SSO, password reset, multi-account, notification for a closed page, pack authoring.
`docs/roadmap.md` orders what comes next.

## 5. Verifying

```
npm run code     # tsc --noEmit
npm run lint     # Oxlint type-aware, then Stylelint
npm test         # Vitest
npm run build    # code check, then Vite
npm run verify   # output audit, source audit
npm run check    # all of the above
```

`test/browser/flow.mjs` drives a real server; read `docs/testing.md` before running it.

## 6. Working notes

**One activation path.** Login, a restored session and the end of the key gate all end in
`App.applySession`. It opens the account database, reads the rooms, decides the phase from
the stored key flag and mounts; the authoritative key status settles after the first frame.

**Two writers, disjoint keys.** The main thread writes a queued message under its
transaction id; the worker deletes it when the echo lands. Nothing else is written twice.

**A local echo is not a message.** The SDK writes the message being sent into the timeline
as `~room:txn`; the projection skips it, and the echo replaces the queued row.

**A keyed row is updated in place.** An edit, a reaction or a status change rebuilds the
row's content while keeping its node, so what the reader is looking at never disappears.

**The composer is not store state.** A keystroke writes a debounced draft and nothing else;
putting the text in the store would repaint the whole shell per character.

**The gate has codes, not one message.** `no-keys`, `invalid`, `restore`, `uia`.

**Copy and boundaries are checked.** `scripts/audit.ts` makes dead copy and a crossed
boundary a build failure rather than a review note.

## 7. Where the work stands

Verified against a real homeserver: sign in, the key gate (unlock, reset, taking the key
again on a signed-in device), SAS device verification, session listing and signing the
others out, room list with sections, invites, E2EE send and receive, media with progress and
cancel, drafts, picker, settings, search, both colour schemes, the narrow shell.

Next, each inside an existing boundary: member permissions are in room settings and need a
second account to exercise; `docs/roadmap.md` holds the rest.
