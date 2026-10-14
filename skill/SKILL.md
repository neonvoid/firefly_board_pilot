---
name: boards-pilot
description: Pilot Adobe Firefly Boards through a browser agent (Claude in Chrome). Attach canvas items as prompt refs by exact computed clicks, verify the refs by board-item id, generate once with the credit cost stated, place each result next to its source, and keep a per-board ledger. Use when asked to generate, restyle or iterate on a Firefly board, to find or attach board items as references, or to place or read back results. Prompting guidance is in PROMPTING.md.
---

# boards-pilot: piloting Firefly Boards by numbers, not by eye

Firefly Boards draws its canvas itself, so a browser agent normally finds items by squinting at screenshots, zooming in
and out, and closing and reopening the Generate panel. That took about 25 actions to attach 4 refs. This skill gives the
agent exact numbers instead:
- where the camera is;
- where each item sits;
- what covers the canvas;
- which refs are attached, and which board item each one is;
- which results are new.

A full round (attach 4 refs, generate, place the result) is about 15 actions, every one of them checked.

Files in this folder:
- `boards_pilot.js`: the in-page helper;
- `ledger.py`: board ledgers;
- `ledger_template.json`;
- `PROMPTING.md`: how to write prompts for Boards.

## Requirements

- A browser agent that can screenshot, click and run page JavaScript in the page's MAIN world, e.g. Claude Code with
  Claude in Chrome (`/chrome`) and firefly.adobe.com approved.
- The operator's Adobe account with access to the board. **The agent spends the operator's generative credits.**

## Rules (hold them always)

1. **Read-only.** The helper reads plain data properties of Boards' view models and page element boxes. Never call a
   getter or an app method (`submitAction`, `submitProperty`, store writes), and make no network calls from the page.
2. **The ghost panel is the one write.** `ghost(true)` sets `visibility:hidden; pointer-events:none` on the Generate panel
   so a click reaches a canvas item beneath it, and `ghost(false)` restores it. Board data is never touched. Ask the
   operator once per board/session whether it is allowed.
3. **Credits:** state the model and credit cost before every Generate (e.g. "Nano Banana 2, 20 credits"). Click Generate
   once. **Never re-click on a timeout.** Watch `newResults()` instead.
4. **Side by side:** after every generation, place the result on the canvas next to the plate or ref it came from, so
   source and result read as a pair.
5. **Never trigger browser dialogs** (alert, confirm, file pickers). A dialog freezes the extension. Escape closes the
   whole Generate panel, so close it with its X.
6. **Stop on "Boards changed: …".** Adobe renamed something. Report the exact message; don't guess around it.

## Setup: where ledgers live

A ledger is the agent's map of one board: our labels for items, their board boxes and node ids, recipes and runs.
Boards keeps no item names, so the labels are ours. Ledgers live **outside any git repo**. `ledger.py` resolves the
folder in this order:
1. `--dir`;
2. the `BOARDS_PILOT_LEDGERS` environment variable;
3. `ledger_dir` in `~/.boards-pilot/config.json`;
4. `~/.boards-pilot/ledgers`.

```
python <skill>/ledger.py where                       # which folder
python <skill>/ledger.py new <board-url> --name "…"  # empty ledger: <first 8 chars of board id>.json
python <skill>/ledger.py validate <file>
python <skill>/ledger.py export <file> --out snap.json   # share with a teammate (local file paths stripped)
python <skill>/ledger.py import snap.json                # merge a teammate's snapshot; local data wins on conflict
```

The agent edits the ledger JSON directly (labels, boxes, node ids, recipes, runs) and runs `validate` afterwards.

## Install the helper (once per page load)

Read `boards_pilot.js` and run its full text with the javascript tool. It defines `window.__bp` and returns
`boards_pilot v5 installed`. Running it again is a no-op. A page reload clears it, so reinstall then.

## Coordinates

    page  = CSS px of the browser viewport = where the agent clicks = the screenshot frame
    world = board units; stable while an item is not moved
    world = (page − origin − t) / scale        page = world · scale + t + origin
    origin = top-left of #canvas-input-container (below the app header)
    t, scale = the canvas view model's tx / ty / scale

An item read at 10 % and again at 42 % zoom kept its world box within rounding. At 2 % zoom one page pixel is about 50
world units, so register boxes at a higher zoom when precision matters. Re-run `observe()` after any browser-zoom or
window change.

## API (`window.__bp`)

| call | returns |
|---|---|
| `observe()` | everything in one JSON: dpr, viewport, origin, camera, selection, occluders, prompt (model id, prompt length and head, refs), result count, last undo title, ghost state |
| `selection()` | `{count, types, page, world}` of the current selection |
| `stamp()`, `await settled(stamp)` | the selection updates a beat after a click (~50 ms; it is mirrored from Boards' worker). Take `stamp()` before clicking, then `await settled(s)`. A drag that keeps the same selection times out but still returns the right box. |
| `toPage(world)`, `toWorld(page)` | the conversions above |
| `occluders()` | boxes of the Generate panel, the results filmstrip and the side panel when visible |
| `visiblePoint(pageBox)` | an interior point of the box that is on the canvas and outside every occluder, or `null` |
| `refs()` | attached refs in order: `{label: "Image-N", ord, node, usage}`, where `node` is the board item's id |
| `prompt()` | `{model, aspect, n, promptChars, promptHead, refs}` |
| `resultIds()`, `newResults(baseline)`, `result(id)` | results in the generation feed: status, model, timing, the ref nodes used |
| `ghost(true / false)` | hide / restore the Generate panel (rule 2) |

## Playbooks

**Register an item** (the first time it is used on a board):
1. Close the panel with X.
2. `s = __bp.stamp()`, click the item, then `await __bp.settled(s)`.
3. Store `label → world` in the ledger.

**Attach refs** (order matters: the prompt names refs by position):
1. Open Generate image.
2. For each ref in order:
   - Click the Image slot.
   - `p = __bp.visiblePoint(__bp.toPage(item.world))`.
   - If `p` is `null` and ghost is allowed: `__bp.ghost(true)`, click the `toPage` centre, then `__bp.ghost(false)`.
   - `__bp.refs()` must now have exactly one more entry, with the next ordinal. Store its `node` in the ledger the first
     time; later, compare against it. Stop on any mismatch.
3. Several refs fit in one `browser_batch`.

**Re-use a recipe:** click **Load** on a result on the canvas, or **Load prompt** on a Generation history item (hover
icon). It restores that generation's refs and prompt. **It does not restore the model**: check `prompt().model` and the
picker label.

**Change one ref:**
- There is **no in-place swap**. Clicking a chip only selects it. The ✕ on hover removes the chip, and the remaining
  chips renumber.
- To keep the order the prompt expects, clear all chips and re-attach every ref in order.

**Edit the prompt:** click into the text, press Ctrl+A (it selects only the editor's text), and type the new prompt.
The refs stay attached.

**Generate:**
1. Check `prompt()`: the model, the refs (nodes = the ledger's), the prompt length.
2. `base = __bp.resultIds()`.
3. State the credits and click Generate **once**.
4. Poll `__bp.newResults(base)` until there is exactly one new result with a final `status` (e.g. `success`), about
   20 s for Nano Banana 2. Its `refNodes` must equal the refs you attached.

**Place side by side:**
1. Select the result in Generation history, then click **Place on canvas**. It does **not** select the placed item; the
   item drops near where the history item was.
2. `s = stamp()`, click the dropped item, then `await settled(s)` to read its box.
3. `left_click_drag` from its centre to the `toPage` centre of the slot next to the source.
4. Check with `selection()`.
5. Record the result in the ledger (label, result id, world box) and add the run.

**Read results back:**
- `__bp.result(id)` covers what a run needs.
- For a full export, see the quiet receipt in `tools/receipt/` (set `globalThis.__boardsReceiptQuiet = true` first:
  no dialogs, no downloads).

## Traps

- **Escape closes the whole Generate panel.** Close it with X to keep refs and text.
- **At fit-all, a selected item's toolbar can cover other items.** A click meant for an item can land on **Create
  element** and open "Move board to project": Cancel it. Re-screenshot after every fit-all.
- **A selection read straight after a click returns the PREVIOUS selection.** Use `stamp()` + `settled()`. Never cache
  a view-model object: Boards replaces it on every update.
- **Page-zoom keys are blocked:** Claude in Chrome blocks Ctrl+0 and Ctrl+±. Use the zoom menu ("Zoom to selection",
  "Fit all content"). The scroll wheel pans very slowly at low zoom.
- **The model's picker label and id differ.** "Gemini 3.1 (w/ Nano Banana 2)" reads as model id `nano-banana-3`.
- **Aspect:** "Landscape" produced 4:3 output from 16:9 plates. See PROMPTING.md.

## Prompting

See `PROMPTING.md`: addressing refs by position, sheets, mixed media, layout plates, model notes and hygiene.
