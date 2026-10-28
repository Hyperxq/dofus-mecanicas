import { test } from "node:test";
import assert from "node:assert/strict";
import { applyEdit } from "../selatrop-portales/js/editor.js";

const base = () => ({
  cols: 15, rows: 15,
  blocked: new Set(["5,5"]),
  portals: [{ id: "A", x: 2, y: 2 }],
  caster: { x: 0, y: 0 },
  entities: [{ id: "m1", name: "Muñeco 1", x: 7, y: 7 }],
});

test("the caster tool moves the caster to a free cell", () => {
  const { state, changed } = applyEdit(base(), "caster", { x: 9, y: 3 });
  assert.equal(changed, true);
  assert.deepEqual(state.caster, { x: 9, y: 3 });
});

test("the caster tool refuses occupied cells", () => {
  for (const c of [{ x: 5, y: 5 }, { x: 7, y: 7 }, { x: 2, y: 2 }]) {
    const { state, changed, message } = applyEdit(base(), "caster", c);
    assert.equal(changed, false);
    assert.ok(message);
    assert.deepEqual(state.caster, { x: 0, y: 0 });
  }
});

test("the dummy tool adds a numbered dummy and toggles it off", () => {
  const added = applyEdit(base(), "dummy", { x: 3, y: 9 });
  assert.deepEqual(added.state.entities.at(-1), { id: "m2", name: "Enemigo 2", x: 3, y: 9 });
  const removed = applyEdit(added.state, "dummy", { x: 3, y: 9 });
  assert.deepEqual(removed.state.entities.map((e) => e.id), ["m1"]);
});

test("the rock tool toggles obstacles only on free cells", () => {
  assert.equal(applyEdit(base(), "rock", { x: 4, y: 4 }).state.blocked.has("4,4"), true);
  assert.equal(applyEdit(base(), "rock", { x: 5, y: 5 }).state.blocked.has("5,5"), false);
  assert.equal(applyEdit(base(), "rock", { x: 7, y: 7 }).changed, false);
});

test("the erase tool removes whatever sits on the cell", () => {
  assert.equal(applyEdit(base(), "erase", { x: 7, y: 7 }).state.entities.length, 0);
  assert.equal(applyEdit(base(), "erase", { x: 5, y: 5 }).state.blocked.size, 0);
  assert.equal(applyEdit(base(), "erase", { x: 2, y: 2 }).state.portals.length, 0);
  assert.equal(applyEdit(base(), "erase", { x: 12, y: 12 }).changed, false);
});

test("edits never mutate the previous state", () => {
  const s = base();
  applyEdit(s, "rock", { x: 4, y: 4 });
  applyEdit(s, "dummy", { x: 3, y: 9 });
  assert.equal(s.blocked.has("4,4"), false);
  assert.equal(s.entities.length, 1);
});

test("the portal tool opens portals anywhere, keeps the queue of four and closes on a second tap", () => {
  let s = { ...base(), portals: [] };
  for (const c of [{ x: 1, y: 1 }, { x: 14, y: 14 }, { x: 1, y: 14 }, { x: 14, y: 1 }]) s = applyEdit(s, "portal", c).state;
  assert.deepEqual(s.portals.map((p) => p.id), ["A", "B", "C", "D"]);
  const fifth = applyEdit(s, "portal", { x: 10, y: 10 });
  assert.equal(fifth.removed.id, "A");
  assert.equal(fifth.state.portals.length, 4);
  const closed = applyEdit(fifth.state, "portal", { x: 14, y: 14 });
  assert.equal(closed.state.portals.some((p) => p.id === "B"), false);
  assert.equal(applyEdit(base(), "portal", { x: 5, y: 5 }).changed, false);
});
