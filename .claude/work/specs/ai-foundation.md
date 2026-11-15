# AI foundation (11 to 14)

Decisions settled with the user from 2026-10-24 to 2026-11-16, one at a
time and in plain words. They replace the parts of
`.claude/work/specs/ai-architecture.md` they contradict (subscription
sign-in, consent before each hosted call, one thread per file, a diff to
reject before an edit lands, the open questions at its end);
the rest of it stands: no second render path, the capped repair loop, AI
edits as transactions, JSONL transcripts outside the project.

On 2026-11-16 proposals, Accept and Reject, keep and discard, drafts and the
review list were dropped: the AI's changes go in as it makes them, on pages
it has claimed (decisions 23 to 27).

## What AI does in Bava

1. **The jobs.** Draw a diagram, write and rewrite pages, change any page's
   document or canvas, organise pages, answer questions about the Space.
   Candidates around them, not yet ordered: a diagram from pasted code, a
   schema or a picture; explain a selected diagram; summarise a page; fix a
   D2 error in the D2 diagram dialog.

2. **The model decides, Bava acts.** The model never touches the user's
   files, canvas or pages. It asks Bava to run a tool from a short, fixed
   menu Bava sends with every request; Bava runs it and returns the result.
   A request for anything not on the menu is answered "not available" and
   the model carries on without it. Nothing breaks.

3. **The menu:**
   - Look: the Space's pages and folders; search the Space; read a page;
     read a canvas or the selection; list and read files in an attached
     folder; find an icon.
   - Claim: claim a page for editing; release it (decision 24).
   - Make: draw a diagram from D2; create a page or a folder; write into a
     page.
   - Change: change a claimed page's document or canvas, by the rules of
     decisions 28 and 29.
   - Organise: rename or move a page or folder; move a page or folder to
     Trash (decision 30).

   With "Allow the AI to edit pages" off (decision 23), only Look is on the
   menu.

4. **Drawing** keeps the existing path: the model writes D2, Bava compiles
   it in-process, feeds an error back at most twice behind a visible
   checking line, and lays it out once into ordinary shapes, placed in free
   space beside what the canvas holds, in the direction the model chose.
   Still broken after that, nothing is placed and the chat shows the error.
   Icons arrive as Bava's own by name, never fetched; one given as a web
   address is left out. The D2 is not kept: a later change to the diagram is
   an ordinary change to its shapes and arrows.

5. **Changing** sends the page as short text (each block with its id; each
   canvas element's id, label, position, size and connections; a pen stroke
   as a summary of where it is, its size, colour and what it overlaps) and
   takes back a list of changes keyed by id, never a replacement. The
   changes go in as they arrive, with no review; each reply's changes are
   one undo step on their page (decision 26).

6. **Asking** gives the model an outline of the Space (page names,
   headings, links) and the Look tools. Bava keeps no index and no copy of
   pages. The answer names the pages it used.

7. **Tasks of several steps** (document a project, tidy a Space) use the
   same chat, model library and menu. Each step's changes go in as it makes
   them, on the pages it has claimed; a set step limit and Stop end a task
   early. The task ends with its summary (decision 31).

8. **No separate code-watching feature.** To draw from code, or check a
   diagram against it, the user attaches a folder in the chat (the folder
   picker, so the sandboxes allow it) and asks.

9. **House rules** can live in an ordinary page of the Space the model
   reads before it starts (for example "AI rules"): plain text, the user's
   own file.

## Who answers

10. **Three ways in, in this order:** the user's own agent, which connects
    to Bava and uses the same menu (Bava then makes no model call; this is
    also how a user with a subscription their provider keeps to its own
    tools can use it with Bava); a model on the user's own computer; an
    online model with the user's own key. The agent comes first because it
    is the way the owner can try today, and it needs no model calls, keys
    or consent. **Subscription sign-in is dropped**:
    of the providers, one allows it for apps like Bava, and the user chose
    not to depend on it.

11. **When a conversation outgrows the model,** Bava first asks the local
    server for the room the model and memory allow, and reads the model's
    real limit. Still full, Bava summarises the oldest messages and carries
    on, with a line "Summarised earlier messages". The full conversation
    stays on screen and in the transcript. Nothing is ever dropped
    silently.

## Keys, consent, cost

12. **Keys go to the system's safe:** the Keychain on macOS, Credential
    Manager on Windows (a long token stored in parts, 2,560 bytes each at
    most). **On Flathub**, the Secret portal gives Bava a lock of its own
    from the system's safe, and the keys are kept in a small file encrypted
    with it, in Bava's data folder. This replaces "never a file" with
    "never a plain file": the portal keeps apps apart, where opening the
    shared safe would show Bava every saved password.

13. **Consent is one general statement in AI settings,** shown once before
    the first online model is added, with an unticked box. No company is
    named in it, and nothing is asked per message:

    > **Sending your work to an AI service**
    > When you use an online AI service, Bava sends your request, and the
    > pages, diagrams or selection needed to answer it, to the service you
    > set up here, using your own account with them.
    > Bava's makers never receive, store or see any of it. What the service
    > does with it is set by your agreement with them.
    > You can withdraw at any time in AI settings. Bava then stops sending
    > and deletes your keys from this computer.
    >
    > ☐ I agree to send my requests and the content they need to the AI
    > services I set up.

    A model on the user's computer needs no consent. A short public privacy
    policy saying the same is owed with the store listings (16), and the
    wording is read by a privacy professional before release.

14. **Cost is tokens only:** each reply shows what was sent and received,
    as the service reports it. No prices, no price list.

## The chat

15. **Chats belong to the Space, with New chat.** The AI pane lists the
    Space's chats, newest first, each named from its first message; New
    chat starts another. The page or canvas open when a message is sent is
    attached to it, so a chat can span pages and survives a page being
    renamed or moved. Each chat is one file of plain-text lines, one line
    per message, only ever added to:
    `<data dir>/bava/chats/<escaped Space path>/<chat id>.jsonl`, outside
    the Space. A Space moved outside Bava leaves its chats detached, never
    deleted. This replaces one thread per file.

16. **The pane** sits where the AI pane is listed in the View menu, and
    works with or without a page open (with none, nothing is attached).
    There is no prompt at the selection: what is selected on the page or
    canvas shows as a chip above the pane's message box ("3 shapes", or the
    start of the selected text) and goes with the message; ✕ on the chip
    sends without it. View ▸ Ask AI About Selection opens the pane with the
    selection attached and the cursor in the box. There are no quick
    actions. Replies stream word by word; Stop ends them. Model text is
    untrusted: no web code runs, no picture loads, links open in the
    browser.

17. **What the chat shows besides text,** drawn in Bava's own style:
    - a step line per tool run: one sentence per tool ("Read *Payments*",
      "Searched for *billing* (3)"), a spinner then a tick or a cross,
      runs of the same tool folded ("Read 12 files"), opened by a click;
    - the checking line, what was attached (the page, the selection chip,
      a folder), an error with Retry, the tokens line, and the summary at
      the end of a reply or task (decision 31).

## Libraries, not our own code

18. **Prefer a well-known free library for every part**, and say what is
    left to write:
    - Model calls, streaming, the step loop and its limit: `goai`
      (`github.com/zendev-sh/goai`, MIT), behind a thin layer of Bava's so
      it can be swapped for the providers' official Go libraries. It is
      young, so it is tried first (below).
    - No AI toolkit in the frontend: the chat's state is a list of messages
      fed by Go events, a few dozen lines with Svelte's own state.
    - Reply formatting: `markstream-svelte` (MIT), tried first; fallback
      `marked` with `DOMPurify` and `remend`. Code in replies uses Bava's
      own highlighter.
    - Keys: a keychain library that calls the macOS Keychain directly (the
      common one shells out today; its fix is merged, not released);
      `rymdport/portal`'s `secret` (Apache-2.0) and Go's own encryption on
      Flathub.
    - Chat history: Go's standard library.
    - The chat's pieces: Bava's own components; an AI chat kit was looked at
      and left out, since it brings a second styling system.

## Your agent (11)

19. **The agent connects through the common agent plug (MCP),** served by
    the official Go library for it. Bava listens on this computer only
    (a loopback address), and only while "Allow agents" is on in AI
    settings; a program must show the connection code Bava displays there,
    and a new code can be made at any time. This needs the Mac sandbox's
    permission to accept incoming connections
    (`com.apple.security.network.server`), agreed by the owner on
    2026-11-02.

20. **In Milestone 11 the agent gets Look, Claim, Make and Change,**
    creating new pages included; Organise (a folder, rename or move, move
    to Trash) comes with tasks of several steps in Milestone 14. Proposed
    with the reshaped roadmap, for the user's approval.

21. **Read anywhere, change any page the AI has claimed.** The model and
    the user's agent may read and search any page of the Space, the open
    one as it is on screen, unsaved edits included. They may change any
    page, open or not, and create new ones, once they have claimed it
    (decision 24). This replaces "change only the open page".

22. **The connection code stays until the user makes a new one,** kept in
    the system's password safe (decision 12), so setting an agent up is
    done once. The password safe therefore comes in Milestone 11, not 13.
    Settled with it, as the natural reading: Bava listens on one fixed
    local port, shown in AI settings, and says so if another program holds
    it; several agents may connect at once.

## Editing pages

23. **"Allow the AI to edit pages"** is a switch in AI settings, for every
    way in. Off, the AI only reads and answers: Claim, Make, Change and
    Organise are not on its menu, and asked for a change it says how to
    turn the switch on.

24. **The AI claims a page before it edits it.** Claiming makes the page
    read-only for the user at once, whether it is open or not; if the user
    is typing in it, Bava waits for a pause and saves their words first.
    Only then does the AI read the page for editing, so its copy is always
    current and nothing is ever merged. A change to a page the AI has not
    claimed is refused. A page the AI creates starts claimed by it. The AI
    may hold several claims at once; every other page stays the user's.

25. **A claim ends** when the AI says it is done with the page, when the
    reply or task ends (for a model Bava runs), or when the user presses
    Stop on the page's bar. Stop keeps the changes already made, ends what
    is in progress, and refuses any later change to that page. There is no
    timer: a claim the user's agent forgets stays until Stop. Claims are
    held in memory; quitting Bava releases them all. A claimed page shows a
    bar, "AI is editing this page", with Stop; a dot beside it in the Files
    tree; and the AI pane lists the pages claimed now.

26. **Undo is ⌘Z on the page.** On any page the AI changed, open now or
    later, ⌘Z takes its changes back, a reply's changes as one step: Bava
    keeps the page as it was before the AI's first change, in memory until
    Bava quits, so the page's undo history starts there. A page the AI
    created is taken back by moving it to Trash; one it moved to Trash is
    restored from Trash.

27. **Locks are the user's.** A locked page refuses every AI change,
    rename, move and trash; a locked canvas element refuses every change.
    The AI never locks or unlocks a page or an element. Asked to change one,
    it says it is locked and to unlock it.

## What the AI may change

The AI writes what it means and Bava writes the file: Bava measures text,
builds page-link addresses, writes date chips, numbers footnotes, routes
arrows and sizes shapes to their labels, as it does for the user. Colours
are Bava's swatches and sizes Bava's steps only, so everything the AI sets
can be seen and changed with Bava's own controls.

Nothing that loads from the web is added or changed: web links, web cards,
pictures and videos by web address, and raw HTML can only be removed. An AI
that has read something hostile (an attached folder, a pasted page) can be
led to write an address that carries the user's text to another site, by a
click or by a picture loading; removing can send nothing anywhere.

28. **The document, block by block:**
    - **Paragraphs and headings:** all of it: write, rewrite, delete,
      reorder; levels 1 to 6; bold, italic, strikethrough, underline,
      inline code, line breaks, emoji; text colour, highlight and a block's
      background.
    - **Lists:** all of it: items, nesting, bullets, numbers (start, letters,
      roman numerals), to-dos and their ticks, to and from paragraphs.
    - **Quotes and dividers:** all of it.
    - **Callouts:** all of it, the kind one of Bava's five (info, note,
      success, warning, error); a title; any blocks inside; a custom colour
      and emoji icon.
    - **Toggles:** all of it, the summary plain text, starting open or not;
      never whether one is folded on the user's screen.
    - **Code blocks:** all of it: code, language, wrapping, caption. D2 is
      checked: an error goes back to the AI at most twice, then the block
      goes in as written and the chat names the error.
    - **Equations:** all of it, inline (one line) or a block, checked the
      way D2 is.
    - **Footnotes:** add, rewrite, delete, refer to one again; Bava numbers
      and places them.
    - **Contents block:** place, move, remove; Bava fills it.
    - **Tables:** all of it: cells, rows, columns, alignment, widths, header
      row and column, merged cells, cell colours. A cell holds one line of
      formatted text; a reply breaking that is refused and asked again.
    - **Page links:** add, change, remove, to a page or a heading, pages it
      is creating included; Bava writes the address. A link to a page that
      does not exist is allowed and named in the chat.
    - **Web links:** remove only, named in the chat. A rewrite of text that
      holds one keeps it as it was, unless it removes it.
    - **Date chips:** add, change, remove, a written date into a chip; Bava
      writes the chip, refuses a day that does not exist, and sends today's
      date with each request.
    - **Pictures and videos:** remove from the page, and edit caption, alt
      text, size and alignment. Never add one, change which file or address
      it shows, or delete a file from Media.
    - **Canvas embeds:** as pictures: remove, caption and layout only.
    - **Web cards:** remove only.
    - **Blocks kept as they are:** read and remove only.
    - **Page settings** (tags, width, lock): none.

29. **The canvas, element by element:**
    - **Shapes** (all nine): all of it: add, change, remove, change kind,
      labels and their alignment; Bava sizes the shape to its label.
    - **Text:** all of it: words, font size, alignment, wrapping width.
    - **Lines and arrows:** all of it: connect either end to an element or a
      table or class row, reconnect, detach; straight, elbow or curved;
      arrowheads; labels and their place and direction; open or closed lines
      and their fill. Bava routes a connected arrow; an unconnected line is
      placed by the points the AI gives.
    - **Pen strokes:** move, restyle (colour, thickness, opacity), remove;
      never draw new ones.
    - **Frames:** all of it: add, rename, remove, members, border and label
      colour. Removing a frame keeps its members; an element belongs to one
      frame at most; pages embedding a frame that changes are named in the
      chat.
    - **Groups:** all of it, nested ones included; removing a group removes
      its members.
    - **Code:** all of it: code, language, font size, width; Bava wraps and
      sizes it; D2 checked as in the document.
    - **SQL tables and UML classes:** all of it: name and rows, written as
      the user types them. An arrow whose row is renamed or removed falls
      back to the whole element, named in the chat.
    - **Icons:** all of it, by name from any set, the user's custom library
      included, found with the icon tool; label and colour. Never adding to
      the custom library.
    - **Pictures:** remove, and layout only.
    - **D2 diagrams:** as decision 4.
    - **Styles:** all of it, on any element it may change: fill, border and
      text colour, line thickness and style, corners, opacity, font size,
      alignment; copying one element's style to others.
    - **Layout:** all of it: move, resize, rotate, front and back, align,
      distribute, tidy. Arrows stay attached, frames carry their members,
      icons stay square and pictures keep their proportions.

30. **Organising.** The AI may create pages and folders, rename and move
    them, and move them to Trash. A rename or move repairs every link to the
    page as it does for the user: that is Bava's link repair, not an AI
    edit, and pages being edited or locked are skipped and named. The AI
    never empties Trash and never deletes anything for good.

31. **The summary.** Every reply or task that changed something ends with a
    summary in the chat, a record with no buttons: the pages it created,
    changed, renamed, moved or trashed, one line each; what it was refused
    or skipped, and why; what that did to other pages (links repaired or now
    missing, an embed whose frame went, a web link removed); and the tokens
    line. Every claim is released when it appears.

## How a change reaches a page

32. **Bava's own page code applies every change; nothing writes the file
    text by another route.** The open page takes the AI's changes in its
    editor and scene, as the user's own edits. A page not on screen is
    changed in a background worker: the same code that reads and writes
    pages, with no screen, so it cannot touch the user's window and a
    failure there fails only that change, leaving the file as it was. Pages
    go to it one at a time. Canvas text the worker writes is measured on a
    drawing surface that is never shown, with the bundled fonts; where that
    does not match the window on a system, it is measured in Go with the
    bundled fonts, as D2 text is. Neither a hidden editor in the user's
    window nor a second hidden window is used.

## Before Milestone 11

- A trial: canvas text measured in a worker matches the window on macOS,
  Windows and Linux.
- Two short trials: `goai` against a local server and a hosted one
  (streaming, tools, step limit, no unexpected network call), and
  `markstream-svelte` (size, no network request, Bava's colours, Bava's
  code blocks, links and HTML).
- Milestones 11 to 14 reshaped for these decisions, for the user's approval.
- The mockup's AI page redrawn for them: a claimed page with its bar and
  Stop, the dot in the Files tree, the claimed pages in the AI pane, the
  selection chip, the summary, the "Allow the AI to edit pages" switch; the
  proposals, review list, selection prompts and quick actions taken out.
  Then the chat pane, step lines, summary and AI settings in the Design
  System.
