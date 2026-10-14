;(() => {
  "use strict";
  // boards_pilot.js v5 (firefly-boards-pilot; first written 2026-10-13 as show_tools/boards_pilot.js v4):
  // helpers for an agent piloting Adobe Firefly Boards through a browser agent (built with Claude in Chrome).
  // Install by running this file's text with the javascript tool (page MAIN world), once per page load; it defines
  // window.__bp. Everything is READ-ONLY: plain data properties only, never a getter or an app method, no network.
  // The one exception is ghost(), which sets a CSS style on the generation feed element and restores it.
  // Coordinates: "page" = CSS px of the browser viewport (what the agent clicks; screenshots are in this frame);
  // "world" = board units, stable while an item is not moved: world = (page - origin - t) / scale.
  const VERSION = 5;
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
    return out;
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
    refs, prompt, resultIds, result, newResults, ghost };
  return "boards_pilot v" + VERSION + " installed";
})()
