# firefly-boards-pilot

Tools and a playbook that let an AI browser agent (built with **Claude Code + Claude in Chrome**) work on **Adobe
Firefly Boards** reliably. It attaches canvas items as prompt references by exact computed clicks, checks which board
item each ref really is, generates once with the credit cost stated, places each result next to its source, and keeps a
per-board ledger. It also includes a prompting guide for Boards.

    agent ──► Claude in Chrome ──► your logged-in Firefly Boards tab
                 │  screenshots + clicks          ▲
                 └─ runs skill/boards_pilot.js ───┘  (read-only: camera, item boxes, attached refs, new results)

## What's here

| Path | What |
|---|---|
| `skill/` | **The Claude Code skill.** Copy this folder to `~/.claude/skills/boards-pilot/`. Contents: `SKILL.md` (rules + playbooks), `boards_pilot.js` (in-page helper), `ledger.py` (board ledgers), `ledger_template.json`, `PROMPTING.md` |
| `tools/receipt/` | Read-only receipt exporter: every generation's prompt, model, seed and ordered refs as JSON. Humans paste it into the console. Agents use quiet mode (no dialogs, no downloads). Includes a Python reader and tests. |
| `docs/HOW_IT_WORKS.md` | Why it works this way: Boards' internals as far as we've mapped them, why a browser agent, and the limits |
| `tests/` | Tests for `ledger.py` |

## Setup

1. Install Claude Code, connect Claude in Chrome (`/chrome` → enable), and approve firefly.adobe.com when asked.
2. Copy `skill/` to `~/.claude/skills/boards-pilot/`.
3. Choose where ledgers live, **outside any git repo**:
   - set the `BOARDS_PILOT_LEDGERS` environment variable, or
   - put `{"ledger_dir": "<folder>"}` in `~/.boards-pilot/config.json`.

   The default is `~/.boards-pilot/ledgers`. Check it with `python skill/ledger.py where`.
4. Open your board in Chrome. In Claude Code, ask for what you want, e.g. "restyle plate_45 with the cinema recipe".
   The skill loads on its own.

## Sharing ledgers with teammates

Ledgers are runtime state written by agents, so they don't go in git.

- **To share:** run `python skill/ledger.py export <ledger.json> --out snapshot.json` and send the snapshot. Local file
  paths are stripped.
- **To receive:** run `python skill/ledger.py import snapshot.json`. It merges into your ledger for that board; your own
  data wins on conflict, and it reports the conflicts.

## Disclaimer

This is an independent project. It is **not affiliated with, endorsed by, or supported by Adobe**. "Adobe", "Firefly"
and "Firefly Boards" are Adobe's trademarks. It contains no Adobe code. Use it at your own risk, on your own account,
and within Adobe's terms.

## Caveats (read before using)

- **It relies on Boards' private internals,** which Adobe can change at any deploy. The helper fails loudly
  ("Boards changed: …") rather than mis-clicking. When that happens, the field paths need updating.
- **It is read-only, apart from the ghost panel**, which briefly hides the Generate panel's look (never board data).
  Adobe hasn't sanctioned reading its page state. It works, but working is not authorization. Use your own boards and
  stay present.
- **Your agent acts as you and spends your generative credits.** The skill states the cost before every Generate and
  never retries automatically.

## Tests

```
python -m unittest discover -s tests                         # ledger.py
cd tools/receipt && node tests/boards_receipt_mock_test.cjs  # exporter (mock page)
cd tools/receipt && PYTHONPATH=. python -m unittest discover -s tests   # reader
```

Standard library only (Python 3.11+, Node 18+).
