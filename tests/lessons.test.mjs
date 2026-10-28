import { test } from "node:test";
import assert from "node:assert/strict";
import { LESSONS } from "../selatrop-portales/js/lessons.js";
import { castSpell, computeRoute, reachable, walkThrough, key, SPELLS } from "../selatrop-portales/js/rules.js";

const build = (lesson) => {
  const d = lesson.setup();
  return {
    cols: 15, rows: 15,
    blocked: new Set(d.blocked.map(([x, y]) => `${x},${y}`)),
    portals: d.portals, caster: d.caster, entities: d.entities,
  };
};
const byTitle = (t) => LESSONS.find((l) => l.title === t);
const castAt = (state, spell, cell) => castSpell(state, SPELLS[spell], cell);
const objectivesMet = (lesson, ev, state) => lesson.objectives.filter((o) => o.done(ev, state)).length;

test("every lesson builds a valid board", () => {
  for (const l of LESSONS) {
    const s = build(l);
    for (const c of [s.caster, ...s.portals, ...s.entities]) {
      assert.ok(c.x >= 0 && c.y >= 0 && c.x < 15 && c.y < 15, `${l.title}: cell out of board`);
      assert.equal(s.blocked.has(key(c)), false, `${l.title}: piece on an obstacle`);
    }
  }
});

test("quiz answers match the routing rule", () => {
  for (const l of LESSONS.filter((x) => x.quiz)) {
    assert.equal(computeRoute(build(l).portals, "A").exit.id, l.quiz.answer, l.title);
  }
});

test("projection lessons are solvable from a reachable cell", () => {
  const cases = [
    ["Entrar por uno, salir por otro", "golpe", null, { x: 5, y: 5 }],
    ["El portal copia tu lanzamiento", "golpe", { x: 4, y: 5 }, { x: 6, y: 4 }],
    ["Línea de visión en dos tramos", "golpe", { x: 5, y: 5 }, { x: 6, y: 7 }],
    ["Áreas a través de portales", "cruz", { x: 3, y: 5 }, { x: 5, y: 4 }],
    ["Empujar a través de portales", "insulto", null, { x: 6, y: 6 }],
    ["Empujar dentro de un portal", "insulto", null, { x: 6, y: 7 }],
    ["Orden de los empujes", "convulsion", null, { x: 6, y: 7 }],
    ["Atracciones", "shock", null, { x: 5, y: 7 }],
  ];
  for (const [title, spell, moveTo, target] of cases) {
    const lesson = byTitle(title);
    const state = build(lesson);
    if (moveTo) {
      assert.ok(reachable(state, 6).has(key(moveTo)), `${title}: solution cell not reachable`);
      state.caster = moveTo;
    }
    const result = castAt(state, spell, target);
    assert.ok(result.ok, `${title}: cast failed (${result.reason})`);
    const castObjectives = lesson.objectives.filter((o) => o.done({ type: "cast", spell, result }, state));
    assert.ok(castObjectives.length >= 1, `${title}: cast completes no objective`);
  }
});

test("the line of sight lesson starts blocked", () => {
  const lesson = byTitle("Línea de visión en dos tramos");
  const result = castAt(build(lesson), "golpe", { x: 6, y: 7 });
  assert.equal(result.reason, "los-entrada");
  assert.equal(objectivesMet(lesson, { type: "cast", spell: "golpe", result }, build(lesson)), 1);
});

test("walking into the network leaves the middle pair open", () => {
  const state = build(byTitle("Caminar por la red"));
  assert.ok(reachable(state, 6).has("4,7"));
  assert.deepEqual(walkThrough(state.portals, "A").portals.map((p) => p.id), ["B", "C"]);
});
