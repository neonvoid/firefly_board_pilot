"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const src = fs.readFileSync(path.join(__dirname, "..", "boards_receipt.js"), "utf8");
const rootPath = "_artboardSequenceStore._uiSyncFrontend._viewModels.auraGenerationFeed.viewModel";
const prompts = ["  First image, second image: café 🎨.\r\n\tKeep  spaces and \"quotes\".  ", "A wholly different prompt — 雪.\nEnd."];
// A FAKE JWT for the redaction test ({"alg":"HS256"}.{"sub":"1"}.sig), joined at runtime so secret scanners do not flag it.
const jwt = ["eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiIxIn0", "c2ln"].join(".");

function model(prompt, seed) {
  const tagged = (kind, value) => ({ kind, value });
  return { modelId: "firefly-model", input: {
    prompt: tagged("string", prompt), seed: tagged("seed", seed),
    enhancedPrompt: tagged("string", prompt), n: tagged("number", 1),
    aspectRatio: tagged("aspectRatio", "landscape"),
    mediaSpec: { width: 1536, height: 1024, mimeType: "image/png", resolution: "2k" },
    fastMode: undefined, additionalConfig: {},
  } };
}
function ref(index, composer = false, prefix = "") {
  const parameters = { mentionId: prefix + "mention-" + index, ordinalIndex: index, mentionLabel: prefix + "Image " + index };
  return composer ? { snapshotPromptEntity: "snapshot-" + index, sceneNode: "scene-" + index,
    reference: "reference-" + index, usageType: "image", parameters, resourceMetadata: {} } :
    { sceneNode: prefix + "scene-" + index, resourceCollection: prefix + "collection-" + index,
      usage: "image", additionalParams: parameters };
}
function result(id, prompt, seed, time, prefix) {
  return { modelInput: model(prompt, seed), resultId: id, operationId: "op-" + id,
    snapshotPrompts: [ref(2, false, prefix), ref(1, false, prefix)],
    outputComponentId: "output-" + id, status: "success", dimensions: { width: 1536, height: 1024 },
    startedAt: time, finishedAt: time + 1000, mimeType: "image/png", enhancedPrompt: null };
}
function run(change = () => {}, consent = true, pathname = "/boards/id/abc", quiet = false) {
  const traps = { getter: 0, method: 0, accessToken: 0, proxy: 0, domOverride: 0 };
  class Element {}
  class HTMLElement extends Element {}
  class DocumentFragment {}
  class Document {}
  const mk = () => Object.assign(new HTMLElement(), { _first: null, _next: null, _shadow: null });
  Object.defineProperty(Element.prototype, "firstElementChild", { get() { return this._first; } });
  Object.defineProperty(Element.prototype, "nextElementSibling", { get() { return this._next; } });
  Object.defineProperty(Element.prototype, "shadowRoot", { get() { return this._shadow; } });
  Object.defineProperty(DocumentFragment.prototype, "firstElementChild", { get() { return this._first; } });
  const downloads = [], blobs = [], alerts = [], confirmations = [], logs = [], timers = [], revoked = [];
  HTMLElement.prototype.click = function () { downloads.push({ href: this.href, name: this.download }); };
  const html = mk(), body = mk(), host = mk(); html._first = body;
  const children = Array.from({ length: 30 }, mk); body._first = children[0];
  children.forEach((el, i) => { el._next = children[i + 1] || null; });
  const shadow = new DocumentFragment(); children[29]._shadow = shadow; shadow._first = host;
  Object.defineProperty(body, "firstElementChild", { get() { traps.domOverride++; throw Error("override"); } });
  const feed = {
    modelInput: model("Composer now: different again.", 33), snapshotPromptValues: [ref(3, true), ref(1, true)],
    results: {
      "result-later": result("result-later", prompts[1], 22, 1700000010000, "later-"),
      "result-first": result("result-first", prompts[0], 11, 1700000000000, "first-"),
    },
    resultUrls: { "result-first": "blob:https://firefly.adobe.com/existing-worker-blob",
      "result-later": "https://cdn.example.com/image.png?sig=SECRET#fragment" },
    resultThumbnailUrls: {}, canvasUrls: {},
    resultIdsByEntity: { "entity-b": ["result-first", "result-later"], "entity-a": ["result-first"] },
    totalNumberOfHistoryItems: 5, resultsIdsFromPaginatedHistory: [], nextPageHistoryIndex: 0,
    isLoadingHistoryItems: false, docId: "abc",
    get dangerous() { traps.getter++; throw Error("getter"); },
    submit() { traps.method++; },
    proxied: new Proxy({}, Object.fromEntries(["get", "getOwnPropertyDescriptor", "getPrototypeOf", "ownKeys"].map(k =>
      [k, () => { traps.proxy++; throw Error("proxy"); }]))),
  };
  Object.defineProperty(feed, "accessToken", { get() { traps.accessToken++; return "TOKENVALUE"; } });
  feed.modelInput.input.additionalConfig.accessToken = "TOKENVALUE";
  feed.results["result-first"].accessToken = "TOKENVALUE";
  const store = { _uiSyncFrontend: { _viewModels: { auraGenerationFeed: { viewModel: feed } } } };
  Object.defineProperty(host, "_artboardSequenceStore", { value: store, configurable: true });
  change({ feed, host, store, traps });
  const document = new Document();
  Object.defineProperty(Document.prototype, "documentElement", { get() { return html; } });
  Document.prototype.createElement = name => { assert.equal(name, "a"); return mk(); };
  class MyURL extends URL {}
  MyURL.createObjectURL = blob => { blobs.push(blob); return "blob:receipt-output"; };
  MyURL.revokeObjectURL = url => revoked.push(url);
  class Blob { constructor(parts, options) { this.text = parts.join(""); this.type = options.type; } }
  const ctx = vm.createContext({ document, location: { pathname }, Element, HTMLElement, DocumentFragment, Document,
    Blob, URL: MyURL, atob, alert: m => alerts.push(m), confirm: m => { confirmations.push(m); return consent; },
    console: { log: m => logs.push(m) }, setTimeout: (fn, ms) => timers.push({ fn, ms }) });
  if (quiet) ctx.__boardsReceiptQuiet = true;
  const globalsBefore = Object.keys(ctx);
  vm.runInContext(src, ctx, { timeout: 5000 });
  // Quiet mode leaves exactly one global, the receipt itself (only when one was built).
  const added = Object.keys(ctx).filter(k => !globalsBefore.includes(k));
  assert.deepEqual(added, quiet && ctx.__boardsReceipt ? ["__boardsReceipt"] : [], "no globals left behind");
  const output = blobs.length ? blobs[0].text : (quiet && ctx.__boardsReceipt ? JSON.stringify(ctx.__boardsReceipt) : "");
  return { feed, traps, downloads, blobs, alerts, confirmations, logs, timers, revoked, output,
    receipt: output ? JSON.parse(output) : null };
}

const normal = run();
const { receipt } = normal;
assert.deepEqual(normal.alerts, []);
assert.equal(receipt.format, "boards-receipt-v1");
assert.equal(receipt.board.path, "/boards/id/abc");
assert.match(receipt.captured_at, /^\d{4}-\d\d-\d\dT/);
assert.equal(receipt.composer.modelInput.input.prompt.value, "Composer now: different again.");
assert.deepEqual(receipt.composer.refs.map(r => r.ordinalIndex), [1, 3]);
assert.deepEqual(receipt.results.map(r => r.resultId), ["result-first", "result-later"]);
for (let i = 0; i < 2; i++) {
  const r = receipt.results[i], original = normal.feed.results[r.resultId];
  assert.deepEqual(Buffer.from(r.modelInput.input.prompt.value), Buffer.from(prompts[i]));
  assert.equal(r.modelInput.input.prompt.value_truncated, false);
  assert.equal(r.modelInput.modelId, original.modelInput.modelId);
  for (const k of ["seed", "n", "aspectRatio", "enhancedPrompt"]) {
    assert.equal(r.modelInput.input[k].kind, original.modelInput.input[k].kind);
    assert.equal(r.modelInput.input[k].value, original.modelInput.input[k].value);
  }
  for (const k of ["width", "height", "mimeType", "resolution"])
    assert.equal(r.modelInput.input.mediaSpec[k], original.modelInput.input.mediaSpec[k]);
  for (const k of ["resultId", "operationId", "outputComponentId", "status", "startedAt", "finishedAt", "mimeType", "enhancedPrompt"])
    assert.equal(r[k], original[k]);
  assert.deepEqual(r.dimensions, original.dimensions);
  assert.equal(r.startedAt_iso, new Date(original.startedAt).toISOString());
  assert.equal(r.finishedAt_iso, new Date(original.finishedAt).toISOString());
  assert.deepEqual(r.refs.map(r => r.ordinalIndex), [1, 2]);
  const prefix = i ? "later-" : "first-";
  for (const ref of r.refs) {
    assert.equal(ref.sceneNode, prefix + "scene-" + ref.ordinalIndex);
    assert.equal(ref.resourceCollection, prefix + "collection-" + ref.ordinalIndex);
    assert.equal(ref.mentionId, prefix + "mention-" + ref.ordinalIndex);
    assert.equal(ref.mentionLabel, prefix + "Image " + ref.ordinalIndex);
  }
}
assert.deepEqual(receipt.results[0].entityIds, ["entity-b", "entity-a"]);
assert.deepEqual(receipt.results[1].entityIds, ["entity-b"]);
assert.deepEqual(receipt.results[0].image, { url_kind: "blob", has_blob_url: true,
  saved_as: "result-first.png", url: { kind: "blob" } });
assert.equal(receipt.results[1].image.saved_as, null);
assert.equal(receipt.results[1].image.url, "https://cdn.example.com/image.png");
assert.match(receipt.results[1].image.reason, /never downloaded/);
assert.deepEqual(normal.confirmations, ["Save 1 result images too?"]);
assert.equal(normal.downloads.length, 2);
// The receipt goes first so a "multiple downloads" block can't eat it.
assert.match(normal.downloads[0].name, /^boards-receipt-\d{8}-\d{6}\.json$/);
assert.deepEqual(normal.downloads[1], { href: normal.feed.resultUrls["result-first"], name: "result-first.png" });
assert.equal(normal.blobs[0].type, "application/json");
assert.deepEqual(normal.timers.map(t => t.ms), [30000]);
assert.deepEqual(normal.revoked, []);
normal.timers[0].fn();
assert.deepEqual(normal.revoked, ["blob:receipt-output"]);
assert.deepEqual(normal.traps, { getter: 0, method: 0, accessToken: 0, proxy: 0, domOverride: 0 });
assert(!/SECRET|TOKENVALUE|accessToken|existing-worker-blob/.test(normal.output));
assert.equal(receipt.history.loaded, 2);
assert.equal(receipt.history.total, 5);
assert.match(receipt.history.note, /history panel, scroll.*rerun/);
assert(receipt.warnings.some(w => /multiple downloads/.test(w)));
assert.deepEqual(normal.logs, ["Boards receipt: 2 results (history total 5), 1 images requested."]);
console.log("PASS exact receipt, ordered refs, timestamps, reverse entities, blob-only downloads and untouched traps");

for (const [change, expected] of [
  [({ store }) => { delete store._uiSyncFrontend._viewModels.auraGenerationFeed.viewModel; }, rootPath],
  [({ feed }) => { delete feed.results["result-first"].modelInput.input.prompt; }, rootPath + '.results["result-first"].modelInput.input.prompt'],
  [({ feed, traps }) => { Object.defineProperty(feed, "modelInput", { get() { traps.getter++; } }); }, rootPath + ".modelInput"],
  [({ host, traps }) => { Object.defineProperty(host, "_artboardSequenceStore", { get() { traps.getter++; } }); }, "_artboardSequenceStore"],
  [({ feed, traps }) => { Object.defineProperty(feed.resultUrls, "result-first", { get() { traps.getter++; } }); }, rootPath + '.resultUrls["result-first"]'],
  [({ feed }) => { delete feed.resultUrls["result-first"]; }, rootPath + '.resultUrls["result-first"]'],
]) {
  const r = run(change);
  const message = "Firefly changed: " + expected + " is not plain data";
  assert.deepEqual(r.alerts, [message]); assert.deepEqual(r.logs, [message]);
  assert.equal(r.downloads.length, 0); assert.equal(r.blobs.length, 0); assert.equal(r.confirmations.length, 0);
  assert(Object.values(r.traps).every(n => n === 0));
}
console.log("PASS missing and accessor paths fail exactly, without files or getter calls");

const redacted = run(({ feed }) => {
  feed.modelInput.input.prompt.value = "Visit https://user:pass@example.com/a?sig=SECRET#frag " + jwt + " blob:https://example.com/SECRET";
  feed.results["result-first"].modelInput.input.prompt.value = "x".repeat(20001);
  Object.defineProperty(feed.results, "accessToken", { get() { throw Error("must not inspect sensitive key"); } });
});
assert(!redacted.alerts.length);
assert(!/SECRET|TOKENVALUE|eyJhbGci|user:pass|accessToken/.test(redacted.output));
assert.match(redacted.receipt.composer.modelInput.input.prompt.value, /https:\/\/example.com\/a \[REDACTED JWT\]/);
assert.equal(redacted.receipt.results[0].modelInput.input.prompt.value.length, 20000);
assert.equal(redacted.receipt.results[0].modelInput.input.prompt.value_truncated, true);
console.log("PASS embedded URL/JWT redaction, sensitive dictionary keys and truncation flags");

const declined = run(() => {}, false);
assert.equal(declined.downloads.length, 1);
assert.equal(declined.receipt.results[0].image.saved_as, null);
const missingUrl = run(({ feed }) => { feed.resultUrls["result-first"] = null; });
assert.equal(missingUrl.receipt.results[0].image.url_kind, "missing");
assert.equal(missingUrl.confirmations.length, 0);
const unsafe = run(({ feed }) => { feed.results["result-first"].mimeType = "application/octet-stream"; });
assert.equal(unsafe.receipt.results[0].image.saved_as, null);
const route = run(() => {}, true, "/boards/not-a-board");
assert.deepEqual(route.alerts, ["Open a Firefly board first."]);
assert.equal(route.downloads.length, 0);
console.log("PASS consent declined, null URL, unsupported MIME and route guard");
// History-loaded results carry refs without sceneNode (firefly-boards-pilot addition, seen live 2026-10-13).
const noScene = run(({ feed }) => { delete feed.results["result-later"].snapshotPrompts[0].sceneNode; });
assert.deepEqual(noScene.alerts, []);
assert.equal(noScene.receipt.results[1].refs.find(r => r.ordinalIndex === 2).sceneNode, null);
assert.equal(noScene.receipt.results[1].refs.find(r => r.ordinalIndex === 1).sceneNode, "later-scene-1");
const accessorScene = run(({ feed, traps }) => { Object.defineProperty(feed.results["result-later"].snapshotPrompts[0], "sceneNode", { get() { traps.getter++; } }); });
assert.equal(accessorScene.alerts.length, 1); assert.match(accessorScene.alerts[0], /sceneNode is not plain data/);
assert.equal(accessorScene.traps.getter, 0);
console.log("PASS result refs without sceneNode export as null; an accessor sceneNode still fails without being called");
// History results can also lack mediaSpec and a ref's mention fields (firefly-boards-pilot addition, seen live).
const sparse = run(({ feed }) => {
  delete feed.results["result-later"].modelInput.input.mediaSpec;
  const ap = feed.results["result-later"].snapshotPrompts[0].additionalParams;
  delete ap.mentionId; delete ap.ordinalIndex; delete ap.mentionLabel;
});
assert.deepEqual(sparse.alerts, []);
assert.equal(sparse.receipt.results[1].modelInput.input.mediaSpec, null);
assert.deepEqual(sparse.receipt.results[1].refs.map(r => r.ordinalIndex), [1, null]);
assert.equal(sparse.receipt.results[1].refs[1].mentionLabel, null);
const noParams = run(({ feed }) => { feed.results["result-later"].snapshotPrompts[0].additionalParams = undefined; });
assert.deepEqual(noParams.alerts, []);
assert.deepEqual(noParams.receipt.results[1].refs.map(r => r.ordinalIndex), [1, null]);
const composerMissing = run(({ feed }) => { delete feed.snapshotPromptValues[0].parameters.ordinalIndex; });
assert.equal(composerMissing.alerts.length, 1);
console.log("PASS sparse history results (no mediaSpec, ref without mention fields) export with nulls; composer refs stay strict");
// Quiet mode (firefly-boards-pilot addition): no dialogs, no downloads, receipt left in globalThis.__boardsReceipt.
const quiet = run(() => {}, true, "/boards/id/abc", true);
assert.deepEqual(quiet.alerts, []); assert.deepEqual(quiet.confirmations, []);
assert.equal(quiet.downloads.length, 0); assert.equal(quiet.blobs.length, 0);
assert.equal(quiet.receipt.format, "boards-receipt-v1");
assert.deepEqual(quiet.receipt.results.map(r => r.resultId), ["result-first", "result-later"]);
assert.equal(quiet.receipt.results[0].image.saved_as, null);
assert(quiet.receipt.warnings.some(w => /Quiet mode/.test(w)));
assert.match(quiet.logs.at(-1), /quiet mode/);
const quietRoute = run(() => {}, true, "/boards/not-a-board", true);
assert.deepEqual(quietRoute.alerts, []); assert.deepEqual(quietRoute.logs, ["Open a Firefly board first."]);
assert.equal(quietRoute.downloads.length, 0);
const quietFail = run(({ store }) => { delete store._uiSyncFrontend._viewModels.auraGenerationFeed.viewModel; }, true, "/boards/id/abc", true);
assert.deepEqual(quietFail.alerts, []);
assert.deepEqual(quietFail.logs, ["Firefly changed: " + rootPath + " is not plain data"]);
assert.equal(quietFail.downloads.length, 0);
console.log("PASS quiet mode: no dialogs, no downloads, receipt in globalThis.__boardsReceipt; route guard and failures log only");
if (process.argv.includes("--json")) process.stdout.write("\nRECEIPT_JSON\n" + normal.output);
