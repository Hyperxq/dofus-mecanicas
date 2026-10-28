// Each lesson builds a board and lists the objectives that complete it.
// Event shapes: { type: "portal", removed }, { type: "cast", spell, result }, { type: "walk" },
// { type: "move" }, { type: "neutral" }, { type: "interrupt" }, { type: "quiz", correct }, { type: "enter" }.

const dummy = (n, x, y) => ({ id: `m${n}`, name: `Muñeco ${n}`, x, y });
const enemy = (n, x, y) => ({ ...dummy(n, x, y), name: `Enemigo ${n}` });
const portals = (...list) => list.map(([id, x, y]) => ({ id, x, y }));
const cast = (spell, test = () => true) => (ev) => ev.type === "cast" && ev.result.ok && (!spell || ev.spell === spell) && test(ev.result);
const hit = (id) => (r) => r.hits.includes(id);

export const LESSONS = [
  {
    title: "Abrí tus primeros portales",
    body: `<p>El Selatrop pelea con una red de <b>hasta 4 portales</b>. Cada portal se abre en una casilla libre a <b>1–6 casillas</b> de vos.</p>
      <p>Elegí el hechizo <b>Portal</b> en la barra de abajo (tecla <kbd>1</kbd>) y tocá una casilla azul.</p>`,
    tools: ["portal"],
    move: true,
    setup: () => ({ caster: { x: 7, y: 7 }, portals: [], entities: [], blocked: [] }),
    objectives: [
      { text: "Abrí un portal", done: (ev, s) => ev.type === "portal" && s.portals.length >= 1 },
      { text: "Abrí un segundo portal", done: (ev, s) => ev.type === "portal" && s.portals.length >= 2 },
    ],
  },
  {
    title: "Entrar por uno, salir por otro",
    body: `<p>Para proyectar un hechizo, <b>apuntás a un portal</b>. Ese portal es la <b>entrada</b>. Con dos portales, la salida es siempre el otro.</p>
      <p>Elegí <b>Golpe</b> (<kbd>2</kbd>) y apuntá al portal <b>A</b>. Mirá la línea punteada: amarillo es tu lanzamiento, celeste la red y verde la salida.</p>`,
    tools: ["golpe"],
    preview: true,
    setup: () => ({ caster: { x: 3, y: 6 }, portals: portals(["A", 5, 5], ["B", 10, 9]), entities: [dummy(1, 12, 8)], blocked: [] }),
    objectives: [
      { text: "Lanzá Golpe a través del portal A", done: cast("golpe", (r) => r.projected && r.entry.id === "A") },
      { text: "Afectá al Muñeco 1", done: cast("golpe", hit("m1")) },
    ],
  },
  {
    title: "El portal copia tu lanzamiento",
    body: `<p>El hechizo sale de la salida con <b>el mismo desplazamiento</b> que usaste para llegar a la entrada. Si apuntás 2 casillas en un eje y 1 en el otro, cae 2 y 1 más allá de la salida.</p>
      <p>Movete tocando una casilla verde (hasta 6 PM) hasta encontrar la posición desde la que Golpe por <b>A</b> cae sobre el muñeco.</p>`,
    tools: ["golpe"],
    move: true,
    preview: true,
    setup: () => ({ caster: { x: 2, y: 9 }, portals: portals(["A", 6, 4], ["B", 9, 11]), entities: [dummy(1, 11, 10)], blocked: [] }),
    objectives: [
      { text: "Movete a otra casilla", done: (ev) => ev.type === "move" },
      { text: "Afectá al muñeco a través de los portales", done: cast("golpe", (r) => r.projected && r.hits.includes("m1")) },
    ],
  },
  {
    title: "Con tres portales manda la cercanía",
    body: `<p>Después de la entrada, el hechizo viaja al <b>portal no usado más cercano</b> y repite hasta recorrerlos todos. El último es la salida.</p>
      <p>La distancia se cuenta en casillas: una diagonal suma los dos ejes.</p>
      <p>Sin vista previa esta vez: si entrás por <b>A</b>, ¿por cuál sale?</p>`,
    tools: ["golpe"],
    preview: false,
    quiz: { question: "Entrás por A. ¿Por qué portal sale?", options: ["B", "C"], answer: "B" },
    setup: () => ({ caster: { x: 2, y: 6 }, portals: portals(["A", 3, 3], ["B", 11, 4], ["C", 6, 8]), entities: [], blocked: [] }),
    objectives: [
      { text: "Respondé la pregunta", done: (ev) => ev.type === "quiz" },
      { text: "Comprobalo lanzando Golpe por A", done: cast("golpe", (r) => r.projected && r.entry.id === "A") },
    ],
  },
  {
    title: "La edad no decide la ruta",
    body: `<p>El número chico de cada portal es su <b>edad</b>: #1 es el más viejo, #4 el más nuevo. La edad solo dice cuál desaparece primero. La ruta la sigue decidiendo la cercanía.</p>`,
    tools: ["golpe"],
    preview: false,
    quiz: { question: "Entrás por A. ¿Por qué portal sale?", options: ["B", "C", "D"], answer: "B" },
    setup: () => ({ caster: { x: 2, y: 5 }, portals: portals(["A", 2, 2], ["B", 12, 12], ["C", 4, 3], ["D", 7, 4]), entities: [], blocked: [] }),
    objectives: [
      { text: "Respondé la pregunta", done: (ev) => ev.type === "quiz" },
      { text: "Comprobalo lanzando Golpe por A", done: cast("golpe", (r) => r.projected && r.entry.id === "A") },
    ],
  },
  {
    title: "Una cola de cuatro",
    body: `<p>Ya tenés 4 portales. Si abrís un <b>quinto</b>, desaparece el más viejo (#1) y los demás bajan un puesto. El nuevo pasa a ser el #4 y hereda la letra libre.</p>`,
    tools: ["portal"],
    move: true,
    setup: () => ({ caster: { x: 7, y: 7 }, portals: portals(["A", 4, 4], ["B", 10, 4], ["C", 10, 10], ["D", 4, 10]), entities: [], blocked: [] }),
    objectives: [{ text: "Abrí un quinto portal y mirá cuál se cierra", done: (ev) => ev.type === "portal" && !!ev.removed }],
  },
  {
    title: "Empates",
    body: `<p>Si dos portales quedan <b>a la misma distancia</b>, el juego desempata en sentido horario desde una línea de referencia que va de abajo-izquierda a arriba-derecha.</p>
      <p>Torrente Arcano lo explica con la <i>regla de la flecha</i> y la <i>regla del ojo</i>. Este simulador usa una aproximación de la regla horaria.</p>`,
    note: "Aproximación: comprobá los empates en el juego antes de confiar en ellos.",
    tools: ["golpe"],
    preview: true,
    setup: () => ({ caster: { x: 5, y: 7 }, portals: portals(["A", 7, 7], ["B", 10, 7], ["C", 7, 10]), entities: [], blocked: [] }),
    objectives: [{ text: "Lanzá Golpe por A y mirá qué portal gana el empate", done: cast("golpe", (r) => r.projected) }],
  },
  {
    title: "Línea de visión en dos tramos",
    body: `<p>Un hechizo proyectado necesita línea de visión <b>dos veces</b>: de vos a la entrada, y de la salida al impacto. Los obstáculos y las criaturas la cortan; los portales no.</p>
      <p>Las casillas azul claro están en alcance pero sin visión. Rodeá la roca para afectar al muñeco a través de <b>A</b>.</p>`,
    tools: ["golpe"],
    move: true,
    preview: true,
    setup: () => ({
      caster: { x: 2, y: 7 },
      portals: portals(["A", 6, 7], ["B", 11, 3]),
      entities: [dummy(1, 12, 5)],
      blocked: [[4, 6], [4, 7], [4, 8], [12, 1]],
    }),
    objectives: [
      { text: "Intentá lanzar por A sin línea de visión", done: (ev) => ev.type === "cast" && !ev.result.ok && ev.result.reason.startsWith("los") },
      { text: "Afectá al muñeco a través de A", done: cast("golpe", (r) => r.projected && r.hits.includes("m1")) },
    ],
  },
  {
    title: "Áreas a través de portales",
    body: `<p>La zona de un hechizo se dibuja <b>alrededor del impacto</b>, después de salir del portal. Una cruz que sale de un portal afecta a todos los que estén en esa cruz.</p>
      <p>Usá <b>Cruz</b> (<kbd>3</kbd>) para afectar a los dos muñecos con un solo lanzamiento.</p>`,
    tools: ["cruz"],
    move: true,
    preview: true,
    setup: () => ({ caster: { x: 3, y: 9 }, portals: portals(["A", 5, 4], ["B", 10, 10]), entities: [dummy(1, 12, 10), dummy(2, 13, 9)], blocked: [] }),
    objectives: [{ text: "Afectá a los dos muñecos con una Cruz proyectada", done: cast("cruz", (r) => r.projected && r.hits.length >= 2) }],
  },
  {
    title: "Empujar a través de portales",
    body: `<p>Un empuje proyectado empuja en la <b>misma dirección de tu lanzamiento</b>. Si algo choca con un obstáculo, otra criatura o el borde, se frena.</p>
      <p><b>Insulto</b> (<kbd>4</kbd>) golpea una línea de 3 casillas perpendicular y empuja 2. Mandá al muñeco contra la roca.</p>`,
    tools: ["insulto"],
    move: true,
    preview: true,
    setup: () => ({ caster: { x: 4, y: 6 }, portals: portals(["A", 6, 6], ["B", 10, 10]), entities: [dummy(1, 12, 10)], blocked: [[14, 10]] }),
    objectives: [{ text: "Empujá al muñeco contra la roca", done: cast("insulto", (r) => r.moves.some((m) => m.collided)) }],
  },
  {
    title: "Empujar dentro de un portal",
    body: `<p>Si un empuje mete a una criatura en un portal, la criatura <b>sale por el final de la red</b>, igual que un hechizo.</p>
      <p>Lanzá Insulto directo al muñeco para empujarlo dentro de <b>A</b>.</p>`,
    note: "Aproximación: el simulador frena el empuje al salir del portal.",
    tools: ["insulto"],
    move: true,
    preview: true,
    setup: () => ({ caster: { x: 4, y: 7 }, portals: portals(["A", 8, 7], ["B", 12, 2]), entities: [dummy(1, 6, 7)], blocked: [] }),
    objectives: [{ text: "Empujá al muñeco dentro del portal A", done: cast("insulto", (r) => r.moves.some((m) => m.teleported)) }],
  },
  {
    title: "Orden de los empujes",
    body: `<p>Cuando un empuje mueve a varios a la vez, el orden importa: el que se mueve primero puede bloquear al siguiente.</p>
      <p>Según Torrente Arcano, los empujes se resuelven <b>de afuera hacia el centro</b>, en sentido antihorario. <b>Convulsión</b> (<kbd>5</kbd>) es una X: el centro empuja hacia adelante y las esquinas en diagonal.</p>`,
    note: "Aproximación: las distancias de empuje son de ejemplo.",
    tools: ["convulsion"],
    move: true,
    preview: true,
    setup: () => ({ caster: { x: 3, y: 7 }, portals: [], entities: [dummy(1, 6, 7), dummy(2, 7, 6), dummy(3, 7, 8), dummy(4, 5, 6)], blocked: [] }),
    objectives: [{ text: "Afectá al menos a 3 muñecos con Convulsión", done: cast("convulsion", (r) => r.hits.length >= 3) }],
  },
  {
    title: "Atracciones",
    body: `<p>Las atracciones se resuelven <b>del centro hacia afuera</b>, en sentido horario. Cada criatura se acerca al centro del impacto hasta que choca.</p>
      <p><b>Shock</b> (<kbd>6</kbd>) golpea un círculo de radio 2 y atrae una casilla hacia el centro. Proyectalo por <b>A</b> sobre el grupo.</p>`,
    note: "Aproximación: la distancia de atracción es de ejemplo.",
    tools: ["shock"],
    move: true,
    preview: true,
    setup: () => ({ caster: { x: 3, y: 7 }, portals: portals(["A", 5, 7], ["B", 10, 4]), entities: [dummy(1, 12, 2), dummy(2, 14, 4), dummy(3, 10, 4)], blocked: [] }),
    objectives: [{ text: "Atraé al menos a 2 muñecos con Shock proyectado", done: cast("shock", (r) => r.projected && r.moves.filter((m) => m.path.length).length >= 2) }],
  },
  {
    title: "Caminar por la red",
    body: `<p>Si <b>caminás sobre un portal</b>, entrás a la red y salís por el final de la ruta. Al hacerlo se <b>cierran la entrada y la salida</b>.</p>
      <p>Muchas veces queda vivo el par del medio, que puede darte mejor línea. Caminá hasta el portal <b>A</b>.</p>`,
    tools: [],
    move: true,
    preview: true,
    setup: () => ({ caster: { x: 2, y: 7 }, portals: portals(["A", 4, 7], ["B", 7, 5], ["C", 9, 9], ["D", 12, 7]), entities: [], blocked: [] }),
    objectives: [{ text: "Caminá a través de la red", done: (ev) => ev.type === "walk" }],
  },
  {
    title: "Neutral e Interrupción",
    body: `<p><b>Neutral</b> (<kbd>7</kbd>) cierra un solo portal. <b>Interrupción</b> (<kbd>8</kbd>) cierra la red entera.</p>
      <p>Cerrar un portal cambia toda la ruta: después de usar Neutral, volvé a calcular desde la entrada.</p>`,
    tools: ["neutral", "interrupcion", "portal"],
    move: true,
    setup: () => ({ caster: { x: 7, y: 7 }, portals: portals(["A", 4, 4], ["B", 10, 4], ["C", 10, 10], ["D", 4, 10]), entities: [], blocked: [] }),
    objectives: [
      { text: "Cerrá un portal con Neutral", done: (ev) => ev.type === "neutral" },
      { text: "Cerrá todos con Interrupción", done: (ev) => ev.type === "interrupt" },
    ],
  },
  {
    title: "Un mapa compartido",
    body: `<p>Tu red no es solo tuya:</p>
      <ul>
        <li><b>Tus aliados</b> pueden lanzar sus hechizos por tus portales. Pensá la red para ellos: un Hipermago quiere una línea corta y recta, un Ocra necesita distancia.</li>
        <li><b>Los enemigos no cruzan portales en el primer turno</b>, salvo invocaciones o monstruos que llegan en oleadas. Por eso conviene jugar primero y dejar portales abiertos.</li>
        <li>Después del primer turno, tu red puede ser <b>una autopista para el enemigo</b>. Antes de pasar turno, preguntate si el próximo en jugar la aprovecha mejor que vos.</li>
        <li>Golpear un <b>tótem</b> parado sobre un portal activa el portal, sin cambiar el orden de la cola.</li>
      </ul>`,
    tools: [],
    setup: () => ({ caster: { x: 7, y: 7 }, portals: portals(["A", 4, 5], ["B", 11, 9]), entities: [], blocked: [] }),
    objectives: [{ text: "Leé la lección", done: (ev) => ev.type === "enter" }],
  },
  {
    title: "Playground",
    body: `<p>Tu mapa, tus reglas. Armá el escenario con las herramientas de <b>Editar mapa</b> y probá redes, áreas, empujes y atracciones.</p>
      <p>Atajos: <kbd>1</kbd>–<kbd>8</kbd> eligen hechizo, <kbd>Esc</kbd> o clic derecho cancela, y la rueda del mouse hace zoom. Tu escenario se guarda en este navegador.</p>`,
    tools: ["portal", "golpe", "cruz", "insulto", "convulsion", "shock", "neutral", "interrupcion"],
    move: true,
    preview: true,
    playground: true,
    setup: () => ({
      caster: { x: 2, y: 7 },
      portals: [],
      entities: [enemy(1, 10, 4), enemy(2, 11, 5), enemy(3, 12, 10), enemy(4, 8, 11)],
      blocked: [[6, 3], [6, 4], [9, 8], [10, 8], [4, 11]],
    }),
    objectives: [],
  },
];
