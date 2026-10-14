# Boards receipt exporter (read-only)

`boards_receipt.js` exports the generation data the current board page already holds:
- the prompt bar (composer);
- every loaded result, with its model input (prompt, model, seed, aspect, media spec), ids, status, timing and
  **ordered refs**.

**What it reads:** only an explicit allowlist of plain-data fields under `_artboardSequenceStore`.

**What it never does:**
- read page text, cookies or storage;
- call app getters or methods;
- change app objects;
- make network requests.

**Redaction:**
- Sensitive keys are dropped.
- JWT-looking strings are redacted.
- URL queries and fragments are stripped.
- Strings are capped at 20,000 characters, with `*_truncated` flags.

## For people (console)

1. Open the board, then open DevTools → Console. If Chrome asks, type `allow pasting`.
2. Paste all of `boards_receipt.js` and press Enter.
3. Answer the one dialog ("Save N result images too?"). Declining still exports the receipt.

You get `boards-receipt-YYYYMMDD-HHMMSS.json` (UTC). Approved images download as `<resultId>.<ext>` from the page's
existing blob URLs, and only blob URLs are downloaded: HTTP(S) images are recorded, never fetched.

## For agents (quiet mode)

A dialog freezes Claude in Chrome. Run this first:

    globalThis.__boardsReceiptQuiet = true

then the script's text, via the javascript tool. In quiet mode:
- there are no dialogs and no downloads;
- the receipt is left in `globalThis.__boardsReceipt`.

Read it with `JSON.stringify(globalThis.__boardsReceipt)`, save it yourself, then `delete globalThis.__boardsReceipt`.

## History results are sparser

Results generated in the current page session are complete. Results loaded from **history** are not: their refs
carry `resourceCollection` (the asset) and **no `sceneNode`**, and an occasional one lacks `mediaSpec` or a ref's
mention fields. Those export as `null`. Null-order refs sort last. To tie a history ref to a board item, use its
`resourceCollection`, not `sceneNode`.

## Reading a receipt

    python boards_receipt.py receipt.json                        # validate + print a table
    python boards_receipt.py receipt.json --images-dir Downloads # also check the image files

The reader validates the schema and rejects ASCII control characters.

**History paging:** if `history.loaded < history.total`, open the history panel, scroll to load more, and rerun.

## Tests

    node tests/boards_receipt_mock_test.cjs                  # the exporter, against a mock page (incl. quiet mode)
    PYTHONPATH=. python -m unittest discover -s tests        # the reader
