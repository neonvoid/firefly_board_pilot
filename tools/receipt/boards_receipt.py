"""Validate and print a boards-receipt-v1 export; standard library only."""
from __future__ import annotations

import argparse
from datetime import datetime
import json
import math
from pathlib import Path
import re
import sys


CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def scan_controls(value):
    """Check decoded strings, including keys and optional/unrecognized fields."""
    if isinstance(value, str):
        if CONTROL.search(value):
            raise ValueError("receipt contains a forbidden ASCII control character")
    elif isinstance(value, dict):
        for key, item in value.items():
            scan_controls(key)
            scan_controls(item)
    elif isinstance(value, list):
        for item in value:
            scan_controls(item)


def require(condition, path):
    if not condition:
        raise ValueError(f"invalid or missing required field: {path}")


def record(value, names, path):
    require(isinstance(value, dict), path)
    for name in names.split():
        require(name in value, f"{path}.{name}")


def number(value):
    return type(value) in (int, float) and math.isfinite(value)


def text(value):
    # Whole blob URL strings are represented as a marker by the exporter.
    return isinstance(value, str) or value == {"kind": "blob"}


def scalar(value):
    return value is None or type(value) is bool or number(value) or text(value)


def iso(value, path, nullable=False):
    if nullable and value is None:
        return
    require(isinstance(value, str), path)
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise ValueError(f"invalid ISO timestamp: {path}") from None
    require(parsed.tzinfo is not None, path)


def validate_model(model, path):
    record(model, "modelId input", path)
    require(text(model["modelId"]), path + ".modelId")
    inp = model["input"]
    record(inp, "prompt seed enhancedPrompt n aspectRatio mediaSpec", path + ".input")
    for key in ("prompt", "seed", "enhancedPrompt", "n", "aspectRatio"):
        field = inp[key]
        here = path + ".input." + key
        record(field, "kind value", here)
        require(text(field["kind"]) and scalar(field["value"]), here)
        if key == "prompt":
            require(text(field["value"]), here + ".value")
    media = inp["mediaSpec"]
    if media is None:  # results loaded from history can lack it
        return
    record(media, "width height mimeType resolution", path + ".input.mediaSpec")
    require(all(scalar(media[k]) for k in ("width", "height", "mimeType", "resolution")), path + ".input.mediaSpec")


def validate_refs(refs, path, composer=False):
    require(isinstance(refs, list), path)
    extra = "snapshotPromptEntity reference usageType" if composer else "resourceCollection usage"
    previous = -math.inf
    for i, ref in enumerate(refs):
        here = f"{path}[{i}]"
        record(ref, "sceneNode mentionId ordinalIndex mentionLabel " + extra, here)
        if ref["ordinalIndex"] is None and not composer:  # history refs can lack it; the exporter sorts them last
            previous = math.inf
            continue
        require(number(ref["ordinalIndex"]) and ref["ordinalIndex"] >= previous, here + ".ordinalIndex")
        previous = ref["ordinalIndex"]
        for key in ("sceneNode mentionId mentionLabel " + extra).split():
            require(scalar(ref[key]), here + "." + key)


def safe_filename(value):
    return isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,180}\.[a-z0-9]+", value) is not None


def validate(receipt):
    scan_controls(receipt)
    record(receipt, "format board captured_at composer results history warnings", "receipt")
    require(receipt["format"] == "boards-receipt-v1", "format")
    record(receipt["board"], "path", "board")
    require(isinstance(receipt["board"]["path"], str) and
            re.fullmatch(r"/boards/id/[^/]+/?", receipt["board"]["path"]) is not None, "board.path")
    iso(receipt["captured_at"], "captured_at")
    record(receipt["composer"], "modelInput refs", "composer")
    validate_model(receipt["composer"]["modelInput"], "composer.modelInput")
    validate_refs(receipt["composer"]["refs"], "composer.refs", composer=True)
    require(isinstance(receipt["results"], list), "results")
    for i, result in enumerate(receipt["results"]):
        path = f"results[{i}]"
        record(result, "resultId operationId outputComponentId status startedAt finishedAt "
               "startedAt_iso finishedAt_iso mimeType enhancedPrompt modelInput dimensions refs entityIds image", path)
        for key in ("resultId", "operationId", "outputComponentId", "status", "mimeType"):
            require(text(result[key]), path + "." + key)
        require(scalar(result["enhancedPrompt"]), path + ".enhancedPrompt")
        for key in ("startedAt", "finishedAt"):
            require(result[key] is None or number(result[key]), path + "." + key)
            iso(result[key + "_iso"], path + "." + key + "_iso", nullable=True)
        validate_model(result["modelInput"], path + ".modelInput")
        record(result["dimensions"], "width height", path + ".dimensions")
        require(all(scalar(result["dimensions"][k]) for k in ("width", "height")), path + ".dimensions")
        validate_refs(result["refs"], path + ".refs")
        require(isinstance(result["entityIds"], list) and all(text(x) for x in result["entityIds"]), path + ".entityIds")
        image = result["image"]
        record(image, "url_kind saved_as has_blob_url", path + ".image")
        require(image["url_kind"] in ("blob", "http", "missing", "other"), path + ".image.url_kind")
        require(type(image["has_blob_url"]) is bool and image["has_blob_url"] == (image["url_kind"] == "blob"), path + ".image.has_blob_url")
        require(image["saved_as"] is None or (image["url_kind"] == "blob" and safe_filename(image["saved_as"])), path + ".image.saved_as")
    history = receipt["history"]
    record(history, "loaded total note", "history")
    require(type(history["loaded"]) is int and history["loaded"] == len(receipt["results"]), "history.loaded")
    require(type(history["total"]) is int and history["total"] >= 0, "history.total")
    require(isinstance(history["note"], str), "history.note")
    require(isinstance(receipt["warnings"], list) and all(isinstance(x, str) for x in receipt["warnings"]), "warnings")
    return receipt


def display(value):
    if value is None:
        return "-"
    if isinstance(value, dict):
        return "[blob]"
    return str(value).replace("\r", "\\r").replace("\n", "\\n").replace("\t", "\\t")


def print_table(receipt, images_dir=None):
    columns = ["resultId", "status", "modelId", "seed", "startedAt", "prompt", "refs", "saved_as"]
    if images_dir is not None:
        columns.append("exists")
    print("\t".join(columns))
    for result in receipt["results"]:
        model = result["modelInput"]
        prompt = model["input"]["prompt"]["value"]
        name = result["image"]["saved_as"]
        row = [display(result["resultId"])[:8], display(result["status"]), display(model["modelId"]),
               display(model["input"]["seed"]["value"]), display(result["startedAt_iso"] or result["startedAt"]),
               display(prompt[:60] if isinstance(prompt, str) else prompt),
               ", ".join(display(ref["mentionLabel"]) for ref in result["refs"]), display(name)]
        if images_dir is not None:
            row.append("-" if name is None else "yes" if (images_dir / name).is_file() else "no")
        print("\t".join(row))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("receipt", type=Path)
    parser.add_argument("--images-dir", type=Path)
    args = parser.parse_args(argv)
    try:
        raw = args.receipt.read_text(encoding="utf-8")
        scan_controls(raw)
        receipt = validate(json.loads(raw))
        print_table(receipt, args.images_dir)
    except (OSError, ValueError, TypeError, RecursionError, OverflowError) as exc:
        print(f"boards_receipt: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
