# How it works, and why it is built this way

This is the condensed research behind this repo (Oct 2026). Facts were checked live on a test board unless they are
marked otherwise.

## 1. Three doors into Adobe, and why we use the third

| Door | What it is | Does it reach Boards? |
|---|---|---|
| **Firefly Services API / SDK** | Adobe's generation API (Node SDK) | **No.** It has no board operations, and access is enterprise-only (ETLA). |
| **Adobe's connector** (`create_firefly_board`) | Creates a *new* board from images | It can't drive an existing board, attach refs or click Generate. |
| **The Boards web app itself** | The page you use | **Yes.** It's the only door to an existing board. |

So the agent works the web app like a person does, through a **browser agent**.

## 2. Why a browser agent and not a page script

A script inside the page (the console, an extension content script) produces events the browser marks untrusted. It
can't pick files or start a real drag. The prompt bar ignores dropped and pasted files, so page scripts can't attach
refs at all.

A browser agent (Claude in Chrome) drives the browser from **outside**. To the page its clicks look exactly like yours,
so it can do everything you can: open Generate, click the Image slot, click a canvas item.

What the agent lacks is **sight on the canvas**. Boards draws the canvas itself, so items aren't page elements and
can't be found in the DOM. Without help, the agent squints at screenshots. `boards_pilot.js` fills that gap by
**reading** the app's own state, so the agent can compute where to click and check the results.

## 3. What Boards exposes (read-only)

Boards is built from web components. One element (it was `hz-face-pile` in Oct 2026) carries `_artboardSequenceStore`.
Under it, `_uiSyncFrontend._viewModels` holds about 51 named **view models**: plain-data snapshots mirrored from a
background worker over a `MessagePort`. Each update **replaces** the snapshot object.

| View model | Fields we use |
|---|---|
| `canvas` | `tx`, `ty`, `scale`, `renderViewport`: the camera |
| `selection` | `x`, `y`, `width`, `height` (`.value`) of the selected item, in canvas-viewport CSS px; `selectedNodeCount`; `types`; `lastChanged` |
| `auraGenerationFeed` | `modelInput` (model id, prompt, seed, n, aspect); `snapshotPromptValues[]`, the attached refs (`sceneNode` = item id, `parameters.mentionLabel` / `ordinalIndex`); `results{}`, each with its own model input, ordered refs, status and timing |
| `undoInfo` | `undoOperationTitle` (e.g. "MoveSelected") |

**Not exposed on the main thread:**
- a list of every canvas item (the scene graph lives in the worker);
- names or filenames for plain images.

That is why the ledger keeps our own labels and learns each item's id when it is attached.

**Commands exist and are not used.** `submitAction`, `submitProperty` and the canvas store's `submitCanvasState` are
methods on the same objects. This repo never calls them. A teammate's open-source tool, Prefire
(github.com/lizlong401/prefire), uses `submitCanvasState` for saved camera views. That shows camera moves are possible,
but it's a write to app state, so we left it out.

## 4. Native Boards features to lean on (Oct 2026)

- **Load / Load prompt:** restore a past generation's refs + prompt, but not the model.
- **Generation history:** search with "Find…", expand to a grid view, and "Place on canvas".
- **Artboards:**
  - "Artboard from selection" creates a named container.
  - **Collect items** gathers a selection into a grid inside an artboard.
  - **Arrange / Align / Group**.
- **Presets** with named slots (Composition / Style / Subject), e.g. Restyle (Firefly Image 4).
- **Sample from canvas:** describe an image, or use it as a style or composition reference.
- **Firefly AI Assistant (beta):** Adobe's own conversational agent, a separate app with no public API.

## 5. Limits

- Every field path above is private and can change with any Adobe deploy. The helper checks its paths and stops with
  "Boards changed: …".
- Reading page state is not sanctioned by Adobe. Treat it as a grey zone: your own boards, present, no automation of
  paid generation beyond what you'd click yourself.
- Prompt-bar refs must be board items. Files have to reach the canvas first: drag them from Explorer, or use the
  board's own import.
