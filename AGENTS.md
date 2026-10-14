# For agents

- **To pilot a Firefly board**, read `skill/SKILL.md`: rules, the helper API and the playbooks. For prompt wording,
  read `skill/PROMPTING.md`.
- **Any browser agent can use this**, not only Claude in Chrome. It needs to screenshot, click, and run page
  JavaScript in the page's MAIN world.
- **Never call Boards' internal command methods** (`submitAction`, `submitProperty`) or write its stores. Read only.
- **State credits before Generate, and click it once.**
- **Ledgers live outside this repo.** See `skill/ledger.py where`.
- **To change code:** keep `skill/boards_pilot.js` free of personal paths, and bump `VERSION` whenever it changes, so an
  already-installed page reinstalls it. Run all three test suites (see README) before committing.
