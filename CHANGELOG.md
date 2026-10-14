# Changelog

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
