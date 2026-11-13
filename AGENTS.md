# AGENTS.md

Three parts. **Rules** bind every change. **Requirements** is the brief as the user stated it,
summarised and brought in line with the current design. **Design** is the engineering record.

---

# Part 1 — Rules

## 1.0 第一原则：保持善良

**考虑用户体验是最核心的一条规则。** 它排在技术偏好、代码整洁、甚至「这样做更省事」之前。

- 不做会伤害读者的东西：不闪白（暗色模式下的白屏）、不抖动（占位换成内容）、不吞点击、不让动画
  挡住操作、不把错误藏在控制台。
- 能少一步就少一步，能少一次等待就少一次；等待必须可见、可打断、可取消。
- 一个控件只要出现就必须真的能用；做不到的功能宁可不出现。
- 报错说人话，说明发生了什么、能做什么，内部状态不端给读者看。
- 慢就是无礼：加载、翻页、滚动、输入都要当成人的时间在花。

后面所有规则都是这条的具体化。与它冲突的「最佳实践」不适用。

## 1.1 Working rules

1. 思考方案或写代码前，必须查询最新官方资料和相关项目（包括 `past/git/`）的代码。
2. 本文件里的设计讨论不一定是最终方案，可能变动；不要盲目相信。
3. 讨论不充分前，不要写代码。
4. AI 与用户的讨论要及时记录，放在用户要求和项目规则下面。用户的要求和本规则不能直接修改。

## 1.2 Precedence

1. 1.1 and 1.2 — the rules themselves.
2. Part 2 — the user's requirements, as summarised here.
3. Part 3 — the engineering design.
4. `past/` — reference material and earlier attempts, read but never shipped.

A change that needs one of these contradicted is a discussion, not an edit.

## 1.2.1 The specification is on disk

`past/spec/` is a shallow clone of `matrix-org/matrix-spec` (checked 2026-11-13 at `801afa6`), and
`past/git/matrix-js-sdk` is the client library. Consult them **before** writing or changing anything
that touches the protocol — not from memory, not from a blog post:

| question | where |
| --- | --- |
| an endpoint, its fields, its errors | `past/spec/content/client-server-api/`, `rooms/`, `push-gateway-api.md` |
| a data type or grammar (MXID, server name, event) | `past/spec/data-definitions/`, `past/spec/appendices.md` |
| a proposal Matrix is pushing | `past/spec/content/proposals.md`, and MSCs via web search |
| how the library implements it | `past/git/matrix-js-sdk/src/` |
| what a real client does | `past/git/cinny/src/` |

A specification statement wins over a library behaviour; where the library deviates, the deviation is
what we have to work with, and it is recorded. `grep -rn` in that checkout is the normal first move:
`grep -rn "well-known/matrix/client" past/spec/content | head`.

## 1.2.1b Project trust in Pi

Pi refuses to load project-supplied resources until the folder is trusted, because those resources
can execute: `.pi/settings.json`, `.pi/mcp.json`, `.pi/extensions`, `.pi/skills`, `.pi/prompts`,
`.pi/themes`, `.pi/SYSTEM.md`, `.pi/APPEND_SYSTEM.md`, and `<dir>/.agents/skills`.

This repository has `.pi/skills/contracts/SKILL.md`, so Pi asks. The three ways to answer:

| way | scope |
| --- | --- |
| `/trust` inside Pi | saves a decision for this directory in `~/.pi/agent/trust.json` |
| `pi --approve` (`-a`) / `--no-approve` (`-na`) | one process |
| `defaultProjectTrust` in user settings | every project: `"always"`, `"ask"` (default), `"never"` |

Trust gates *loading*, not tool access: after start, tools run with the operating system permissions
of the Pi process. Declining trust is safe here — the skill only repeats section 3.15.1 — so a reader
who does not want project resources loaded loses nothing but a shortcut.

## 1.2.1c One configuration surface

`src/config.ts` holds every project-wide value: app identity (name, version, source), the site
origin, the dev server host and port, the default homeserver, and the limits the interface reads.
The generator, the dev server and the client import it; nothing else writes a port or an address of
its own. Copy is not configuration and stays in the catalogs.

## 1.2.2 Commands

One command per intent; the tools behind them are an implementation detail.

| command | what it does |
| --- | --- |
| `npm run dev` | types, lint and style once, then the bundler in watch mode, a type checker in watch mode, and the site on http://localhost:5173/ with a reload after each build |
| `npm run build` | the whole gate: types, lint, tests, bundle, output audit, contracts |
| `npm run check` | the same as `build` — a build that was not checked is not the build we ship |
| `npm run bundle` | the bundle and the pages, without the gates, for a watch loop that already ran them |
| `npm run types` | `tsc --noEmit` |
| `npm run lint` | Oxlint type-aware, then Stylelint over `src/` and `static/` |
| `npm run test` | `node --test` over `test/*.test.ts` |
| `npm run audit` | the output audit: generated pages equal the generator, every asset exists and is hashed |
| `npm run contracts` | the eight contracts of 3.15.1 |
| `npm run features` | the platform dataset: `-- <id> --require 2026` |
| `npm run serve` | serve the built `dist/` without the reload |
| `npm run clean` | remove `dist/` and `build/` |

The dev server injects one `<script>` into each HTML response and nothing into the files, so the
audit still compares the generated output byte for byte. It answers `application/wasm`, falls back
to `404.html`, and sends `no-store`, which is why a reload always shows the last build.

## 1.3 The loop

The project moves in short, complete steps rather than long unverified stretches. One step is:

1. **Read.** The module the change touches, the section of this file that governs it, and — for
   anything protocol-shaped — `past/spec`. A plan against code nobody read is a guess.
2. **Plan.** Name the approach, and the smaller one when two are plausible. A change that needs a
   decision the user owns stops here and becomes a question.
3. **Implement** to the shape Part 3 gives the file, leaving the tree coherent after each file.
4. **Run it.** `npm run dev` for anything with a surface, the protocol test for the worker, a unit
   test for a rule that can be pure. A change that was not run is not a change that works.
5. **Verify at the level the change claims:** verified on the real homeserver, wired but unverified,
   or not verified — and say which, with the evidence.
6. **Record.** A defect found but not fixed goes to a numbered open-defect section with what is known
   and what the next step is. A decision goes to Part 2 or Part 3, whichever owns it.
7. **Commit** one coherent change, the reason in the body, and push.

Before a step is called done, `npm run check` passes: types, lint, tests, bundle, output audit and
the eight contracts. The gate is not advisory, and a budget is never raised to make it pass.

### A bug report is its own loop

When the user reports something, the loop is shorter and stricter: reproduce it in the browser, find
the **root cause** rather than the symptom, fix that, re-run the same reproduction, and commit with
the cause named in the message. Two failed fixes on one symptom mean the boundary is wrong (1.6), and
the next step is a redesign of that boundary, not a third patch.

### Changing the design

- The user's words are Part 2, and they are not edited here: a change there is a question, never an
  edit.
- Engineering decisions live in Part 3 with their reason; a decision that replaces an older one
  rewrites that paragraph instead of leaving two descriptions.
- A rule without an enforcing check is a wish. Adding a rule adds its row to 3.15.1 and, when it can
  be checked, the check itself.

### What a step leaves behind

A step is not a conversation; it is a change to the tree. When it ends, these exist or it did not
happen:

| for a change that | the step also leaves |
| --- | --- |
| fixes a defect | the reproduction that failed before and passes after, named in the commit |
| adds behaviour | a unit test for the rule, or a browser run whose assertion is the behaviour |
| adds or moves a rule | its row in 3.15.1 and the check that enforces it |
| changes a decision | the rewritten paragraph in Part 2 or Part 3, never a second description beside it |
| adds a dependency | the reason, and the removal of one nothing imports |
| touches the protocol | the spec path it was checked against, quoted in the commit |

### The verification ladder

A claim names its rung. A claim one rung above its evidence is a reporting defect.

1. **Pure** — a unit test under `node --test`: no DOM, no network.
2. **Worker** — the protocol driven from a browser: login, sync, send, decrypt.
3. **Surface** — the page driven in Chromium: the control does what it says, scripts on.
4. **Scriptless** — the same page with JavaScript disabled: the frame is complete and every visible
   control either works or says what it needs.
5. **Real server** — the whole flow against a homeserver, on a device whose state is real.
6. **Other engines** — Firefox and Safari. Until this rung is run, a browser claim says Chromium.

### Defects

A defect found and not fixed is written into a numbered open-defect section with four fields: the
symptom a reader sees, what is known, what was ruled out, and the next concrete step. An open defect
blocks the exit of its own phase, not the next unrelated step. A defect whose cause is unknown after
two attempts is a boundary problem (1.6): the third attempt starts by redesigning that boundary
instead of looking harder.

### Starting and leaving a session

Start by reading 1.3, the open-defect sections, and the status table in 3.16. What they say is the
truth about the tree, not the memory of the last conversation.

Leave the tree green, the documents in step, the commits pushed, and one paragraph that says what
moved, what is verified at which rung, and what comes next. An unfinished change is finished or
removed before the session ends; never left half-applied.

### Reviews

Before a change that spans several files is reported, it is read once more against this file: the
contracts it touches, the section that governs its behaviour, and the diff itself. The reviewer is a
reader with no memory of writing it — a subagent where the change is large enough to justify it — and
the answer is a list of blockers, not praise.

### Commits and snapshots

- One commit is one coherent change, in the imperative, with the reason in the body and the contract
  or section it serves named when that is not obvious.
- History is never rewritten: no amend, no rebase, no force push. A mistake is corrected by the next
  commit, and its message says what was wrong.
- Every commit is a place a reader can stop: the tree builds, the gate passes, the documents agree.
- A snapshot can be restored at any point precisely because of the previous line. A restored tree is
  read again from 1.3 before work continues, because the conversation is ahead of it.

### Deciding and asking

| the agent decides | the agent asks |
| --- | --- |
| module boundaries, names, file layout | what the product promises |
| which existing pattern to follow | anything a reader would notice as a change of behaviour |
| a cheaper implementation of the same promise | a rule in Part 2, a budget, a scope cut |
| deleting code it has just made dead | deleting code it did not write and cannot attribute |

A question carries a recommendation and what it rules out, and work continues on the parts that do
not depend on the answer.

### What the loop forbids

- Committing a tree that fails a gate, or leaving an unfinished change behind at the end of a turn.
- Silently weakening a check, a budget or a test to get a green result.
- Reporting a feature as working when it was only wired.
- Carrying a second implementation beside an existing one because touching the first was awkward.

## 1.4 Writing floor

- Correctness first, then human readability: domain names, straight lines, early returns, explicit
  data, no abbreviation a newcomer has to decode.
- One module, one job; the file name says it. No abstraction before the third repetition.
- One implementation per boundary. A second way to do the same thing is a defect: a case the choke
  point does not cover extends that choke point, and is never worked around beside it.
- No dead code, unused export, TODO, stub, placeholder or fake control. A missing feature is absent.
- A comment only states what the code cannot: a protocol quirk, a security boundary, a browser
  behaviour, an invariant. One line, English, no trailing punctuation, no decorative rule or banner.
  A conventional tag such as `@param` is allowed where a convention exists; decoration is not.
- No Chinese in code, identifiers or comments. A language's own name is content and lives in the
  catalog it names.
- Nothing written and unused: no placeholder key, no helper waiting for a caller, no copy for a
  feature that does not exist yet. It is deleted and written when it is needed.
- No vendor prefix, no polyfill, no engine-specific feature, no compatibility shim.
- Code, identifiers and commits are English. Part 2 is Chinese because it is the user's own voice.

## 1.5 Learning from experience

Code inherits a body of engineering experience and real failure. The order is: the standard or the
specification, then the reference implementation, then the documented failure modes of the pattern we
are about to use. Inventing a mechanism before reading those is not originality, it is repeating
someone else's mistake.

- A mechanism that exists because of a known failure names that failure in one line, in the change and
  in 3.14. A mechanism nobody can name a failure for is probably decoration.
- When a decision contradicts established practice, say why it is right here. "We did not know" is not
  a reason; look it up first.
- Our own two attempts are part of that experience. A lesson learned from them is as binding as one
  from a specification.

## 1.6 When to stop and redo

A plan is a hypothesis. These are exit conditions, not warnings:

1. The same boundary needs a third workaround: the boundary is wrong, redesign it.
2. A defect returns after being fixed in two different places: it has two owners, delete one.
3. A phase's exit cannot be reached with the tool it was planned with: change that tool, record why.
4. A generated file has to be hand-edited to work: the generator is wrong, and output is never touched.
5. A "temporary" second path outlives its phase: deleted or promoted in the same change.

Rewriting one module on these is the normal repair. Rewriting the tree is what happens when they are
ignored.

---

# Part 2 — Requirements

## 2.1 目标

一个快、省、本地优先的 Matrix 客户端。页面加载后即可离线使用；看消息、翻历史、搜索、发送都不该被网络或动画卡住。绝大多数 Matrix 客户端卡顿，这个不能。

## 2.2 技术栈

- TypeScript + esbuild。不用 Vite。不用 UI 框架、组件库、CSS 框架、状态库、路由库、i18n 库、日期库。
- `matrix-js-sdk` 负责协议、同步与加密，只跑在 worker 里；rust crypto wasm 同在 worker。
- DOMPurify 是唯一的其它运行时依赖。
- 输出是静态目录，没有后端，没有服务端渲染。

## 2.3 三层分工

- **骨架交给 HTML，外观交给 CSS，业务逻辑才交给 JS。**
- HTML 里不含任何 CSS 或 JS；样式表与脚本都外部引入。
- 没有 JS 时页面是完整的：导航、折叠区、顶栏、时间线区域、输入框都在，只是没有数据。
- 需要 JS 的能力必须是 `<button>`，打开后由面板自己说明「需要 JavaScript」；不用 `<a>` 假装能点。
- 属于流程内部的返回入口（例如从密码页回到选服务器页）由 JS 渲染；静态页放 `<noscript>` 说明。
- JS 只填充内容、使用已经写好的类和样式，不发明新样式。
- **整个界面由 HTML + CSS 承担。** 一项交互如果 HTML + CSS 做不到，先考虑能不能换个设计绕开；
  确实绕不开才用 JS，而那时样式仍然写在 CSS 里，JS 只切换已经存在的类或状态。

## 2.4 页面与地址

- 每个页面是独立文档，地址不带 `.html`：`/`、`/server/`、`/login/`、`/login-oauth/`、`/register/`、
  `/reset/`、`/key/`、`/chat/`。
- `/404.html` 是一个手写的静态文件，不参与生成、不带样式表：一句话说明地址不存在，一个回 `/` 的链接。
  错误页不值得一套构建流程。
- 每种语言一套，放在语言前缀下：`/zh-CN/chat/`；英文生成两份，`/` 与 `/en/`，`/en/` 的 canonical
  指回 `/`。
- 房间不是页面：`/chat/#/room/<id>`。窄屏由 hash 决定显示导航屏还是房间屏；无 hash 或 id 不存在
  等同于没有房间。
- `/` 是加载页：上面 `maski` 标记，下面转圈，别无他物；没有 JS 时再加一句需要 JS 和入口链接。
  它读会话决定去处，用 `replace()` 跳转，同时决定语言：**没有登录就跳 `/server/`**，有会话跳 `/chat/`。
- `/server/` 的地址输入框**预填配置里的默认地址**（`src/config.ts` 的 `homeserver.default`），没有占位符文字；
  用户可以全选删掉换成别的。可填 `unredacted.org`、
  `https://unredacted.org`、`http://localhost:8008`、`matrix.unredacted.org:8448` 等；协议缺省按
  `https://` 处理，路径被丢弃，非 http(s) 协议与含空格的输入被拒绝。
- `/login/` 与 `/register/` 依赖服务器地址，没有它业务功能不成立；地址只来自它们自己的 `?server=`。
- 语言只智能决定一次：已存的选择优先；第一次用浏览器语言并立刻保存；此后浏览器语言不再改变语言。
- 静态托管不需要任何重写规则；基础路径可配置。

## 2.5 登录与密钥

- `/server/` 填 homeserver；探测 `.well-known`、`/versions` 与 `/login` 的 flows。
- 有密码登录：`/login/?server=…`，用户名、密码、登录；下面依次是「注册」（服务器允许时）、
  「更多登录方式」（不止密码时）、「忘记密码」（重置流程上线后才有）。
- 只有 SSO/OAuth：`/login-oauth/?server=…`，按钮由 JS 按 flows 渲染。
- 注册：`/register/?server=…`，用户名、密码、确认；服务器的交互式认证阶段（条款、令牌、密码）就地完成。
- 缺少 `?server=` 是跳过步骤：不做特殊页面，页面照常显示，JS 给出回到 `/server/` 的入口。
- 忘记密码是真实的重置流程，但先不做；在它存在之前，登录页不放这个入口。
- **密钥门强制**：`/key/`。三条路径——用恢复密钥或口令解锁；等另一台设备用 SAS 验证；重新开始
  （新 secret storage、新 cross-signing、新备份，明确告知旧加密历史可能读不到）。注册后只有「重新开始」。
  恢复密钥只显示一次，等宽字体，可复制、可下载，绝不写日志。
- 未完成密钥门前，聊天页不可交互，也不渲染任何房间数据。

## 2.6 聊天页布局

- **左导航两个区。**
  - **菜单区**：搜索、新消息、邀请（带数量）、加入房间、创建房间、设置。邀请不单独成区。
  - **房间区**：收藏、房间、私聊、频道四个 `<details>`，**默认收起**，展开状态按账户记忆。空区隐藏，
    房间区常驻。
- **频道是 space**：点击频道卡片**就地展开**它的子房间（同一区内、一层，不嵌套），**不改变右侧内容**；
  右键、菜单键或长按在卡片上打开菜单。子房间只在频道下出现，不在房间区重复。
- **房间行**：头像、名称、预览、时间、未读与提及徽章、静音标记、当前房间高亮。菜单有房间设置、
  标记已读或未读、收藏、静音、离开、复制链接。
- **右侧顶栏只有两格**：返回（仅窄屏）、房间名与话题。**没有菜单**，也没有任何房间控件——没有房间时
  它没有作用对象。房间设置因此在左侧房间卡片的菜单里。
- **右侧状态**：
  - 未登录：时间线位置写「未登录」，不渲染任何数据，骨架仍可浏览；把读者送到登录流程是路由页的事。
  - 密钥门未完成：同一位置写密钥未设置。
  - 没有选中房间：不渲染房间内容（没有顶栏内容、没有时间线），输入框在但发不出消息。
  - 有房间：顶栏、时间线、输入框。

## 2.7 时间线与消息

- 气泡参考 Telegram，但不照搬：自己的靠右、他人的靠左，靠一个浅表面层级区分；不用阴影、不用强调色、不用尾巴。
- 同一发送者同一段只显示一次头像与名字；头像顶对齐，他人的在左，自己的在右。
- 图片、视频、贴纸**没有气泡底色**；时间做成右下角的小标签。
- 文字消息的时间在气泡右下；**只有一行时气泡撑长，时间留在同一行**，不换行到下一行。
- 日期分隔、已读线、新消息提示都是行间的小元素，不做重线条。
- 消息菜单：回复、回应、编辑、删除、复制文本、复制链接。右键、长按、键盘都能打开。
- 直聊房间如果没有自己的房间头像，就用对方的头像（列表与顶栏一致）。
- 贴纸在时间线里不弹大图：`body` 是可访问名称，shortcode 是提示；表情包媒体不加密。
- 只有表情的消息用下一档字号显示；提及当前用户的消息有底色标记。
- 系统与成员事件是一行浅色文字，没有气泡、没有侧线。
- 不能解密的消息说明原因；正在解密时说正在解密；被删除的消息离开时间线。
- 加载更早、跳到被回复的消息、未读时的新消息提示，都不阻塞滚动。

## 2.8 输入框

```
[附件] [贴纸] [ 输入框 …表情 ] [发送]
```

- 附件打开文件选择（图片、视频、音频、文件，可多选）；**粘贴也进同一个缓冲区**，位于输入框上方，
  每个可移除，显示进度，可取消、可重试。
- 贴纸按钮发 `m.sticker`；输入框里的表情按钮打开面板，选中后在**光标处插入普通字符**——贴纸是事件
  类型，表情只是文本。
- Enter 换行，Ctrl/Cmd+Enter 发送，发送键发送；输入法组字期间回车不发送。
- 文字为空且没有文件时不能发送。
- 发送顺序：图片与文件一条一个消息，按顺序；随后文字稿作为独立的 `m.text`。不做说明文字，不做相册。
- 输入框随内容长高，有上限，然后内部滚动。草稿按房间保存，本地有效，离线也能排队。
- 带样式的草稿在失焦时就地渲染成它将被发送的样子；点回该处恢复纯文本并把光标放到对应字符，
  光标永远不会与样式副本错位。
- 选中文本右键可以加粗、斜体、下划线、删除线、行内代码、标题、引用、代码块，并可取消样式；写下的文字
  始终原样保留，不解析 markdown 输入。

## 2.9 设置、搜索、通知、表情包

- **设置**只有一个对话框，滚动分区：账户、通知、安全、关于。没有外观、主题、密度或「回车发送」开关——
  样式与用法是固定的。
- **账户**：头像、显示名、MXID（只读可复制）、语言切换（立即生效并改变地址前缀）、退出登录（确认并说明
  本地加密历史与设备密钥会被清除）。
- **安全**：本机设备验证状态、恢复密钥、密钥备份、重置恢复；**会话列表**可以验证单台设备、登出单台、
  一键登出本设备之外的所有设备（当前设备保留，需要密码时用交互式认证，密码不保存）。
- **通知**：在应用内用未读与提及徽章，标题显示总数；桌面通知默认关闭，只有用户手势才请求权限，
  可关闭消息预览（预览可能暴露解密后的内容）。
- **关于**：版本、源码、依赖许可、无统计、本地搜索、本地通知、无推送网关的说明。
- **搜索**在本地索引上进行（NFKC、小写、去变音、`Intl.Segmenter`），离线可用；结果按时间倒序，
  显示房间、发送者、时间与命中片段；点选跳到那条消息。
- **表情包**：房间包（`m.room.image_pack`）、全局包（`m.image_pack.rooms`）、旧标识为兼容读取；
  选择器有搜索、Emoji 与贴纸两个页签、可滚动的包带与网格；最近与收藏按账户保存；
  「在所有房间使用」写入稳定与旧的账户数据。表情包媒体不加密，这一点要写在包里。
- **房间设置**从左侧房间卡片的菜单打开：概况（头像、名称、话题）、成员（搜索、邀请）、通知模式
  （全部/仅提及/静音）、加密状态（只读）、离开（就地确认）。没有权限时只读。
- **个人资料**从消息发送者、成员行或提及打开：头像、名称、MXID、验证状态、发消息、验证、复制 MXID。

## 2.10 首帧

- 第一眼看到的就是最终画面：没有骨架屏、没有闪烁、没有「先占位再替换」的抖动。
- 没有数据的列表就是空的；数据出现时以它最终的大小出现。图片先按事件里的宽高占好位置。

## 2.11 样式

- 以「流体设计」和「格式塔心理学」为依据：分组靠距离、相似与共同区域，不靠边框与阴影；层级靠字号、
  色调与间距指向同一方向。
- 两墨一纸：表面声明墨的比例并据此推出文字色；浅色与深色各一套，用 `light-dark()`。
- 所有颜色、字体、字号、间距、圆角、时长都是 `:root` 的 token；规则只用 token。
- 流体：`clamp()`、`minmax()`、`auto-fit`、容器查询；不用宽度媒体查询。窄屏与宽屏是同一套布局的两种状态。
- 不用阴影、渐变、玻璃、卡片化仪表盘、大厂范式、图标字体、外部字体。
- 平台新特性要用，但必须 **Chrome、Firefox、Safari 在 2026 年都支持**；每引入一条新属性或新函数，
  都用工具查一次三家版本（`npm run features -- <id> --require 2026`），不靠记忆、不靠文章。不用前缀、
  不用 polyfill、不为迁就某个引擎写 `@supports` 分支；同一功能只有一种写法。
- 动画短、可打断、只动 transform/opacity/color；`prefers-reduced-motion` 下关闭。
- 焦点永远可见；点击目标不小于 24px。

## 2.12 离线与速度

- service worker 预缓存 shell（页面、CSS、JS、worker、wasm）；导航 cache-first 并后台更新，刷新先出画。
- 消息、房间、头像在 IndexedDB 里，由 worker 独占；homeserver 请求永不进 HTTP 缓存。
- 离线是正常状态，不是错误页：能看、能搜、能排队发送。

## 2.13 多语言

- 界面语言可切换；英文是源语言与兜底。
- 文案只陈述读者需要知道的事实，不解释他看得见的东西。不写「你看到的是客户端使用的表单」这类
  同义重复，不写「请注意」「简单来说」这类空话，不用营销腔，不模仿 LLM 的句式。
- 文案只存在于带类型的 catalog 里，缺键是编译错误；layout 与 component 里不出现任何字面文案，
  连标题与 `aria-label` 也不行。
- 页面在构建时按语言提前渲染，客户端不做翻译；日期、数字、复数用 `Intl`。

## 2.14 安全

- 事件、资料、房间名、`formatted_body` 一律不可信；富文本过白名单消毒器。
- CSP 不允许内联脚本与内联样式；没有第三方请求、没有统计。
- token 与密钥只在 worker 里；主线程只看到会话摘要与一次性显示的恢复密钥。
- 不记录 token、密钥与消息正文。

## 2.15 范围

- **先做**：登录与强制密钥门，做到能用。
- **范围内**：房间与时间线、发送与接收、回复/编辑/删除/回应、媒体（点击才加载）、贴纸与表情包管理、
  本地搜索、设置、会话与设备验证、频道、通知与推送、包体切分。
- **不做**：通话与视频、线程、低优先级分区。
- 邀请进菜单；忘记密码在重置流程做完之前不出现。

---

# Part 3 — Design

## 3.1 Stack and checks

- TypeScript 7, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals`, `noUnusedParameters`. No `any`, no
  non-null assertion, no enum, no parameter property, no cast that silences the compiler.
- `target` and `lib` are `ES2025`, not `ESNext`: with `noEmit` the compiler writes nothing, so
  `target` only decides the default library, and a library past what the three engines ship would
  type-check calls that cannot run. `ESNext` is a proposal list, not a platform ceiling.
- esbuild bundles three entries — `src/client/main.ts`, `src/worker/worker.ts`, `src/styles/style.css` —
  minified, content-hashed, with a metafile the page generator reads.
- `html-minifier-terser` minifies HTML: `collapseWhitespace: true`, `removeComments: true`.
- Oxlint is type-aware, `--deny-warnings`; Stylelint is the standard config with zero warnings.
- Vitest for units, Playwright for browser flows. A rule that can be pure gets a unit test.
- `npm run code` · `lint` · `test` · `build` · `audit` · `check` · `features`. `npm run check` chains
  them; `npm run features` reads the platform dataset (3.10).

## 3.2 Module map and dependency direction

```
src/catalogs/     pure data: one typed object per language
src/lib/          html.ts (escape-by-default tag), assets.ts (the asset record), catalog.ts (t())
src/layouts/      base.ts (doctype + head + empty body slot), app.ts, auth.ts
src/components/   markup only: parameters in, string out, no state
src/pages/        one function per page; regions.ts holds the ids both sides use
src/protocol/     the command and event unions
src/client/       store, worker client, router, one module per region
src/worker/       api, session, db, rooms, projection, media, keys
scripts/          build, pages, audit, features
```

- `catalogs → lib → layouts/components → pages` is build-time only; none of it is shipped.
- `client` and `worker` never import each other; they speak `protocol` only.
- `worker` owns the account database, the SDK and crypto. `client` owns the interface and `maski-ui`.
- A module asks another layer for a fact; it does not read that layer's storage.

## 3.3 Data model

**Account database** `maski-<hash(userId)>`, opened by the worker and nobody else:

| store | key | indexes | contents |
| --- | --- | --- | --- |
| `meta` | `key` | | session, per-room cursor, `m.direct`, revision |
| `rooms` | `roomId` | | name, avatar, topic, membership, unread, preview, flags, `hasOlder` |
| `events` | `id` | `byRoom`, `byRoomTs` `[roomId, ts, id]`, `byStatus`, `byToken` (multi-entry) | one row per message |
| `members` | `[roomId, userId]` | `byRoom` | display name, avatar, membership, power |
| `media` | `key` | | cached blob and mime, keyed by `mxc@size` |

**UI database** `maski-ui`: `settings` (locale, last account, collapse state), `drafts`,
`recent` (emoji and stickers).

A message row carries `id, roomId, sender, name, avatar, ts, kind, body, html, media, reply, edited,
reactions, mentions, status, error, encrypted, membership, tokens`. `html` is stored raw and sanitized
at render. `tokens` is the search index: NFKC, lowercase, diacritics stripped, split on non-word
characters.

**The projection has two directions.** Forward, once per sync: every event after the room cursor,
plus the last thirty rows, because an edit, a reaction or a redaction changes an older row without
adding one. Backward, after a scrollback: walk from the start of the live timeline and stop at the
first stored id, because the cursor marks the newest row and cannot see that direction. Neither pass
clears a store; a room disappears only on an explicit leave.

**The queued message is an ordinary row.** The worker writes it under its transaction id before the
request, so the window already shows it as `queued`. The remote echo carries the same transaction id
and replaces it; the SDK's `~room:txn` local echo is skipped. A failed send leaves `status: failed`
with an error; retry resets it, discard deletes it.

**Relations come from the SDK aggregate**: `room.relations` at projection time, so there is no second
store to replay. An annotation counts once per sender per key, and `me` is the viewer.

**Read state** is one call: `setRoomReadMarkers` moves the receipt and the fully read marker together,
and the room row keeps the receipt id so the timeline can draw where reading stopped.

## 3.4 Worker protocol

One dedicated worker per tab, created when the page needs data. A command carries an `id`; the reply
repeats it with `{ ok: true, data }` or `{ ok: false, error }`, where `error` is a plain string. Events
carry no id. Unknown commands and malformed events are ignored and logged without secrets.

| command | reply | notes |
| --- | --- | --- |
| `start` | `{ session, keys }` | opens the database, restores the session, starts sync after the reply |
| `login` | `{ session }` | credentials arrive once and are not kept on the main thread |
| `logout` | `{}` | clears the SDK store, crypto store and account database |
| `keyStatus` | `{ ready }` | secret storage ready or not |
| `send` | `{}` | the row is written first; `outbox` events follow |
| `media` | a blob | decrypted with the record's `file`, cached under `mxc@size` |

Events: `ready`, `session`, `rooms`, `window`, `outbox { txnId, status, error }`,
`connection { state }`, `keys`, `typing { roomId, users }`, `fatal`.

There is no revision window and no ack protocol: a pass posts a room list and, if a room is open, its
window. The payload is bounded, so a lost event costs one window, not a rebuild.

**Media.** The worker fetches with `Authorization`, decrypts when the row carries a `file` object,
and caches under `mxc@size`. A thumbnail of an encrypted original is ciphertext, so an encrypted
image, video or sticker asks for size 0 and the element scales it.

**Failure.** A worker error marks the connection degraded and restarts it once; the projection on disk
is untouched. There is no main-thread SDK fallback.

## 3.5 Main-thread store

A key table, not a render pass.

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
}
```

- `set(patch)` compares each key by reference and notifies only the keys that changed.
- `subscribe(key, listener)` returns an unsubscribe. A region subscribes to the keys it reads.
- Regions: navigation (rooms, roomId), header (roomId, rooms, typing), timeline (messages, roomId,
  hasOlder), composer (roomId, connection), surfaces (their own state).
- The composer and an open surface own their state and are never re-rendered by a store change; that is
  what keeps the caret and the selection.
- The store is not persisted. The worker's database is the source; on load the page asks `start` and
  then `open` for the room in the hash.

**Timeline rendering.** Rows are keyed by message id and updated in place. Day separators, the read
line and the older control are display items with their own keys. New rows append; a backfill prepends
and the scroll position is restored from a recorded anchor, whether the list grew or the server had
nothing older. Opening another room resets both the anchor and the pinned state.

**Read receipts** move only while the newest row is on screen: a reader scrolled up has not seen what
arrived below.

## 3.6 Pages and regions

Every page is a document written by the generator. `<body data-page="…">` tells the client which
behaviour to load; region ids come from `src/pages/regions.ts`, which both the generator and the
client import, so the two cannot disagree.

| page | regions |
| --- | --- |
| `index.html` | the mark, the spinner, the note |
| `chat/index.html` | `nav`, `menu`, `sections`, `content`, `header`, `timeline`, `composer`, `tray`, one surface per menu entry |
| login pages | `form`, `flow-back` (rendered by the script) |
| `key/index.html` | `gate` |
| `404.html` | none: a static file in `static/`, one link home |

## 3.7 Sanitizer and security

- `formatted_body` goes through DOMPurify with an allowlist: `p`, `br`, `strong`, `b`, `em`, `i`, `u`,
  `del`, `s`, `code`, `pre`, `blockquote`, `ul`, `ol`, `li`, `a`, `hr`, `table`, `thead`, `tbody`,
  `tr`, `th`, `td`. Scripts, handlers, `style`, `class`, `id`, `javascript:` URLs, ordinary images,
  headings and unknown tags are stripped; text survives when only the tag is dropped. `mx-reply`
  content is removed entirely.
- `img` is allowed only with `data-mx-emoticon`, an `mxc://` src, `alt`, `title`, `height`, `width`.
- Links are allowed for `http:`, `https:` and `matrix.to`, with `rel="noopener noreferrer"` and
  `target="_blank"`.
- CSP: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self';
  img-src 'self' blob: data:; media-src 'self' blob:; worker-src 'self' blob:; object-src 'none';
  base-uri 'none'; form-action 'self'; connect-src *`. The last one is an exception: homeservers are
  user-supplied.
- SSO tokens are consumed once and removed from the URL; recovery keys are shown once and never stored
  in the clear on the main thread; logout clears the databases.
- Do not log tokens, keys or message bodies.

## 3.8 CSS system

- Tokens in `:root`: page and ink, a surface ladder (`--surface`, `--surface-hover`,
  `--surface-active`, `--popover`), derived text tones, `--rule`, `--mark`, `--scrim`, `--focus`,
  the type ladder (`--text-xs` … `--text-2xl`), leading, the spacing scale (`--space-1` … `--space-7`),
  radii, `--ease`, and layout sizes (`--nav-width`, `--bubble-max`, `--modal-max`, `--composer-max`,
  `--control-size`, `--avatar`).
- Surfaces: navigation and room header `--surface`; timeline and composer `--page`; own bubble one step
  above the other bubble; surfaces over content `--popover` with `--rule`.
- Spacing roles: surface padding `--space-4`; control padding `--space-3`; compact rows
  `--space-2 --space-3`. A message group uses `--space-4` between groups and `--space-1` within.
- One container query on `body` (`container-type: inline-size`) switches the narrow shell: with no room
  the navigation fills the viewport, with a room the content does. No width media query anywhere.
- `appearance: none` on `button` and `textarea` before any control styling, or a dark colour scheme
  paints the user agent's own button face over the tokens.
- Focus is `outline: 2px solid var(--focus)` at `2px` offset; never `outline: none`.

## 3.9 Build, assets and caching

**Three kinds of file, three rules.**

| where | what | name |
| --- | --- | --- |
| `static/` | only what a platform asks for by name: `/robots.txt`, `/404.html` with `/404.css`, and `/sw.js` when it exists | copied verbatim, never hashed |
| `src/assets/` | images and icons a module, a stylesheet or the page generator needs — never markup | hashed by the bundler, or by the build for a page asset |
| the crypto wasm | the one file the SDK resolves by its own URL | copied by the build with a hash of its bytes |

**Every case the pipeline must handle, decided once.**

| who needs the file | mechanism | example |
| --- | --- | --- |
| a client module | `import url from "../assets/x.png"` returns the hashed URL | an image the timeline draws |
| a stylesheet | `url(…)` inside the CSS, rewritten by the bundler | a mask or a cursor |
| the generated page | one lookup into the manifest, `asset("icon.svg")`, from a declared page-asset list | `<link rel="icon">` |
| the client, for a file nothing imports | a `<meta>` tag written from the manifest | worker, wasm, service worker |
| the service worker | a generated file with the manifest inlined | `/sw.js` |
| the platform, by fixed name | copied from `static/` | `/robots.txt`, `/404.html` |

There is no seventh mechanism, and a change that needs one extends this table instead of adding a
path beside it. Three consequences are rules:

- **Icons that follow `currentColor` are not files.** They are small typed functions returning `<svg>`;
  a file loaded through a URL cannot inherit the text colour, so it would need a second icon system.
- **The worker never imports an asset.** Its bundle resolves relative URLs at a different depth, and a
  figure it needs arrives from the main thread or through a command, never as a bundler URL.
- **The generator never imports a browser module.** It is Node code: a file the page needs is named in
  the page-asset list and resolved through the manifest, so no DOM module is pulled into the build.
- **Markup is never an asset.** A page is either generated from a function or written once in
  `static/`; `src/assets/` holds no HTML, because a second place where markup can live is a second way
  to build a page.

**A file is imported, not typed into a string.** A module writes
`import mark from "../assets/mark.svg"` and receives the hashed URL; a stylesheet writes `url(…)` and
the bundler rewrites it; a file the *generator* has to reference, and nothing imports, is read out of
the build manifest by one function. A hand-written asset path is a bug, and the audit fails when a
referenced file is missing.

**Two hashes, and why we use one of them.** A name can carry a hash of the file's *content* or a hash of
its *filename*:

- a content hash changes when the bytes change, so the URL can be cached forever and the switch lands
  atomically with the deploy;
- a filename hash stays put across content changes, giving a longer cache life to a name that must stay
  stable, at the cost of a revalidation step.

This is a client, not a content site with stable landing addresses: a release changes the shell, the
service worker and the whole bundle together, and the reader reloads the client as one thing. So
**content hash everywhere**, and the only stable names are the three paths a platform asks for by name.

**A static page carries its own small stylesheet, in system colours.** `404.html` cannot know the
hashed stylesheet name, so `404.css` sits beside it and uses `Canvas`, `CanvasText` and
`color-scheme` instead of the palette: the platform already knows both colour schemes, so there is no
second copy of a colour to drift, and `<meta name="color-scheme" content="light dark">` in the head
makes the page dark before any CSS arrives — which is what stops the white flash.

**The icon has one name, not two.** An earlier draft copied it twice — a stable `/favicon.ico` for a
browser's speculative probe and a hashed copy for our `<link>` — which is the same file with two
identities and two chances to disagree. The root of the problem is the probe, and the probe only
happens when a page declares no icon: every page we generate declares `<link rel="icon">` with the
hashed name, so there is nothing to probe for and no `.ico` is shipped. A browser that asks for
`/favicon.ico` anyway gets a 404, which breaks nothing: the tab already has its icon from the link.

**The wasm** is copied by the build with a hash of its bytes, because esbuild leaves the SDK's
`new URL(…, import.meta.url)` untouched. The worker calls `initAsync(wasm)` before `initRustCrypto`, so
the SDK's no-argument call reuses that promise, and the host must serve the file as `application/wasm`.

**Pages** are generated from functions with the catalog and the manifest, then minified; the output is
committed, and the audit regenerates it and fails on a byte of difference.

**Audit.** Every page exists for every locale, carries `lang` and a title, has no inline CSS or JS,
contains the region ids, has one `h1`, carries a `<noscript>` note and holds no placeholder `href`;
every referenced asset exists; every manifest name is hashed.

**Service worker.** Generated with the manifest inlined, so its bytes change exactly when the shell
does. Install precaches the locale's pages and the hashed assets; navigation is cache-first with a
background revalidate; `skipWaiting` and `clients.claim` keep one version live; registration happens
only in a production build, with `updateViaCache: "none"` and an `update()` on load.

**Dev.** esbuild watch plus a small static server: rebuild, regenerate pages, full reload. No HMR and
no dev-time service worker, so the page a developer sees is the page the generator wrote.

## 3.10 Web platform ledger

The source of truth is the **web-features dataset**: `npm run features -- <id>` prints Baseline status
and the engine version, and `--require 2026` exits non-zero when a feature fails. `@mdn/browser-compat-data`
sits beside it for properties the dataset does not name. Checked 2026-11-13.

**Usable** (Baseline ≤ 2026 and Firefox ≤ 157, the user's browser):

| feature | Baseline | Chrome | Firefox | Safari |
| --- | --- | --- | --- | --- |
| popover, `popovertarget` | 2025-01-27 | 116 | 125 | 17 |
| invoker commands | 2025-12-12 | 135 | 144 | 26.2 |
| `field-sizing` | 2026-06-16 | 123 | 152 | 26.2 |
| `<details name>` | 2024-09-03 | 120 | 130 | 17.2 |
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

**Not usable**: `text-box` (Firefox does not ship it), cross-document view transitions, anchor
positioning, `interpolate-size` and `calc-size()`, `interestfor`, and scroll-driven animations
(Firefox 159, above the user's version).

**Held, with reasons**: `::details-content` (sections open instantly by design), `@scope` (nesting
already contains message markup), `sibling-index()` (nothing staggers by position), `<details name>`
(sections open independently), invoker commands (`popovertarget` already opens and closes the surface).

**The check is part of the change.** A new property or function is looked up with
`npm run features -- <id> --require 2026` before it is written, and the answer is copied into the
commit message when it is not obviously below the current engine versions. The dataset is the
authority: an article, a blog post or a conference talk about a feature that is not in it is a claim,
not a fact.

**Four questions** before a feature is used: does the design need the behaviour at all; does what we
have already do the job; is the feature larger than the need; does it replace code or add a second way
to spell the same thing. A feature that is available but unused is listed here with its reason.

## 3.10.1 Discovery, as the specification states it

`past/spec/content/client-server-api/_index.md` §"Well-known URIs" is the authority. The flow:

1. Take the server name from the Matrix ID (the part after the first colon), or from what the reader
   typed when it is a bare host.
2. `GET https://<server name>/.well-known/matrix/client`, following 30x redirects.
3. 404 → ignore, and fall back to `https://<server name>`; any other non-200 or an empty body → tell
   the reader, do not guess; unparsable JSON → the same.
4. `m.homeserver.base_url` is the client-server base; missing → tell the reader; not a URL → fail.
5. Validate it against `/_matrix/client/versions` and its response shape.
6. `base_url` may carry a path and a trailing slash; both are handled.

Two things this implementation deliberately does not do. `m.identity_server` is ignored: nothing in
the design uses an identity server. `m.server` in `/.well-known/matrix/server` is federation and
belongs to the homeserver, not to us: a client discovers the *client-server* base, and the user's
Matrix ID keeps the server name the person typed (`@maski:unredacted.org` even when the API lives at
`matrix.unredacted.org`).

A typed URL takes the other branch: it is the base URL as given, and no well-known is consulted,
because a reader who wrote `https://matrix.example.org` has already named the API.

## 3.11 Phases

| phase | work | exit |
| --- | --- | --- |
| P0 | pipeline: build, pages, audit, features, layouts, components, router and chat pages, stylesheet | done: four generated pages, audit green, `/chat/` complete with scripts off at both widths and both colour schemes |
| P1 | worker: esbuild worker entry, hashed wasm, `initAsync`, login, sync, decrypt | done: `test/browser/worker.mjs` signs in, syncs ten rooms (eight encrypted), sends into one and reads the plaintext echo |
| P2 | every page and the stylesheet in full | no control is dead, every page complete with scripts off |
| P3 | data: database, both projection passes, store, sections, timeline, composer | a real account lists rooms, reads history, sends, and keeps its place through a backfill and a reload |
| P4 | discovery, password login, the gate, the router — done except registration and reset | login lands on the gate, the recovery key opens secret storage, and the chat opens behind it; verified against the real server. Remaining: UIA registration, the reset path, SAS waiting |
| P5 | media, stickers, search, settings, sessions and verification, channels | each item works |
| P6 | service worker, reload-to-paint, notifications, language switch, accessibility pass | offline reload works and the measurements are reported |

Known issue for P2: navigation rows paint a fill in a dark colour scheme that the computed styles do
not explain. It is recorded rather than chased, because the navigation is restyled in that phase.

## 3.12 The implementation, file by file

Build-time: `lib/html.ts` (escape by default, `raw`), `lib/assets.ts` (the asset record),
`lib/catalog.ts` (`t()`), `catalogs/{en,zh-CN}.ts`, `layouts/{base,app,auth}.ts`,
`components/{nav,sections,header,timeline,composer,surface}.ts`, `pages/{regions,router,chat}.ts`,
`scripts/{build,pages,audit,features}.ts`.

Runtime: `protocol/messages.ts`, `client/{main,store,worker,router,nav,timeline,composer,surfaces}.ts`,
`worker/{worker,api,session,db,rooms,project,normalize,media,keys}.ts`.

Each file has one job and one thing it may not do; a second implementation of the same boundary is a
defect (1.4).

## 3.13 Lessons we build on

Each line is a failure someone has already paid for, with the thing in this code that exists because
of it. They are not decoration: removing one of these mechanisms re-opens its failure.

| lesson | where it comes from | what it costs us |
| --- | --- | --- |
| One fact with two writers drifts; the second writer is always the bug | our second attempt, and every state bug in it | the worker owns the account database; the main thread owns `maski-ui` (3.2) |
| A forward-only projection cannot grow history: clearing the cursor to page backwards drops every page after the first | our second attempt | two passes, forward and backward, decided together (3.3) |
| Prepending to a scroll container moves the viewport | browser behaviour, every chat client | a recorded anchor restored in a frame after a backfill (3.5) |
| A reader scrolled up has not read what arrived below | Telegram, Element | a receipt moves only while the newest row is on screen (3.5) |
| The user agent paints its own button face, which no token can reach | Chrome's dark colour scheme, hit in P0 | `appearance: none` before any control styling (3.8) |
| `instantiateStreaming` requires `application/wasm`; a wrong MIME type fails the whole crypto stack | the Fetch and WebAssembly specs | the hashed wasm is served and checked as such, and the test server does the same (3.9) |
| `new URL(…, import.meta.url)` is rewritten by some bundlers and left alone by others | Vite versus esbuild, measured | the wasm URL is explicit and copied by the build (3.9) |
| A new device cannot read history it holds no keys for | Olm and Megolm design | the mandatory gate, and a decryption failure that says why (2.5) |
| A browser may evict origin storage; Safari does after seven days without interaction | WebKit's storage policy | `navigator.storage.persist()` is requested and a refusal is stated in the interface |
| A service worker that activates immediately can mix an old page with new assets | documented service worker update problems | a precache stamped with the build, and one version live at a time (3.9) |
| A scrollbar appearing moves the layout sideways | browser behaviour | `scrollbar-gutter: stable` on the scroller |
| An IndexedDB transaction closes when the event loop yields | the IndexedDB spec | a read that spans an `await` opens its own transaction or a cursor |
| Long unbroken strings, URLs and CJK text overflow a flex child | CSS box model | `min-inline-size: 0` and `overflow-wrap` on text holders |
| A click can be lost when the element under the pointer is replaced mid-gesture | our second attempt's room list | a keyed list that updates rows in place, never rebuilds them (2.6) |
| One file under two names is two facts that can disagree; a second name is only justified when the platform demands it | the favicon in this file's own first draft | one hashed icon, declared in `<head>`, and no `/favicon.ico` at all (3.9) |
| A key that was never backed up cannot be restored later; a new device reading old messages as unreadable is the truth, not a bug | Megolm backup semantics, seen on the test account | the gate says the key is needed, the timeline says the message cannot be decrypted, and neither claims a restore fixed history |
| A page paints the user agent's canvas before its stylesheet arrives; in a dark colour scheme that is a white flash in the face | every site that ships a link to a stylesheet and nothing else | `color-scheme` in the head of every page, and a static page's stylesheet written in system colours (3.9) |
| Copy that explains what the reader can already see is noise, and reads like a machine wrote it | this file's own first pass at the `<noscript>` notes | one sentence per note, stating only what is missing (2.13) |
| A string written for a feature that has not been built rots before it is used | every project with a catalogue full of keys nothing reads | the catalog test fails on a key the code does not read, so unused copy is deleted rather than kept for later |

## 3.14 Testing

- Units: projection in both directions, store notification granularity, catalog key parity, page
  generation per page and locale (one `h1`, one note, region ids, no inline code, no placeholder link),
  minified and unminified text equality, sanitizer allowlist, search tokens.
- Browser: every page with scripts off, the login flow, the gate, sync, send, retry, decrypt, collapse
  persistence, a subpath base, narrow and wide widths, both colour schemes, keyboard, reduced motion,
  popover open and close.
- `test/browser/worker.mjs` speaks the protocol to the bundled worker and is the check for P1; it takes
  `MASKI_USER`, `MASKI_PASSWORD` and `MASKI_BASE` from the environment.

## 3.15 Tooling decisions

**eslint versus oxlint.** `typescript-eslint` (8.x and the canary) declares `typescript >=4.8.4
<6.1.0`, and this project is on TypeScript 7.0.2. Choosing ESLint therefore means pinning the
compiler back two majors to satisfy the linter. Oxlint's type-aware mode runs through
`oxlint-tsgolint`, its own type engine, so it works with TypeScript 7 and needs one config file.

The decision: **strictness of the compiler first, Oxlint as the gate**, with the rules that matter
most for a client turned on explicitly — `no-floating-promises`, type-aware correctness, `suspicious`
and `perf` categories, warnings denied. When `typescript-eslint` supports TypeScript 7, this is
revisited: its type-checked configs are a superset of Oxlint's type-aware rules, and the only reason
it is not used today is the peer range.

**The toolchain.** Node runs TypeScript directly (type stripping), so the scripts and the tests need
no transpiler: `node scripts/build.ts`, `node --test "test/*.test.ts"`. That removed `tsx` and
`vitest` and their trees; the tests use `node:test` and `node:assert/strict`.

| runtime | build time |
| --- | --- |
| `matrix-js-sdk`, `@matrix-org/matrix-sdk-crypto-wasm` | `esbuild`, `html-minifier-terser`, `typescript`, `oxlint`, `oxlint-tsgolint`, `stylelint`, `stylelint-config-standard`, `playwright`, `web-features`, `@types/node`, `@types/html-minifier-terser` |

`dompurify` is added when the sanitizer lands; a dependency nothing imports is not a dependency.

## 3.15.1 Contracts, and how each one is audited

A rule that only a reviewer remembers is not a rule. Every promise has an owner, a place it is
written, and a check that fails in `npm run check`. The checks live in `scripts/contracts.ts` and
each failure prints `<id>: <what broke>`.

| id | contract | written in | enforced by |
| --- | --- | --- | --- |
| C1 | one catalog key set per language, every key read, nothing empty | 2.13, 3.2 | `contracts.ts` C1 and the catalog test |
| C2 | every protocol command has a handler | 3.4 | `contracts.ts` C2 |
| C3 | the client never imports the SDK, the worker never imports the interface, a page never imports client code | 3.2 | `contracts.ts` C3 |
| C4 | every page has `lang`, one `h1`, a `<noscript>` note, and the chat page carries every region and surface | 3.6, 3.9 | `contracts.ts` C4 and the page tests |
| C5 | every manifest name is hashed and present in `dist/` | 3.9 | `contracts.ts` C5 and the output audit |
| C6 | client bundle ≤ 200 kB, stylesheet ≤ 40 kB | 2.11 | `contracts.ts` C6 |
| C7 | no TODO marker, no console output, no Chinese outside the Chinese catalog | 1.4 | `contracts.ts` C7 |
| C8 | every screen exists in every language, English at the root | 2.4 | `contracts.ts` C8 |
| — | no vendor prefix, no `!important`, no `outline: none` | 1.4, 2.11 | Stylelint and the CSS audit |
| — | a dependency nothing imports is not a dependency | 3.15 | `package.json` review, recorded here |

A budget is a decision, not a target: raising one is a change to this file with the reason, and it
is never done to make a failing build pass.

The same promises are how a new contributor starts: `npm run check` is the whole contract, and the
table above says which one broke and where its rule lives.

## 3.15.2 Open defect: the unlock path

After the sweep, signing in reaches `/key/` with a usable field and the gate no longer lets a new
device through, but submitting the recovery key ends with "The keys could not be restored" on the
test account. The gate predicate is now `isCrossSigningReady()`, which the SDK documents as true
after a successful `bootstrapCrossSigning()`, so the failing call is inside the restore:

1. `secretStorage.hasKey()` and `checkKey()` pass, so the key itself is right;
2. the key is handed to the SDK through `cryptoCallbacks` passed at `createClient`;
3. `bootstrapCrossSigning` or `bootstrapSecretStorage` still throws, and the message is swallowed.

Next step is to surface the thrown message in the gate (it is not a secret) and read it, rather than
guessing which of the two fails. Until then the chat is reachable only on a device that already
holds the keys, which is what 3.15.2 exists to say plainly.

## 3.16 What is built, as of this commit

| area | state |
| --- | --- |
| pipeline | esbuild + hashed assets + generated pages + audit + `past/spec` ledger; `npm run check` green |
| worker | account database, forward and backward projection, room summaries, send with echo replace, media fetch and decrypt, unlock |
| pages | router, chat, server, login, login-oauth, register, key, 404 — seven generated documents per language, complete with scripts off |
| language | one button per page opening a native popover of the languages; the choice is stored and reused by the loader and by settings; English lives at `/` |
| chat | room list in four sections with remembered state, timeline with day separators and grouped avatars, composer with draft in the field |
| media | a picture is a button until the reader asks for it, then an image whose click opens the viewer; video uses native controls |
| settings | account (name, MXID), language, about (version, source, privacy), log out with an inline confirmation |

Next, in the order the design asks for: stickers and the picker (packs from room state and account
data), search over the token index, sessions and verification in settings, then the service worker
with its offline story.
