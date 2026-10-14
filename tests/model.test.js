import test from "node:test";
import assert from "node:assert/strict";
import {
  initialProject,
  validateProject,
  removeScene,
  analytics,
  csv,
} from "../src/model.js";
import { corners, match, translation, blend } from "../src/vision.js";
test("initial graph validates and all navigation links resolve", () => {
  const p = initialProject();
  validateProject(p);
  const ids = new Set(p.scenes.map((s) => s.id));
  assert.ok(
    p.scenes.every((s) =>
      s.hotspots.every((h) => h.kind === "info" || ids.has(h.target)),
    ),
  );
});
test("invalid graph edits and nonfinite hotspot coordinates are rejected", () => {
  for (const mutate of [
    (p) => (p.scenes[0].hotspots[0].target = "missing"),
    (p) => (p.scenes[0].hotspots[0].yaw = NaN),
    (p) => (p.scenes[0].map = [2, 0]),
    (p) => (p.scenes[1].id = p.scenes[0].id),
    (p) => (p.start = "missing"),
  ]) {
    const p = initialProject();
    mutate(p);
    assert.throws(() => validateProject(p));
  }
});
test("scene deletion removes incoming links and preserves a start scene", () => {
  const p = removeScene(initialProject(), "lobby");
  assert.notEqual(p.start, "lobby");
  assert.ok(
    p.scenes.every((s) => s.hotspots.every((h) => h.target !== "lobby")),
  );
  while (p.scenes.length > 1) removeScene(p, p.scenes[0].id);
  assert.throws(() => removeScene(p, p.start));
});
test("activity totals use observed entries and clicks without invented visitors", () => {
  const p = initialProject(),
    events = [
      { type: "visit", scene: "lobby" },
      { type: "visit", scene: "lobby" },
      { type: "visit", scene: "suite" },
      { type: "hotspot", scene: "lobby" },
    ];
  const a = analytics(events, p.scenes);
  assert.equal(a.visits, 3);
  assert.equal(a.unique, 2);
  assert.equal(a.clicks, 1);
  assert.equal(a.completion, 50);
});
test("feather blending output dimensions and overlap colors are deterministic", () => {
  const image = (r, b) => ({
      width: 20,
      height: 10,
      data: Uint8ClampedArray.from(
        Array.from({ length: 200 }, () => [r, 0, b, 255]).flat(),
      ),
    }),
    out = blend([image(255, 0), image(0, 255)], 0.5);
  assert.equal(out.width, 30);
  assert.equal(out.data[0], 255);
  assert.equal(out.data[29 * 4 + 2], 255);
  assert.ok(out.data[15 * 4] > 0 && out.data[15 * 4 + 2] > 0);
  assert.throws(() => blend([], 0.5));
  assert.throws(() => blend([image(0, 0), image(0, 0)], 0.9));
});
test("Harris detection rejects flat images and detects textured corners", () => {
  const w = 80,
    h = 60,
    data = new Uint8ClampedArray(w * h * 4);
  const blank = { width: w, height: h, data };
  assert.equal(corners(blank).length, 0);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 3; c++)
        data[(y * w + x) * 4 + c] =
          x > 20 && x < 55 && y > 20 && y < 45 ? 255 : 0;
  assert.ok(corners(blank).length >= 4);
});
test("patch matching recovers a known translation", () => {
  const a = Array.from({ length: 8 }, (_, i) => ({
      x: i * 10,
      y: i * 4,
      descriptor: Array.from({ length: 8 }, (_, j) => (i === j ? 1 : 0)),
    })),
    b = a.map((p) => ({ ...p, x: p.x - 23, y: p.y + 5 })),
    matches = match(a, b),
    t = translation(matches);
  assert.equal(matches.length, 8);
  assert.equal(t.dx, 23);
  assert.equal(t.dy, -5);
  assert.equal(t.rms, 0);
  assert.equal(translation([]), null);
});
test("project JSON roundtrip and CSV escaping retain user text safely", () => {
  const p = initialProject();
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))), p);
  assert.equal(csv([["=SUM(A1)", 'a"b']]), '"\'=SUM(A1)","a""b"');
});

test("removed scenes do not inflate current tour completion", () => {
  const p = initialProject(),
    events = [
      ...p.scenes.map((s) => ({ type: "visit", scene: s.id })),
      { type: "visit", scene: "deleted-scene" },
    ];
  const a = analytics(events, p.scenes);
  assert.equal(a.completion, 100);
  assert.equal(a.unique, 4);
  assert.equal(a.visits, 5);
});
