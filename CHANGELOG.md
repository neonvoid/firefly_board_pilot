# Changelog

## 0.3.1 (2026-10-14)

- **`ledger.py at <ledger> --box x,y,w,h | --point x,y`:** which ledger items sit at the operator's selection (ranked
  by overlap; a point returns the most specific item first). This is how an operator "picks" an image to continue
  from without sending screenshots. Test added (8 ledger tests).
- **`skill/SKILL.md`:** the artboard organizer playbook, tested live on a real board. It covers the backup copy, exact
  Properties layout, group select, Artboard from selection, naming, and moving an artboard with its contents. Also the
  pick playbook.
- **New traps:** opening Properties can pan the canvas; a shift-click on the selection's edge resizes instead of
  adding; Escape does not deselect; artboards pad about 360-420 units.
- **`docs/BOARDS_FEATURES.md`:** grouping and context (artboards, Collect items, Group, Projects, Elements), from
  Adobe Help and the Adobe Community.

## 0.3.0 (2026-10-14)

**`skill/boards_pilot.js` v8:** screen-independent, window-aware, settings and organizer.
- `frame()` with no argument guesses the screenshot scale. The window size is recorded, and every click point checks
  it (`checkFrame()`): a resized window throws instead of producing wrong clicks.
- `health()` / `assertHealthy()`: detects the 1 fps throttling Chrome applies to a covered or minimized window (17 ms
  frames in front, 1,000 ms behind another window, measured). Put the gate first in every batch.
- `settings()` / `assertSettings()` / `option()`: model, aspect and resolution pickers by value (e.g.
  `nano-banana-3-image`), the Seed field, the Google Search switch and the credit cost. Tested live: switched to FLUX.2
  [pro] and back; set a fixed seed and cleared it.
- `props()` / `assertProps()` / `input()`: exact placement and sizing through the Properties panel's X / Y / W / H
  fields, which use the same board units as the helper. Tested live: moved an item 47 units by typing and back,
  exactly.
- `layoutPlan()`: equal-cell grid targets for organizing a round. `chips()`: ref chips with their remove buttons.

**`docs/BOARDS_FEATURES.md` (new):** a catalogue of what Boards' web UI offers an agent. It covers the main menu, both
toolbars, the right rail (Properties, Search, AI Assistant, Comments), all model / aspect / resolution options, Effects,
37 Presets, Generate video (Veo 3.1: 400 credits per 8 s clip), and Vary (6 images for 30 credits). The image toolbar
covers Edit (Insert / Remove / Expand), Convert (Image to video / Image to 3D) and More (Copy as PNG, Copy link to
selection, Reorder). It also marks which buttons act at once.

**`skill/SKILL.md`:**
- New sections: "Run Chrome unthrottled" (launch switches), generation settings, exact placement and the organizer,
  and removing ref chips.
- The fast round now starts with `assertHealthy` and `assertSettings`.
- New traps: the multi-select toolbar acts on click (Arrange laid two items out at once; undone); Effects / Elements
  open side panels or dialogs; a reload clears the panel.

**Tests:** `tests/boards_pilot_pure_test.cjs`, the helper's first tests (install, frame / checkFrame, layoutPlan,
slotRight).

## 0.2.0 (2026-10-14)

**`skill/boards_pilot.js` v6:** fewer agent round trips per ideation round (about 10 calls down to 3-4).
- `frame()`: click points come back in the screenshot frame (non-100 % Chrome zoom).
- `controls()`: the Generate panel's buttons, the zoom button and the filmstrip, read from the DOM instead of
  screenshots. Thumbnails carry their result id (`__resultId`).
- Placement: `slotRight`, `dropPlan` (one drag; the drop puts the item's top-left on the slot, measured 0-1 world
  units off at 74 % zoom), `movePlan`, `offWorld`.
- `attachPlan`: all ref clicks for one batch, with the Image slot's moves predicted.
- Gates that throw and so stop a batch: `assertReady` (model, refs, prompt length) before Generate, `expectRefs`
  after each ref click, and `menuItem` for the zoom menu. `waitNew` waits for results inside the page.
- Tested live on a 74 % board: control points matched hand-measured clicks within 2 px; the gates threw on a wrong ref
  order, a wrong prompt length and a closed menu; a test drop was undone with Ctrl+Z.

**`skill/boards_pilot.js` v7:** fixes from the first live round with v6 (two variants, 40 credits).
- `occluders()` includes a selected item's floating toolbar: a drop onto it does nothing, and one did.
- `movePlan` picks a grab point whose destination is also clickable, so a half off-screen item can be moved.
- `waitNew(baseline, timeout, count)`: waits for `count` results; before, it returned when the first was done.
- New gates: `expectControl(name, at)` (the Generate button vanishes for a moment after a click) and
  `expectThumb(id, at)` before a filmstrip drag (with the panel closed, the drag moved a canvas item instead; undone).
- Drop accuracy is not always exact (0-64 page px measured), so the playbook always checks and fixes.

**`skill/SKILL.md`:** the fast-round and one-batch attach playbooks (v7 flow: plan each drop after the previous one,
gate each drag, check and fix), and new traps: `refs()` lag, the moving Image slot, the zoom-menu miss, the 1 fps
covered window, focus before Ctrl+Z, a canvas click closes the panel, the selection toolbar. Alt+Ctrl+0 (Fit all)
works through Claude in Chrome. Plus the filmstrip-drag placement and the prompting lessons from 2026-10-13
(`PROMPTING.md` §5b).

## 0.1.0 (2026-10-13)

First packaging, from the adobe lane's tools of 2026-10-12/13.

**`skill/boards_pilot.js` v5**
- Camera, origin and coordinate conversion. The world box was checked stable across a 10 % → 42 % zoom.
- Selection with `stamp`/`settled`: the view model updates ~50 ms after a click.
- Occluders (panel, filmstrip, side panel) and `visiblePoint`.
- Refs by node id, prompt/model read, new-result watch.
- `ghost()`.
- First full run: 4 refs re-attached through the hidden panel, 1 generation, side-by-side placement within 1 px.

**`skill/ledger.py`**
- Board ledgers: where/new/validate/export/import.
- Export strips local paths. Import merges and local data wins.
- Plus `ledger_template.json`.

**`skill/SKILL.md`, `skill/PROMPTING.md`**
- Rules, playbooks and traps.
- The prompting guide, with an anonymised layout-plate example.

**`tools/receipt/`**
- The read-only receipt exporter and reader from 2026-10-12.
- New: **quiet mode** (`globalThis.__boardsReceiptQuiet = true`): no dialogs, no downloads, and the receipt is left in
  `globalThis.__boardsReceipt`. Tests added.
- Fixed: **results loaded from history are sparser** than results from the current session. The original exporter
  failed on any board with history. Found live on a 32-result board:
  - no ref has a `sceneNode` (refs carry `resourceCollection` instead): 67 of 67;
  - one result lacks `mediaSpec`;
  - one ref has `additionalParams` undefined.

  These now export as `null`, and null-order refs sort last. Composer refs stay strict, and accessors still fail. The
  reader accepts the nulls. Mock and reader tests were added, and a live quiet run read all 32 results.
