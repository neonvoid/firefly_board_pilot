;(() => {
  "use strict";
  // firefly-boards-pilot copy of boards_receipt.js (show_tools, 2026-10-12), plus QUIET mode (2026-10-13).
  // Browser intrinsics are trusted. Only explicitly named app data is inspected.
  // QUIET mode, for browser agents: set globalThis.__boardsReceiptQuiet = true before running. Then there are no
  // alert/confirm dialogs (a dialog freezes Claude in Chrome) and no downloads. The receipt object is left in
  // globalThis.__boardsReceipt for the agent to read and save itself, and to delete afterwards.
  const QUIET = (() => { try { return globalThis.__boardsReceiptQuiet === true; } catch { return false; } })();
  const notify = m => { if (!QUIET) alert(m); console.log(m); };
  const path = location.pathname;
  if (!/^\/boards\/id\/[^/]+\/?$/.test(path)) {
    if (QUIET) console.log("Open a Firefly board first."); else alert("Open a Firefly board first.");
    return;
  }
  const C = { domDepth: 60, discoveryDomNodes: 60000, discoveryChildren: 4000,
    milliseconds: 6000, chars: 20000 };
  const secret = /token|auth|access|secret|cookie|session|bearer|ims|jwt|password|credential|signature|apikey|api_key/i;
  const warnings = [], limits = new Set();
  const started = Date.now();
  function attempt(fn, fallback = null) { try { return fn(); } catch { return fallback; } }
  const desc = (v, k) => attempt(() => Object.getOwnPropertyDescriptor(v, k));
  const proto = v => attempt(() => Object.getPrototypeOf(v));
  // Enumerate only the two required dictionaries, without the probe's sampling cap.
  const keys = v => attempt(() => Reflect.ownKeys(v));
  const object = v => v !== null && typeof v === "object";
  function fail(p) { throw new Error("Firefly changed: " + p + " is not plain data"); }
  function own(v, k, p) {
    if (secret.test(k)) fail(p);
    const d = object(v) ? desc(v, k) : null;
    if (!d || !("value" in d)) fail(p);
    return d.value;
  }
  function obj(v, p) { if (!object(v)) fail(p); return v; }
  function child(v, k, p) { return obj(own(v, k, p + "." + k), p + "." + k); }
  function scalar(v, p) {
    // A still-running generation can hold undefined (e.g. finishedAt); record it as null.
    if (v === undefined) return null;
    if (v === null || typeof v === "boolean" ||
        (typeof v === "number" && Number.isFinite(v))) return v;
    if (typeof v !== "string") fail(p);
    if (/^blob:\S+$/i.test(v)) return { kind: "blob" };
    // Strip URL queries/fragments even when URLs occur inside a prompt.
    let s = v.replace(/blob:[^\s<>"']+/gi, "[blob URL omitted]")
      .replace(/https?:\/\/[^\s<>"']+/gi, u => attempt(() => {
        const parsed = new URL(u); return parsed.origin + parsed.pathname;
      }, "[URL omitted]"));
    s = s.replace(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, t => {
      const h = t.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
      return attempt(() => /^\s*\{/.test(atob(h)), false) ? "[REDACTED JWT]" : t;
    });
    return s;
  }
  function put(out, k, v, p) {
    if (secret.test(k)) return;
    const clean = scalar(v, p);
    const truncated = typeof clean === "string" && clean.length > C.chars;
    out[k] = truncated ? clean.slice(0, C.chars) : clean;
    if (typeof clean === "string") out[k + "_truncated"] = truncated;
    if (truncated) warnings.push(("String truncated at " + p).slice(0, C.chars));
  }
  function fields(v, names, p) {
    obj(v, p);
    const out = {};
    for (const k of names) put(out, k, own(v, k, p + "." + k), p + "." + k);
    return out;
  }
  function array(v, p, convert) {
    if (!attempt(() => Array.isArray(v), false)) fail(p);
    const n = own(v, "length", p + ".length");
    if (!Number.isSafeInteger(n) || n < 0) fail(p + ".length");
    const out = [];
    for (let i = 0; i < n; i++) out.push(convert(own(v, String(i), p + "[" + i + "]"), p + "[" + i + "]"));
    return out;
  }
  function dictKeys(v, p) {
    obj(v, p);
    const all = keys(v); if (!all) fail(p);
    return all.filter(k => {
      if (typeof k !== "string" || secret.test(k)) {
        warnings.push("A sensitive or symbol dictionary key was omitted."); return false;
      }
      return true;
    });
  }
  // Diagnostic paths never contain raw dictionary keys (which can contain secrets).
  function entryPath(p, k) {
    const clean = scalar(k, p);
    return p + "[" + JSON.stringify(typeof clean === "string" ? clean.slice(0, C.chars) : clean) + "]";
  }
  function model(v, p) {
    const out = fields(v, ["modelId"], p);
    const input = child(v, "input", p), ip = p + ".input";
    out.input = {};
    for (const k of ["prompt", "seed", "enhancedPrompt", "n", "aspectRatio"])
      out.input[k] = fields(child(input, k, ip), ["kind", "value"], ip + "." + k);
    // A result loaded from history can lack mediaSpec (seen 2026-10-13: 1 of 30): absent -> null.
    const msd = desc(input, "mediaSpec");
    out.input.mediaSpec = !msd || ("value" in msd && msd.value === undefined) ? null :
      fields(child(input, "mediaSpec", ip), ["width", "height", "mimeType", "resolution"], ip + ".mediaSpec");
    return out;
  }
  function refs(v, p, composer) {
    return array(v, p, (ref, rp) => {
      const out = fields(ref, composer ? ["snapshotPromptEntity", "sceneNode", "reference", "usageType"] :
        ["resourceCollection", "usage"], rp);
      // Results loaded from history identify their refs by resourceCollection and carry NO sceneNode (seen 2026-10-13:
      // 67 refs on a 32-result board); only results generated in the current session have one. Absent -> null; an
      // accessor or non-plain value still fails loudly.
      if (!composer) {
        const sd = desc(ref, "sceneNode");
        if (!sd) out.sceneNode = null;
        else if (!("value" in sd)) fail(rp + ".sceneNode");
        else put(out, "sceneNode", sd.value, rp + ".sceneNode");
      }
      const name = composer ? "parameters" : "additionalParams";
      const pp = rp + "." + name, pd0 = desc(ref, name);
      // A history result's ref can lack its mention fields, or the whole additionalParams (seen 2026-10-13: 1 of 67,
      // additionalParams present but undefined): absent -> null, sorted last.
      const pv = !composer && (!pd0 || ("value" in pd0 && pd0.value === undefined)) ? null : child(ref, name, rp);
      let params;
      if (composer) params = fields(pv, ["mentionId", "ordinalIndex", "mentionLabel"], pp);
      else if (pv === null) params = { mentionId: null, ordinalIndex: null, mentionLabel: null };
      else {
        params = {};
        for (const k of ["mentionId", "ordinalIndex", "mentionLabel"]) {
          const pd = desc(pv, k);
          if (!pd) params[k] = null; else if (!("value" in pd)) fail(pp + "." + k); else put(params, k, pd.value, pp + "." + k);
        }
      }
      if (typeof params.ordinalIndex !== "number" && (composer || params.ordinalIndex !== null)) fail(pp + ".ordinalIndex");
      Object.assign(out, params); return out;
    }).sort((a, b) => (a.ordinalIndex ?? Infinity) - (b.ordinalIndex ?? Infinity));
  }
  function iso(raw, p) {
    if (raw === null) return null;
    // Observed timestamps are numbers; interpret as Unix milliseconds, never guess seconds.
    if (typeof raw !== "number") fail(p);
    const result = attempt(() => new Date(raw).toISOString());
    if (!result) warnings.push(("Timestamp outside ISO range at " + p).slice(0, C.chars));
    return result;
  }
  // Fixed native DOM getters and the probe v2 discovery caps, including open shadows.
  const first = desc(Element.prototype, "firstElementChild").get;
  const sibling = desc(Element.prototype, "nextElementSibling").get;
  const shadow = desc(Element.prototype, "shadowRoot").get;
  const shadowFirst = desc(DocumentFragment.prototype, "firstElementChild").get;
  const documentRoot = desc(Document.prototype, "documentElement").get;
  function discover() {
    const dom = [{ el: attempt(() => documentRoot.call(document)), depth: 0 }];
    const visited = new WeakSet(); let walked = 0;
    while (dom.length && walked < C.discoveryDomNodes) {
      if (Date.now() - started > C.milliseconds) { limits.add("time"); break; }
      const { el, depth } = dom.pop();
      if (!el || visited.has(el)) continue;
      visited.add(el); walked++;
      const d = desc(el, "_artboardSequenceStore");
      if (d) {
        if (!("value" in d) || !object(d.value)) fail("_artboardSequenceStore");
        return d.value;
      }
      if (depth >= C.domDepth) { limits.add("domDepth"); continue; }
      const sr = attempt(() => shadow.call(el));
      const starts = [attempt(() => first.call(el)), sr ? attempt(() => shadowFirst.call(sr)) : null];
      for (const start of starts) {
        let node = start, count = 0;
        while (node && count < C.discoveryChildren) {
          dom.push({ el: node, depth: depth + 1 }); count++;
          node = attempt(() => sibling.call(node));
        }
        if (node) limits.add("domChildren");
      }
    }
    if (dom.length) limits.add("domScan");
    if (limits.size) throw new Error("Discovery INCONCLUSIVE: _artboardSequenceStore search stopped early (" + [...limits].join(", ") + ").");
    fail("_artboardSequenceStore");
  }
  function download(url, name) {
    const a = Document.prototype.createElement.call(document, "a");
    a.href = url; a.download = name;
    HTMLElement.prototype.click.call(a);
  }
  try {
    let feed = discover(), fp = "_artboardSequenceStore";
    for (const k of ["_uiSyncFrontend", "_viewModels", "auraGenerationFeed", "viewModel"]) {
      feed = child(feed, k, fp); fp += "." + k;
    }
    const receipt = { format: "boards-receipt-v1", board: {}, captured_at: new Date().toISOString(),
      composer: {}, results: [], history: {}, warnings };
    put(receipt.board, "path", path, "board.path");
    receipt.composer.modelInput = model(child(feed, "modelInput", fp), fp + ".modelInput");
    receipt.composer.refs = refs(child(feed, "snapshotPromptValues", fp), fp + ".snapshotPromptValues", true);
    const results = child(feed, "results", fp), urls = child(feed, "resultUrls", fp);
    const byEntity = child(feed, "resultIdsByEntity", fp), reverse = new Map();
    for (const entity of dictKeys(byEntity, fp + ".resultIdsByEntity")) {
      const ep = entryPath(fp + ".resultIdsByEntity", entity);
      for (const id of array(own(byEntity, entity, ep), ep, (v, p) => {
        if (typeof v !== "string") fail(p); return v;
      })) {
        if (!reverse.has(id)) reverse.set(id, []);
        const clean = {}; put(clean, "id", entity, ep);
        reverse.get(id).push(clean);
      }
    }
    const pending = [];
    for (const key of dictKeys(results, fp + ".results")) {
      const rp = entryPath(fp + ".results", key), raw = obj(own(results, key, rp), rp);
      const out = fields(raw, ["resultId", "operationId", "outputComponentId", "status",
        "startedAt", "finishedAt", "mimeType", "enhancedPrompt"], rp);
      const rawId = own(raw, "resultId", rp + ".resultId");
      if (typeof rawId !== "string" || rawId !== key) fail(rp + ".resultId");
      out.modelInput = model(child(raw, "modelInput", rp), rp + ".modelInput");
      out.dimensions = fields(child(raw, "dimensions", rp), ["width", "height"], rp + ".dimensions");
      out.refs = refs(child(raw, "snapshotPrompts", rp), rp + ".snapshotPrompts", false);
      out.startedAt_iso = iso(out.startedAt, rp + ".startedAt");
      out.finishedAt_iso = iso(out.finishedAt, rp + ".finishedAt");
      const entities = reverse.get(rawId) || [];
      out.entityIds = entities.map(entity => entity.id);
      out.entityIds_truncated = entities.some(entity => entity.id_truncated === true);
      // Null represents no image; missing/accessor dictionary entries fail loudly.
      const up = entryPath(fp + ".resultUrls", key), url = own(urls, key, up);
      if (url !== null && typeof url !== "string") fail(up);
      const kind = url === null ? "missing" : /^blob:/i.test(url) ? "blob" : /^https?:\/\//i.test(url) ? "http" : "other";
      out.image = { url_kind: kind, has_blob_url: kind === "blob", saved_as: null };
      if (kind === "blob") {
        out.image.url = { kind: "blob" };
        out.image.reason = "Image downloads declined.";
        pending.push({ url, out });
      } else if (kind === "http") {
        put(out.image, "url", url, up);
        out.image.reason = "HTTP(S) images are never downloaded.";
      } else out.image.reason = kind === "missing" ? "No result URL is loaded." : "Unsupported URL scheme.";
      receipt.results.push(out);
    }
    receipt.results.sort((a, b) => (a.startedAt ?? Infinity) - (b.startedAt ?? Infinity));
    const total = own(feed, "totalNumberOfHistoryItems", fp + ".totalNumberOfHistoryItems");
    if (!Number.isSafeInteger(total) || total < 0) fail(fp + ".totalNumberOfHistoryItems");
    receipt.history = { loaded: receipt.results.length, total,
      note: receipt.results.length < total ? "Open the history panel, scroll to load more, and rerun." : "All currently reported history items are loaded." };
    if (limits.size) warnings.push("Discovery reached limits before finding the host: " + [...limits].join(", "));
    warnings.push("Strings are capped at 20,000 characters; companion *_truncated flags indicate truncation. Sensitive keys, JWTs and URL credentials/queries/fragments are omitted or redacted.");
    if (location.pathname !== path) throw new Error("Receipt stopped: board route changed.");
    // The receipt downloads FIRST: Chrome's "allow multiple downloads?" prompt can block
    // every download after the first one, and the receipt is the one that must land.
    const queue = [];
    if (QUIET && pending.length) warnings.push("Quiet mode: result images were not requested.");
    if (pending.length && !QUIET && confirm("Save " + pending.length + " result images too?")) {
      warnings.push("The browser may ask to allow multiple downloads. saved_as is the requested filename, not confirmation of a saved file.");
      const extensions = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
        "image/gif": "gif", "image/avif": "avif", "image/svg+xml": "svg", "image/tiff": "tif", "image/bmp": "bmp" };
      for (const { url, out } of pending) {
        const ext = typeof out.mimeType === "string" && Object.hasOwn(extensions, out.mimeType) ? extensions[out.mimeType] : null;
        // Refuse unsafe IDs instead of changing the artist's requested filename.
        if (!ext || typeof out.resultId !== "string" || !/^[A-Za-z0-9_-]{1,180}$/.test(out.resultId)) {
          out.image.reason = "Unsupported MIME type or unsafe filename ID."; continue;
        }
        const name = out.resultId + "." + ext;
        out.image.saved_as = name; delete out.image.reason;
        queue.push({ url, out, name });
      }
    }
    const stamp = receipt.captured_at.replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
    let receiptUrl = null;
    if (QUIET) globalThis.__boardsReceipt = receipt;
    else try {
      receiptUrl = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" }));
      download(receiptUrl, "boards-receipt-" + stamp + ".json");
    } finally {
      if (receiptUrl) setTimeout(() => URL.revokeObjectURL(receiptUrl), 30000);
    }
    let imagesRequested = 0, imagesRejected = 0;
    for (const { url, name } of queue) {
      try { download(url, name); imagesRequested++; } catch { imagesRejected++; }
    }
    console.log("Boards receipt: " + receipt.results.length + " results (history total " + total + "), " +
      imagesRequested + " images requested" + (imagesRejected ? ", " + imagesRejected + " rejected by the browser" : "") +
      (QUIET ? "; receipt left in globalThis.__boardsReceipt (quiet mode)." : "."));
  } catch (error) {
    // Only locally constructed Error messages are exposed, never app exception values.
    const d = desc(error, "message");
    const message = proto(error) === Error.prototype && d && "value" in d && typeof d.value === "string" &&
      /^(Firefly changed:|Discovery INCONCLUSIVE:|Receipt stopped:)/.test(d.value) ? d.value : "Receipt failed; no app state was changed.";
    notify(message);
  }
})();
