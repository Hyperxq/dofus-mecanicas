// Pure portal/spell rules. Grid cells are { x, y }; on screen +x goes down-right and +y goes down-left.

export const MAX_PORTALS = 4;
const LETTERS = ["A", "B", "C", "D"];

export const key = (c) => `${c.x},${c.y}`;
export const same = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y;
export const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const inside = (state, c) => c.x >= 0 && c.y >= 0 && c.x < state.cols && c.y < state.rows;

export const SPELLS = {
  golpe: { id: "golpe", name: "Golpe", range: [1, 8], zone: "single", effect: null,
    blurb: "Una sola casilla. Sirve para ver si el objetivo fue afectado." },
  cruz: { id: "cruz", name: "Cruz", range: [1, 6], zone: "cross", effect: null,
    blurb: "Zona en cruz de radio 1 alrededor del impacto." },
  insulto: { id: "insulto", name: "Insulto", range: [1, 5], zone: "perp3", effect: { type: "push", cells: 2, order: "center-first" },
    blurb: "Línea perpendicular de 3 casillas. Empuja 2 en la dirección del lanzamiento." },
  convulsion: { id: "convulsion", name: "Convulsión", range: [1, 4], zone: "x", effect: { type: "burst", cells: 1 },
    blurb: "Zona en X. El centro empuja hacia adelante y las esquinas en diagonal." },
  shock: { id: "shock", name: "Shock", range: [1, 6], zone: "cross", effect: { type: "pull", cells: 1 },
    blurb: "Zona en cruz. Atrae hacia el centro del impacto." },
};

export function addPortal(portals, cell) {
  const next = portals.slice();
  const removed = next.length >= MAX_PORTALS ? next.shift() : null;
  const id = LETTERS.find((l) => !next.some((p) => p.id === l));
  next.push({ id, x: cell.x, y: cell.y });
  return { portals: next, removed };
}

export const closePortal = (portals, id) => portals.filter((p) => p.id !== id);
export const portalAt = (portals, c) => portals.find((p) => same(p, c)) || null;

// Clockwise screen angle from the bottom-left → top-right reference line; only breaks distance ties.
export function cwAngle(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const sx = dx - dy, sy = dx + dy;
  return (Math.atan2(sy, sx) - Math.atan2(-1, 1) + Math.PI * 4) % (Math.PI * 2);
}

export function computeRoute(portals, entryId) {
  const entry = portals.find((p) => p.id === entryId);
  if (!entry || portals.length < 2) return null;
  const order = [entry];
  const left = portals.filter((p) => p !== entry);
  let cur = entry, cells = 0, tie = false;
  while (left.length) {
    const min = Math.min(...left.map((p) => dist(cur, p)));
    const tied = left.filter((p) => dist(cur, p) === min);
    if (tied.length > 1) tie = true;
    tied.sort((a, b) => cwAngle(cur, a) - cwAngle(cur, b));
    const next = tied[0];
    cells += min;
    order.push(next);
    left.splice(left.indexOf(next), 1);
    cur = next;
  }
  return { order, exit: cur, cells, tie };
}

// Supercover walk between cell centres. A ray through an exact grid corner yields a { corner: [a, b] } step.
export function traverse(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const nx = Math.abs(dx), ny = Math.abs(dy);
  const sx = Math.sign(dx), sy = Math.sign(dy);
  let x = a.x, y = a.y, ix = 0, iy = 0;
  const steps = [];
  while (ix < nx || iy < ny) {
    const decision = (1 + 2 * ix) * ny - (1 + 2 * iy) * nx;
    if (decision === 0) {
      steps.push({ corner: [{ x: x + sx, y }, { x, y: y + sy }] });
      x += sx; y += sy; ix++; iy++;
    } else if (decision < 0) { x += sx; ix++; }
    else { y += sy; iy++; }
    if (x !== b.x || y !== b.y) steps.push({ cell: { x, y } });
  }
  return steps;
}

export function hasLineOfSight(a, b, blocked) {
  return traverse(a, b).every((s) =>
    s.cell ? !blocked.has(key(s.cell)) : !(blocked.has(key(s.corner[0])) && blocked.has(key(s.corner[1]))));
}

export function direction(dx, dy) {
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(dx) === Math.abs(dy)) return { x: Math.sign(dx), y: Math.sign(dy) };
  return Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
}

export function zoneCells(zone, center, dir) {
  const d = dir || { x: 1, y: 0 };
  const offsets = {
    single: [[0, 0]],
    cross: [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]],
    x: [[0, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]],
    perp3: [[0, 0], [-d.y, d.x], [d.y, -d.x]],
  }[zone];
  return offsets.map(([ox, oy]) => ({ x: center.x + ox, y: center.y + oy }));
}

function losBlockers(state) {
  const s = new Set(state.blocked);
  for (const e of state.entities) s.add(key(e));
  return s;
}

export function inRange(state, spell, cell) {
  const d = dist(state.caster, cell);
  return d >= spell.range[0] && d <= spell.range[1] && inside(state, cell);
}

export function rangeCells(state, spell) {
  const blockers = losBlockers(state);
  const out = [];
  for (let y = 0; y < state.rows; y++) for (let x = 0; x < state.cols; x++) {
    const c = { x, y };
    if (state.blocked.has(key(c)) || !inRange(state, spell, c)) continue;
    out.push({ ...c, los: hasLineOfSight(state.caster, c, blockers) });
  }
  return out;
}

export function castSpell(state, spell, target) {
  const fail = (reason, extra = {}) => ({ ok: false, reason, hits: [], moves: [], zone: [], ...extra });
  if (!inRange(state, spell, target)) return fail("rango");
  const blockers = losBlockers(state);
  const vec = { x: target.x - state.caster.x, y: target.y - state.caster.y };
  const dir = direction(vec.x, vec.y);
  const entry = portalAt(state.portals, target);
  const route = entry ? computeRoute(state.portals, entry.id) : null;

  let landing = target;
  const segments = [[state.caster, target]];
  if (route) {
    if (!hasLineOfSight(state.caster, entry, blockers)) return fail("los-entrada", { route, entry });
    landing = { x: route.exit.x + vec.x, y: route.exit.y + vec.y };
    for (let i = 1; i < route.order.length; i++) segments.push([route.order[i - 1], route.order[i]]);
    segments.push([route.exit, landing]);
    if (!inside(state, landing)) return fail("fuera", { route, entry, landing, segments });
    if (state.blocked.has(key(landing))) return fail("obstaculo", { route, entry, landing, segments });
    if (!hasLineOfSight(route.exit, landing, blockers)) return fail("los-salida", { route, entry, landing, segments });
  } else if (!hasLineOfSight(state.caster, target, blockers)) {
    return fail("los");
  }

  const zone = zoneCells(spell.zone, landing, dir).filter((c) => inside(state, c));
  const zoneKeys = new Set(zone.map(key));
  const affected = state.entities.filter((e) => zoneKeys.has(key(e)));
  const moves = spell.effect ? resolveDisplacement(state, spell.effect, affected, landing, dir) : [];
  return { ok: true, projected: !!route, route, entry, landing, segments, dir, zone, hits: affected.map((e) => e.id), moves };
}

function resolveDisplacement(state, effect, affected, center, dir) {
  const occupied = new Set([key(state.caster), ...state.entities.map(key)]);
  const withMeta = affected.map((e) => ({
    e,
    d: dist(e, center),
    cw: same(e, center) ? -1 : cwAngle(center, e),
  }));
  const ccw = (m) => (m.cw < 0 ? -1 : (Math.PI * 2 - m.cw) % (Math.PI * 2));

  let ordered;
  if (effect.type === "pull") ordered = withMeta.sort((a, b) => a.d - b.d || a.cw - b.cw);
  else if (effect.order === "center-first") ordered = withMeta.sort((a, b) => a.d - b.d || a.cw - b.cw);
  else ordered = withMeta.sort((a, b) => b.d - a.d || ccw(a) - ccw(b));

  return ordered.map(({ e }) => {
    let stepDir;
    if (effect.type === "pull") stepDir = direction(center.x - e.x, center.y - e.y);
    else if (effect.type === "burst" && !same(e, center)) stepDir = direction(e.x - center.x, e.y - center.y);
    else stepDir = dir;
    const move = slide(state, occupied, e, stepDir, effect.cells, effect.type === "pull" ? center : null);
    occupied.delete(key(e));
    occupied.add(key(move.to));
    return { id: e.id, ...move };
  });
}

function slide(state, occupied, from, dir, cells, stopAt) {
  let pos = { x: from.x, y: from.y };
  const path = [];
  let collided = false, teleported = null;
  for (let i = 0; i < cells && dir; i++) {
    if (stopAt && same(pos, stopAt)) break;
    const next = { x: pos.x + dir.x, y: pos.y + dir.y };
    if (!inside(state, next) || state.blocked.has(key(next)) || occupied.has(key(next))) { collided = true; break; }
    const portal = portalAt(state.portals, next);
    const route = portal ? computeRoute(state.portals, portal.id) : null;
    if (route) {
      path.push(next);
      if (occupied.has(key(route.exit))) { pos = next; collided = true; break; }
      pos = { x: route.exit.x, y: route.exit.y };
      path.push(pos);
      teleported = route.exit.id;
      break;
    }
    pos = next;
    path.push(pos);
  }
  return { from: { x: from.x, y: from.y }, path, to: pos, collided, teleported };
}

export function walkThrough(portals, entryId) {
  const route = computeRoute(portals, entryId);
  if (!route) return null;
  const closed = new Set([route.order[0].id, route.exit.id]);
  return { to: { x: route.exit.x, y: route.exit.y }, route, portals: portals.filter((p) => !closed.has(p.id)) };
}
