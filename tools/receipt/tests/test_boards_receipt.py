import contextlib
import copy
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

import boards_receipt as reader


def model():
    return {"modelId": "firefly-model", "input": {
        **{k: {"kind": "value", "value": v} for k, v in {
            "prompt": "Exact café prompt.\r\n\t" + "x" * 80, "seed": 42, "n": 1,
            "aspectRatio": "landscape", "enhancedPrompt": "enhanced"}.items()},
        "mediaSpec": {"width": 100, "height": 100, "mimeType": "image/png", "resolution": "2k"}}}


def fixture():
    return {"format": "boards-receipt-v1", "board": {"path": "/boards/id/abc"},
            "captured_at": "2023-11-14T22:13:20.000Z", "composer": {"modelInput": model(), "refs": []},
            "results": [{"resultId": "result-first", "operationId": "op", "outputComponentId": "output",
                         "status": "success", "modelInput": model(), "startedAt": 1700000000000,
                         "finishedAt": 1700000001000, "startedAt_iso": "2023-11-14T22:13:20.000Z",
                         "finishedAt_iso": "2023-11-14T22:13:21.000Z", "enhancedPrompt": None,
                         "mimeType": "image/png", "dimensions": {"width": 100, "height": 100},
                         "entityIds": ["entity"], "refs": [
                             {"sceneNode": "s", "resourceCollection": "r", "usage": "image",
                              "mentionId": "m", "ordinalIndex": i, "mentionLabel": label}
                             for i, label in enumerate(["Image A", "Image B"])],
                         "image": {"url_kind": "blob", "has_blob_url": True, "saved_as": "result-first.png"}}],
            "history": {"loaded": 1, "total": 1, "note": "All loaded."}, "warnings": []}


class BoardsReceiptTests(unittest.TestCase):
    def setUp(self):
        scratch = Path(__file__).resolve().parents[1] / ".cx_tmp"
        scratch.mkdir(exist_ok=True)
        # Registered first, so it runs last: drop the scratch dir once it is empty.
        self.addCleanup(lambda: scratch.rmdir() if scratch.exists() and not any(scratch.iterdir()) else None)
        self.temp = tempfile.TemporaryDirectory(dir=scratch)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.path = self.root / "receipt.json"

    def run_reader(self, data=None, extra=(), raw=None):
        self.path.write_text(raw if raw is not None else json.dumps(data), encoding="utf-8")
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = reader.main([str(self.path), *extra])
        return code, stdout.getvalue(), stderr.getvalue()

    def test_sparse_history_result_nulls(self):
        data = fixture()
        data["results"][0]["modelInput"]["input"]["mediaSpec"] = None
        data["results"][0]["refs"][1].update({"ordinalIndex": None, "mentionId": None, "mentionLabel": None, "sceneNode": None})
        code, out, err = self.run_reader(data)
        self.assertEqual((code, err), (0, ""))
        bad = fixture()
        bad["results"][0]["refs"][0]["ordinalIndex"] = None  # a numbered ref after an unnumbered one is out of order
        code, _, err = self.run_reader(bad)
        self.assertNotEqual(code, 0)

    def test_table_exact_columns_prompt_and_ref_order(self):
        data = fixture()
        code, out, err = self.run_reader(data)
        self.assertEqual((code, err), (0, ""))
        self.assertEqual(len(out.splitlines()), 2)
        row = out.splitlines()[1].split("\t")
        self.assertEqual(row, ["result-f", "success", "firefly-model", "42", "2023-11-14T22:13:20.000Z",
                               reader.display(data["results"][0]["modelInput"]["input"]["prompt"]["value"][:60]),
                               "Image A, Image B", "result-first.png"])

    def test_images_present_missing_and_unsaved(self):
        data = fixture()
        extra = ["--images-dir", str(self.root)]
        self.assertTrue(self.run_reader(data, extra)[1].rstrip().endswith("\tno"))
        (self.root / "result-first.png").write_bytes(b"mock image")
        self.assertTrue(self.run_reader(data, extra)[1].rstrip().endswith("\tyes"))
        data["results"][0]["image"]["saved_as"] = None
        self.assertTrue(self.run_reader(data, extra)[1].rstrip().endswith("\t-\t-"))

    def test_required_fields_types_and_invalid_json(self):
        for name in fixture():
            data = fixture()
            del data[name]
            with self.subTest(name=name):
                code, out, err = self.run_reader(data)
                self.assertEqual((code, out), (2, ""))
                self.assertIn("required field", err)
        bad = [None, [], {**fixture(), "format": "unknown"}, {**fixture(), "results": {}},
               {**fixture(), "captured_at": "yesterday"}, {**fixture(), "warnings": "wrong"}]
        for data in bad:
            self.assertEqual(self.run_reader(data)[0], 2)
        self.assertEqual(self.run_reader(raw="{")[0], 2)

    def test_nested_required_fields(self):
        base = fixture()
        paths = [("composer", "modelInput", "input", "prompt", "value"),
                 ("results", 0, "operationId"), ("results", 0, "image", "saved_as"),
                 ("results", 0, "refs", 0, "mentionLabel"), ("results", 0, "dimensions", "width")]
        for path in paths:
            data = copy.deepcopy(base)
            cursor = data
            for part in path[:-1]:
                cursor = cursor[part]
            del cursor[path[-1]]
            with self.subTest(path=path):
                self.assertEqual(self.run_reader(data)[0], 2)

    def test_controls_anywhere_including_escaped_and_keys(self):
        for codepoint in [*range(9), 11, 12, *range(14, 32), 127]:
            for in_key in (False, True):
                data = fixture()
                control = chr(codepoint)
                data["optional" + (control if in_key else "")] = "ok" if in_key else control
                with self.subTest(codepoint=codepoint, in_key=in_key):
                    code, out, err = self.run_reader(data)
                    self.assertEqual((code, out), (2, ""))
                    self.assertIn("forbidden ASCII control", err)
        self.assertEqual(self.run_reader(raw=json.dumps(fixture()) + "\x7f")[0], 2)

    def test_reject_path_traversal_nonfinite_unsorted_and_bad_count(self):
        for name in ("../outside.png", "C:\\outside.png", "..\\outside.png"):
            data = fixture()
            data["results"][0]["image"]["saved_as"] = name
            self.assertEqual(self.run_reader(data, ["--images-dir", str(self.root)])[0], 2)
        data = fixture()
        data["results"][0]["refs"].reverse()
        self.assertEqual(self.run_reader(data)[0], 2)
        data = fixture()
        data["results"][0]["startedAt"] = float("nan")
        self.assertEqual(self.run_reader(data)[0], 2)
        data = fixture()
        data["history"]["loaded"] = 7
        self.assertEqual(self.run_reader(data)[0], 2)

    def test_empty_results_and_blob_marker(self):
        data = fixture()
        data["composer"]["modelInput"]["input"]["prompt"]["value"] = {"kind": "blob"}
        data["results"] = []
        data["history"]["loaded"] = 0
        self.assertEqual(self.run_reader(data)[0], 0)

    def test_missing_file(self):
        with contextlib.redirect_stderr(io.StringIO()) as err:
            code = reader.main([str(self.root / "absent.json")])
        self.assertEqual(code, 2)
        self.assertIn("boards_receipt:", err.getvalue())

    def test_actual_mock_exporter_receipt_roundtrip(self):
        harness = Path(__file__).with_name("boards_receipt_mock_test.cjs")
        completed = subprocess.run(["node", str(harness), "--json"], capture_output=True,
                                   text=True, encoding="utf-8", timeout=15, check=True)
        raw = completed.stdout.partition("\nRECEIPT_JSON\n")[2]
        self.assertTrue(raw)
        code, out, err = self.run_reader(raw=raw)
        self.assertEqual((code, err), (0, ""))
        self.assertIn("first-Image 1, first-Image 2", out)
        self.assertIn("result-first.png", out)


if __name__ == "__main__":
    unittest.main()
