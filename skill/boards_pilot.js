;(() => {
  "use strict";
  // boards_pilot.js v7 (firefly-boards-pilot; first written 2026-10-13 as show_tools/boards_pilot.js v4; v6 2026-10-14
  // added DOM controls, placement plans and batch gates; v7 the same day fixes what the first live round found):
  // helpers for an agent piloting Adobe Firefly Boards through a browser agent (built with Claude in Chrome).
  // Install by running this file's text with the javascript tool (page MAIN world), once per page load; it defines
  // window.__bp. Everything is READ-ONLY: Boards' view models are read through plain data properties only, never a
  // getter or an app method; page elements through standard DOM reads (boxes, text, attributes); no network.
  // The one exception is ghost(), which sets a CSS style on the generation feed element and restores it.
  // Coordinates: "page" = CSS px of the browser viewport; "world" = board units, stable while an item is not moved:
  // world = (page - origin - t) / scale. "shot" = the agent's screenshot frame = page * K, where K is set once with
  // frame(screenshot width); K = 1 at 100 % Chrome zoom.
  const VERSION = 7;
  if (window.__bp && window.__bp.version === VERSION) return "boards_pilot v" + VERSION + " already installed";

  const attempt = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };
  // A plain data property's value; undefined for getters, absent keys and errors.
  const own = (o, k) => attempt(() => {
    const d = o !== null && typeof o === "object" ? Object.getOwnPropertyDescriptor(o, k) : null;
    return d && "value" in d ? d.value : undefined;
  }, undefined);
  // Many view-model fields are wrappers {values, enabled, indeterminate, value}.
  const unwrap = v => (v && typeof v === "object" && "enabled" in v && "value" in v) ? v.value : v;
  const field = (o, k) => unwrap(own(o, k));

  function walk(test, limit = 150000) {
    const todo = [document.documentElement]; let n = 0;
    while (todo.length && n < limit) {
      const el = todo.pop(); n++;
      if (test(el)) return el;
      if (el.shadowRoot) todo.push(...el.shadowRoot.children);
      todo.push(...el.children);
    }
    return null;
  }
  const cache = {};
  function cached(key, test) {
    if (!cache[key] || !cache[key].isConnected) cache[key] = walk(test);
    return cache[key];
  }
  function viewModels() {
    const host = cached("host", el => own(el, "_artboardSequenceStore") !== undefined);
    if (!host) throw new Error("Boards changed: no element carries _artboardSequenceStore");
    const m = own(own(own(host, "_artboardSequenceStore"), "_uiSyncFrontend"), "_viewModels");
    if (!m || typeof m !== "object") throw new Error("Boards changed: _uiSyncFrontend._viewModels is not plain data");
    return m;
  }
  const vm = name => own(viewModels()[name], "viewModel");
  const box = el => { const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };

  function camera() {
    const c = vm("canvas");
    const cam = { tx: field(c, "tx"), ty: field(c, "ty"), scale: field(c, "scale"), viewport: field(c, "renderViewport") };
    for (const k of ["tx", "ty", "scale"]) if (typeof cam[k] !== "number") throw new Error("Boards changed: canvas." + k);
    return cam;
  }
  // Page position of the canvas viewport's top-left: the <canvas id="canvas-input-container"> wrapper, below the
  // 48 px header at 100 % zoom (#main-area starts at y = 0, so it is the wrong anchor; checked 2026-10-13).
  function origin() {
    const c = cached("canvasEl", el => el.id === "canvas-input-container" || el.id === "canvas-0");
    if (!c) throw new Error("Boards changed: #canvas-input-container not found");
    const b = box(c); return { x: b.x, y: b.y };
  }
  function toWorld(p, cam = camera(), o = origin()) {
    return { x: (p.x - o.x - cam.tx) / cam.scale, y: (p.y - o.y - cam.ty) / cam.scale, w: p.w / cam.scale, h: p.h / cam.scale };
  }
  function toPage(w, cam = camera(), o = origin()) {
    return { x: Math.round(w.x * cam.scale + cam.tx + o.x), y: Math.round(w.y * cam.scale + cam.ty + o.y),
      w: Math.round(w.w * cam.scale), h: Math.round(w.h * cam.scale) };
  }

  function selection() {
    const s = vm("selection"), o = origin(), cam = camera();
    const count = field(s, "selectedNodeCount"), types = field(s, "types");
    if (!count) return { count: 0, types };
    const v = { x: field(s, "x"), y: field(s, "y"), w: field(s, "width"), h: field(s, "height") };
    const page = { x: Math.round(v.x + o.x), y: Math.round(v.y + o.y), w: Math.round(v.w), h: Math.round(v.h) };
    return { count, types, page, world: toWorld(page, cam, o) };
  }

  // The selection view model is mirrored from Boards' worker, so it updates a beat AFTER a click (a read straight after
  // a click returns the previous selection; seen 2026-10-13). Take stamp() before the click, then await settled(stamp).
  // Each update REPLACES the view-model object, so never cache one: a cached object's lastChanged never moves. vm()
  // re-reads from the store on every call (measured: the stamp changed ~50 ms after the click).
  function stamp() { return field(vm("selection"), "lastChanged"); }
  async function settled(before, timeoutMs = 2000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (stamp() !== before) { await new Promise(r => setTimeout(r, 60)); return selection(); }
      await new Promise(r => setTimeout(r, 50));
    }
    return { timeout: true, ...selection() };
  }

  // Everything drawn over the canvas that can swallow a click.
  function occluders() {
    const out = [];
    const feed = cached("feed", el => el.localName === "aura-generation-feed");
    if (feed && visible(feed)) {
      const panel = walk(el => el.localName === "aura-prompt-bar");
      if (panel && visible(panel)) out.push({ what: "generate panel", ...box(panel) });
      // The filmstrip of recent results above the panel (aura-generation-feed-results, checked 2026-10-13).
      const strip = walk(el => el.localName === "aura-generation-feed-results");
      if (strip && visible(strip) && box(strip).h > 20) out.push({ what: "results strip", ...box(strip) });
    }
    const side = walk(el => /^aura-.*(history|side-?panel)/i.test(el.localName) && visible(el) && box(el).w > 200);
    if (side) out.push({ what: "side panel", ...box(side) });
    // The floating toolbar above a selected item (Load, Vary, Edit, ...). A drop that ends on it does nothing
    // (2026-10-14: a result dropped onto the previous result's toolbar was never placed).
    const tb = selectionToolbar();
    if (tb) out.push({ what: "selection toolbar", ...tb });
    return out;
  }
  function selectionToolbar() {
    const names = /^(Load|Vary|Edit|Convert|Create element|More|Download|Crop|Link options|Remove background)$/;
    const els = [];
    const todo = [document.documentElement];
    while (todo.length) {
      const el = todo.pop();
      if (el.localName === "sp-action-button" && visible(el) &&
          (names.test((el.innerText || "").trim()) || names.test(el.getAttribute("aria-label") || ""))) els.push(box(el));
      if (el.shadowRoot) todo.push(...el.shadowRoot.children);
      todo.push(...el.children);
    }
    // Keep only the row that holds Vary, so a stray "More" elsewhere on the page can't stretch the box.
    const vary = els.find(b => b.w > 40 && els.filter(o => Math.abs(o.y - b.y) <= 4).length >= 3);
    if (!vary) return null;
    const row = els.filter(b => Math.abs(b.y - vary.y) <= 4);
    const x = Math.min(...row.map(b => b.x)) - 8, y = Math.min(...row.map(b => b.y)) - 8;
    return { x, y, w: Math.max(...row.map(b => b.x + b.w)) + 8 - x, h: Math.max(...row.map(b => b.y + b.h)) + 8 - y };
  }
  // A clickable interior point of a page box: inside the canvas viewport, outside every occluder.
  function visiblePoint(p, pad = 6) {
    const cam = camera(), o = origin(), vp = cam.viewport || { width: innerWidth, height: innerHeight - o.y };
    const occ = occluders();
    const left = Math.max(p.x + pad, o.x + 60), right = Math.min(p.x + p.w - pad, o.x + vp.width - 60);
    const top = Math.max(p.y + pad, o.y), bottom = Math.min(p.y + p.h - pad, o.y + vp.height);
    if (left >= right || top >= bottom) return null;
    const inside = (x, y) => occ.some(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    const steps = 9; let best = null, bestD = Infinity;
    const cx = (p.x + p.w / 2), cy = (p.y + p.h / 2);
    for (let i = 0; i <= steps; i++) for (let j = 0; j <= steps; j++) {
      const x = left + (right - left) * i / steps, y = top + (bottom - top) * j / steps;
      if (inside(x, y)) continue;
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (d < bestD) { bestD = d; best = { x: Math.round(x), y: Math.round(y) }; }
    }
    return best;
  }

  function feedVM() { return vm("auraGenerationFeed"); }
  function refs() {
    const raw = unwrap(own(feedVM(), "snapshotPromptValues"));
    if (!Array.isArray(raw)) return [];
    return raw.map(r => { const p = own(r, "parameters") || {};
      return { label: own(p, "mentionLabel"), ord: own(p, "ordinalIndex"), node: own(r, "sceneNode"), usage: own(r, "usageType") }; })
      .sort((a, b) => a.ord - b.ord);
  }
  function prompt() {
    const mi = unwrap(own(feedVM(), "modelInput")) || {};
    const input = own(mi, "input") || {}; const text = own(own(input, "prompt"), "value");
    return { model: own(mi, "modelId"), aspect: own(mi, "aspectRatio"), n: own(mi, "n"),
      promptChars: typeof text === "string" ? text.length : null,
      promptHead: typeof text === "string" ? text.slice(0, 80) : null, refs: refs() };
  }
  function resultIds() { const r = unwrap(own(feedVM(), "results")); return r && typeof r === "object" ? Object.keys(r) : []; }
  function result(id) {
    const r = own(unwrap(own(feedVM(), "results")), id); if (!r) return null;
    const mi = own(r, "modelInput") || {}; const text = own(own(own(mi, "input"), "prompt"), "value");
    const snaps = own(r, "snapshotPrompts");
    return { id, status: own(r, "status"), model: own(mi, "modelId"), startedAt: own(r, "startedAt"),
      finishedAt: own(r, "finishedAt") ?? null, promptChars: typeof text === "string" ? text.length : null,
      refNodes: Array.isArray(snaps) ? snaps.map(s => own(s, "sceneNode")).filter(Boolean) : null };
  }
  function newResults(baseline) { const before = new Set(baseline || []); return resultIds().filter(id => !before.has(id)).map(result); }

  // The one write: make the generation feed (panel + results strip) invisible and click-through, or restore it.
  function ghost(on) {
    const feed = cached("feed", el => el.localName === "aura-generation-feed");
    if (!feed) throw new Error("Boards changed: aura-generation-feed not found");
    if (on) {
      if (!window.__bpGhost) window.__bpGhost = { vis: feed.style.visibility, pe: feed.style.pointerEvents };
      feed.style.visibility = "hidden"; feed.style.pointerEvents = "none"; return "ghost on";
    }
    const g = window.__bpGhost || { vis: "", pe: "" };
    feed.style.visibility = g.vis; feed.style.pointerEvents = g.pe; delete window.__bpGhost; return "ghost off";
  }

  // ---- v6: DOM controls, exact placement, batch gates ----
  // A browser_batch fixes every click coordinate in advance and stops at the first tool error. So: read the controls
  // and plans first, then send one batch whose JS steps are GATES. A gate throws when the page is not as expected,
  // which stops the batch before the next click; a Generate click can never follow a wrong setup.
  let K = 1;
  function frame(shotWidth) { K = shotWidth / innerWidth; return K; }
  const shot = p => ({ x: Math.round(p.x * K), y: Math.round(p.y * K) });
  const centre = b => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
  const ctl = el => { if (!el || !visible(el)) return null; const b = box(el); return { page: b, click: shot(centre(b)) }; };
  const text = el => (el.innerText || "").trim().replace(/\s+/g, " ");
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function walkAll(root, test, limit = 150000) {
    const out = [], todo = [root]; let n = 0;
    while (todo.length && n < limit) {
      const el = todo.pop(); n++;
      if (test(el)) out.push(el);
      if (el.shadowRoot) todo.push(...el.shadowRoot.children);
      todo.push(...el.children);
    }
    return out;
  }
  function fail(msg) { throw new Error("boards_pilot gate: " + msg); }

  // Page boxes and click points (shot frame) of the controls a round uses (element names checked 2026-10-14).
  function controls() {
    const bar = walk(el => el.localName === "aura-prompt-bar");
    const open = !!bar && visible(bar);
    const inBar = test => open ? walkAll(bar, test).find(visible) || null : null;
    const picker = walkAll(document.documentElement, el => el.localName === "sp-picker" && box(el).y < 80 &&
      /^\d+%$/.test(text(el))).find(visible);
    const opener = open ? null : walkAll(document.documentElement, el => /^(button|sp-button|sp-action-button)$/.test(el.localName) &&
      text(el) === "Generate image" && box(el).y > innerHeight - 160).find(visible);
    return { k: K, panelOpen: open,
      openGenerate: ctl(opener),
      imageSlot: ctl(inBar(el => el.classList && el.classList.contains("reference") && el.classList.contains("placeholder"))),
      prompt: ctl(inBar(el => el.getAttribute && el.getAttribute("contenteditable") === "true")),
      generate: ctl(inBar(el => el.localName === "sp-button" && text(el) === "Generate")),
      close: ctl(inBar(el => el.localName === "sp-action-button" && el.getAttribute("aria-label") === "Close")),
      zoom: ctl(picker), zoomLabel: picker ? text(picker) : null,
      thumbs: thumbs() };
  }
  // The results filmstrip, left to right (the newest result sits at the right end). Each thumbnail element carries its
  // result id as a plain data property, __resultId. click is null for a thumbnail scrolled out of the strip.
  function thumbs() {
    const strip = walk(el => el.localName === "aura-generation-feed-results");
    if (!strip || !visible(strip)) return [];
    const sb = box(strip);
    return walkAll(strip, el => el.localName === "aura-generation-history-thumbnail").map(el => {
      const b = box(el), id = own(el, "__resultId");
      const inStrip = b.w > 0 && b.x >= sb.x - 1 && b.x + b.w <= sb.x + sb.w + 1;
      return { resultId: typeof id === "string" ? id : null, page: b, click: inStrip ? shot(centre(b)) : null };
    }).sort((a, b) => a.page.x - b.page.x);
  }
  function thumb(resultId) { return thumbs().find(t => t.resultId === resultId) || null; }
  // A visible zoom-menu item (the menu must be open). Throws otherwise: the zoom menu can miss its first click.
  function menuItem(label) {
    const el = walkAll(document.documentElement, el => el.localName === "sp-menu-item" && text(el).startsWith(label)).find(visible);
    if (!el) fail(`menu item "${label}" not visible (is the zoom menu open?)`);
    return ctl(el);
  }

  // A page point the agent can click on the canvas: inside the viewport, off the side toolbars, outside occluders.
  function clickable(p) {
    const cam = camera(), o = origin(), vp = cam.viewport || { width: innerWidth, height: innerHeight - o.y };
    if (p.x < o.x + 60 || p.x > o.x + vp.width - 60 || p.y < o.y || p.y > o.y + vp.height) return false;
    return !occluders().some(r => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
  }
  // The slot right of an item on the board (world boxes), top-aligned, with the board's usual 196-unit gap.
  function slotRight(anchor, size, gap = 196) {
    return { x: anchor.x + anchor.w + gap, y: anchor.y, w: size ? size.w : anchor.w, h: size ? size.h : anchor.h };
  }
  // One drag from a result's filmstrip thumbnail onto a slot. Boards puts the placed item's top-left NEAR the drop
  // point: measured 2026-10-14 from exact (32 %, 74 % zoom) to 64 page px off (33 %, where a drop next to a neighbour
  // ended flush against it). So always check offWorld() after the drop, and fix with one movePlan() drag when it is
  // more than ~20 units off. {ok:false} when the thumbnail or the drop point is not clickable (off-screen, under the
  // panel, or under a selected item's toolbar): plan again after the previous drop, or drop anywhere visible and move.
  function dropPlan(resultId, slot) {
    const t = thumb(resultId);
    if (!t || !t.click) return { ok: false, reason: "thumbnail not visible in the filmstrip" };
    const tl = toPage({ x: slot.x, y: slot.y, w: 0, h: 0 });
    if (!clickable(tl)) return { ok: false, reason: "slot top-left is off the canvas or under an occluder", slotPage: tl };
    return { ok: true, from: t.click, to: shot(tl), zoom: camera().scale };
  }
  // The drag that moves the SELECTED item onto a slot: grab an interior point and move it by (slot - box). The grab
  // point is chosen so that both it and its destination are clickable (an item half off-screen still works), nearest
  // the item's centre first.
  function movePlan(slot) {
    const s = selection();
    if (!s.count) return { ok: false, reason: "nothing selected" };
    const t = toPage(slot), dx = t.x - s.page.x, dy = t.y - s.page.y;
    let best = null;
    for (let i = 1; i < 10; i++) for (let j = 1; j < 10; j++) {
      const g = { x: s.page.x + s.page.w * i / 10, y: s.page.y + s.page.h * j / 10 }, to = { x: g.x + dx, y: g.y + dy };
      const d = (i - 5) ** 2 + (j - 5) ** 2;
      if ((!best || d < best.d) && clickable(g) && clickable(to)) best = { d, g, to };
    }
    if (!best) return { ok: false, reason: "no grab point whose destination is clickable: zoom out or pan" };
    return { ok: true, from: shot(best.g), to: shot(best.to), off: offWorld(slot) };
  }
  // How far the selected item's top-left sits from a slot, in world units.
  function offWorld(slot) {
    const s = selection();
    return s.count ? { dx: Math.round(s.world.x - slot.x), dy: Math.round(s.world.y - slot.y) } : null;
  }
  // Click pairs (Image slot, then item) that attach world boxes as refs, in order, for ONE batch. The Image slot moves
  // right one chip pitch per attached ref (138 page px at 67 % Chrome zoom, 2026-10-14), so its later positions are
  // predicted. Put `await __bp.expectRefs(n)` after each pair: a miss stops the batch.
  function attachPlan(worldBoxes) {
    const c = controls();
    if (!c.imageSlot) fail("Image slot not visible (is the Generate panel open?)");
    const have = refs().length, s = c.imageSlot.page;
    const bar = walk(el => el.localName === "aura-prompt-bar"), bb = box(bar);
    const chips = walkAll(bar, el => el.localName === "img" && visible(el) && box(el).w > 80).map(box).sort((a, b) => a.x - b.x);
    const pitch = have && chips.length ? (s.x - chips[0].x) / have : 138;
    return worldBoxes.map((w, i) => {
      const slot = { x: s.x + s.w / 2 + i * pitch, y: s.y + s.h / 2 };
      const item = visiblePoint(toPage(w));
      return { n: have + i + 1, slot: slot.x < bb.x + bb.w - 40 ? shot(slot) : null, item: item ? shot(item) : null };
    });
  }

  // Gates. assertReady throws unless the panel holds the expected model, refs (node-id prefixes, in order) and prompt
  // length. expectRefs waits for the n-th ref (refs() lags a click by up to ~1 s). waitNew waits in the page until every
  // new result has left "loading".
  function assertReady({ model, refs: want, chars } = {}) {
    const p = prompt();
    if (model && p.model !== model) fail(`model ${p.model} != ${model}`);
    if (want) {
      const got = p.refs.map(r => r.node || "");
      if (got.length !== want.length || want.some((w, i) => !got[i].startsWith(w)))
        fail(`refs [${got.map(g => g.slice(0, 8)).join(", ")}] != [${want.join(", ")}]`);
    }
    if (chars != null && p.promptChars !== chars) fail(`prompt is ${p.promptChars} chars, expected ${chars}`);
    return p;
  }
  async function expectRefs(n, timeoutMs = 3000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) { const r = refs(); if (r.length === n) return r; await sleep(150); }
    fail(`expected ${n} refs, have ${refs().length}`);
  }
  // count = how many new results to wait for. Without it, waitNew returns as soon as every result that exists so far
  // is final, so a second generation that has not appeared yet is missed (seen 2026-10-14).
  async function waitNew(baseline, timeoutMs = 120000, count = 1) {
    const pending = s => s == null || /^(loading|pending|queued|running)$/i.test(s);
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const r = newResults(baseline);
      if (r.length >= count && r.every(x => x && !pending(x.status))) return r;
      await sleep(1000);
    }
    return { timeout: true, results: newResults(baseline) };
  }
  // GATE: waits until a control from controls() is present at the planned click point. Right after a Generate
  // click, the Generate button is missing for a moment while Boards re-renders the panel (seen 2026-10-14).
  async function expectControl(name, at, tol = 4, timeoutMs = 2000) {
    const t0 = Date.now(); let c = null;
    while (Date.now() - t0 < timeoutMs) {
      c = controls()[name];
      if (c && Math.abs(c.click.x - at.x) <= tol && Math.abs(c.click.y - at.y) <= tol) return c;
      await sleep(150);
    }
    fail(`${name} is not at ${at.x},${at.y}: ${JSON.stringify(c && c.click)}`);
  }
  // GATE before a filmstrip drag: the panel is open and the result's thumbnail is at the planned point. Without it, a
  // closed panel turns the drag into a drag of whatever canvas item lies under that point (seen 2026-10-14).
  function expectThumb(resultId, at, tol = 4) {
    const t = thumb(resultId);
    if (!t || !t.click || Math.abs(t.click.x - at.x) > tol || Math.abs(t.click.y - at.y) > tol)
      fail(`thumbnail ${String(resultId).slice(0, 8)} is not at ${at.x},${at.y}: ${JSON.stringify(t && t.click)}`);
    return t;
  }

  function observe() {
    const cam = camera();
    return { version: VERSION, board: (location.pathname.match(/urn:[^/]+/) || [null])[0],
      dpr: devicePixelRatio, inner: [innerWidth, innerHeight], origin: origin(),
      camera: { tx: Math.round(cam.tx), ty: Math.round(cam.ty), scale: cam.scale, viewport: cam.viewport },
      selection: selection(), occluders: occluders(), prompt: prompt(),
      results: resultIds().length, undo: field(vm("undoInfo"), "undoOperationTitle"),
      ghost: !!window.__bpGhost };
  }

  window.__bp = { version: VERSION, observe, camera, origin, toWorld, toPage, selection, stamp, settled, occluders, visiblePoint,
    refs, prompt, resultIds, result, newResults, ghost,
    frame, controls, thumbs, thumb, menuItem, clickable, slotRight, dropPlan, movePlan, offWorld, attachPlan,
    assertReady, expectRefs, waitNew, expectControl, expectThumb };
  return "boards_pilot v" + VERSION + " installed";
})()
