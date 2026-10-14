"""Board ledgers for firefly-boards-pilot: find, create, validate, export and import. Standard library only.

A ledger is one JSON file per Firefly board (schema "boards-pilot-ledger-v1"). It holds our labels for board items, with
each item's board-space box and node id, the recipes (ordered refs, prompt, model) and the runs. Agents write it while
they work. Ledgers live OUTSIDE the repo. Teammates share them with `export` (a snapshot) and `import` (a merge), never
through git.

Ledger folder, first match wins:
  1. the --dir argument
  2. the BOARDS_PILOT_LEDGERS environment variable
  3. "ledger_dir" in ~/.boards-pilot/config.json
  4. ~/.boards-pilot/ledgers
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import sys

SCHEMA = "boards-pilot-ledger-v1"
SNAPSHOT = "boards-pilot-ledger-snapshot-v1"
BOARD_RE = re.compile(r"^https://firefly\.adobe\.com/boards/id/(urn:[^/?#]+)")


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def ledger_dir(explicit: str | None = None) -> Path:
    if explicit:
        return Path(explicit)
    if os.environ.get("BOARDS_PILOT_LEDGERS"):
        return Path(os.environ["BOARDS_PILOT_LEDGERS"])
    config = Path.home() / ".boards-pilot" / "config.json"
    if config.is_file():
        value = json.loads(config.read_text(encoding="utf-8")).get("ledger_dir")
        if value:
            return Path(value)
    return Path.home() / ".boards-pilot" / "ledgers"


def board_key(url: str) -> str:
    """A filename-safe key from a board URL: the first 8 characters of the board's id, e.g. '1234abcd' for
    .../urn:aaid:sc:US:1234abcd-0000-...."""
    m = BOARD_RE.match(url)
    if not m:
        raise ValueError(f"not a Firefly board URL: {url}")
    key = re.sub(r"[^0-9a-f]", "", m.group(1).rsplit(":", 1)[-1].lower())[:8]
    if len(key) != 8:
        raise ValueError(f"board id too short in {url}")
    return key


def validate(data: dict) -> list[str]:
    """Return a list of problems; empty means valid."""
    problems = []
    if data.get("schema") != SCHEMA:
        problems.append(f"schema must be {SCHEMA!r}")
    if not isinstance(data.get("board"), str) or not BOARD_RE.match(data.get("board", "")):
        problems.append("board must be a https://firefly.adobe.com/boards/id/urn:... URL")
    for section, kind in (("items", dict), ("recipes", dict), ("runs", list)):
        if not isinstance(data.get(section), kind):
            problems.append(f"{section} must be a {kind.__name__}")
    for label, item in (data.get("items") or {}).items():
        world = item.get("world") if isinstance(item, dict) else None
        if not isinstance(world, dict) or not all(isinstance(world.get(k), (int, float)) for k in "xywh"):
            problems.append(f"items.{label}.world needs numeric x, y, w, h")
        node = item.get("node") if isinstance(item, dict) else None
        if node is not None and not isinstance(node, str):
            problems.append(f"items.{label}.node must be a string or null")
    for name, recipe in (data.get("recipes") or {}).items():
        if not isinstance(recipe, dict) or not isinstance(recipe.get("refs"), list):
            problems.append(f"recipes.{name}.refs must be a list of item labels (\"<plate>\"-style slots allowed)")
    return problems


def load(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    problems = validate(data)
    if problems:
        raise ValueError(f"{path}: " + "; ".join(problems))
    return data


def save(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(path)


def new(url: str, name: str, folder: Path) -> Path:
    path = folder / f"{board_key(url)}.json"
    if path.exists():
        raise FileExistsError(f"{path} already exists")
    save(path, {"schema": SCHEMA, "board": url, "board_name": name, "updated": now(), "notes": [],
                "items": {}, "recipes": {}, "runs": []})
    return path


def export(path: Path, out: Path, keep_paths: bool = False) -> Path:
    """Write a shareable snapshot. Local file paths ('file' fields) are dropped unless keep_paths."""
    data = load(path)
    if not keep_paths:
        for item in data["items"].values():
            item.pop("file", None)
    snapshot = {"snapshot": SNAPSHOT, "exported_at": now(), "ledger": data}
    save(out, snapshot)
    return out


def import_snapshot(snapshot_path: Path, folder: Path) -> tuple[Path, dict]:
    """Merge a teammate's snapshot into the local ledger for the same board. Local data always wins on conflict;
    new items, recipes and runs are added. Returns (ledger path, report)."""
    snap = json.loads(snapshot_path.read_text(encoding="utf-8"))
    if snap.get("snapshot") != SNAPSHOT:
        raise ValueError(f"{snapshot_path}: not a {SNAPSHOT} file")
    theirs = snap["ledger"]
    problems = validate(theirs)
    if problems:
        raise ValueError(f"{snapshot_path}: " + "; ".join(problems))
    path = folder / f"{board_key(theirs['board'])}.json"
    report = {"items_added": [], "items_conflicting": [], "recipes_added": [], "recipes_conflicting": [], "runs_added": 0}
    if not path.exists():
        save(path, theirs)
        report["items_added"] = sorted(theirs["items"])
        report["recipes_added"] = sorted(theirs["recipes"])
        report["runs_added"] = len(theirs["runs"])
        return path, report
    mine = load(path)
    for label, item in theirs["items"].items():
        if label not in mine["items"]:
            mine["items"][label] = item; report["items_added"].append(label)
        elif mine["items"][label].get("node") and item.get("node") and mine["items"][label]["node"] != item["node"]:
            report["items_conflicting"].append(label)
        elif not mine["items"][label].get("node") and item.get("node"):
            mine["items"][label]["node"] = item["node"]  # fill a gap; never overwrite
    for name, recipe in theirs["recipes"].items():
        if name not in mine["recipes"]:
            mine["recipes"][name] = recipe; report["recipes_added"].append(name)
        elif mine["recipes"][name] != recipe:
            report["recipes_conflicting"].append(name)
    seen = {json.dumps(r, sort_keys=True) for r in mine["runs"]}
    for run in theirs["runs"]:
        key = json.dumps(run, sort_keys=True)
        if key not in seen:
            mine["runs"].append(run); seen.add(key); report["runs_added"] += 1
    mine["updated"] = now()
    save(path, mine)
    return path, report


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dir", help="ledger folder (overrides env/config)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("where", help="print the resolved ledger folder")
    p = sub.add_parser("new", help="create an empty ledger for a board"); p.add_argument("url"); p.add_argument("--name", default="")
    p = sub.add_parser("validate", help="check a ledger file"); p.add_argument("file")
    p = sub.add_parser("export", help="write a shareable snapshot"); p.add_argument("file"); p.add_argument("--out", required=True)
    p.add_argument("--keep-paths", action="store_true", help="keep local 'file' paths in items")
    p = sub.add_parser("import", help="merge a snapshot into the local ledger"); p.add_argument("snapshot")
    args = ap.parse_args(argv)
    folder = ledger_dir(args.dir)
    try:
        if args.cmd == "where":
            print(folder)
        elif args.cmd == "new":
            print(new(args.url, args.name, folder))
        elif args.cmd == "validate":
            problems = validate(json.loads(Path(args.file).read_text(encoding="utf-8")))
            print("\n".join(problems) if problems else "OK")
            return 1 if problems else 0
        elif args.cmd == "export":
            print(export(Path(args.file), Path(args.out), args.keep_paths))
        elif args.cmd == "import":
            path, report = import_snapshot(Path(args.snapshot), folder)
            print(path); print(json.dumps(report, indent=2))
    except (ValueError, FileExistsError, OSError, json.JSONDecodeError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
