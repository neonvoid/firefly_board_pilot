"""Tests for ledger.py. Every test works in a self-cleaning temp folder and never touches a real ledger folder."""
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "skill"))
import ledger  # noqa: E402

URL = "https://firefly.adobe.com/boards/id/urn:aaid:sc:US:1234abcd-0000-4000-8000-000000000000"


class LedgerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def make(self, folder, items=None, recipes=None, runs=None):
        path = ledger.new(URL, "tester", folder)
        data = json.loads(path.read_text(encoding="utf-8"))
        data["items"].update(items or {}); data["recipes"].update(recipes or {}); data["runs"].extend(runs or [])
        ledger.save(path, data)
        return path

    def test_board_key_and_new(self):
        self.assertEqual(ledger.board_key(URL), "1234abcd")
        path = ledger.new(URL, "tester", self.root)
        self.assertEqual(path.name, "1234abcd.json")
        self.assertEqual(ledger.validate(json.loads(path.read_text(encoding="utf-8"))), [])
        with self.assertRaises(FileExistsError):
            ledger.new(URL, "tester", self.root)
        with self.assertRaises(ValueError):
            ledger.board_key("https://example.com/boards/id/urn:x")

    def test_validate_catches_bad_boxes_and_refs(self):
        data = {"schema": ledger.SCHEMA, "board": URL, "items": {"a": {"world": {"x": 1, "y": 2, "w": "3", "h": 4}}},
                "recipes": {"r": {"refs": "a"}}, "runs": []}
        problems = ledger.validate(data)
        self.assertTrue(any("items.a.world" in p for p in problems))
        self.assertTrue(any("recipes.r.refs" in p for p in problems))

    def test_dir_resolution_order(self):
        self.assertEqual(ledger.ledger_dir(str(self.root)), self.root)

    def test_export_strips_local_paths(self):
        item = {"node": "n1", "world": {"x": 0, "y": 0, "w": 10, "h": 10}, "file": "D:/local/plate.png"}
        path = self.make(self.root / "mine", items={"plate": item})
        out = ledger.export(path, self.root / "snap.json")
        snap = json.loads(out.read_text(encoding="utf-8"))
        self.assertEqual(snap["snapshot"], ledger.SNAPSHOT)
        self.assertNotIn("file", snap["ledger"]["items"]["plate"])
        kept = json.loads(ledger.export(path, self.root / "snap2.json", keep_paths=True).read_text(encoding="utf-8"))
        self.assertEqual(kept["ledger"]["items"]["plate"]["file"], "D:/local/plate.png")

    def test_import_merges_and_local_wins(self):
        box = {"x": 0, "y": 0, "w": 10, "h": 10}
        theirs = self.make(self.root / "theirs",
                           items={"plate": {"node": "THEIR", "world": box}, "look": {"node": "look-node", "world": box},
                                  "figure_b": {"node": "m-node", "world": box}},
                           recipes={"restyle": {"refs": ["<plate>", "look"]}, "other": {"refs": ["look"]}},
                           runs=[{"when": "t1", "result_id": "r1"}])
        mine = self.make(self.root / "mine",
                         items={"plate": {"node": "MINE", "world": box}, "figure_b": {"node": None, "world": box}},
                         recipes={"restyle": {"refs": ["<plate>", "look", "figure_a"]}},
                         runs=[{"when": "t1", "result_id": "r1"}])
        snap = ledger.export(theirs, self.root / "snap.json")
        path, report = ledger.import_snapshot(snap, self.root / "mine")
        self.assertEqual(path, mine)
        merged = json.loads(mine.read_text(encoding="utf-8"))
        self.assertEqual(merged["items"]["plate"]["node"], "MINE")          # local wins
        self.assertEqual(merged["items"]["figure_b"]["node"], "m-node")         # gap filled
        self.assertIn("look", merged["items"])                                # new item added
        self.assertEqual(merged["recipes"]["restyle"]["refs"], ["<plate>", "look", "figure_a"])
        self.assertIn("other", merged["recipes"])
        self.assertEqual(len(merged["runs"]), 1)                            # duplicate run not re-added
        self.assertEqual(report["items_conflicting"], ["plate"])
        self.assertEqual(report["recipes_conflicting"], ["restyle"])

    def test_import_into_empty_folder_copies(self):
        theirs = self.make(self.root / "theirs", items={"look": {"node": "k", "world": {"x": 0, "y": 0, "w": 1, "h": 1}}})
        snap = ledger.export(theirs, self.root / "snap.json")
        path, report = ledger.import_snapshot(snap, self.root / "fresh")
        self.assertTrue(path.exists())
        self.assertEqual(report["items_added"], ["look"])

    def test_cli_validate_exit_codes(self):
        good = ledger.new(URL, "t", self.root)
        self.assertEqual(ledger.main(["validate", str(good)]), 0)
        bad = self.root / "bad.json"; bad.write_text("{}", encoding="utf-8")
        self.assertEqual(ledger.main(["validate", str(bad)]), 1)


if __name__ == "__main__":
    unittest.main()
