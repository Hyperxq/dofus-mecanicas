import { createWorld } from "./scene.js";
import { LESSONS } from "./lessons.js";
import * as R from "./rules.js";
import { applyEdit } from "./editor.js";

const COLS = 15, ROWS = 15, PM = 6, PORTAL_RANGE = [1, 6], FREE_RANGE = 99;
const STORE_KEY = "dofus-mecanicas:selatrop:done";
const PLAY_KEY = "dofus-mecanicas:selatrop:playground";
const DRAG_PX = 8;

const ICONS = {
  mover: '<path d="M16 4v24M4 16h24M16 4l-4 4M16 4l4 4M16 28l-4-4M16 28l4-4M4 16l4-4M4 16l4 4M28 16l-4-4M28 16l-4 4"/>',
  portales: '<circle cx="16" cy="16" r="10"/><path d="M16 6a10 10 0 0 1 0 20M16 11a5 5 0 0 1 0 10"/>',
  hechizo: '<path d="M16 3l3.5 8.5L28 13l-6.5 6 2 9L16 23.5 8.5 28l2-9L4 13l8.5-1.5z"/>',
  golpe: '<circle cx="16" cy="16" r="4"/><path d="M16 4v6M16 22v6M4 16h6M22 16h6"/>',
  cruz: '<path d="M12 4h8v8h8v8h-8v8h-8v-8H4v-8h8z"/>',
  insulto: '<path d="M6 10h20M6 16h20M6 22h20"/><path d="M22 7l5 3-5 3"/>',
  convulsion: '<path d="M7 7l18 18M25 7L7 25"/><circle cx="16" cy="16" r="3"/>',
  shock: '<circle cx="16" cy="16" r="3"/><path d="M4 16h7M28 16h-7M16 4v7M16 28v-7M8 13l3 3-3 3M24 13l-3 3 3 3"/>',
};

const MODES = [
  { id: "mover", key: "1", name: "Mover" },
  { id: "portales", key: "2", name: "Portales" },
  { id: "hechizo", key: "3", name: "Hechizo" },
];
const SPELL_IDS = ["golpe", "cruz", "insulto", "convulsion", "shock"];
const SPELL_KEYS = ["4", "5", "6", "7", "8"];

const REASONS = {
  rango: "Fuera de alcance.",
  los: "No hay línea de visión hasta esa casilla.",
  "los-entrada": "No hay línea de visión hasta el portal de entrada.",
  "los-salida": "Desde el portal de salida no hay línea de visión hasta el impacto.",
  fuera: "El impacto queda fuera de la cuadrícula: el hechizo se pierde.",
  obstaculo: "El impacto cae sobre un obstáculo.",
};

const $ = (id) => document.getElementById(id);
const world = createWorld({ canvas: $("world"), overlay: $("overlay"), cols: COLS, rows: ROWS });

let lessonIndex = 0, lesson, S, progress = [], quiz = null, busy = false, hoverCell = null, armedCell = null;
let mode = "mover", spellId = null, editTool = null, freeRange = false;
let done = new Set();
try { done = new Set(JSON.parse(localStorage.getItem(STORE_KEY) || "[]")); } catch { /* storage unavailable */ }

const nameOf = (id) => S.entities.find((e) => e.id === id)?.name || id;
const previewAllowed = () => !!lesson.preview && (!lesson.quiz || quiz.answered !== null);
const occupied = (c) => R.same(S.caster, c) || S.entities.some((e) => R.same(e, c));
const spellFor = (spell) => (lesson.playground && freeRange ? { ...spell, range: [1, FREE_RANGE] } : spell);
const allows = (id) => lesson.tools.includes(id);
const lessonSpells = () => SPELL_IDS.filter(allows);
const modeAvailable = (m) => (m === "mover" ? !!lesson.move : m === "portales" ? ["portal", "neutral", "interrupcion"].some(allows) : lessonSpells().length > 0);
const sign = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

function boardFrom(d) {
  return {
    cols: COLS, rows: ROWS,
    blocked: new Set(d.blocked.map(([x, y]) => `${x},${y}`)),
    portals: d.portals.map((p) => ({ ...p })),
    caster: { ...d.caster },
    entities: d.entities.map((e) => ({ ...e })),
  };
}

function loadPlayground() {
  try {
    const d = JSON.parse(localStorage.getItem(PLAY_KEY) || "null");
    if (d && d.caster && Array.isArray(d.blocked)) return boardFrom(d);
  } catch { /* storage unavailable or corrupt */ }
  return null;
}

function savePlayground() {
  if (!lesson.playground) return;
  const d = { blocked: [...S.blocked].map((k) => k.split(",").map(Number)), portals: S.portals, caster: S.caster, entities: S.entities };
  try { localStorage.setItem(PLAY_KEY, JSON.stringify(d)); } catch { /* storage unavailable */ }
}

function syncWorld() {
  world.setBlocked(S.blocked);
  world.setPortals(S.portals);
  world.setActors(S.caster, S.entities);
}

function loadLesson(i, { fresh = false } = {}) {
  lessonIndex = Math.max(0, Math.min(LESSONS.length - 1, i));
  lesson = LESSONS[lessonIndex];
  S = (lesson.playground && !fresh && loadPlayground()) || boardFrom(lesson.setup());
  progress = lesson.objectives.map(() => false);
  quiz = lesson.quiz ? { answered: null } : null;
  editTool = null;
  armedCell = null;
  spellId = lessonSpells()[0] || null;
  mode = [lesson.start, "hechizo", "portales", "mover"].find((m) => m && modeAvailable(m)) || "mover";
  syncWorld();
  renderEditor();
  $("result").textContent = "Todavía no lanzaste nada en esta lección.";
  try { history.replaceState(null, "", `#leccion-${lessonIndex + 1}`); } catch { /* sandboxed */ }
  renderPanel();
  renderBars();
  emit({ type: "enter" });
  refresh();
}

function renderPanel() {
  $("lesson-count").textContent = `Lección ${lessonIndex + 1} de ${LESSONS.length}`;
  $("lesson-title").textContent = lesson.title;
  $("lesson-body").innerHTML = lesson.body;
  const note = $("lesson-note");
  note.hidden = !lesson.note;
  note.textContent = lesson.note || "";
  const sel = $("lesson-select");
  sel.replaceChildren(...LESSONS.map((l, i) => {
    const o = document.createElement("option");
    o.value = String(i);
    o.textContent = `${done.has(i) ? "✓ " : ""}${i + 1}. ${l.title}`;
    return o;
  }));
  sel.value = String(lessonIndex);
  $("prev").disabled = lessonIndex === 0;
  $("next").disabled = lessonIndex === LESSONS.length - 1;
  renderQuiz();
  renderObjectives();
}

function renderObjectives() {
  const ul = $("objectives");
  ul.replaceChildren(...lesson.objectives.map((o, i) => {
    const li = document.createElement("li");
    li.className = progress[i] ? "done" : "";
    li.textContent = o.text;
    return li;
  }));
  ul.hidden = !lesson.objectives.length;
  $("objectives-title").hidden = ul.hidden;
  const complete = lesson.objectives.length > 0 && progress.every(Boolean);
  $("panel").classList.toggle("complete", complete);
  $("next").classList.toggle("pulse", complete && lessonIndex < LESSONS.length - 1);
}

function renderQuiz() {
  const box = $("quiz");
  box.hidden = !lesson.quiz;
  if (!lesson.quiz) return;
  $("quiz-q").textContent = lesson.quiz.question;
  $("quiz-options").replaceChildren(...lesson.quiz.options.map((opt) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = `Portal ${opt}`;
    b.disabled = quiz.answered !== null;
    if (quiz.answered !== null) b.classList.toggle("right", opt === lesson.quiz.answer);
    if (quiz.answered === opt && opt !== lesson.quiz.answer) b.classList.add("wrong");
    b.addEventListener("click", () => {
      quiz.answered = opt;
      const correct = opt === lesson.quiz.answer;
      $("quiz-feedback").textContent = correct
        ? "¡Correcto! Ahora lanzá el hechizo para verlo."
        : `No: sale por ${lesson.quiz.answer}. Lanzá el hechizo y seguí la ruta.`;
      renderQuiz();
      emit({ type: "quiz", correct });
      refresh();
    });
    return b;
  }));
  if (quiz.answered === null) $("quiz-feedback").textContent = "";
}

function iconButton(cls, icon, label, key, pressed, title) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.setAttribute("aria-pressed", String(pressed));
  b.title = title;
  b.setAttribute("aria-label", title);
  b.innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true">${ICONS[icon]}</svg><span class="slot-key">${key}</span><span class="slot-name">${label}</span>`;
  return b;
}

function renderBars() {
  $("modebar").replaceChildren(...MODES.map((m) => {
    const b = iconButton("mode", m.id, m.name, m.key, mode === m.id && !editTool, `${m.name} (${m.key})`);
    b.disabled = !modeAvailable(m.id);
    b.addEventListener("click", () => setMode(m.id));
    return b;
  }));

  const sub = $("subbar");
  sub.replaceChildren();
  sub.hidden = !!editTool || mode === "mover";
  if (mode === "hechizo") {
    sub.append(...SPELL_IDS.map((id, i) => {
      const sp = R.SPELLS[id];
      const b = iconButton("slot", id, sp.name, SPELL_KEYS[i], spellId === id, `${sp.name} (${SPELL_KEYS[i]}): ${sp.blurb} Alcance ${sp.range[0]}–${sp.range[1]}.`);
      b.disabled = !allows(id);
      b.addEventListener("click", () => pickSpell(id));
      return b;
    }));
  } else if (mode === "portales") {
    const hint = document.createElement("p");
    hint.className = "subbar-hint";
    const parts = [];
    if (allows("portal")) parts.push("Tocá una casilla azul para abrir un portal");
    if (allows("neutral")) parts.push("tocá un portal para cerrarlo (Neutral)");
    hint.textContent = `${parts.join(" · ")}.`;
    sub.append(hint);
    if (allows("interrupcion")) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn";
      b.textContent = "Cerrar todos (Interrupción)";
      b.addEventListener("click", interrupt);
      sub.append(b);
    }
  }
  const hints = {
    mover: "Tocá una casilla verde para moverte (6 PM). Arrastrá para mover la cámara.",
    portales: "Máximo 4 portales: el quinto cierra el más viejo.",
    hechizo: "Pasá por un portal o una casilla para ver adónde sale. Clic o segundo toque para lanzar.",
  };
  $("move-hint").textContent = editTool ? "Editando el mapa: tocá casillas para aplicar la herramienta." : hints[mode];
  requestAnimationFrame(updateInsets);
}

function setMode(m) {
  if (busy || !modeAvailable(m)) return;
  mode = m;
  armedCell = null;
  if (editTool) setEditTool(null, { silent: true });
  renderBars();
  refresh();
}

function pickSpell(id) {
  if (busy || !allows(id)) return;
  spellId = id;
  mode = "hechizo";
  armedCell = null;
  if (editTool) setEditTool(null, { silent: true });
  renderBars();
  refresh();
}

function setEditTool(id, { silent = false } = {}) {
  editTool = id;
  document.querySelectorAll("[data-edit]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.edit === id)));
  if (!silent) { renderBars(); refresh(); }
}

function renderEditor() {
  $("editor").hidden = !lesson.playground;
  $("free-range").checked = freeRange;
  document.querySelectorAll("[data-edit]").forEach((b) => b.setAttribute("aria-pressed", "false"));
}

function portalCells() {
  const max = lesson.playground && freeRange ? FREE_RANGE : PORTAL_RANGE[1];
  const out = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const c = { x, y };
    const d = R.dist(S.caster, c);
    if (d >= PORTAL_RANGE[0] && d <= max && !S.blocked.has(R.key(c)) && !occupied(c) && !R.portalAt(S.portals, c)) out.push(c);
  }
  return out;
}

function previewAt(cell) {
  if (mode !== "hechizo" || !spellId || !cell || editTool) return null;
  const spell = spellFor(R.SPELLS[spellId]);
  if (!R.inRange(S, spell, cell)) return { spell, outOfRange: true };
  const isPortal = !!R.portalAt(S.portals, cell);
  if (isPortal && !previewAllowed()) return { spell, hidden: true };
  return { spell, res: R.castSpell(S, spell, cell) };
}

function refresh() {
  if (busy) { world.setHighlights({}); world.setPreview(null); world.setHover(null); renderPreviewCard(null); return; }
  const hl = {};
  let segs = null, impact = {};
  const focus = armedCell || hoverCell;
  const pv = previewAt(focus);
  if (editTool) {
    // Map editing shows only the hovered cell.
  } else if (mode === "mover") {
    if (lesson.move) {
      const reach = R.reachable(S, PM);
      hl.move = [...reach.values()].map((r) => r.cell);
      const r = hoverCell && reach.get(R.key(hoverCell));
      if (r) hl.path = r.path;
    }
  } else if (mode === "portales") {
    if (allows("portal")) hl.range = portalCells();
  } else if (mode === "hechizo" && spellId) {
    const cells = R.rangeCells(S, spellFor(R.SPELLS[spellId]));
    hl.range = cells.filter((c) => c.los);
    hl.rangeNoLos = cells.filter((c) => !c.los);
    if (pv?.res) {
      if (pv.res.segments) { segs = pv.res.segments; impact = { landing: pv.res.landing, ok: pv.res.ok }; }
      if (pv.res.ok) hl.zone = pv.res.zone;
    }
  }
  world.setHighlights(hl);
  world.setPreview(segs, impact);
  world.setHover(focus);
  renderNetwork();
  renderPreviewCard(pv);
}

function renderPreviewCard(pv) {
  const card = $("preview-card");
  if (!pv || pv.outOfRange) { card.hidden = true; return; }
  card.hidden = false;
  const title = $("pv-title"), detail = $("pv-detail"), cast = $("pv-cast");
  card.classList.toggle("bad", !!pv.res && !pv.res.ok);
  cast.hidden = !armedCell || !pv.res || !pv.res.segments;
  if (pv.hidden) {
    title.textContent = `${pv.spell.name} por un portal`;
    detail.textContent = "Respondé la pregunta para ver la ruta.";
    return;
  }
  const res = pv.res;
  const v = { x: res.segments?.[0][1].x - S.caster.x, y: res.segments?.[0][1].y - S.caster.y };
  if (res.route) {
    title.textContent = `${pv.spell.name}: ${res.route.order.map((p) => p.id).join(" → ")}`;
    const lines = [`Desplazamiento ${sign(v.x)}, ${sign(v.y)} copiado desde ${res.route.exit.id}.`];
    if (res.ok) lines.push(res.hits.length ? `Afectaría a ${res.hits.map(nameOf).join(", ")}.` : "No afectaría a nadie.");
    else lines.push(REASONS[res.reason]);
    detail.textContent = lines.join("\n");
  } else if (res.ok) {
    title.textContent = `${pv.spell.name} directo`;
    detail.textContent = res.hits.length ? `Afectaría a ${res.hits.map(nameOf).join(", ")}.` : "No afectaría a nadie.";
  } else {
    title.textContent = pv.spell.name;
    detail.textContent = REASONS[res.reason];
  }
}

function renderNetwork() {
  const list = $("network");
  if (!S.portals.length) { list.textContent = "Sin portales abiertos."; return; }
  list.textContent = `Abiertos: ${S.portals.map((p, i) => `${p.id} #${i + 1}`).join(" · ")}`;
}

function describe(spell, res) {
  const lines = [];
  lines.push(res.projected
    ? `${spell.name} por ${res.route.order.map((p) => p.id).join(" → ")}. Sale por ${res.route.exit.id}.`
    : `${spell.name} directo.`);
  lines.push(res.hits.length ? `Afectados: ${res.hits.map(nameOf).join(", ")}.` : "No afectó a ningún objetivo.");
  for (const m of res.moves) {
    const steps = m.teleported ? `entró a la red y salió por ${m.teleported}` : `se movió ${m.path.length} casilla${m.path.length === 1 ? "" : "s"}`;
    lines.push(`${nameOf(m.id)} ${steps}${m.collided ? " y chocó" : ""}.`);
  }
  return lines.join("\n");
}

async function onCell(cell, { touch = false } = {}) {
  if (busy || !cell) return;
  if (editTool) {
    const { state, changed, message, removed } = applyEdit(S, editTool, cell);
    if (!changed) return toast(message);
    if (removed) toast(`Se cerró ${removed.id}, el portal más viejo.`);
    S = state;
    syncWorld();
    savePlayground();
    refresh();
    return;
  }
  if (mode === "mover") {
    const r = lesson.move && R.reachable(S, PM).get(R.key(cell));
    if (r) await walk(r);
    return;
  }
  if (mode === "portales") return portalTap(cell);
  if (mode === "hechizo") {
    if (touch && !R.same(armedCell, cell)) {
      armedCell = cell;
      refresh();
      return;
    }
    armedCell = null;
    await cast(cell);
  }
}

function portalTap(cell) {
  const existing = R.portalAt(S.portals, cell);
  if (existing) {
    if (!allows("neutral")) return toast("En esta lección no se cierran portales.");
    S.portals = R.closePortal(S.portals, existing.id);
    world.setPortals(S.portals);
    emit({ type: "neutral" });
    return refresh();
  }
  if (!allows("portal")) return;
  if (!portalCells().some((c) => R.same(c, cell))) return toast("No podés abrir un portal ahí: necesita una casilla libre a 1–6 casillas.");
  const { portals, removed } = R.addPortal(S.portals, cell);
  S.portals = portals;
  world.setPortals(S.portals);
  if (removed) toast(`Se cerró ${removed.id}, el portal más viejo. El nuevo ocupa su letra y pasa a ser el #4.`);
  emit({ type: "portal", removed });
  refresh();
}

async function cast(cell) {
  const spell = spellFor(R.SPELLS[spellId]);
  if (!R.inRange(S, spell, cell)) return toast(REASONS.rango);
  const res = R.castSpell(S, spell, cell);
  if (!res.ok && !res.segments) {
    toast(REASONS[res.reason]);
    emit({ type: "cast", spell: spellId, result: res });
    return;
  }
  busy = true;
  refresh();
  await world.playCast(res);
  if (res.ok) {
    for (const m of res.moves) Object.assign(S.entities.find((e) => e.id === m.id), m.to);
    $("result").textContent = describe(spell, res);
  } else {
    toast(REASONS[res.reason]);
    $("result").textContent = `${spell.name}: ${REASONS[res.reason]}`;
  }
  busy = false;
  emit({ type: "cast", spell: spellId, result: res });
  refresh();
}

async function walk(r) {
  busy = true;
  refresh();
  await world.moveActor("caster", r.path);
  S.caster = { ...r.cell };
  const portal = R.portalAt(S.portals, r.cell);
  const through = portal && R.walkThrough(S.portals, portal.id);
  if (through) {
    await world.moveActor("caster", [through.to], through.route.exit.id);
    S.caster = { ...through.to };
    S.portals = through.portals;
    world.setPortals(S.portals);
    toast(`Cruzaste la red de ${portal.id} a ${through.route.exit.id}: esos dos portales se cerraron.`);
  }
  busy = false;
  emit({ type: through ? "walk" : "move" });
  refresh();
}

function interrupt() {
  if (busy) return;
  if (!S.portals.length) return toast("No hay portales para cerrar.");
  S.portals = [];
  world.setPortals(S.portals);
  toast("Interrupción: se cerró toda la red.");
  emit({ type: "interrupt" });
  refresh();
}

function emit(ev) {
  if (ev.type !== "enter") savePlayground();
  let changed = false;
  lesson.objectives.forEach((o, i) => {
    if (!progress[i] && o.done(ev, S)) { progress[i] = true; changed = true; }
  });
  if (!changed) return;
  renderObjectives();
  if (progress.every(Boolean)) {
    if (!done.has(lessonIndex) && ev.type !== "enter") toast("¡Lección completada!", "good");
    done.add(lessonIndex);
    try { localStorage.setItem(STORE_KEY, JSON.stringify([...done])); } catch { /* storage unavailable */ }
    const opt = $("lesson-select").options[lessonIndex];
    if (opt) opt.textContent = `✓ ${lessonIndex + 1}. ${lesson.title}`;
  }
}

let toastTimer;
function toast(text, kind = "") {
  const el = $("toast");
  el.textContent = text;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = "toast"; }, 3200);
}

function updateInsets() {
  const panel = $("panel").getBoundingClientRect();
  const bar = $("bottombar").getBoundingClientRect();
  const W = window.innerWidth, H = window.innerHeight;
  document.documentElement.style.setProperty("--bottombar-h", `${Math.round(H - bar.top)}px`);
  const mobile = W < 760;
  world.setInsets(mobile
    ? { left: 0, right: 0, top: 64, bottom: H - Math.min(panel.top, bar.top) + 8 }
    : { left: panel.right + 12, right: 12, top: 12, bottom: H - bar.top + 8 });
}

// Input: tap acts, drag pans the camera, wheel and pinch zoom toward the pointer.
const canvas = $("world");
let down = null;
// Pinch uses touch events: iOS Safari does not deliver reliable multi-pointer events for gestures.
// Pointer events fire before their touch counterparts, so `gesture` stays set through the last pointerup.
let gesture = false, pinch = null;
const touchInfo = (t) => ({
  d: Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY),
  x: (t[0].clientX + t[1].clientX) / 2,
  y: (t[0].clientY + t[1].clientY) / 2,
});
canvas.addEventListener("touchstart", (ev) => {
  if (ev.touches.length < 2) return;
  ev.preventDefault();
  gesture = true;
  down = null;
  pinch = touchInfo(ev.touches);
}, { passive: false });
canvas.addEventListener("touchmove", (ev) => {
  if (ev.touches.length < 2 || !pinch) return;
  ev.preventDefault();
  const now = touchInfo(ev.touches);
  world.panBy(now.x - pinch.x, now.y - pinch.y);
  if (pinch.d > 0 && now.d > 0) world.zoomAt(now.d / pinch.d, now.x, now.y);
  pinch = now;
}, { passive: false });
const endTouch = (ev) => {
  pinch = ev.touches.length >= 2 ? touchInfo(ev.touches) : null;
  if (!ev.touches.length) gesture = false;
};
canvas.addEventListener("touchend", endTouch);
canvas.addEventListener("touchcancel", endTouch);
document.addEventListener("gesturestart", (ev) => ev.preventDefault());

canvas.addEventListener("pointerdown", (ev) => {
  if (gesture || ev.button === 2) return;
  down = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, lx: ev.clientX, ly: ev.clientY, dragging: false };
  canvas.setPointerCapture?.(ev.pointerId);
});
canvas.addEventListener("pointermove", (ev) => {
  if (down && down.id === ev.pointerId && !gesture) {
    if (!down.dragging && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > DRAG_PX) {
      down.dragging = true;
      canvas.classList.add("dragging");
    }
    if (down.dragging) {
      world.panBy(ev.clientX - down.lx, ev.clientY - down.ly);
      down.lx = ev.clientX;
      down.ly = ev.clientY;
      return;
    }
  }
  if (ev.pointerType === "touch") return;
  const c = world.pickCell(ev.clientX, ev.clientY);
  if (!R.same(c, hoverCell) && (c || hoverCell)) { hoverCell = c; refresh(); }
});
canvas.addEventListener("pointerleave", () => { if (!down) { hoverCell = null; refresh(); } });
const finishPointer = (ev) => {
  canvas.classList.remove("dragging");
  const d = down;
  down = null;
  return d && d.id === ev.pointerId && !d.dragging && !gesture ? d : null;
};
canvas.addEventListener("pointercancel", finishPointer);
canvas.addEventListener("pointerup", (ev) => {
  if (!finishPointer(ev)) return;
  onCell(world.pickCell(ev.clientX, ev.clientY), { touch: ev.pointerType === "touch" });
});
canvas.addEventListener("contextmenu", (ev) => { ev.preventDefault(); armedCell = null; setMode("mover"); });
canvas.addEventListener("wheel", (ev) => {
  ev.preventDefault();
  world.zoomAt(ev.deltaY < 0 ? 1.12 : 1 / 1.12, ev.clientX, ev.clientY);
}, { passive: false });
window.addEventListener("keydown", (ev) => {
  if (ev.target instanceof HTMLSelectElement || ev.target instanceof HTMLInputElement) return;
  if (ev.key === "Escape") { armedCell = null; if (editTool) setEditTool(null); return refresh(); }
  const m = MODES.find((x) => x.key === ev.key);
  if (m) return setMode(m.id);
  const s = SPELL_KEYS.indexOf(ev.key);
  if (s >= 0) pickSpell(SPELL_IDS[s]);
});

$("pv-cast").addEventListener("click", () => {
  const cell = armedCell;
  armedCell = null;
  if (cell) cast(cell);
});
$("prev").addEventListener("click", () => loadLesson(lessonIndex - 1));
$("next").addEventListener("click", () => loadLesson(lessonIndex + 1));
$("reset").addEventListener("click", () => loadLesson(lessonIndex, { fresh: true }));
document.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => {
  if (busy) return;
  setEditTool(editTool === b.dataset.edit ? null : b.dataset.edit);
}));
$("free-range").addEventListener("change", (ev) => { freeRange = ev.target.checked; refresh(); });
$("pg-clear").addEventListener("click", () => {
  if (busy) return;
  S = boardFrom({ caster: S.caster, portals: [], entities: [], blocked: [] });
  syncWorld();
  savePlayground();
  refresh();
});
$("pg-sample").addEventListener("click", () => { if (!busy) { loadLesson(lessonIndex, { fresh: true }); savePlayground(); } });
$("lesson-select").addEventListener("change", (ev) => loadLesson(Number(ev.target.value)));
$("zoom-in").addEventListener("click", () => world.zoomAt(1.15));
$("zoom-out").addEventListener("click", () => world.zoomAt(1 / 1.15));
$("zoom-reset").addEventListener("click", () => world.resetView());
$("collapse").addEventListener("click", () => {
  const p = $("panel");
  const collapsed = p.classList.toggle("collapsed");
  $("collapse").setAttribute("aria-expanded", String(!collapsed));
  $("collapse").textContent = collapsed ? "Mostrar lección" : "Ocultar";
  requestAnimationFrame(updateInsets);
});
window.addEventListener("resize", updateInsets);
new ResizeObserver(updateInsets).observe($("panel"));
new ResizeObserver(updateInsets).observe($("bottombar"));
window.addEventListener("hashchange", () => {
  const m = location.hash.match(/^#leccion-(\d+)$/);
  if (m && Number(m[1]) - 1 !== lessonIndex) loadLesson(Number(m[1]) - 1);
});

const start = location.hash.match(/^#leccion-(\d+)$/);
loadLesson(start ? Number(start[1]) - 1 : 0);
updateInsets();
