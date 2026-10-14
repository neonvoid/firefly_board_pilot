# Changelog

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
