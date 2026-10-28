import { createWorld } from "./scene.js";
import { LESSONS } from "./lessons.js";
import * as R from "./rules.js";

const COLS = 15, ROWS = 15, PM = 6, PORTAL_RANGE = [1, 6];
const STORE_KEY = "dofus-mecanicas:selatrop:done";

const ICONS = {
  portal: '<circle cx="16" cy="16" r="10"/><path d="M16 6a10 10 0 0 1 0 20M16 11a5 5 0 0 1 0 10"/>',
  golpe: '<circle cx="16" cy="16" r="4"/><path d="M16 4v6M16 22v6M4 16h6M22 16h6"/>',
  cruz: '<path d="M12 4h8v8h8v8h-8v8h-8v-8H4v-8h8z"/>',
  insulto: '<path d="M6 10h20M6 16h20M6 22h20"/><path d="M22 7l5 3-5 3"/>',
  convulsion: '<path d="M7 7l18 18M25 7L7 25"/><circle cx="16" cy="16" r="3"/>',
  shock: '<circle cx="16" cy="16" r="3"/><path d="M4 16h7M28 16h-7M16 4v7M16 28v-7M8 13l3 3-3 3M24 13l-3 3 3 3"/>',
  neutral: '<circle cx="16" cy="16" r="10"/><path d="M9 23L23 9"/>',
  interrupcion: '<circle cx="11" cy="13" r="6"/><circle cx="21" cy="19" r="6"/><path d="M5 27L27 5"/>',
};

const TOOLS = {
  portal: { key: "1", name: "Portal", kind: "portal", blurb: "Abre un portal en una casilla libre a 1–6 casillas. Máximo 4 a la vez." },
  golpe: { key: "2", kind: "spell", spell: R.SPELLS.golpe },
  cruz: { key: "3", kind: "spell", spell: R.SPELLS.cruz },
  insulto: { key: "4", kind: "spell", spell: R.SPELLS.insulto },
  convulsion: { key: "5", kind: "spell", spell: R.SPELLS.convulsion },
  shock: { key: "6", kind: "spell", spell: R.SPELLS.shock },
  neutral: { key: "7", name: "Neutral", kind: "neutral", blurb: "Cierra un portal." },
  interrupcion: { key: "8", name: "Interrupción", kind: "interrupt", blurb: "Cierra toda la red de portales." },
};
const ORDER = Object.keys(TOOLS);

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

let lessonIndex = 0, lesson, S, progress = [], quiz = null, tool = null, busy = false, hoverCell = null, lastTap = null;
let done = new Set();
try { done = new Set(JSON.parse(localStorage.getItem(STORE_KEY) || "[]")); } catch { /* storage unavailable */ }

const nameOf = (id) => S.entities.find((e) => e.id === id)?.name || id;
const previewAllowed = () => !!lesson.preview && (!lesson.quiz || quiz.answered !== null);
const occupied = (c) => R.same(S.caster, c) || S.entities.some((e) => R.same(e, c));

function loadLesson(i) {
  lessonIndex = Math.max(0, Math.min(LESSONS.length - 1, i));
  lesson = LESSONS[lessonIndex];
  const d = lesson.setup();
  S = {
    cols: COLS, rows: ROWS,
    blocked: new Set(d.blocked.map(([x, y]) => `${x},${y}`)),
    portals: d.portals.map((p) => ({ ...p })),
    caster: { ...d.caster },
    entities: d.entities.map((e) => ({ ...e })),
  };
  progress = lesson.objectives.map(() => false);
  quiz = lesson.quiz ? { answered: null } : null;
  tool = null;
  world.setBlocked(S.blocked);
  world.setPortals(S.portals);
  world.setActors(S.caster, S.entities);
  $("result").textContent = "Todavía no lanzaste nada en esta lección.";
  try { history.replaceState(null, "", `#leccion-${lessonIndex + 1}`); } catch { /* sandboxed */ }
  renderPanel();
  renderBar();
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

function renderBar() {
  const bar = $("spellbar");
  bar.replaceChildren(...ORDER.map((id) => {
    const t = TOOLS[id];
    const allowed = lesson.tools.includes(id);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "slot";
    b.disabled = !allowed;
    b.setAttribute("aria-pressed", String(tool === id));
    const name = t.spell ? t.spell.name : t.name;
    const blurb = t.spell ? `${t.spell.blurb} Alcance ${t.spell.range[0]}–${t.spell.range[1]}.` : t.blurb;
    b.title = `${name} (${t.key}): ${blurb}`;
    b.setAttribute("aria-label", `${name}. ${blurb}`);
    b.innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true">${ICONS[id]}</svg><span class="slot-key">${t.key}</span><span class="slot-name">${name}</span>`;
    b.addEventListener("click", () => pickTool(id));
    return b;
  }));
  const hint = $("move-hint");
  hint.hidden = !lesson.move;
}

function pickTool(id) {
  if (busy || !lesson.tools.includes(id)) return;
  if (TOOLS[id].kind === "interrupt") return interrupt();
  setTool(tool === id ? null : id);
}

function setTool(id) {
  tool = id;
  document.querySelectorAll(".slot").forEach((b, i) => b.setAttribute("aria-pressed", String(ORDER[i] === id)));
  refresh();
}

function portalCells() {
  const out = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const c = { x, y };
    const d = R.dist(S.caster, c);
    if (d >= PORTAL_RANGE[0] && d <= PORTAL_RANGE[1] && !S.blocked.has(R.key(c)) && !occupied(c) && !R.portalAt(S.portals, c)) out.push(c);
  }
  return out;
}

function refresh() {
  if (busy) { world.setHighlights({}); world.setPreview(null); world.setHover(null); return; }
  const hl = {};
  let segs = null;
  const t = tool && TOOLS[tool];
  if (!t) {
    if (lesson.move) {
      const reach = R.reachable(S, PM);
      hl.move = [...reach.values()].map((r) => r.cell);
      const r = hoverCell && reach.get(R.key(hoverCell));
      if (r) hl.path = r.path;
    }
  } else if (t.kind === "portal") {
    hl.range = portalCells();
  } else if (t.kind === "spell") {
    const cells = R.rangeCells(S, t.spell);
    hl.range = cells.filter((c) => c.los);
    hl.rangeNoLos = cells.filter((c) => !c.los);
    if (hoverCell && R.inRange(S, t.spell, hoverCell)) {
      const isPortal = !!R.portalAt(S.portals, hoverCell);
      if (!isPortal || previewAllowed()) {
        const res = R.castSpell(S, t.spell, hoverCell);
        if (res.segments) segs = res.segments;
        if (res.ok) hl.zone = res.zone;
      }
    }
  } else if (t.kind === "neutral") {
    hl.range = S.portals.map((p) => ({ x: p.x, y: p.y }));
  }
  world.setHighlights(hl);
  world.setPreview(segs);
  world.setHover(hoverCell);
  renderNetwork();
}

function renderNetwork() {
  const list = $("network");
  if (!S.portals.length) { list.textContent = "Sin portales abiertos."; return; }
  const parts = S.portals.map((p, i) => `${p.id} #${i + 1}`);
  let text = `Abiertos: ${parts.join(" · ")}`;
  const hp = hoverCell && R.portalAt(S.portals, hoverCell);
  if (hp && (previewAllowed() || !lesson.quiz)) {
    const route = R.computeRoute(S.portals, hp.id);
    if (route) text += `\nEntrando por ${hp.id}: ${route.order.map((p) => p.id).join(" → ")} (${route.cells} casillas)${route.tie ? " · empate" : ""}`;
  }
  list.textContent = text;
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

async function onCell(cell) {
  if (busy || !cell) return;
  const t = tool && TOOLS[tool];
  if (!t) {
    if (!lesson.move) return;
    const r = R.reachable(S, PM).get(R.key(cell));
    if (r) await walk(r);
    return;
  }
  if (t.kind === "portal") {
    if (!portalCells().some((c) => R.same(c, cell))) return toast("No podés abrir un portal ahí: necesita una casilla libre a 1–6 casillas.");
    const { portals, removed } = R.addPortal(S.portals, cell);
    S.portals = portals;
    world.setPortals(S.portals);
    if (removed) toast(`Se cerró ${removed.id}, el portal más viejo. El nuevo ocupa su letra y pasa a ser el #4.`);
    setTool(null);
    emit({ type: "portal", removed });
    return;
  }
  if (t.kind === "neutral") {
    const p = R.portalAt(S.portals, cell);
    if (!p) return;
    S.portals = R.closePortal(S.portals, p.id);
    world.setPortals(S.portals);
    setTool(null);
    emit({ type: "neutral" });
    return;
  }
  if (t.kind === "spell") {
    if (!R.inRange(S, t.spell, cell)) return setTool(null);
    const res = R.castSpell(S, t.spell, cell);
    if (!res.ok && !res.segments) {
      toast(REASONS[res.reason]);
      emit({ type: "cast", spell: t.spell.id, result: res });
      return;
    }
    busy = true;
    setTool(null);
    refresh();
    await world.playCast(res);
    if (res.ok) {
      for (const m of res.moves) Object.assign(S.entities.find((e) => e.id === m.id), m.to);
      $("result").textContent = describe(t.spell, res);
    } else {
      toast(REASONS[res.reason]);
      $("result").textContent = `${t.spell.name}: ${REASONS[res.reason]}`;
    }
    busy = false;
    emit({ type: "cast", spell: t.spell.id, result: res });
    refresh();
  }
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
  if (!S.portals.length) return toast("No hay portales para cerrar.");
  S.portals = [];
  world.setPortals(S.portals);
  setTool(null);
  toast("Interrupción: se cerró toda la red.");
  emit({ type: "interrupt" });
}

function emit(ev) {
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
  const mobile = W < 760;
  world.setInsets(mobile
    ? { left: 0, right: 0, top: 64, bottom: H - Math.min(panel.top, bar.top) + 8 }
    : { left: panel.right + 12, right: 12, top: 12, bottom: H - bar.top + 8 });
}

// Input
const canvas = $("world");
let down = null;
canvas.addEventListener("pointermove", (ev) => {
  if (ev.pointerType === "touch") return;
  const c = world.pickCell(ev.clientX, ev.clientY);
  if (!R.same(c, hoverCell) && (c || hoverCell)) { hoverCell = c; refresh(); }
});
canvas.addEventListener("pointerleave", () => { hoverCell = null; refresh(); });
canvas.addEventListener("pointerdown", (ev) => { down = { x: ev.clientX, y: ev.clientY }; });
canvas.addEventListener("pointerup", (ev) => {
  if (!down || ev.button === 2 || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 8) { down = null; return; }
  down = null;
  const c = world.pickCell(ev.clientX, ev.clientY);
  if (ev.pointerType === "touch" && tool && TOOLS[tool].kind === "spell" && !R.same(lastTap, c)) {
    lastTap = c;
    hoverCell = c;
    refresh();
    toast("Tocá de nuevo la misma casilla para lanzar.");
    return;
  }
  lastTap = null;
  onCell(c);
});
canvas.addEventListener("contextmenu", (ev) => { ev.preventDefault(); setTool(null); });
canvas.addEventListener("wheel", (ev) => { ev.preventDefault(); world.zoomBy(ev.deltaY < 0 ? 1.1 : 1 / 1.1); }, { passive: false });
window.addEventListener("keydown", (ev) => {
  if (ev.target instanceof HTMLSelectElement) return;
  if (ev.key === "Escape") return setTool(null);
  const id = ORDER.find((k) => TOOLS[k].key === ev.key);
  if (id) pickTool(id);
});

$("prev").addEventListener("click", () => loadLesson(lessonIndex - 1));
$("next").addEventListener("click", () => loadLesson(lessonIndex + 1));
$("reset").addEventListener("click", () => loadLesson(lessonIndex));
$("lesson-select").addEventListener("change", (ev) => loadLesson(Number(ev.target.value)));
$("zoom-in").addEventListener("click", () => world.zoomBy(1.15));
$("zoom-out").addEventListener("click", () => world.zoomBy(1 / 1.15));
$("collapse").addEventListener("click", () => {
  const p = $("panel");
  const collapsed = p.classList.toggle("collapsed");
  $("collapse").setAttribute("aria-expanded", String(!collapsed));
  $("collapse").textContent = collapsed ? "Mostrar lección" : "Ocultar";
  requestAnimationFrame(updateInsets);
});
window.addEventListener("resize", updateInsets);
new ResizeObserver(updateInsets).observe($("panel"));
window.addEventListener("hashchange", () => {
  const m = location.hash.match(/^#leccion-(\d+)$/);
  if (m && Number(m[1]) - 1 !== lessonIndex) loadLesson(Number(m[1]) - 1);
});

const start = location.hash.match(/^#leccion-(\d+)$/);
loadLesson(start ? Number(start[1]) - 1 : 0);
updateInsets();
