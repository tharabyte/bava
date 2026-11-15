# Bava roadmap

The order work is built in. The build loop (`.claude/skills/build-step/SKILL.md`)
reads it to find the next step; check the tree, not a previous session's
claim. Each step names its exit check.

Standing rules:
- **Tokens before components** (`.ai/rules/design-system.md`).
- **Format before persistence:** `docs/file-format.md` describes a shape
  before code writes it, with a round-trip test.
- **Nothing deferred without a destination:** work pushed out names the step
  that picks it up.

## Done

| Step | What |
|---|---|
| 0 to 0.5 | Scaffold, toolchain |
| 1 | The spine: D2 compiled and laid out in Go, previewed |
| 2 to 3 | Design tokens and theming; the app shell |
| 4 | Canvas foundation (Konva, outside Svelte) |
| 5 to 5.8 | File format and persistence; wiring; chrome; brand; errors and logs |
| 6 | The canvas: shapes, lines, arrows, binding, elbows, code blocks, export |
| 7 | Snapping and detached arrows |
| 8 | Documents: Spaces, the page editor, media, tables, links, tags, templates |
| 8.7 | The look: black and white |
| 15.1 | Search across a Space; find on the Canvas |
| 15.2 | Export: a page, a folder or the Space as PDF or Markdown zip; the Canvas as PNG or SVG |
| R1 | The move to Tharabyte (`tharabyte/bava`, `com.tharabyte.bava`); no other products named; adapted canvas code attributed in `NOTICE`, for good |
| 10 | D2 coloured and edited as D2 in the D2 diagram's editor and in canvas and page code blocks (`.claude/work/specs/d2-editing.md`) |
| 9 | Icons: an icon element from bundled general icons and logos in Bava's palette, a custom SVG library every Space shares, cleaned before it is drawn; a D2 `icon:` found by name, never fetched (`.claude/work/specs/icons.md`) |

## Next

### R2: the stores' sandboxes, proven first
The Mac App Store and Flathub sandbox the app: it may reach only what the
user chose through the system's dialogs, and must ask again to reopen a
Space (macOS: security-scoped bookmarks; Flathub: portals).
1. A spec, one question at a time: Spaces, loose pages, recent Spaces, the
   pickers, import and export under each sandbox; where settings and logs
   land; what the Microsoft Store's package changes.
2. A sandboxed run on CI, free of any account: an ad-hoc signed `.app` with
   the sandbox entitlements, a self-signed MSIX, later a Flatpak. Expected
   to fail first.
3. The file access each needs, until the sandboxed walks pass.

Exit: the end-to-end walks pass sandboxed on CI.

### 15.3: Import
Markdown files and folders, and Bava's export zips, into a chosen folder;
name clashes numbered, never overwritten. Exit: a Space round-trips through
export and import.

### 15.4: Canvas work
Zoom to fit and to selection; a command palette; paste from other apps
(text as a text element, Bava shapes through the system clipboard); a drag
the system cuts off ends as a release does; labels that fit their shape;
SQL table and UML class shapes.

### CI setup in one place
Move the setup every job repeats (checkout, Linux packages, Go, Node,
`npm ci`) into `.github/actions/setup`. Name every job one way, the same
word in its id, its shown name and any artifact it keeps (`walks-<os>`,
`store-walks-<os>`, `browser`; `release-check` keeps none; the build's
download keeps `bava-<os>-<commit>`), with `docs/testing.md` and the build skill to match.
Exit: green on all three systems.

### 11: AI through your own agent
Decisions in `.claude/work/specs/ai-foundation.md`. Bava's tool menu (look,
claim, make, change), served on this computer only, for an agent the user
already runs to connect to with a one-time code; Bava makes no model call.
"Allow the AI to edit pages" lets the agent change any page it claims, new
pages included: a claimed page is read-only for the user until the agent
releases it or the user presses Stop. Changes land at once with no review,
⌘Z on the page takes them back, and each round ends with a summary. D2 the
agent writes is compiled and laid out into shapes, its errors answered to
the agent. Exit: tests against a stub agent, never a live one.

### 12: A model on your computer
Two trials first: the Go model library (streaming, tools, step limit, no
unexpected network call) and the reply renderer (no network request,
Bava's tokens and code blocks). The chat pane: streamed replies, Stop, step
lines, the summary, the selection as a chip; chats per Space with New chat,
as JSONL in the
app's data folder; local servers found from AI settings; older messages
summarised, visibly, when a chat outgrows the model; a folder attached to a
message. Exit: tests against a local stub, never a live endpoint.

### 13: Online models with your key
Keys in the OS secret store (on Flathub, the Secret portal's lock and an
encrypted file); the general consent statement and its unticked box in AI
settings; tokens shown per reply; clear errors. Exit: no credential in any
plain file Bava writes; every endpoint from user settings.

### 14: Tasks of several steps
A step limit and Stop; each step's changes land as made, on claimed pages,
with one summary at the end; the organise tools (a folder, rename or move,
move to Trash, restorable, Trash never emptied by the AI); an "AI rules" page
the model reads first.

### 16: Release-ready, without any account
Everything that costs nothing:
- Packaging for each store, built on CI and signed with throwaway
  certificates (ad-hoc on macOS, self-signed MSIX); a Flatpak build.
- No updater: the stores update Bava.
- First run (theme); the About screen with the licences.
- Third-party licences generated from the bundled packages, full texts.
- Installer art (the DMG, MSIX tiles and Linux icons still carry the Wails
  template).
- Recovering unsaved work after a crash; the public issue tracker and Help ▸
  Report Issue.
- Store listings drafted (text, screenshots, privacy answers), not
  submitted.

Exit: each store's package builds on CI.

### 17: Accounts and submission, when Bava is complete
Paid and owner-run, only once the owner calls Bava complete: the Apple
Developer account, the Microsoft Store account, real signing certificates
(the MSIX publisher then matches the certificate), submission to each
store. The Flathub manifest and submission are written by the owner, not
AI, as Flathub requires.

### After release: the documentation rewrite
Delete `.claude/work`; rewrite `docs/`, `.claude/`, CLAUDE.md, `.ai/` and
the README for the released app, with an AI disclosure if a store asks
for one.
