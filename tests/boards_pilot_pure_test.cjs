// Tests for the parts of skill/boards_pilot.js that need no page: install, frame()/checkFrame(), layoutPlan(),
// slotRight(). Run: node tests/boards_pilot_pure_test.cjs
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "..", "skill", "boards_pilot.js"), "utf8");
const ctx = { innerWidth: 1920, innerHeight: 911, devicePixelRatio: 1 };
ctx.window = ctx;
vm.createContext(ctx);

// Objects made inside the vm context have that context's prototypes; compare plain copies.
const plain = o => JSON.parse(JSON.stringify(o));
let passed = 0;
function test(name, fn) { fn(); passed++; console.log("PASS " + name); }

test("installs and reports its version", () => {
  const out = vm.runInContext(src, ctx);
  assert.match(out, /^boards_pilot v\d+ installed$/);
  assert.strictEqual(typeof ctx.__bp.layoutPlan, "function");
  assert.strictEqual(vm.runInContext(src, ctx), "boards_pilot v" + ctx.__bp.version + " already installed");
});

test("frame() guesses the screenshot scale and frame(W) sets it", () => {
  const auto = ctx.__bp.frame();
  assert.ok(Math.abs(auto.k - 1568 / 1920) < 1e-9);
  assert.strictEqual(auto.auto, true);
  assert.strictEqual(ctx.__bp.frame(1568).k, 1568 / 1920);
  ctx.innerWidth = 1280; ctx.innerHeight = 700;
  assert.strictEqual(ctx.__bp.frame().k, 1); // never scale up
  ctx.innerWidth = 1920; ctx.innerHeight = 911;
  ctx.__bp.frame(1568);
});

test("checkFrame() throws after the window is resized", () => {
  ctx.__bp.checkFrame();
  ctx.innerHeight = 855;
  assert.throws(() => ctx.__bp.checkFrame(), /window changed from 1920x911@1 to 1920x855@1/);
  ctx.__bp.frame(1568);
  ctx.__bp.checkFrame();
});

test("layoutPlan() puts items on an equal-cell grid", () => {
  const plan = ctx.__bp.layoutPlan(
    [{ label: "a", w: 1200, h: 897 }, { label: "b", w: 1000, h: 1000 }, { label: "c", w: 1200, h: 897 }],
    { x: 100, y: 50, cols: 2 });
  assert.deepStrictEqual(plan.map(p => [p.label, p.x, p.y]), [["a", 100, 50], ["b", 1496, 50], ["c", 100, 1246]]);
  const custom = ctx.__bp.layoutPlan([{ label: "a", w: 10, h: 10 }, { label: "b", w: 10, h: 10 }],
    { cols: 1, gap: 5, rowGap: 20, cell: { w: 30, h: 40 } });
  assert.deepStrictEqual(custom.map(p => [p.x, p.y]), [[0, 0], [0, 60]]);
});

test("slotRight() keeps the top edge and the board gap", () => {
  assert.deepStrictEqual(plain(ctx.__bp.slotRight({ x: 0, y: -10, w: 1200, h: 897 })), { x: 1396, y: -10, w: 1200, h: 897 });
  assert.deepStrictEqual(plain(ctx.__bp.slotRight({ x: 0, y: 0, w: 100, h: 50 }, { w: 30, h: 40 }, 10)), { x: 110, y: 0, w: 30, h: 40 });
});

console.log(passed + " passed");
