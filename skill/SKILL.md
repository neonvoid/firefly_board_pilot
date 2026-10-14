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

1. **Read-only.** The helper reads plain data properties of Boards' view models, and page elements through standard DOM
   reads (boxes, text, attributes). Never call a getter or an app method on Boards' objects (`submitAction`,
   `submitProperty`, store writes), and make no network calls from the page. Every click is a real agent click.
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
`boards_pilot v8 installed`. Running it again is a no-op; an older version is replaced. A page reload clears it (and
the Generate panel's refs and prompt), so reinstall then. Then:
1. `__bp.frame(<screenshot width>)`, so every click point the helper returns is already in the screenshot frame. Every
   screenshot reports its frame ("coordinate frame: 1568x698"). `frame()` with no argument guesses min(1, 1568 /
   innerWidth), which matched at 1920 px. The helper records the window size: if the window is resized, every click
   point throws until `frame()` is called again.
2. `await __bp.assertHealthy()` at the start of every batch: it throws when Chrome is throttled (see "Run Chrome
   unthrottled" below).

Nothing else depends on the screen: every position is read from the page or the board at run time.

## Run Chrome unthrottled (recommended)

On Windows, Chrome slows a window that another window covers to about one frame per second, even when
`document.visibilityState` says "visible" (its native occlusion tracking). Minimized windows stop painting. Then
screenshots time out (30 s), menus and popovers miss clicks, and only page JavaScript keeps working. The agent's
`assertHealthy()` catches it, but the operator has to keep the window in front.

The cure is to start Chrome with switches that turn this off. Close every Chrome window first: switches only apply
when Chrome starts.

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --disable-features=CalculateNativeWinOcclusion --disable-backgrounding-occluded-windows --disable-renderer-backgrounding
```

Make it a shortcut for agent sessions. A covered window then keeps rendering; a minimized one may still pause, so
leave it un-minimized (behind other windows, or on a second screen).

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
| `frame(shotWidth)` | (v6) sets K = screenshot px per page px; every `click`, `from` and `to` below is in the screenshot frame |
| `controls()` | (v6) `{page, click}` of `openGenerate`, `imageSlot`, `prompt`, `generate`, `close`, `zoom`, plus `thumbs`. Read from the DOM, so no screenshot is needed to find a button |
| `thumbs()`, `thumb(resultId)` | (v6) filmstrip thumbnails left to right (newest at the right end), each with its `resultId` (`__resultId` on the element) |
| `slotRight(anchor, size?, gap = 196)` | (v6) the world box of the free slot right of an item |
| `dropPlan(resultId, slot)` | (v6) `{ok, from, to}`: ONE drag from the thumbnail that puts the result's top-left on the slot |
| `movePlan(slot)`, `offWorld(slot)` | (v6) the drag that moves the selected item onto a slot, and how far off it is now |
| `attachPlan(worldBoxes)` | (v6) `[{n, slot, item}]` click pairs that attach refs in order; the Image slot's later positions are predicted |
| `assertReady({model, refs, chars})` | (v6) GATE: throws unless the model, refs (node-id prefixes, in order) and prompt length match |
| `await expectRefs(n)` | (v6) GATE: waits up to 3 s for the n-th ref, throws otherwise |
| `menuItem(label)` | (v6) GATE: the click point of a visible zoom-menu item; throws when the menu is not open |
| `await waitNew(baseline, timeout, count)` | (v7) waits in the page until `count` new results have left `loading`; returns them |
| `expectControl(name, at)`, `expectThumb(id, at)` | (v7) GATES: the control or thumbnail is at the planned point (the Generate button vanishes for a moment after a click) |
| `await health()`, `await assertHealthy()` | (v8) frame times and visibility; the gate throws when the window is throttled (covered or minimized) |
| `checkFrame()` | (v8) GATE: the window size is the one `frame()` recorded (every click point calls it) |
| `settings()` | (v8) the Generate panel's model / aspect / resolution pickers (`value` = id, e.g. `nano-banana-3-image`), Seed (and its field when open), Google Search switch, credit cost |
| `assertSettings({model, aspect, resolution})` | (v8) GATE on the picker values |
| `option(valueOrLabel)` | (v8) GATE: the click point of a visible option in an open picker or menu, by value or exact label |
| `input(label)` | (v8) a visible input by aria-label: `Seed`, `X-position`, `Y-position`, `Width`, `Height`, `Rotation` |
| `chips()` | (v8) attached ref chips in order, with each chip's remove-button point (hover the chip first) |
| `props()`, `assertProps({x, y, w, h})` | (v8) the Properties panel's Transform fields for the selected item; the gate after an edit |
| `layoutPlan(items, {x, y, cols, gap})` | (v8) the organizer's planner: equal-cell grid targets `[{label, x, y, w, h}]` for a set of items |

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

**Fast round (v7): one prompt change, generate, place, look, in two or three batches.** Use it when the refs are
already attached and only the prompt changes (the usual ideation loop). Before the first round: `frame()`, set the
camera so the source and its empty slot(s) are on screen at 25 % zoom or more (select the source, zoom menu → Zoom to
selection, then Zoom out), open the panel, and read `controls()`. Its click points stay valid while the window and
the panel layout don't change.
1. Say the model and the credits in chat.
2. **Batch 1:**
   - JS: `await __bp.assertHealthy()` (v8: stops here if the window is throttled or was resized);
   - click `controls().prompt.click`, press Ctrl+A, type the new prompt;
   - JS: `__bp.assertSettings({model, aspect, resolution}); __bp.assertReady({refs: [...node prefixes], chars: <prompt length>}); window.__base = __bp.resultIds()`;
   - click `controls().generate.click`;
   - JS: `const r = await __bp.waitNew(window.__base, 60000, <how many Generate clicks>); JSON.stringify({r, plan: __bp.dropPlan(r[0].id, slot)})`.

   If the gate throws, the batch stops before Generate and nothing is spent. **Several variants:** after a Generate
   click, `await __bp.expectControl("generate", at)` (the button vanishes for a moment while Boards re-renders), then
   type the next prompt and click again. Generate stays enabled while a result is loading. In practice the agent takes
   longer to type the next prompt than Nano Banana 2 takes to finish (17 s), so this pipelines rather than overlaps.
3. **Batch 2, one per result:**
   - JS gate: `__bp.expectThumb(id, plan.from)`. It throws if the panel closed or the strip moved; otherwise the drag
     would grab whatever canvas item is under that point;
   - `left_click_drag` from `plan.from` to `plan.to`;
   - JS: `JSON.stringify({off: __bp.offWorld(slot), fix: __bp.movePlan(slot), next: __bp.dropPlan(nextId, nextSlot)})`.

   Plan the next drop only AFTER this one: the placed item is selected, and its toolbar can cover the next slot
   (`occluders()` now includes it). If `off` is more than ~20 units, send the `fix` drag.
4. Look: close the panel with its X, then zoom (Alt+Ctrl+0 = Fit all works through Claude in Chrome; for Zoom to
   selection, click `controls().zoom.click`, gate with `__bp.menuItem("Zoom to selection")`, click it). Screenshot.
5. Ledger: the items, their boxes and the runs.

**Drop accuracy (measured 2026-10-14):** the filmstrip drop puts the item's top-left on the drop point at 32 % and
74 % zoom (0-1 units off). At 33 % one drop landed 24 page px low, and one dropped next to a fresh neighbour ended
flush against it (64 px off). At 6 % drops landed 30-45 px off. So always read `offWorld` and fix with `movePlan`.
If `dropPlan` returns `ok: false`, the slot is off-screen or covered: zoom out, or drop on any visible spot, then move.

**Attach refs in one batch (v6):** `attachPlan([box1, box2, ...])` returns the click pairs. Send them as one batch:
for each pair, click `slot`, click `item`, then JS `await __bp.expectRefs(n)`. A `null` slot (the chip row is full) or a
`null` item (not visible) means attach that one by hand.

**Place side by side:**
0. **Best: drag the result's thumbnail from the filmstrip** (above the open panel) onto the canvas. Boards places it
   ("StampGun place items on canvas") and **selects it**, so `settled()` gives its box at once. Its top-left lands on
   the drop point, so `dropPlan()` gives the one drag (above).
1. Otherwise select the result in Generation history, then click **Place on canvas**. It does **not** select the placed item; the
   item drops near where the history item was.
2. `s = stamp()`, click the dropped item, then `await settled(s)` to read its box.
3. `left_click_drag` from its centre to the `toPage` centre of the slot next to the source.
4. Check with `selection()`.
5. Record the result in the ledger (label, result id, world box) and add the run.

**Generation settings (v8):** model, aspect, resolution and seed, set with real clicks and checked by value.
1. `s = __bp.settings()`: each picker's `click` point and current `value`.
2. Click the picker, then JS `__bp.option("<value or label>")`: a gate that throws if the menu did not open. Click its
   point. Model values sit at the top level or under "More models" (hover it to open the submenu).
3. Read `settings()` AGAIN before the next picker: a picker's width, and so its click point, changes with its label
   (seen 2026-10-14: switching to FLUX.2 [pro] moved the model picker 43 px).
4. **Seed:** click Seed. `input("Seed")` gives the field; triple-click it, type the number, press Tab, click Seed to
   close. The value persists until cleared (an empty field = a random seed per generation). Use a fixed seed for
   one-change A/B rounds, then clear it.
5. Gate before Generate: `__bp.assertSettings({model, aspect, resolution})` plus `assertReady`.

FLUX.2 [pro] has no resolution picker (`resolution: null`). Models, aspects and resolutions seen are listed in
`docs/BOARDS_FEATURES.md`.

**Exact placement and the organizer (v8).** Properties (right rail) shows X / Y / W / H for ONE selected item, in the
same board units as the world boxes here (checked to within 7 units). Typing a value and pressing Enter moves or
resizes it exactly. That is the organizer's tool; drags are only for placing results from the filmstrip.
1. Select the item (`stamp`, click, `settled`), click the rail's Properties button, then `p = __bp.props()`.
2. Triple-click `p.fields.x.click`, type the number, press Enter; the same for Y (and W for a uniform width; H follows
   with the aspect lock).
3. `__bp.assertProps({x, y})`. Boards records each edit as one undo step ("Change X").
4. **Tidy a round:** `__bp.layoutPlan(items, {x, y, cols, gap: 196})` gives every item an equal grid cell. Apply each
   target with steps 1-3. Keep each round in a labelled row or grid; record the layout in the ledger.

**Remove ref chips (to swap refs):** `__bp.chips()` lists the chips and their remove buttons. Hover the chip, click its
remove point, then `await __bp.expectRefs(n - 1)`. The rest renumber, so remove from the first chip and re-attach in
order.

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
- **Screenshot frame ≠ page pixels at non-100 % Chrome zoom.** At 67 % (dpr 1, page 1920 px wide) screenshots came back
  1568 px wide: click at page × (screenshot width / innerWidth). `frame()` does this for you.
- **`refs()` lags the click.** Read straight after the board-item click, it can still be `[]`; it showed the new ref
  about 1 s later. Use `expectRefs(n)`.
- **The Image slot moves right one chip (138 page px at 67 %) per attached ref.** `controls()` and `attachPlan()`
  know where it is.
- **The zoom menu can miss its first click** (the next click then lands on the canvas and selects whatever is under
  it). Gate the menu item with `menuItem()`, and click the zoom button again if it throws.
- **A 1 fps window.** When the Chrome window is covered or not in front, Chrome throttles it to one frame per second.
  Screenshots then time out (30 s) and menus lag; JS still works. `assertHealthy()` catches it. Ask the operator to
  bring the window to the front, or use the switches in "Run Chrome unthrottled".
- **The multi-select toolbar ACTS on click.** With 2+ items selected it shows Remix, Collect items, **Arrange** and
  Align. Clicking Arrange immediately laid the two selected items out in a row ("Update selection after arrange"); its
  menu (Rows / Columns / Mosaic) only switches the layout. One Ctrl+Z on the canvas restored it (2026-10-14). Treat
  every button there as an action: read its tooltip by hovering, never click to explore.
- **Some panel buttons open side panels or dialogs, not popovers.** Effects opens a settings side panel that its own
  Close button (top right) closes; clicking Effects again does not. Elements (the @ button) and Create element open
  "Move board to project": Cancel it.
- **A page reload clears the Generate panel** (refs and prompt), as well as the helper.
- **Before Ctrl+Z, check focus.** With focus in the prompt editor, Ctrl+Z undoes prompt typing, not the board. Click
  the canvas first. Ctrl+Z on the canvas undoes a placement or a move cleanly (the undo title goes back).
- **A click on empty canvas closes the Generate panel** (refs and prompt are kept). So never deselect that way
  mid-round: the filmstrip disappears, and the next "filmstrip" drag moves a canvas item instead (seen 2026-10-14;
  undone with Ctrl+Z). Deselect before opening the panel instead, as in the attach playbook.
- **Dropping onto a selected item's toolbar does nothing.** `occluders()` includes the toolbar from v7, so plan each
  drop after the previous one.

## Prompting

See `PROMPTING.md`: addressing refs by position, sheets, mixed media, layout plates, model notes and hygiene.
