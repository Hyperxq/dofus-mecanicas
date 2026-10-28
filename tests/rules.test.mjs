import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addPortal,
  computeRoute,
  traverse,
  hasLineOfSight,
  castSpell,
  walkThrough,
  reachable,
  SPELLS,
} from "../selatrop-portales/js/rules.js";

const board = (over = {}) => ({
  cols: 15,
  rows: 15,
  blocked: new Set(),
  portals: [],
  caster: { x: 0, y: 0 },
  entities: [],
  ...over,
});

test("a fifth portal removes the oldest and reuses its letter", () => {
  let portals = [];
  for (const c of [{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 1, y: 5 }, { x: 5, y: 5 }]) portals = addPortal(portals, c).portals;
  assert.deepEqual(portals.map((p) => p.id), ["A", "B", "C", "D"]);
  const { portals: next, removed } = addPortal(portals, { x: 9, y: 9 });
  assert.equal(removed.id, "A");
  assert.deepEqual(next.map((p) => p.id), ["B", "C", "D", "A"]);
  assert.deepEqual(next.at(-1), { id: "A", x: 9, y: 9 });
});

test("route follows the nearest unused portal, not placement age", () => {
  const portals = [
    { id: "A", x: 0, y: 0 },
    { id: "B", x: 10, y: 0 },
    { id: "C", x: 2, y: 0 },
  ];
  const route = computeRoute(portals, "A");
  assert.deepEqual(route.order.map((p) => p.id), ["A", "C", "B"]);
  assert.equal(route.exit.id, "B");
  assert.equal(route.cells, 10);
  assert.equal(route.tie, false);
});

test("route distance counts both axes of a diagonal", () => {
  const route = computeRoute([{ id: "A", x: 0, y: 0 }, { id: "B", x: 3, y: 3 }], "A");
  assert.equal(route.cells, 6);
});

test("equidistant candidates are reported as a tie", () => {
  const portals = [
    { id: "A", x: 5, y: 5 },
    { id: "B", x: 8, y: 5 },
    { id: "C", x: 5, y: 8 },
  ];
  assert.equal(computeRoute(portals, "A").tie, true);
});

test("a route needs two portals and a known entry", () => {
  assert.equal(computeRoute([{ id: "A", x: 0, y: 0 }], "A"), null);
  assert.equal(computeRoute([{ id: "A", x: 0, y: 0 }, { id: "B", x: 2, y: 0 }], "Z"), null);
});

test("traverse marks exact corner crossings as a pair", () => {
  const steps = traverse({ x: 0, y: 0 }, { x: 2, y: 2 });
  assert.equal(steps[0].corner.length, 2);
  assert.deepEqual(steps[1], { cell: { x: 1, y: 1 } });
});

test("line of sight is blocked by an obstacle between both cells", () => {
  const blocked = new Set(["2,0"]);
  assert.equal(hasLineOfSight({ x: 0, y: 0 }, { x: 4, y: 0 }, blocked), false);
  assert.equal(hasLineOfSight({ x: 0, y: 0 }, { x: 0, y: 4 }, blocked), true);
});

test("a corner crossing only blocks when both side cells are blocked", () => {
  const one = new Set(["1,0"]);
  const both = new Set(["1,0", "0,1"]);
  assert.equal(hasLineOfSight({ x: 0, y: 0 }, { x: 1, y: 1 }, one), true);
  assert.equal(hasLineOfSight({ x: 0, y: 0 }, { x: 1, y: 1 }, both), false);
});

test("a projected spell copies the caster-to-entry vector from the exit", () => {
  const state = board({
    caster: { x: 2, y: 4 },
    portals: [{ id: "A", x: 4, y: 3 }, { id: "B", x: 10, y: 8 }],
    entities: [{ id: "t1", x: 12, y: 7 }],
  });
  const res = castSpell(state, SPELLS.golpe, { x: 4, y: 3 });
  assert.equal(res.ok, true);
  assert.deepEqual(res.landing, { x: 12, y: 7 });
  assert.deepEqual(res.hits, ["t1"]);
});

test("a cast fails when the caster has no line of sight to the entry", () => {
  const state = board({
    caster: { x: 0, y: 3 },
    blocked: new Set(["2,3"]),
    portals: [{ id: "A", x: 4, y: 3 }, { id: "B", x: 10, y: 8 }],
  });
  const res = castSpell(state, SPELLS.golpe, { x: 4, y: 3 });
  assert.equal(res.ok, false);
  assert.equal(res.reason, "los-entrada");
});

test("a projected landing outside the map fails", () => {
  const state = board({
    caster: { x: 0, y: 0 },
    portals: [{ id: "A", x: 3, y: 0 }, { id: "B", x: 13, y: 0 }],
  });
  const res = castSpell(state, SPELLS.golpe, { x: 3, y: 0 });
  assert.equal(res.ok, false);
  assert.equal(res.reason, "fuera");
});

test("an area spell affects every entity inside its zone", () => {
  const state = board({
    caster: { x: 3, y: 7 },
    entities: [{ id: "a", x: 7, y: 7 }, { id: "b", x: 7, y: 8 }, { id: "c", x: 9, y: 9 }],
  });
  const res = castSpell(state, SPELLS.cruz, { x: 7, y: 7 });
  assert.deepEqual([...res.hits].sort(), ["a", "b"]);
});

test("a push moves the target along the cast direction and stops on obstacles", () => {
  const state = board({
    caster: { x: 2, y: 7 },
    blocked: new Set(["7,7"]),
    entities: [{ id: "t", x: 5, y: 7 }],
  });
  const res = castSpell(state, SPELLS.insulto, { x: 5, y: 7 });
  const move = res.moves.find((m) => m.id === "t");
  assert.deepEqual(move.to, { x: 6, y: 7 });
  assert.equal(move.collided, true);
});

test("a pushed target that steps on a portal comes out of the network exit", () => {
  const state = board({
    caster: { x: 2, y: 7 },
    portals: [{ id: "A", x: 6, y: 7 }, { id: "B", x: 11, y: 2 }],
    entities: [{ id: "t", x: 5, y: 7 }],
  });
  const res = castSpell(state, SPELLS.insulto, { x: 5, y: 7 });
  const move = res.moves.find((m) => m.id === "t");
  assert.deepEqual(move.to, { x: 11, y: 2 });
  assert.equal(move.teleported, "B");
});

test("pushes resolve from the outside in", () => {
  const state = board({
    caster: { x: 2, y: 7 },
    entities: [{ id: "center", x: 6, y: 7 }, { id: "corner", x: 7, y: 6 }],
  });
  const res = castSpell(state, SPELLS.convulsion, { x: 6, y: 7 });
  assert.deepEqual(res.moves.map((m) => m.id), ["corner", "center"]);
});

test("a pull brings targets toward the zone center", () => {
  const state = board({
    caster: { x: 2, y: 7 },
    entities: [{ id: "t", x: 7, y: 6 }],
  });
  const res = castSpell(state, SPELLS.shock, { x: 7, y: 7 });
  assert.deepEqual(res.moves[0].to, { x: 7, y: 7 });
});

test("walking into a portal teleports to the exit and closes entry and exit", () => {
  const portals = [
    { id: "A", x: 1, y: 1 },
    { id: "B", x: 3, y: 1 },
    { id: "C", x: 9, y: 1 },
  ];
  const res = walkThrough(portals, "A");
  assert.deepEqual(res.to, { x: 9, y: 1 });
  assert.deepEqual(res.portals.map((p) => p.id), ["B"]);
});

test("movement stays within PM, routes around obstacles and ends on portals", () => {
  const state = board({
    caster: { x: 0, y: 0 },
    blocked: new Set(["1,0"]),
    portals: [{ id: "A", x: 0, y: 2 }, { id: "B", x: 9, y: 9 }],
    entities: [{ id: "t", x: 2, y: 2 }],
  });
  const reach = reachable(state, 3);
  assert.ok(reach.has("1,1"));
  assert.deepEqual(reach.get("0,2").path, [{ x: 0, y: 1 }, { x: 0, y: 2 }]);
  assert.equal(reach.has("2,0"), false);
  assert.equal(reach.has("0,3"), false);
  assert.equal(reach.has("2,2"), false);
});
