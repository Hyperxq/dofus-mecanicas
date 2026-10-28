import { key, same, portalAt, closePortal, addPortal, holesOf } from "./rules.js";

// Pure playground edits: each returns a new state and never mutates the given one.
export function applyEdit(state, tool, cell) {
  const k = key(cell);
  const entity = state.entities.find((e) => same(e, cell));
  const portal = portalAt(state.portals, cell);
  const rock = state.blocked.has(k);
  const hole = holesOf(state).has(k);
  const isCaster = same(state.caster, cell);
  const free = !entity && !portal && !rock && !hole && !isCaster;
  const toggledHoles = () => {
    const holes = new Set(holesOf(state));
    if (hole) holes.delete(k); else holes.add(k);
    return holes;
  };
  const keep = (message) => ({ state, changed: false, message });
  const next = (patch) => ({ state: { ...state, ...patch }, changed: true });

  switch (tool) {
    case "caster":
      return free ? next({ caster: { x: cell.x, y: cell.y } }) : keep("El Selatrop necesita una casilla libre.");
    case "dummy": {
      if (entity) return next({ entities: state.entities.filter((e) => e !== entity) });
      if (!free) return keep("Esa casilla está ocupada.");
      const n = Math.max(0, ...state.entities.map((e) => Number(e.id.slice(1)) || 0)) + 1;
      return next({ entities: [...state.entities, { id: `m${n}`, name: `Enemigo ${n}`, x: cell.x, y: cell.y }] });
    }
    case "portal": {
      if (portal) return next({ portals: closePortal(state.portals, portal.id) });
      if (!free) return keep("Esa casilla está ocupada.");
      const { portals, removed } = addPortal(state.portals, cell);
      return { ...next({ portals }), removed };
    }
    case "rock": {
      const blocked = new Set(state.blocked);
      if (rock) { blocked.delete(k); return next({ blocked }); }
      if (!free) return keep("Esa casilla está ocupada.");
      blocked.add(k);
      return next({ blocked });
    }
    case "hole":
      if (hole) return next({ holes: toggledHoles() });
      return free ? next({ holes: toggledHoles() }) : keep("Esa casilla está ocupada.");
    case "erase": {
      if (entity) return next({ entities: state.entities.filter((e) => e !== entity) });
      if (portal) return next({ portals: closePortal(state.portals, portal.id) });
      if (hole) return next({ holes: toggledHoles() });
      if (rock) { const blocked = new Set(state.blocked); blocked.delete(k); return next({ blocked }); }
      return keep("No hay nada que borrar ahí.");
    }
    default:
      return keep("Herramienta desconocida.");
  }
}
