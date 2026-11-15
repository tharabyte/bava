# 11: AI through your own agent

**Goal:** an agent the user already runs connects to Bava on this computer,
reads the Space, and changes any page it has claimed, new pages included,
while that page is read-only for the user; changes land at once, ⌘Z takes
them back, and each round ends with a summary. Bava makes no model call.
**Specs:** `.claude/work/specs/ai-foundation.md` decisions 2 to 5, 10, 12,
17 to 29, 31 and 32; `.ai/rules/ai.md`, `ipc.md`, `wails.md`, `canvas.md`,
`editors.md`, `file-format.md`. Mockup page "9 · AI", once redrawn for
claimed pages (spec, "Before Milestone 11"): settings, your agent at work, a
claimed page with its bar, a change on the canvas, a rewrite, the summary.
**File format impact:** none. Every change the agent makes is an ordinary
edit, written as Bava writes the user's own.
**UI impact:** AI settings (a new Settings tab: "Your own agent" and "Allow
the AI to edit pages"); the AI pane's agent view with its step lines,
claimed pages and summary; the claimed-page bar with Stop; a dot in the
Files tree. Chat, models and keys come in 12 and 13.

Two parts, each its own commit: **11a** the connection and the Look tools;
**11b** claims and changes (Claim, Make and Change).

## Constraints

- "The model never touches the user's files, canvas or pages. It asks Bava
  to run a tool from a short, fixed menu" (2). "A request for anything not
  on the menu is answered 'not available'."
- "Read anywhere, change any page the AI has claimed ... the open one as it
  is on screen, unsaved edits included" (21).
- "The AI claims a page before it edits it. Claiming makes the page
  read-only for the user at once, whether it is open or not; if the user is
  typing in it, Bava waits for a pause and saves their words first. Only
  then does the AI read the page for editing ... A change to a page the AI
  has not claimed is refused. A page the AI creates starts claimed by it"
  (24).
- "A claim ends when the AI says it is done with the page, when the reply
  or task ends (for a model Bava runs), or when the user presses Stop ...
  There is no timer ... Claims are held in memory; quitting Bava releases
  them all" (25). For an agent, Bava cannot see a reply end: release or
  Stop ends a claim.
- "Undo is ⌘Z on the page ... a reply's changes as one step ... Bava keeps
  the page as it was before the AI's first change, in memory until Bava
  quits" (26). For an agent, one tool call's changes are one step.
- "A locked page refuses every AI change ... a locked canvas element
  refuses every change. The AI never locks or unlocks" (27).
- What each block and element allows: decisions 28 and 29, with "Bava
  writes the file" and "Nothing that loads from the web is added" above
  them; `.ai/rules/ai.md` carries both.
- "Allow the AI to edit pages ... Off, the AI only reads and answers:
  Claim, Make, Change and Organise are not on its menu" (23).
- "Bava listens on this computer only (a loopback address), and only while
  'Allow agents' is on in AI settings; a program must show the connection
  code Bava displays there, and a new code can be made at any time"; the
  Mac sandbox's `com.apple.security.network.server` (19).
- "The connection code stays until the user makes a new one, kept in the
  system's password safe ... one fixed local port, shown in AI settings
  ... several agents may connect at once" (22).
- "Keys go to the system's safe: the Keychain on macOS, Credential Manager
  on Windows (a long token stored in parts, 2,560 bytes each at most). On
  Flathub, the Secret portal gives Bava a lock of its own ... a small file
  encrypted with it, in Bava's data folder" (12).
- Drawing (4): the D2 goes through `Render`, is laid out once into ordinary
  shapes in free space, never placed broken. For an agent, Bava's compile
  errors go back to the agent as the tool's answer; Bava runs no repair loop
  of its own, since it makes no model call.
- Menu in 11: Look, Claim, Make (draw a diagram, create a page, write into
  a page) and Change (20). Organise waits for 14.
- The summary (31): for an agent, a round ends when its last claim ends,
  by release or Stop; the summary then lists that round.
- Libraries (18): the agent plug is `github.com/modelcontextprotocol/go-sdk`
  v1.8.0 (Apache-2.0, official; streamable HTTP, bearer-token middleware,
  localhost rebinding protection on by default). The password safe:
  `github.com/keybase/go-keychain` (Keychain, MIT),
  `github.com/danieljoos/wincred` (Credential Manager, MIT),
  `github.com/rymdport/portal` `secret` (Apache-2.0) with Go's own
  AES-GCM on Flathub. Each behind `internal/secrets`, so one can be swapped.
- Network: listening on loopback is the second network use after
  `internal/web`, raised and agreed (19); `docs/ipc.md` records it.

## How it works

- **Go owns the plug** (`internal/agent`): an MCP server on
  `127.0.0.1:<port>` behind the SDK's bearer-token middleware, the token
  being the connection code. Tools are registered from one table (name,
  description, input schema, handler), so "not available" is the SDK's own
  unknown-tool answer. Turning "Allow the AI to edit pages" on or off
  re-registers the table and sends the protocol's tool-list-changed notice;
  an agent that keeps calling a removed tool gets the reason as its answer.
- **What only the page knows, Go asks the page for**: the open page as on
  screen (source and scene, unsaved edits included), the selection, icon
  names. A round trip: Go emits `agent:ask` `{id, kind, args}`, the page
  answers through the bound `AgentService.Answer(id, result)`; an answer
  that never comes times out after 10 s and the tool answers an error.
- **Reading** a closed page reads its file (`internal/space`,
  `internal/format`); the open page comes from the page. A page becomes
  short text in Go (`internal/agent/page_text.go`): the document as
  Markdown with each block's id; the canvas one line per element with its
  id, kind, label, rounded box, and arrows as `from -> to`; a pen stroke as
  its box, colour and what it overlaps. One writer, used for every page.
- **Claims live in Go** (`internal/agent/claims.go`), in memory, and reach
  the window as `agent:claims` (the claimed page paths). The window makes a
  claimed page read-only, shows its bar and the Files tree's dot, and lists
  claims in the pane. Claiming an open page asks the page to wait for a
  typing pause and save first; only then does the claim answer.
- **Changes go through Bava's own page code**, never as file text Go
  writes: Go checks the claim, the lock and the rules, then emits
  `agent:apply` `{id, page, changes}`. The open page applies them to its
  editor and scene, as the user's own edits. A page not on screen goes to
  **the page worker** (`frontend/src/ai/page-worker.ts`), a background
  worker in the window with no screen: it reads the file with the same
  Markdown and scene code the editor uses, applies the changes to that
  data, writes it back with the same writer, and hands the text to Go to
  save. It cannot touch the user's screen, and a failure there fails only
  that change. Pages go to it one at a time. Either way the answer lists
  what was applied and what was refused, and the file comes out as Bava
  writes the user's.
- **Canvas text in the worker** is measured on a drawing surface that is
  never shown, with the bundled fonts, so it stores the sizes the window
  would. Trial 0 below proves that on all three systems; where it does not
  match, canvas text is measured in Go with the bundled fonts, as D2 text
  already is (`internal/render`'s ruler).
- **Undo across pages:** the window keeps each changed page's state from
  before the agent's first change (`frontend/src/ai/before.svelte.ts`), in
  memory; opening a page the agent changed starts its undo history there,
  so ⌘Z takes the agent's changes back.

## Tasks

### Trial 0: Text measured in a worker
**Files:** a throwaway page in the browser tests, no app code.
**Behavior:** canvas text (the bundled fonts, each font size, a long
wrapped label, a code block) measured on a hidden drawing surface in a
worker gives the same width and height as the window's measurer, on
macOS, Windows and Linux (CI's `browser` and `walks` jobs).
- [ ] Green on all three: the worker measures canvas text. Any system that
  differs: canvas text from the worker is measured in Go with the bundled
  fonts, recorded in the plan's How it works before Task 8.

### Part 11a: the connection and the Look tools

### Task 1: The password safe
**Files:** `internal/secrets/secrets.go`, `secrets_darwin.go`,
`secrets_windows.go`, `secrets_linux.go`, `portal_linux.go`,
`memory.go`, tests; `go.mod`.
**Behavior:** `Get(name)`, `Set(name, value)`, `Delete(name)` under the
service name `com.tharabyte.bava`; Windows splits a value over 2,560-byte
parts and joins them; on Linux inside Flatpak, the portal's secret seals a
file in the data folder (AES-GCM, a fresh nonce per write); with no safe
at all, `ErrNoSafe`, never a plain file. An in-memory safe for tests.
- [ ] Failing tests: round trip; a value over 2,560 bytes on Windows comes
  back whole (`parts_test.go`, the splitting pure and tested on every OS);
  the sealed file has no plain text of the value and fails to open with
  another key; no safe gives `ErrNoSafe` and writes nothing. Expected
  failure: no package.
- [ ] Implement.
- [ ] Green: `go test ./internal/secrets`

### Task 2: The plug
**Files:** `internal/agent/server.go`, `code.go`, `server_test.go`.
**Behavior:** `Start(port, code)`, `Stop()`, `Connected()`; loopback only;
a missing or wrong code is refused (401); a request naming another host is
refused (the SDK's protection); the port busy is an error the settings
show; a new code takes effect at once and drops agents using the old one.
The code: 16 random characters in four groups, from `crypto/rand`, kept in
the password safe.
- [ ] Failing tests with the SDK's own client: connects with the code and
  lists the tools; refused without it and with an old one; listens on
  127.0.0.1 only; a busy port reports `ErrPortInUse`. Expected failure: no
  package.
- [ ] Implement.
- [ ] Green: `go test ./internal/agent -run Server`

### Task 3: Asking the page
**Files:** `internal/agent/ask.go`, `internal/app/agent.go`
(`AgentService`), `frontend/src/ai/answers.ts`, tests.
**Behavior:** `ask(ctx, kind, args)` emits `agent:ask` and waits for the
answer with that id; a late answer is dropped; 10 s without one is an
error; a closed window answers at once with an error.
- [ ] Failing tests: an answer reaches its own ask among several in flight;
  a timeout; a late answer ignored (Go); the page answers each kind from
  its state (vitest). Expected failure: no service.
- [ ] Implement; bindings regenerated.
- [ ] Green: `go test ./internal/agent ./internal/app -run Ask`; `npx vitest run src/ai`

### Task 4: The Look tools
**Files:** `internal/agent/tools.go`, `page_text.go`, tests;
`frontend/src/ai/answers.ts`.
**Behavior:** `list_pages` (folders and pages in the Space's order),
`search` (the Space's search, the open page as on screen), `read_page`
(the page as short text, with block and element ids; the open page as on
screen), `read_selection` (the canvas selection as short text, or the
selected text), `find_icon` (names from the bundled and custom sets, asked
of the page). Outside the Space, hidden or missing paths are refused as the
Space refuses them.
- [ ] Failing tests against a `testdata` Space through the SDK client: each
  tool's answer; `read_page` of the open page returns the unsaved text;
  `page_text` golden for a page with a callout, a table and a picture, and
  a scene with shapes, a frame, an icon, a pen stroke and bound arrows; a
  path outside the Space refused. Expected failure: no tools.
- [ ] Implement.
- [ ] Green: `go test ./internal/agent`

### Task 5: AI settings and the agent view
**Files:** `frontend/src/settings/AISection.svelte`,
`frontend/src/ai/agent-status.svelte.ts`,
`frontend/src/ai/AgentPane.svelte`, `frontend/src/ai/StepLine.svelte`,
`internal/config` (allow agents, port, allow edits), `internal/agent`
(the tool table by setting), `frontend/src/i18n/messages.ts`,
`App.svelte` (section and pane), tests.
**Behavior:** "Your own agent": Allow agents (off by default), the address
and the code with Copy, New code, "N connected", the port in use as an
error. "Allow the AI to edit pages" (off by default): off, only Look is on
the menu. The AI pane, with no chat yet, shows the agent view: connected or
not, then one step line per tool call (one sentence per tool, a tick or a
cross, a run of the same tool folded, as decision 17).
- [ ] Failing tests: the status model folds runs and keeps order; each tool
  has its sentence; settings round trip `allowAgents`, `agentPort` and
  `allowAIEdits` (Go); turning edits off leaves only Look on the menu and
  sends the tool-list-changed notice. Expected failure: no section.
- [ ] Implement; the components in `.ai/rules/design-system.md`.
- [ ] Green: `npx vitest run src/ai src/settings`; `go test ./internal/config ./internal/agent`;
  `npm run browser` with new pictures: settings AI, the agent view
  connected with steps, both themes.

### Task 6: Through the sandboxes
**Files:** `build/darwin/entitlements.sandbox.plist`, `tests/e2e/agent.go`
(a walk), `internal/e2e` (the code readable by the walk), CI workflow.
**Behavior:** a walk turns on Allow agents, connects with the SDK client,
lists pages and reads one, on all three systems and inside each store's
package.
- [ ] The entitlement; the walk; Green on CI (`walks`, `store walks`).

### Part 11b: claims and changes

### Task 7: Claims
**Files:** `internal/agent/claims.go`, `tools.go` (`claim_page`,
`release_page`), `internal/app/agent.go` (`StopClaim(page)`),
`frontend/src/ai/claims.svelte.ts`, `frontend/src/docs/editor.ts` and
`frontend/src/canvas/` (read-only while claimed), tests.
**Behavior:** `claim_page` on an open page asks the page to wait for a
typing pause and save, then makes it read-only and answers; on a closed
page it answers at once. A locked page refuses the claim. `release_page`
and the user's Stop end a claim; Stop also refuses any later change to that
page from the round. Several claims at once; quitting holds none. The
window gets `agent:claims` and shows each claimed page read-only.
- [ ] Failing tests: a change to an unclaimed page is refused; a locked page
  refuses the claim; claiming while typing waits for the pause and saves
  first; Stop releases and refuses what comes after; claims are gone after
  a restart of the service (Go and vitest). Expected failure: no claims.
- [ ] Implement.
- [ ] Green: `go test ./internal/agent -run Claim`; `npx vitest run src/ai src/docs src/canvas`

### Task 8: Applying changes, open or not
**Files:** `internal/agent/apply.go`, `frontend/src/ai/apply.ts`,
`frontend/src/ai/page-worker.ts` (the worker), `frontend/src/ai/page-edits.ts`
(changes on page data, shared by the editor path and the worker),
`frontend/src/canvas/text-measure.ts` (a measurer for the worker),
`frontend/src/ai/before.svelte.ts`, Vite worker config, tests.
**Behavior:** `agent:apply` reaches the open page's editor and scene, or,
for a page not on screen, the page worker: read with `markdown.ts` and the
scene reader, changed as data, written with the same writers, saved by Go.
One page at a time; a worker failure answers that change as failed and
leaves the file as it was. One tool call's changes are one undo step. The
state before the first change is kept per page, in memory; opening that
page later starts its undo history there. The answer lists what was
applied and what was refused, with why.
- [ ] Failing tests: the same changes on a page through the editor and
  through the worker give byte-identical files; a closed page changed reads
  back as Bava writes it; opening it, ⌘Z restores it as it was; two calls
  are two undo steps; a worker that throws leaves the file untouched; a
  page the user locked between claim and change refuses. Expected failure:
  no apply.
- [ ] Implement.
- [ ] Green: `npx vitest run src/ai`; `go test ./internal/agent -run Apply`

### Task 9: Draw a diagram
**Files:** `internal/agent/tools.go` (`draw_diagram`),
`frontend/src/ai/place.ts` (free space beside the scene), tests.
**Behavior:** the D2 goes through `render.Render`; errors go back to the
agent with their lines and nothing is placed; a clean layout becomes
elements through `toElements` with D2 icons by name (an icon given as a web
address left out), placed in free space beside what the canvas holds, as
one undo step on a claimed page.
- [ ] Failing tests: bad D2 answers its diagnostics and places nothing;
  good D2 lands clear of existing elements as one undo step; a web-address
  icon is dropped; an unclaimed page refuses. Expected failure: no tool.
- [ ] Implement.
- [ ] Green: `go test ./internal/agent -run Draw`; `npx vitest run src/ai src/canvas`

### Task 10: Change the canvas
**Files:** `internal/agent/tools.go` (`change_canvas`, its schema),
`frontend/src/ai/canvas-changes.ts`, tests.
**Behavior:** a list keyed by element id of `add`, `update`, `remove`,
`connect`, `group`, `frame`, `arrange`, by decision 29: shapes, text,
arrows (bound by ids and rows, routed by Bava), frames, groups, code,
tables and classes, icons by name, styles and layout. Refused, saying
which: unknown ids, a locked element, a new pen stroke, adding a picture
or changing which file it shows, a literal colour or off-step size, an icon
name no set holds. Bava measures text and sizes shapes to their labels.
- [ ] Failing tests: each kind applied; each refusal; bound arrows follow a
  moved shape; a renamed table row drops an arrow's row binding and the
  answer names it; the whole list is one undo step. Expected failure: no
  tool.
- [ ] Implement.
- [ ] Green: `npx vitest run src/ai src/canvas`; `go test ./internal/agent -run Canvas`

### Task 11: Change the document
**Files:** `internal/agent/tools.go` (`change_document`, its schema),
`frontend/src/ai/document-changes.ts`, `frontend/src/docs/editor.ts`
(changes by block id in one transaction), tests.
**Behavior:** a list keyed by block id of `insert`, `replace`, `remove`,
`move`, by decision 28: every text block, lists, quotes, callouts, toggles,
code (D2 and equations checked: errors go back to the agent, then the block
goes in as written with its error named), footnotes (Bava numbers them),
the contents block (placed, moved, removed), tables (one line per cell),
page links (Bava writes the address), date chips (Bava writes them).
Refused, saying which: a web link, card, picture, video or raw HTML added
or changed (removing allowed); a rewrite dropping a web link it does not
remove; a table cell holding a block; a picture's or embed's file or
address changed; page settings; a literal colour.
- [ ] Failing tests: each block kind written and rewritten; each refusal; a
  rewrite keeps a web link; a page link written from a page name and
  heading resolves; the list is one transaction, one undo step. Expected
  failure: no tool.
- [ ] Implement.
- [ ] Green: `npx vitest run src/ai src/docs`; `go test ./internal/agent -run Document`

### Task 12: Create a page
**Files:** `internal/agent/tools.go` (`create_page`), `internal/space`,
tests.
**Behavior:** a new page in a folder the agent names (the Space's root
otherwise), its name made free as Bava makes one for the user; it starts
claimed by the agent, empty, for `change_document` and `change_canvas` to
fill.
- [ ] Failing tests: the page is created and claimed; a taken name is
  numbered; a path outside the Space refused. Expected failure: no tool.
- [ ] Implement.
- [ ] Green: `go test ./internal/agent ./internal/space -run Create`

### Task 13: The bar, the dot, the pane and the summary
**Files:** `frontend/src/ai/ClaimBar.svelte`, `frontend/src/files/`
(the dot), `frontend/src/ai/AgentPane.svelte` (claimed pages, the
summary), `frontend/src/ai/summary.svelte.ts`,
`frontend/tests/visual/ai.spec.ts`, fixtures.
**Behavior:** a claimed page shows "AI is editing this page" with Stop; the
Files tree shows a dot by each claimed page; the pane lists claimed pages.
When the agent's last claim ends, the pane shows the round's summary, a
record with no buttons: pages created and changed, refusals and why, side
effects on other pages. A browser test drives the whole path with a fake
agent: claim, draw, rewrite, release, then ⌘Z on each page.
- [ ] Failing tests: the summary from a round's applied and refused
  changes (vitest). Expected failure: no module.
- [ ] Implement.
- [ ] Green: `npm run browser` (pictures for the agent view, a claimed
  page on each side, the summary, both themes, each read).

### Task 14: Docs and records
**Files:** `docs/ipc.md` (the agent plug, `agent:ask`, `agent:claims`,
`agent:apply`, the second network use), `docs/decisions.md`,
`.ai/rules/ai.md` (the round trips, claims and before-states in memory),
`docs/release-checklist.md` (connect Claude Code by hand on each system and
store package), `docs/testing.md` (the agent walk), the build skill's
position, the mockup and design system cleaned up for what was built.

## Artifacts

- `docs/ipc.md`, `docs/decisions.md`, `docs/release-checklist.md`,
  `docs/testing.md`, `.ai/rules/ai.md`, `.ai/rules/design-system.md`.
- `go.mod`: the four libraries above, versions exact.
- Strings in `frontend/src/i18n/messages.ts`.
- Design System cards for the new pieces; mockup boards matched to the
  build.

## Out of scope

The chat, models on this computer and online models (12, 13); Organise
(a folder, rename or move, move to Trash) and tasks of several steps (14);
a repair loop of Bava's own; claims or before-states kept across a restart;
agents connecting from another computer; a second, hidden window for page
edits.

## As built
