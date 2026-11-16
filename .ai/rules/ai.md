# AI

Rules for AI features.

## No service of ours
Calls go from the user's machine to an endpoint they chose, with their
credentials. No proxy, relay, default remote URL or hosted fallback: no local
endpoint means the feature is off.

## Credentials live in the OS secret store
Keychain, Credential Manager; on Flathub, a file encrypted with the Secret
portal's per-app lock (the shared secret service would show Bava every
saved password). Never a plain file, config file, transcript, log or error
message.

## Model output is compiled before the user sees it
Generated D2 is compiled in-process; on a diagnostic the error is fed back,
**at most two retries**, with a visible checking state (each hosted retry costs
the user money). Never skip it to show what came back. A diagram still broken
is not placed; a D2 code block still broken goes in as written, its error
named in the chat. Equations are checked the same way.

## AI edits are transactions, with no review
An edit enters as a ProseMirror transaction, CodeMirror change or
`history.mutate`, so the page's undo history holds it: a reply's changes are
one ⌘Z step. It lands at once; there are no proposals, drafts or review list.
A page the AI changed keeps its state from before the first change in memory
until Bava quits, so ⌘Z works on it later too.

## No second pipeline
The AI writes D2 source, which goes through the existing `Render` path,
debounce and goldens.

## Consent is one general statement
In AI settings, before the first online model, with an unticked box; no
company named, nothing asked per message (`.claude/work/specs/ai-foundation.md`).

## The model asks, Bava acts
The model only names tools from Bava's fixed menu; Bava runs them. It changes
only a page it has claimed: claiming makes the page read-only for the user
before the AI reads it, so nothing is merged; a change to an unclaimed or
locked page is refused. Claims live in memory and end on release, at the end
of a reply, or on the user's Stop; never on a timer. Nothing is removed for
good: Trash, never emptied by the AI.

## Page code reads and changes pages, never Go
The open page is read and changed in its editor and scene; a page not on
screen in the background worker, with the same page readers and writers.
Never a hidden editor in the window, a second hidden window, or file text
written another way. The same code writes what the AI reads (block numbers,
element ids, the version), so a number means one block to both; Go holds
no Markdown reader. A change against a stale version is refused.

## The AI's changes are marked, the user's held
On a page the AI holds, the editor takes only transactions marked
`AI_CHANGE`, the canvas history only `mutate(recipe, 'ai')`; the user's
input, undo and redo do nothing. Canvas sizing is `canvas/fit.ts` alone, the
window's and the worker's.

## Bava writes the file, the AI says what it means
Bava measures text, builds page-link addresses, writes date chips, numbers
footnotes, routes arrows and sizes shapes. Colours are swatches and sizes
Bava's steps; a literal colour or off-step size from the model is refused.
What each block and element allows: `ai-foundation.md` decisions 28 and 29.

## Nothing that loads from the web is added
Web links, web cards, pictures and videos by address, and raw HTML can only be
removed by the AI, never added or changed: an address can carry the user's
text to another site on a click or a load. A rewrite keeps every web link it
does not remove.

## Transcripts are Bava's state, not work product
`<data dir>/bava/chats/<escaped Space path>/<chat id>.jsonl`, chats per
Space, append-only (a crash costs a line; unknown keys survive). Detached
history (after a moved Space) is never deleted.
