'use strict';

const VERSION = '2.0.4';
const CLAVE = 'hojasDnD.v1';
const CLAVE_DM = 'hojasDnD.partidasDM';

// ===== Reglas =====
const CARACTERISTICAS = [
  { id: 'fue', nombre: 'Fuerza' },
  { id: 'des', nombre: 'Destreza' },
  { id: 'con', nombre: 'Constitución' },
  { id: 'int', nombre: 'Inteligencia' },
  { id: 'sab', nombre: 'Sabiduría' },
  { id: 'car', nombre: 'Carisma' },
];
const HABILIDADES = [
  ['atletismo', 'Atletismo', 'fue'],
  ['acrobacias', 'Acrobacias', 'des'],
  ['juegoManos', 'Juego de manos', 'des'],
  ['sigilo', 'Sigilo', 'des'],
  ['arcano', 'Conocimiento arcano', 'int'],
  ['historia', 'Historia', 'int'],
  ['investigacion', 'Investigación', 'int'],
  ['naturaleza', 'Naturaleza', 'int'],
  ['religion', 'Religión', 'int'],
  ['medicina', 'Medicina', 'sab'],
  ['percepcion', 'Percepción', 'sab'],
  ['perspicacia', 'Perspicacia', 'sab'],
  ['supervivencia', 'Supervivencia', 'sab'],
  ['tratoAnimales', 'Trato con animales', 'sab'],
  ['engano', 'Engaño', 'car'],
  ['interpretacion', 'Interpretación', 'car'],
  ['intimidacion', 'Intimidación', 'car'],
  ['persuasion', 'Persuasión', 'car'],
].map(([id, nombre, car]) => ({ id, nombre, car }));

const num = v => Number(v) || 0;
const modificador = puntuacion => Math.floor(((puntuacion === '' || puntuacion == null ? 10 : Number(puntuacion)) - 10) / 2);
const nivelValido = n => Math.min(20, Math.max(1, Math.floor(num(n)) || 1));
const bonifCompetencia = nivel => 2 + Math.floor((nivelValido(nivel) - 1) / 4);
const conSigno = n => (n < 0 ? '−' : '+') + Math.abs(n);
const nombreCarac = id => CARACTERISTICAS.find(c => c.id === id).nombre;

// Los nombres del catálogo se comparan sin mayúsculas, pero con tildes (igual que en Forja).
const comparable = t => String(t ?? '').trim().toLocaleLowerCase('es');
const buscarNombre = (lista, texto) => lista.find(n => comparable(n) === comparable(texto));
const datosClase = nombre => CLASES.find(c => comparable(c.nombre) === comparable(nombre));
const datosEspecie = nombre => ESPECIES.find(e => comparable(e.nombre) === comparable(nombre));
const datosTrasfondo = nombre => TRASFONDOS.find(t => comparable(t.nombre) === comparable(nombre));

// ===== Reglas: clases y niveles =====
const nivelTotal = p => Math.min(20, Math.max(1, p.clases.reduce((s, c) => s + nivelValido(c.nivel), 0)));
const dadoClase = c => {
  const d = datosClase(c.nombre);
  return d ? 'd' + d.dado : DADOS_GOLPE.includes(c.dado) ? c.dado : 'd8';
};
// { d10: 3, d8: 2 }: cuántos dados de golpe de cada tipo tiene el personaje.
function dadosGolpe(p) {
  const r = {};
  for (const c of p.clases) r[dadoClase(c)] = (r[dadoClase(c)] || 0) + nivelValido(c.nivel);
  return Object.fromEntries(DADOS_GOLPE.filter(d => r[d]).map(d => [d, r[d]]));
}
const subclaseDesbloqueada = c => nivelValido(c.nivel) >= NIVEL_SUBCLASE;

// Clases del personaje que lanzan conjuros (el Caballero arcano y el Embaucador arcano, desde el nivel 3).
function lanzadores(p) {
  return p.clases.map(c => {
    const d = datosClase(c.nombre);
    if (!d) return null;
    let { lanzamiento, aptitud } = d;
    const sub = d.lanzadoras && Object.entries(d.lanzadoras).find(([n]) => comparable(n) === comparable(c.subclase));
    if (sub && subclaseDesbloqueada(c)) ({ lanzamiento, aptitud } = sub[1]);
    return lanzamiento === 'ninguno' ? null : { clase: d.nombre, nivel: nivelValido(c.nivel), lanzamiento, aptitud };
  }).filter(Boolean);
}

// Con una sola clase lanzadora se usa su tabla; con varias, la tabla de multiclase del libro
// (la mitad de paladín y explorador redondeando hacia arriba, un tercio de las subclases arcanas hacia abajo).
function espaciosCalculados(p) {
  const normales = lanzadores(p).filter(l => l.lanzamiento !== 'pacto');
  const divisor = { completo: 1, medio: 2, tercio: 3 };
  let nivel = 0;
  if (normales.length === 1) {
    nivel = Math.ceil(normales[0].nivel / divisor[normales[0].lanzamiento]);
  } else {
    for (const l of normales) nivel += l.lanzamiento === 'tercio' ? Math.floor(l.nivel / 3) : Math.ceil(l.nivel / divisor[l.lanzamiento]);
  }
  const fila = nivel ? ESPACIOS[Math.min(20, nivel) - 1] : [];
  return Array.from({ length: 9 }, (_, i) => fila[i] || 0);
}
function pactoCalculado(p) {
  const brujo = lanzadores(p).find(l => l.lanzamiento === 'pacto');
  return brujo ? espaciosPacto(brujo.nivel) : null;
}

// Datos que salen de otros: nivel total y espacios de conjuro (si no se ajustan a mano).
function sincronizar(p) {
  p.nivel = nivelTotal(p);
  const calculados = espaciosCalculados(p);
  p.magia.espacios.forEach((e, i) => {
    if (!p.magia.manual) e.total = calculados[i];
    e.gastados = Math.min(e.gastados, e.total);
  });
  const pacto = pactoCalculado(p);
  p.magia.pacto.gastados = pacto ? Math.min(p.magia.pacto.gastados, pacto.cantidad) : 0;
  const dados = dadosGolpe(p);
  for (const d of DADOS_GOLPE) p.dg.gastados[d] = Math.min(Math.max(0, num(p.dg.gastados[d])), dados[d] || 0);
}

// Huecos de dote según los niveles de cada clase. clave = dónde se guarda la elección en dotesNivel.
function huecosDote(p) {
  const huecos = [{ clave: 'origen', titulo: 'De origen' + (p.trasfondo ? ` (${p.trasfondo})` : ''), grupos: ['origen'] }];
  for (const c of p.clases) {
    const d = datosClase(c.nombre);
    const nombre = (d ? d.nombre : c.nombre.trim()).replace(/\./g, '');  // el punto separa rutas: no puede ir en la clave
    if (!nombre) continue;
    const nv = nivelValido(c.nivel);
    if (d && d.estilo && nv >= d.estilo) {
      huecos.push({ clave: `${nombre}@${d.estilo}!estilo`, titulo: `${nombre} ${d.estilo} · Estilo de combate`, grupos: ['estilo'] });
    }
    for (const n of (d && d.dotes) || NIVELES_DOTE) {
      if (nv < n) continue;
      huecos.push(n === NIVEL_DON_EPICO
        ? { clave: `${nombre}@${n}`, titulo: `${nombre} ${n} · Don épico`, grupos: ['epico', 'general', 'origen'] }
        : { clave: `${nombre}@${n}`, titulo: `${nombre} ${n}`, grupos: ['general', 'origen'] });
    }
  }
  return huecos;
}

// Dotes que tiene ahora (las de huecos que ya no le tocan, p. ej. tras bajar de nivel, no cuentan).
function dotesActivas(p) {
  const visibles = new Set(huecosDote(p).map(hd => hd.clave));
  return [...Object.entries(p.dotesNivel).filter(([k]) => visibles.has(k)).map(([, v]) => v), ...p.dotesExtra].filter(Boolean);
}
const tieneDote = (p, nombre) => dotesActivas(p).some(d => comparable(d) === comparable(nombre));

// Multiclase: 13 o más en la característica principal de todas las clases, la nueva incluida.
function requisitosMulticlase(p, nueva) {
  const faltan = [];
  for (const nombre of [...p.clases.map(c => c.nombre), nueva]) {
    const d = datosClase(nombre);
    if (!d || faltan.some(f => f.startsWith(d.nombre))) continue;
    const cumple = c => num(p.punt[c]) >= 13;
    if (d.basta_una ? d.principal.some(cumple) : d.principal.every(cumple)) continue;
    faltan.push(`${d.nombre}: ${d.principal.map(nombreCarac).join(d.basta_una ? ' o ' : ' y ')} 13`);
  }
  return faltan;
}

const miles = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');  // 6800 → 6.800
const pxNum = p => {
  const t = String(p.px ?? '').replace(/\D/g, '');
  return t === '' ? null : Number(t);
};
const pxMinimo = p => PX_NIVEL[nivelTotal(p) - 1];
// PX de los que se parte al sumar: nunca menos de lo que pide el nivel (p. ej. una partida que empieza en nivel 10).
const pxBase = p => Math.max(pxNum(p) || 0, pxMinimo(p));

// Los PX siguen al nivel que decide el DM: nunca por debajo del mínimo del nivel, y si el personaje baja
// de nivel (otra partida que empieza más abajo) con PX de sobra para el siguiente, empieza el nivel de cero.
// Sin PX apuntados (subida por hitos) no se toca nada. Se llama al terminar de cambiar algo, no con cada tecla:
// si no, borrar el «8» para escribir «12» bajaría el nivel a 1 por el camino. Devuelve true si cambia los PX.
const nivelDePX = new WeakMap();  // personaje → nivel con el que se ajustaron sus PX por última vez
function ajustarPX(p) {
  const nivel = nivelTotal(p);
  const nivelAntes = nivelDePX.has(p) ? nivelDePX.get(p) : nivel;
  nivelDePX.set(p, nivel);
  const px = pxNum(p);
  if (px === null) return false;
  let nuevo = px;
  if (nivel < nivelAntes && nivel < 20 && px >= PX_NIVEL[nivel]) nuevo = pxMinimo(p);
  else if (px < pxMinimo(p)) nuevo = pxMinimo(p);
  if (nuevo === px) return false;
  p.px = nuevo;
  return true;
}

// ===== Modelo de datos =====
function crearId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function nuevoPersonaje() {
  return {
    id: crearId(),
    modificado: Date.now(),
    nombre: '',
    clases: [],  // [{ nombre, nivel, subclase, dado }]; normalizar() añade la primera
    especie: '', linaje: '', trasfondo: '',
    nivel: 1,  // nivel total: la suma de las clases (lo calcula sincronizar)
    px: '',
    pxRecibidos: [],  // ids de los premios de PX del DM ya sumados (para no sumarlos dos veces)
    ca: '', escudo: false, velocidad: '9 m', tamano: 'Mediano', iniciativaExtra: '',
    pg: { act: '', temp: '', max: '' },
    dg: { gastados: Object.fromEntries(DADOS_GOLPE.map(d => [d, 0])) },
    muerte: { exitos: 0, fallos: 0 },
    inspiracion: false,
    punt: { fue: 10, des: 10, con: 10, int: 10, sab: 10, car: 10 },
    salv: { fue: false, des: false, con: false, int: false, sab: false, car: false },
    hab: Object.fromEntries(HABILIDADES.map(h => [h.id, 0])),
    armaduras: { ligera: false, media: false, pesada: false, escudo: false },
    compArmas: '', compHerramientas: '',
    armas: [],
    rasgosClase: '', atributosEspecie: '',
    dotesNivel: {},  // clave del hueco (ver huecosDote) → nombre de la dote
    dotesExtra: [],
    dotes: '',  // notas sobre las dotes
    magia: {
      aptitud: '',  // solo se usa si ninguna clase del catálogo lanza conjuros
      manual: false,  // true = los totales de espacios se ajustan a mano
      espacios: Array.from({ length: 9 }, () => ({ total: 0, gastados: 0 })),
      pacto: { gastados: 0 },
    },
    conjuros: [],
    elegidas: [],  // cartas del mazo elegidas de una lista que no son conjuros (invocaciones del brujo…), por nombre
    imagen: null, altura: '', peso: '', edad: '', aspecto: '', historia: '', alineamiento: '', idiomas: '', equipo: '',
    sintonia: Array.from({ length: 3 }, () => ({ activo: false, nombre: '' })),
    monedas: { pc: '', pp: '', pe: '', po: '', ppt: '' },
    partida: '', partidaNombre: '',  // código y nombre de la partida a la que está unido
  };
}
const nuevaClase = () => ({ nombre: '', nivel: 1, subclase: '', dado: 'd8' });
const nuevaArma = () => ({ nombre: '', bonif: '', dano: '', notas: '' });
// carta = nombre de la carta del mazo de la que sale; auto = la añadió la Hoja sola (ver cartas.js).
const nuevoConjuro = () => ({ nivel: 0, nombre: '', tiempo: '', alcance: '', c: false, r: false, m: false, notas: '', carta: '', auto: false });

// Mezcla datos guardados/importados con la plantilla, para que nunca falte ningún campo.
function fusionar(base, datos) {
  if (datos === undefined || datos === null) return base;
  if (Array.isArray(base)) {
    if (!Array.isArray(datos)) return base;
    return base.length ? base.map((b, i) => fusionar(b, datos[i])) : datos;
  }
  if (typeof base === 'object' && base !== null) {
    if (typeof datos !== 'object' || Array.isArray(datos)) return base;
    const r = { ...datos };
    for (const k of Object.keys(base)) r[k] = fusionar(base[k], datos[k]);
    return r;
  }
  if (typeof base === 'boolean') return !!datos;
  return typeof datos === 'object' ? base : datos;
}

function normalizar(datos) {
  const p = fusionar(nuevoPersonaje(), datos);
  p.clases = p.clases.filter(c => c && typeof c === 'object').map(c => {
    const r = fusionar(nuevaClase(), c);
    r.nivel = nivelValido(r.nivel);
    return r;
  });
  migrarV1(p, datos);
  if (!p.clases.length) p.clases.push(nuevaClase());
  p.armas = p.armas.filter(a => a && typeof a === 'object').map(a => fusionar(nuevaArma(), a));
  p.conjuros = p.conjuros.filter(c => c && typeof c === 'object').map(c => fusionar(nuevoConjuro(), c));
  p.dotesExtra = p.dotesExtra.filter(d => typeof d === 'string');
  p.pxRecibidos = p.pxRecibidos.filter(d => typeof d === 'string');
  p.elegidas = p.elegidas.filter(d => typeof d === 'string').slice(0, 200);
  for (const [k, v] of Object.entries(p.dotesNivel)) if (typeof v !== 'string') delete p.dotesNivel[k];
  p.imagen = imagenValida(datos && datos.imagen);
  if (!p.id) p.id = crearId();
  sincronizar(p);
  ajustarPX(p);
  return p;
}

// Hojas de la v1: clase, subclase, especie y trasfondo eran texto libre, el nivel se escribía a mano
// y había un solo tipo de dado de golpe. Lo que coincide con el catálogo pasa a los desplegables;
// lo que no, se queda como «Otro…» con el texto tal cual.
function migrarV1(p, datos) {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos.clases)) return;
  const texto = v => (typeof v === 'string' ? v.trim() : '');
  const dgViejo = datos.dg && typeof datos.dg === 'object' ? datos.dg : {};
  const clase = datosClase(datos.clase);
  const dado = clase ? 'd' + clase.dado : buscarNombre(DADOS_GOLPE, dgViejo.dado) || 'd8';
  p.clases = [{
    nombre: clase ? clase.nombre : texto(datos.clase),
    nivel: nivelValido(datos.nivel),
    subclase: (clase && buscarNombre(clase.subclases, datos.subclase)) || texto(datos.subclase),
    dado,
  }];
  p.dg = { gastados: Object.fromEntries(DADOS_GOLPE.map(d => [d, 0])) };
  p.dg.gastados[dado] = Math.max(0, Math.floor(num(dgViejo.gastados)));
  delete p.clase;
  delete p.subclase;

  // «Tiefling ctónico» → Tiefling + Ctónico
  const especieTexto = texto(datos.especie);
  const especie = datosEspecie(especieTexto) || ESPECIES.find(e => comparable(especieTexto).startsWith(comparable(e.nombre) + ' '));
  if (especie) {
    p.especie = especie.nombre;
    const resto = especieTexto.slice(especie.nombre.length).trim();
    p.linaje = (resto && especie.linajes.find(l => comparable(l).startsWith(comparable(resto)))) || '';
  } else {
    p.especie = especieTexto;
  }
  const trasfondo = datosTrasfondo(datos.trasfondo);
  if (trasfondo) {
    p.trasfondo = trasfondo.nombre;
    p.dotesNivel.origen = trasfondo.dote;
  }

  // Si los espacios que había apuntados no coinciden con la tabla, se respetan (ajuste a mano).
  const calculados = espaciosCalculados(p);
  const viejos = p.magia.espacios.map(e => num(e.total));
  if (viejos.some((t, i) => t !== calculados[i]) && viejos.some(Boolean)) p.magia.manual = true;
}

// imagen = { src (JPEG en base64), ancho, alto (píxeles), zoom (1-4), x, y (0-1: qué parte queda a la vista) }
function imagenValida(im) {
  if (!im || typeof im.src !== 'string' || !im.src.startsWith('data:image/')) return null;
  const rango = (v, def, min, max) => (Number.isFinite(Number(v)) && v !== null ? Math.min(max, Math.max(min, Number(v))) : def);
  return {
    src: im.src,
    ancho: rango(im.ancho, 1, 1, 100000),
    alto: rango(im.alto, 1, 1, 100000),
    zoom: rango(im.zoom, 1, 1, 4),
    x: rango(im.x, .5, 0, 1),
    y: rango(im.y, .5, 0, 1),
  };
}

const leer = (obj, ruta) => ruta.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
function escribir(obj, ruta, valor) {
  const claves = ruta.split('.');
  const ultima = claves.pop();
  claves.reduce((o, k) => o[k], obj)[ultima] = valor;
}

// ===== Guardado =====
let personajes = cargar();
let actual = null;
let pestana = 'combate';
let modoLectura = false;  // true cuando el DM mira la hoja de un jugador

function cargar() {
  try {
    const datos = JSON.parse(localStorage.getItem(CLAVE));
    return Array.isArray(datos) ? datos.map(normalizar) : [];
  } catch {
    return [];
  }
}

let temporizador = null;
function guardar() {
  if (modoLectura) return;
  if (actual) {
    actual.modificado = Date.now();
    if (actual.partida) programarEnvio(actual.id);
  }
  clearTimeout(temporizador);
  temporizador = setTimeout(guardarYa, 300);
}
function guardarYa() {
  clearTimeout(temporizador);
  try {
    localStorage.setItem(CLAVE, JSON.stringify(personajes));
  } catch (e) {
    aviso(e.name === 'QuotaExceededError'
      ? 'No queda espacio para guardar. Quita alguna imagen o borra personajes que no uses.'
      : 'No se ha podido guardar: ' + e.message);
  }
}
window.addEventListener('pagehide', guardarYa);
document.addEventListener('visibilitychange', () => { if (document.hidden) guardarYa(); });

// ===== Utilidades de interfaz =====
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

function h(etiqueta, props, ...hijos) {
  const e = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k in e && !k.includes('-')) e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of hijos.flat(Infinity)) if (c != null && c !== false) e.append(c);
  return e;
}

let temporizadorAviso = null;
function aviso(texto, ms = 2500) {
  const e = $('#aviso');
  e.textContent = texto;
  e.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => { e.hidden = true; }, ms);
}

function autoajustar(t) {
  t.style.height = 'auto';
  t.style.height = t.scrollHeight + 2 + 'px';
}

// ===== Lista de personajes =====
// «Paladín (Juramento de venganza) 3 · Tiefling» o, con multiclase, «Paladín 3 / Brujo 2 · Tiefling».
function resumen(p) {
  const clases = p.clases.filter(c => c.nombre.trim());
  let texto = `Nivel ${nivelTotal(p)}`;
  if (clases.length === 1 && p.clases.length === 1) {
    const c = clases[0];
    texto = `${c.nombre}${c.subclase && subclaseDesbloqueada(c) ? ` (${c.subclase})` : ''} ${nivelValido(c.nivel)}`;
  } else if (clases.length) {
    texto = clases.map(c => `${c.nombre} ${nivelValido(c.nivel)}`).join(' / ');
  }
  return [texto, p.especie].filter(Boolean).join(' · ');
}

function pintarLista() {
  const cont = $('#personajes');
  cont.replaceChildren();
  if (!personajes.length) {
    cont.append(h('p', { class: 'vacio' }, 'Todavía no hay personajes. Crea el primero con «Nuevo personaje» o importa un archivo.'));
    return;
  }
  [...personajes].sort((a, b) => b.modificado - a.modificado).forEach(p => {
    cont.append(h('article', { class: 'tarjeta-pj' },
      h('button', { class: 'abrir', onclick: () => abrir(p.id) },
        miniatura(p),
        h('div', { class: 'texto' },
          h('strong', {}, p.nombre || 'Sin nombre'),
          h('span', {}, resumen(p)),
          h('span', {}, `PG ${p.pg.act === '' ? '–' : p.pg.act} / ${p.pg.max === '' ? '–' : p.pg.max}`))),
      h('div', { class: 'acciones' },
        h('button', { onclick: () => duplicar(p.id) }, 'Duplicar'),
        h('button', { onclick: () => exportar([p], nombreArchivo(p.nombre)) }, 'Exportar'),
        h('button', { onclick: () => borrar(p.id) }, 'Borrar'))));
  });
}

function miniatura(p) {
  const caja = h('div', { class: 'miniatura' });
  if (p.imagen) {
    const img = h('img', { src: p.imagen.src, alt: '' });
    colocarImagen(img, p.imagen, 54, 72);
    caja.append(img);
  } else {
    caja.textContent = (p.nombre || '?').trim().charAt(0).toUpperCase() || '?';
  }
  return caja;
}

function crear() {
  const p = normalizar(nuevoPersonaje());
  personajes.push(p);
  guardarYa();
  abrir(p.id, 'ficha');
  setTimeout(() => $('[data-campo="nombre"]').focus(), 50);
}

function duplicar(id) {
  const original = personajes.find(p => p.id === id);
  const copia = normalizar(JSON.parse(JSON.stringify(original)));
  copia.id = crearId();
  copia.nombre = (original.nombre || 'Sin nombre') + ' (copia)';
  copia.modificado = Date.now();
  copia.partida = copia.partidaNombre = '';
  copia.pxRecibidos = [];
  copiarMazo(original.id, copia.id);
  personajes.push(copia);
  guardarYa();
  pintarLista();
}

function borrar(id) {
  const p = personajes.find(x => x.id === id);
  if (!confirm(`¿Borrar a «${p.nombre || 'Sin nombre'}»? No se puede deshacer.\n(Si quieres conservarlo, expórtalo antes.)`)) return false;
  if (p.partida) quitarPersonajeNube(p.partida, p.id).catch(() => {});
  personajes = personajes.filter(x => x.id !== id);
  borrarMazo(id);
  escucharPremios();
  guardarYa();
  pintarLista();
  return true;
}

// ===== Exportar / importar =====
function nombreArchivo(nombre) {
  const limpio = (nombre || 'personaje').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '');
  return (limpio || 'personaje') + '.json';
}

async function exportar(lista, nombre) {
  guardarYa();
  const datos = { app: 'hoja-dnd-2024', version: 1, exportado: new Date().toISOString(), personajes: lista };
  const archivo = new File([JSON.stringify(datos, null, 2)], nombre, { type: 'application/json' });
  const esMovil = matchMedia('(pointer: coarse)').matches;
  if (esMovil && navigator.canShare && navigator.canShare({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: nombre });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(archivo);
  const a = h('a', { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function importar(archivo) {
  let lista;
  try {
    const datos = JSON.parse(await archivo.text());
    lista = Array.isArray(datos) ? datos : Array.isArray(datos.personajes) ? datos.personajes : [datos];
  } catch {
    aviso('El archivo no es una hoja de personaje válida');
    return;
  }
  let n = 0;
  for (const bruto of lista) {
    if (!bruto || typeof bruto !== 'object') continue;
    const p = normalizar(bruto);
    p.partida = p.partidaNombre = '';  // en otro móvil no podría seguir enviándola: hay que volver a unirse
    const i = personajes.findIndex(x => x.id === p.id);
    if (i >= 0) {
      if (confirm(`Ya tienes a «${personajes[i].nombre || 'Sin nombre'}».\n¿Reemplazarlo por el del archivo?\n(Cancelar = importarlo como copia)`)) {
        personajes[i] = p;
      } else {
        p.id = crearId();
        personajes.push(p);
      }
    } else {
      personajes.push(p);
    }
    n++;
  }
  guardarYa();
  pintarLista();
  aviso(n === 1 ? '1 personaje importado' : `${n} personajes importados`);
}

// ===== Hoja: construcción =====
function construirCaracteristicas() {
  const cont = $('#lista-caracteristicas');
  for (const c of CARACTERISTICAS) {
    const habilidades = HABILIDADES.filter(hb => hb.car === c.id);
    cont.append(h('div', { class: 'caja carac' },
      h('div', { class: 'carac-izq' },
        h('span', { class: 'nombre' }, c.nombre),
        h('span', { class: 'mod', 'data-calc': 'mod-' + c.id }),
        h('input', { 'data-campo': 'punt.' + c.id, 'data-tipo': 'num', type: 'number', inputmode: 'numeric', 'aria-label': 'Puntuación de ' + c.nombre }),
        h('span', { class: 'etq' }, 'Puntuación')),
      h('ul', { class: 'tiradas' },
        h('li', { class: 'salvacion' },
          h('button', { class: 'prof', 'data-accion': 'salv', 'data-id': c.id, 'aria-label': 'Competencia en salvación de ' + c.nombre }),
          h('span', { class: 'valor', 'data-calc': 'salv-' + c.id }),
          h('span', {}, 'Tirada de salvación')),
        habilidades.map(hb => h('li', {},
          h('button', { class: 'prof', 'data-accion': 'hab', 'data-id': hb.id, 'aria-label': 'Competencia en ' + hb.nombre }),
          h('span', { class: 'valor', 'data-calc': 'hab-' + hb.id }),
          h('span', {}, hb.nombre))))));
  }
}

function pintarArmas(abrirIndice) {
  const cont = $('#lista-armas');
  cont.replaceChildren();
  if (!actual.armas.length) cont.append(h('p', { class: 'vacia' }, 'Sin armas ni trucos todavía.'));
  actual.armas.forEach((a, i) => {
    const ruta = `armas.${i}.`;
    cont.append(h('details', { 'data-lista': 'armas', 'data-i': i, open: i === abrirIndice },
      h('summary', {}),
      h('div', { class: 'cuerpo' },
        h('label', { class: 'campo ancho' }, 'Nombre', h('input', { 'data-campo': ruta + 'nombre', autocomplete: 'off' })),
        h('label', { class: 'campo' }, 'Bonif. ataque / CD', h('input', { 'data-campo': ruta + 'bonif', autocomplete: 'off' })),
        h('label', { class: 'campo' }, 'Daño y tipo', h('input', { 'data-campo': ruta + 'dano', autocomplete: 'off' })),
        h('label', { class: 'campo ancho' }, 'Notas', h('textarea', { 'data-campo': ruta + 'notas', rows: 1 })),
        h('button', { class: 'peligro borrar', 'data-accion': 'borrarArma', 'data-i': i }, 'Borrar'))));
  });
  cont.querySelectorAll('details').forEach(pintarResumen);
}

function pintarConjuros(abrirIndice) {
  const cont = $('#lista-conjuros');
  cont.replaceChildren();
  if (!actual.conjuros.length) cont.append(h('p', { class: 'vacia' }, 'Sin conjuros todavía.'));
  actual.conjuros.forEach((c, i) => {
    const ruta = `conjuros.${i}.`;
    cont.append(h('details', { 'data-lista': 'conjuros', 'data-i': i, open: i === abrirIndice },
      h('summary', {}),
      h('div', { class: 'cuerpo' },
        h('label', { class: 'campo ancho' }, 'Nombre', h('input', { 'data-campo': ruta + 'nombre', autocomplete: 'off' })),
        h('label', { class: 'campo' }, 'Nivel (0 = truco)', h('input', { 'data-campo': ruta + 'nivel', 'data-tipo': 'num', type: 'number', inputmode: 'numeric', min: 0, max: 9 })),
        h('label', { class: 'campo' }, 'Tiempo de lanzamiento', h('input', { 'data-campo': ruta + 'tiempo', autocomplete: 'off' })),
        h('label', { class: 'campo ancho' }, 'Alcance', h('input', { 'data-campo': ruta + 'alcance', autocomplete: 'off' })),
        h('div', { class: 'crm' },
          h('label', {}, h('input', { type: 'checkbox', 'data-campo': ruta + 'c' }), 'Concentración'),
          h('label', {}, h('input', { type: 'checkbox', 'data-campo': ruta + 'r' }), 'Ritual'),
          h('label', {}, h('input', { type: 'checkbox', 'data-campo': ruta + 'm' }), 'Material')),
        h('label', { class: 'campo ancho' }, 'Notas', h('textarea', { 'data-campo': ruta + 'notas', rows: 1 })),
        c.carta && h('button', { class: 'ver-carta', 'data-accion': 'verCarta', 'data-nombre': c.carta }, '🃏 Ver carta'),
        c.auto
          ? h('span', { class: 'ayuda auto' }, 'Te toca siempre: se añade solo desde el mazo.')
          : h('button', { class: 'peligro borrar', 'data-accion': 'borrarConjuro', 'data-i': i }, 'Borrar'))));
  });
  cont.querySelectorAll('details').forEach(pintarResumen);
}

function pintarResumen(det) {
  const item = actual[det.dataset.lista][det.dataset.i];
  const s = det.querySelector('summary');
  if (det.dataset.lista === 'armas') {
    s.replaceChildren(
      h('span', { class: 'a' }, item.bonif || '—'),
      h('span', { class: 'n' }, item.nombre || 'Sin nombre'),
      h('span', { class: 'b' }, item.dano));
  } else {
    const nivel = num(item.nivel);
    s.replaceChildren(
      h('span', { class: 'a' }, nivel ? 'Nv ' + nivel : 'Truco'),
      h('span', { class: 'n' }, (item.carta ? '🃏 ' : '') + (item.nombre || 'Sin nombre')),
      h('span', { class: 'b' }, [item.c && 'C', item.r && 'R', item.m && 'M'].filter(Boolean).join(' ')));
  }
}

function rombos(cantidad, marcados, atributos) {
  return Array.from({ length: cantidad }, (_, i) =>
    h('button', { class: 'rombo' + (i < marcados ? ' on' : ''), 'data-i': i, ...atributos, 'aria-label': `${i + 1}` }));
}

function pintarEspacios() {
  const p = actual;
  const manual = p.magia.manual;
  const filas = p.magia.espacios.map((e, n) => (manual || e.total) && h('div', { class: 'espacio' },
    h('span', { class: 'nv' }, `Nivel ${n + 1}`),
    h('div', { class: 'contador' },
      manual && h('button', { class: 'icono', 'data-accion': 'espacioTotal', 'data-n': n, 'data-d': -1, 'aria-label': 'Quitar espacio' }, '−'),
      h('b', {}, e.total),
      manual && h('button', { class: 'icono', 'data-accion': 'espacioTotal', 'data-n': n, 'data-d': 1, 'aria-label': 'Añadir espacio' }, '+')),
    h('div', { class: 'rombos' }, rombos(e.total, e.gastados, { 'data-accion': 'espacio', 'data-n': n }))));
  const pacto = pactoCalculado(p);
  if (pacto) {
    filas.push(h('div', { class: 'espacio pacto' },
      h('span', { class: 'nv' }, `Pacto`, h('small', {}, `nivel ${pacto.nivel}`)),
      h('div', { class: 'contador' }, h('b', {}, pacto.cantidad)),
      h('div', { class: 'rombos' }, rombos(pacto.cantidad, p.magia.pacto.gastados, { 'data-accion': 'espacioPacto' }))));
  }
  $('#lista-espacios').replaceChildren(...filas.filter(Boolean));
}

function pintarEstados() {
  const p = actual;
  $$('.prof[data-accion=salv]').forEach(b => { b.dataset.nivel = p.salv[b.dataset.id] ? 1 : 0; });
  $$('.prof[data-accion=hab]').forEach(b => { b.dataset.nivel = p.hab[b.dataset.id] || 0; });
  $$('[data-muerte]').forEach(cont => {
    const tipo = cont.dataset.muerte;
    cont.replaceChildren(...rombos(3, p.muerte[tipo], { 'data-accion': 'muerte', 'data-tipo': tipo }));
  });
  $('[data-estado=inspiracion]').setAttribute('aria-pressed', p.inspiracion);
  const max = num(p.pg.max);
  const proporcion = max ? Math.max(0, Math.min(1, num(p.pg.act) / max)) : 0;
  const barra = $('[data-estado=pgBarra]');
  barra.style.width = proporcion * 100 + '%';
  barra.className = proporcion <= .25 ? 'bajo' : proporcion <= .5 ? 'medio' : '';
}

// ===== Ficha: desplegables del catálogo =====
const OTRO = '__otro';
const camposOtro = new Set();  // rutas en las que se ha elegido «Otro…» (aunque aún no se haya escrito nada)

// Desplegable con los nombres del catálogo y «Otro…», que abre una casilla para escribir un nombre casero.
// opciones = lista de nombres, o [[título del grupo, lista], ...].
function selector({ etiqueta, ruta, opciones, vacio = '— Elige —', bloqueado = false, clase = 'campo' }) {
  const valor = leer(actual, ruta) || '';
  const grupos = typeof opciones[0] === 'string' ? [[null, opciones]] : opciones;
  const todas = grupos.flatMap(g => g[1]);
  const delCatalogo = buscarNombre(todas, valor);
  const esOtro = !delCatalogo && (valor !== '' || camposOtro.has(ruta));
  const opcion = (v, texto) => h('option', { value: v }, texto);
  const sel = h('select', { 'data-cat': ruta, disabled: bloqueado, 'data-bloqueado': bloqueado },
    opcion('', vacio),
    grupos.map(([titulo, lista]) => (titulo ? h('optgroup', { label: titulo }, lista.map(n => opcion(n, n))) : lista.map(n => opcion(n, n)))),
    opcion(OTRO, 'Otro…'));
  sel.value = esOtro ? OTRO : delCatalogo || '';
  return h('label', { class: clase }, etiqueta, sel,
    esOtro && h('input', { 'data-cat-otro': ruta, value: valor, placeholder: 'Escribe el nombre', autocomplete: 'off', disabled: bloqueado, 'data-bloqueado': bloqueado }));
}

function pintarFicha() {
  const p = actual;
  const cont = $('#ficha-clases');
  cont.replaceChildren(...p.clases.map((c, i) => {
    const d = datosClase(c.nombre);
    const ruta = `clases.${i}.`;
    const bloqueada = !subclaseDesbloqueada(c);
    const etqSub = bloqueada ? `Subclase (se desbloquea en el nivel ${NIVEL_SUBCLASE})` : 'Subclase';
    return h('div', { class: 'fila-clase' },
      selector({ etiqueta: p.clases.length > 1 ? `Clase ${i + 1}` : 'Clase', ruta: ruta + 'nombre', opciones: CLASES.map(x => x.nombre) }),
      h('label', { class: 'campo nivel-clase' }, 'Nivel',
        h('input', { 'data-campo': ruta + 'nivel', 'data-tipo': 'num', 'data-repinta': '', type: 'number', inputmode: 'numeric', min: 1, max: 20, value: c.nivel })),
      p.clases.length > 1 && h('button', { class: 'icono quitar solo-edicion', 'data-accion': 'quitarClase', 'data-i': i, 'aria-label': 'Quitar esta clase' }, '×'),
      d
        ? selector({ etiqueta: etqSub, ruta: ruta + 'subclase', opciones: d.subclases, bloqueado: bloqueada, clase: 'campo sub' })
        : !c.nombre.trim() && !camposOtro.has(ruta + 'nombre')
          ? h('label', { class: 'campo sub' }, 'Subclase',
            h('select', { disabled: true, 'data-bloqueado': true }, h('option', {}, 'Elige primero la clase')))
          : h('div', { class: 'sub fila2' },
          h('label', { class: 'campo' }, etqSub,
            h('input', { 'data-campo': ruta + 'subclase', autocomplete: 'off', value: c.subclase, disabled: bloqueada, 'data-bloqueado': bloqueada })),
          h('label', { class: 'campo' }, 'Dado de golpe',
            h('select', { 'data-campo': ruta + 'dado', 'data-repinta': '' }, DADOS_GOLPE.map(x => h('option', { value: x, selected: x === c.dado }, x))))));
  }));
  const suma = p.clases.reduce((s, c) => s + nivelValido(c.nivel), 0);
  $('#nivel-total').replaceChildren(
    `Nivel total ${nivelTotal(p)} · Bonif. por competencia ${conSigno(bonifCompetencia(p.nivel))}`,
    suma > 20 ? h('span', { class: 'aviso-suave' }, ` ⚠ Las clases suman ${suma}: el máximo es 20.`) : '');
  const tope = nivelTotal(p) >= 20;
  const b = $('#btn-subir-nivel');
  b.disabled = tope;
  b.toggleAttribute('data-bloqueado', tope);
  b.textContent = tope ? 'Nivel máximo' : '⬆ Subir de nivel';

  const especie = datosEspecie(p.especie);
  const trasfondo = datosTrasfondo(p.trasfondo);
  $('#ficha-origen').replaceChildren(...[
    selector({ etiqueta: 'Especie', ruta: 'especie', opciones: ESPECIES.map(e => e.nombre) }),
    especie && especie.linajes.length
      ? selector({ etiqueta: especie.linaje, ruta: 'linaje', opciones: especie.linajes })
      : !especie && p.especie ? h('label', { class: 'campo' }, 'Linaje', h('input', { 'data-campo': 'linaje', autocomplete: 'off', value: p.linaje })) : '',
    especie && especie.tamano.length > 1 &&
      h('label', { class: 'campo' }, 'Tamaño',
        h('select', { 'data-campo': 'tamano' }, especie.tamano.map(t => h('option', { value: t, selected: t === p.tamano }, t)))),
    selector({ etiqueta: 'Trasfondo', ruta: 'trasfondo', opciones: TRASFONDOS.map(t => t.nombre), clase: 'campo ancho2' }),
    trasfondo && h('p', { class: 'ayuda ancho2' }, `Dote de origen del trasfondo: ${trasfondo.dote}`),
  ].filter(Boolean));
}

// Al elegir algo en un desplegable, ajusta lo que depende de ello.
function alElegir(ruta, anterior) {
  const p = actual;
  const m = ruta.match(/^clases\.(\d+)\.nombre$/);
  if (m) {
    const c = p.clases[m[1]];
    const d = datosClase(c.nombre);
    if (comparable(anterior) !== comparable(c.nombre)) c.subclase = '';
    if (d) c.dado = 'd' + d.dado;
  } else if (ruta === 'especie') {
    const e = datosEspecie(p.especie);
    if (comparable(anterior) !== comparable(p.especie)) p.linaje = '';
    if (e) {
      if (!e.tamano.includes(p.tamano)) p.tamano = e.tamano[0];
      p.velocidad = e.velocidad;
    }
  } else if (ruta === 'trasfondo') {
    // La dote de origen sigue al trasfondo, salvo que el jugador haya elegido otra.
    const viejo = datosTrasfondo(anterior);
    const nuevo = datosTrasfondo(p.trasfondo);
    const dote = p.dotesNivel.origen || '';
    if (nuevo && (!dote || (viejo && dote === viejo.dote))) p.dotesNivel.origen = nuevo.dote;
  }
}

function pintarDotes() {
  const p = actual;
  const grupos = ids => ids.map(id => [GRUPOS_DOTES.find(g => g[0] === id)[1], DOTES[id]]);
  const todos = grupos(GRUPOS_DOTES.map(g => g[0]));
  $('#lista-dotes').replaceChildren(
    ...huecosDote(p).map(hd => selector({ etiqueta: hd.titulo, ruta: 'dotesNivel.' + hd.clave, opciones: grupos(hd.grupos), clase: 'campo hueco-dote' })),
    ...p.dotesExtra.map((_, i) => h('div', { class: 'dote-extra' },
      selector({ etiqueta: 'Dote extra', ruta: 'dotesExtra.' + i, opciones: todos, clase: 'campo hueco-dote' }),
      h('button', { class: 'icono quitar solo-edicion', 'data-accion': 'quitarDote', 'data-i': i, 'aria-label': 'Quitar esta dote' }, '×'))));
}

function pintarDados() {
  const p = actual;
  const dados = dadosGolpe(p);
  $('#lista-dg').replaceChildren(...Object.entries(dados).map(([d, total]) => h('div', { class: 'fila-dg' },
    h('b', { class: 'dado' }, `${total}${d}`),
    h('div', { class: 'contador' },
      h('span', { class: 'etq' }, 'Gastados'),
      h('button', { class: 'icono', 'data-accion': 'dg', 'data-dado': d, 'data-d': -1, 'aria-label': 'Quitar' }, '−'),
      h('b', {}, p.dg.gastados[d]), h('span', {}, '/ ' + total),
      h('button', { class: 'icono', 'data-accion': 'dg', 'data-dado': d, 'data-d': 1, 'aria-label': 'Añadir' }, '+')))));
}

// Barra de experiencia: se rellena desde los PX del nivel actual hasta los del siguiente.
function pintarPX() {
  const p = actual;
  // ajustarPX puede haber cambiado los PX (al cambiar de nivel): se ve en la casilla salvo mientras se escribe en ella.
  const campo = $('[data-campo="px"]');
  if (campo && document.activeElement !== campo && campo.value !== String(p.px)) campo.value = p.px;
  const px = pxNum(p);
  const nivel = nivelTotal(p);
  const barra = $('#px-barra');
  const listo = px !== null && nivel < 20 && px >= PX_NIVEL[nivel];
  barra.hidden = px === null;
  $('#px-subir').hidden = !listo || modoLectura;
  if (px === null) {
    $('#px-texto').textContent = '';
    return;
  }
  if (nivel >= 20) {
    $('#px-texto').textContent = `${miles(px)} PX · Nivel máximo`;
    barra.firstChild.style.width = '100%';
    barra.firstChild.className = 'lleno';
    return;
  }
  const desde = PX_NIVEL[nivel - 1];
  const hasta = PX_NIVEL[nivel];
  const pct = Math.max(0, Math.min(100, Math.floor((px - desde) / (hasta - desde) * 100)));
  $('#px-texto').textContent = `${miles(px)} / ${miles(hasta)} PX · ${pct} %`;
  barra.firstChild.style.width = pct + '%';
  barra.firstChild.className = listo ? 'lleno' : 'px-normal';
}

function pintarMagia() {
  const p = actual;
  const lista = lanzadores(p);
  $('#magia-clases').hidden = !lista.length;
  $('#magia-manual').hidden = !!lista.length;
  const prof = bonifCompetencia(p.nivel);
  $('#lista-aptitudes').replaceChildren(...lista.map(l => {
    const mod = modificador(p.punt[l.aptitud]);
    return h('div', { class: 'aptitud' },
      h('div', { class: 'aptitud-nombre' }, h('b', {}, l.clase), h('span', {}, nombreCarac(l.aptitud))),
      h('div', { class: 'cuadricula tres' },
        h('div', { class: 'dato' }, h('span', { class: 'etq' }, 'Modificador'), h('span', { class: 'grande' }, conSigno(mod))),
        h('div', { class: 'dato' }, h('span', { class: 'etq' }, 'CD de salvación'), h('span', { class: 'grande' }, 8 + mod + prof)),
        h('div', { class: 'dato' }, h('span', { class: 'etq' }, 'Bonif. de ataque'), h('span', { class: 'grande' }, conSigno(mod + prof)))));
  }));
  const normales = espaciosCalculados(p).some(Boolean);
  $('#ayuda-espacios').textContent = p.magia.manual
    ? 'Ajusta el total con − / + y toca los rombos para marcar los gastados.'
    : normales || pactoCalculado(p)
      ? 'Los totales salen de tus clases. Toca los rombos para marcar los gastados.'
      : 'Tus clases no tienen espacios de conjuro. Si los necesitas, márcalo abajo para ajustarlos a mano.';
}

// ===== Imagen del personaje =====
const RETRATO = { ancho: 180, alto: 240 };  // igual que .retrato en estilos.css
const ZOOM_MAX = 4;
let editandoImagen = false;

// La imagen siempre cubre todo el recuadro; zoom la agranda y x/y eligen qué parte se ve.
function medidasImagen(imagen, ancho, alto) {
  const escala = Math.max(ancho / imagen.ancho, alto / imagen.alto) * imagen.zoom;
  return { w: imagen.ancho * escala, h: imagen.alto * escala };
}

function colocarImagen(img, imagen, ancho, alto) {
  const m = medidasImagen(imagen, ancho, alto);
  img.style.width = m.w + 'px';
  img.style.height = m.h + 'px';
  img.style.left = (ancho - m.w) * imagen.x + 'px';
  img.style.top = (alto - m.h) * imagen.y + 'px';
}

function pintarRetrato() {
  const im = actual.imagen;
  if (!im) editandoImagen = false;
  const img = $('#retrato-img');
  img.hidden = !im;
  $('#retrato-vacio').hidden = !!im;
  $('#btn-subir').textContent = im ? 'Cambiar imagen' : 'Subir imagen';
  $('#btn-encuadrar').hidden = !im || editandoImagen;
  $('#btn-quitar').hidden = !im;
  $('#retrato-edicion').hidden = !editandoImagen;
  $('#retrato').classList.toggle('editando', editandoImagen);
  if (im) {
    if (img.getAttribute('src') !== im.src) img.src = im.src;
    colocarImagen(img, im, RETRATO.ancho, RETRATO.alto);
    $('#retrato-zoom').value = im.zoom;
  } else {
    img.removeAttribute('src');
  }
}

function leerArchivoImagen(archivo) {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error('imagen no válida')); };
    img.src = url;
  });
}

// Reduce la imagen (lado mayor 1000 px, JPEG) para que quepa en el almacenamiento del móvil.
async function cargarImagen(archivo) {
  let img;
  try {
    img = await leerArchivoImagen(archivo);
  } catch {
    aviso('No se ha podido abrir la imagen');
    return;
  }
  const factor = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
  const ancho = Math.round(img.naturalWidth * factor);
  const alto = Math.round(img.naturalHeight * factor);
  const lienzo = h('canvas', { width: ancho, height: alto });
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = '#ffffff';  // el JPEG no admite transparencia
  ctx.fillRect(0, 0, ancho, alto);
  ctx.drawImage(img, 0, 0, ancho, alto);
  actual.imagen = { src: lienzo.toDataURL('image/jpeg', .85), ancho, alto, zoom: 1, x: .5, y: .5 };
  editandoImagen = true;
  guardar();
  pintarRetrato();
}

function moverImagen(dx, dy) {
  const im = actual.imagen;
  const m = medidasImagen(im, RETRATO.ancho, RETRATO.alto);
  const sobraX = m.w - RETRATO.ancho;
  const sobraY = m.h - RETRATO.alto;
  if (sobraX > 0) im.x = Math.min(1, Math.max(0, im.x - dx / sobraX));
  if (sobraY > 0) im.y = Math.min(1, Math.max(0, im.y - dy / sobraY));
}

function zoomImagen(zoom) {
  actual.imagen.zoom = Math.min(ZOOM_MAX, Math.max(1, zoom));
}

// Arrastrar con un dedo (o el ratón) y pellizcar con dos.
const punteros = new Map();
const distancia = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function iniciarGestoImagen(ev) {
  if (!editandoImagen || !actual.imagen) return;
  ev.preventDefault();
  $('#retrato').setPointerCapture(ev.pointerId);
  punteros.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
}

function moverGestoImagen(ev) {
  const antes = punteros.get(ev.pointerId);
  if (!antes) return;
  const ahora = { x: ev.clientX, y: ev.clientY };
  if (punteros.size === 1) {
    moverImagen(ahora.x - antes.x, ahora.y - antes.y);
  } else {
    const otro = [...punteros].find(([id]) => id !== ev.pointerId)[1];
    const d = distancia(antes, otro);
    if (d > 0) zoomImagen(actual.imagen.zoom * distancia(ahora, otro) / d);
  }
  punteros.set(ev.pointerId, ahora);
  pintarRetrato();
}

function terminarGestoImagen(ev) {
  if (punteros.delete(ev.pointerId)) guardar();
}

// ===== Hoja: cálculos =====
function valorHabilidad(id, p = actual) {
  const hb = HABILIDADES.find(x => x.id === id);
  return modificador(p.punt[hb.car]) + bonifCompetencia(p.nivel) * (p.hab[id] || 0);
}

function recalcular() {
  const p = actual;
  sincronizar(p);
  const prof = bonifCompetencia(p.nivel);
  const mod = id => modificador(p.punt[id]);
  const ap = p.magia.aptitud;
  const valores = {
    titulo: p.nombre || 'Sin nombre',
    subtitulo: resumen(p),
    competencia: conSigno(prof),
    iniciativa: conSigno(mod('des') + num(p.iniciativaExtra)),
    pasiva: 10 + valorHabilidad('percepcion'),
    modMagia: ap ? conSigno(mod(ap)) : '—',
    cdMagia: ap ? 8 + mod(ap) + prof : '—',
    ataqueMagia: ap ? conSigno(mod(ap) + prof) : '—',
    modCon: conSigno(mod('con')),
  };
  for (const c of CARACTERISTICAS) {
    valores['mod-' + c.id] = conSigno(mod(c.id));
    valores['salv-' + c.id] = conSigno(mod(c.id) + (p.salv[c.id] ? prof : 0));
  }
  for (const hb of HABILIDADES) valores['hab-' + hb.id] = conSigno(valorHabilidad(hb.id));
  $$('[data-calc]').forEach(e => {
    const v = valores[e.dataset.calc];
    if (v !== undefined) e.textContent = v;
  });
  pintarEstados();
  pintarDados();
  pintarEspacios();
  pintarMagia();
  pintarPX();
}

// Copia los valores del personaje a los campos de la hoja.
function rellenar(raiz = $('#hoja')) {
  raiz.querySelectorAll('[data-campo]').forEach(e => {
    const v = leer(actual, e.dataset.campo);
    if (e.type === 'checkbox') e.checked = !!v;
    else e.value = v ?? '';
  });
}

function pintarHoja(mantenerScroll = false) {
  if (!mantenerScroll) camposOtro.clear();
  sincronizarCartas();
  pintarFicha();
  pintarDotes();
  pintarArmas();
  pintarConjuros();
  pintarCartas();
  editandoImagen = false;
  pintarRetrato();
  pintarPartidaJugador();
  rellenar();
  recalcular();
  aplicarModoLectura();
  mostrarPestana(pestana, mantenerScroll);
}

// En modo lectura se ve la hoja igual, pero no se puede tocar nada.
function aplicarModoLectura() {
  $('#vista-hoja').classList.toggle('lectura', modoLectura);
  $('#hoja').querySelectorAll('input, textarea, select, button').forEach(e => {
    if (e.matches('textarea, input:not([type=checkbox]):not([type=range]):not([type=file])')) e.readOnly = modoLectura;
    else e.disabled = modoLectura || e.hasAttribute('data-bloqueado');
  });
}

function mostrarPestana(nombre, mantenerScroll = false) {
  pestana = nombre;
  $$('.panel').forEach(p => { p.hidden = p.dataset.panel !== nombre; });
  $$('.pestanas button').forEach(b => {
    if (b.dataset.p === nombre) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  if (nombre === 'cartas') {
    sincronizarCartas();
    pintarCartas();
  }
  if (!mantenerScroll) window.scrollTo(0, 0);
  // Las áreas de texto solo se pueden medir cuando están visibles.
  requestAnimationFrame(() => $$(`[data-panel=${nombre}] textarea`).forEach(autoajustar));
}

// ===== Navegación =====
// Cada pantalla es una entrada del historial, para que el botón «atrás» del móvil funcione.
// estado = { vista: 'lista' | 'hoja' | 'dm' | 'partida' | 'lectura', id?, codigo? }
const PANTALLA = { lista: 'lista', hoja: 'hoja', lectura: 'hoja', dm: 'dm', partida: 'dm' };

function irA(estado) {
  history.pushState(estado, '', '#' + estado.vista);
  mostrarEstado(estado);
}

function mostrarEstado(estado) {
  if (actual && !modoLectura) guardarYa();
  const { vista } = estado;
  if (vista !== 'partida' && vista !== 'lectura') detenerEscucha();
  actual = null;
  modoLectura = false;
  if (vista === 'hoja') {
    actual = personajes.find(p => p.id === estado.id);
    if (!actual) return mostrarEstado({ vista: 'lista' });
    pintarHoja();
  } else if (vista === 'lectura') {
    actual = escucha.codigo === estado.codigo ? escucha.personajes.get(estado.id) : null;
    if (!actual) return mostrarEstado({ vista: 'partida', codigo: estado.codigo });
    modoLectura = true;
    pintarHoja();
    pintarHoraLectura();
  } else if (vista === 'partida') {
    escucharPartida(estado.codigo);
    pintarPartidaDM(estado.codigo);
  } else if (vista === 'dm') {
    pintarInicioDM();
  } else {
    pintarLista();
  }
  for (const nombre of ['lista', 'hoja', 'dm']) $('#vista-' + nombre).hidden = PANTALLA[vista] !== nombre;
  if (PANTALLA[vista] !== 'hoja') window.scrollTo(0, 0);
}

function abrir(id, pestanaInicial = 'combate') {
  pestana = pestanaInicial;
  irA({ vista: 'hoja', id });
}

window.addEventListener('popstate', ev => mostrarEstado(ev.state || { vista: 'lista' }));

// ===== Partida (jugador) =====
// Las hojas unidas a una partida se envían solas a la nube poco después de cada cambio.
const temporizadoresEnvio = new Map();
const estadoEnvio = new Map();  // id → { estado: 'enviando' | 'ok' | 'error', hora, mensaje }

function programarEnvio(id) {
  clearTimeout(temporizadoresEnvio.get(id));
  temporizadoresEnvio.set(id, setTimeout(() => enviarAhora(id), 1500));
}

async function enviarAhora(id) {
  temporizadoresEnvio.delete(id);
  const p = personajes.find(x => x.id === id);
  if (!p || !p.partida) return;
  estadoEnvio.set(id, { estado: 'enviando' });
  pintarPartidaJugador();
  try {
    await enviarPersonajeNube(p);
    estadoEnvio.set(id, { estado: 'ok', hora: new Date() });
  } catch (e) {
    estadoEnvio.set(id, { estado: 'error', mensaje: mensajeErrorNube(e) });
  }
  pintarPartidaJugador();
}

const formatoHora = fecha => fecha.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });

function pintarPartidaJugador() {
  if (!actual || modoLectura) return;
  const unido = !!actual.partida;
  $('#partida-fuera').hidden = unido;
  $('#partida-dentro').hidden = !unido;
  if (!unido) return;
  $('#partida-nombre').textContent = `«${actual.partidaNombre || 'Sin nombre'}»`;
  $('#partida-codigo').textContent = mostrarCodigo(actual.partida);
  const e = estadoEnvio.get(actual.id);
  $('#partida-estado').textContent =
    !e ? 'El DM ve esta hoja. Los cambios se le envían solos.'
      : e.estado === 'ok' ? `✓ Enviada al DM a las ${formatoHora(e.hora)}`
        : e.estado === 'enviando' ? (navigator.onLine ? 'Enviando…' : 'Sin conexión: se enviará al recuperar internet.')
          : '⚠ ' + e.mensaje;
}

async function unirse() {
  const p = actual;
  const codigo = normalizarCodigo($('#codigo-unirse').value);
  if (codigo.length !== 6) return aviso('El código tiene 6 letras o números, p. ej. ABC-123');
  aviso('Buscando la partida…');
  try {
    const partida = await buscarPartidaNube(codigo);
    if (!partida) return aviso('No hay ninguna partida con ese código');
    p.partida = codigo;
    p.partidaNombre = partida.nombre || '';
    $('#codigo-unirse').value = '';
    guardarYa();
    pintarPartidaJugador();
    aviso(`Te has unido a «${p.partidaNombre}»`);
    escucharPremios();
    enviarAhora(p.id);
  } catch (e) {
    aviso(mensajeErrorNube(e));
  }
}

function salirPartida() {
  const p = actual;
  if (!confirm(`¿Salir de «${p.partidaNombre}»? El DM dejará de ver esta hoja.`)) return;
  quitarPersonajeNube(p.partida, p.id).catch(() => {});
  clearTimeout(temporizadoresEnvio.get(p.id));
  estadoEnvio.delete(p.id);
  p.partida = p.partidaNombre = '';
  guardarYa();
  escucharPremios();
  pintarPartidaJugador();
}

// ===== Visor del DM =====
function partidasDM() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_DM)) || [];
  } catch {
    return [];
  }
}
function guardarPartidasDM(lista) {
  localStorage.setItem(CLAVE_DM, JSON.stringify(lista));
}
function recordarPartida(codigo, nombre) {
  guardarPartidasDM([{ codigo, nombre }, ...partidasDM().filter(x => x.codigo !== codigo)]);
}

function pintarInicioDM() {
  $('#dm-titulo').textContent = 'Visor del DM';
  $('#dm-subtitulo').textContent = '';
  const lista = partidasDM();
  $('#dm-contenido').replaceChildren(
    h('p', { class: 'ayuda' }, 'Crea una partida y pasa el código a tus jugadores. Verás sus hojas en directo, solo para leer.'),
    ...(lista.length
      ? lista.map(pt => h('article', { class: 'tarjeta-pj' },
        h('button', { class: 'abrir', 'data-accion': 'abrirPartida', 'data-codigo': pt.codigo },
          h('div', { class: 'texto' },
            h('strong', {}, pt.nombre || 'Sin nombre'),
            h('span', {}, 'Código ' + mostrarCodigo(pt.codigo)))),
        h('div', { class: 'acciones' },
          h('button', { 'data-accion': 'olvidarPartida', 'data-codigo': pt.codigo }, 'Olvidar'))))
      : [h('p', { class: 'vacio' }, 'Todavía no tienes partidas.')]),
    h('div', { class: 'botonera' },
      h('button', { class: 'primario', 'data-accion': 'crearPartida' }, '＋ Crear partida'),
      h('button', { 'data-accion': 'abrirCodigo' }, 'Abrir partida con código')));
}

async function crearPartida() {
  const nombre = prompt('Nombre de la partida (p. ej. «La mina perdida»):');
  if (nombre === null) return;
  const limpio = nombre.trim().slice(0, 100) || 'Partida';  // las reglas de Firestore no admiten más de 100
  aviso('Creando la partida…');
  try {
    const codigo = await crearPartidaNube(limpio);
    recordarPartida(codigo, limpio);
    irA({ vista: 'partida', codigo });
  } catch (e) {
    aviso(mensajeErrorNube(e));
  }
}

function abrirPartidaConCodigo() {
  const texto = prompt('Código de la partida:');
  if (texto === null) return;
  const codigo = normalizarCodigo(texto);
  if (codigo.length !== 6) return aviso('El código tiene 6 letras o números, p. ej. ABC-123');
  irA({ vista: 'partida', codigo });
}

// Partida que se está mirando: sus personajes llegan en directo desde la nube.
const escucha = { codigo: null, cancelar: null, partida: null, esDM: false, cargando: false, error: '', personajes: new Map(), horas: new Map() };

function detenerEscucha() {
  if (escucha.cancelar) escucha.cancelar();
  Object.assign(escucha, { codigo: null, cancelar: null, partida: null, esDM: false, cargando: false, error: '', personajes: new Map(), horas: new Map() });
}

async function escucharPartida(codigo) {
  if (escucha.codigo === codigo) return;
  detenerEscucha();
  escucha.codigo = codigo;
  escucha.cargando = true;
  try {
    const r = await escucharPartidaNube(codigo,
      docs => recibirPersonajes(codigo, docs),
      e => { if (escucha.codigo === codigo) { escucha.error = mensajeErrorNube(e); pintarPartidaDM(codigo); } });
    if (escucha.codigo !== codigo) {
      if (r) r.cancelar();
      return;
    }
    if (r) {
      Object.assign(escucha, { cancelar: r.cancelar, partida: r.partida, esDM: r.esDM });
      recordarPartida(codigo, r.partida.nombre);
    } else {
      escucha.error = 'No hay ninguna partida con ese código.';
    }
  } catch (e) {
    if (escucha.codigo !== codigo) return;
    escucha.error = mensajeErrorNube(e);
  }
  escucha.cargando = false;
  pintarPartidaDM(codigo);
}

function recibirPersonajes(codigo, docs) {
  if (escucha.codigo !== codigo) return;
  escucha.personajes = new Map();
  escucha.horas = new Map();
  for (const d of docs) {
    try {
      escucha.personajes.set(d.id, normalizar(JSON.parse(d.json)));
      escucha.horas.set(d.id, d.actualizado);
    } catch {
      // hoja dañada: se ignora
    }
  }
  const estado = history.state || {};
  if (estado.vista === 'partida') pintarPartidaDM(codigo);
  if (estado.vista === 'lectura' && modoLectura) {
    if (escucha.personajes.has(estado.id)) {
      actual = escucha.personajes.get(estado.id);
      repintarLectura();
    } else {
      aviso(`«${actual.nombre || 'Sin nombre'}» ha salido de la partida`);
      history.back();
    }
  }
}

// Vuelve a pintar la hoja que mira el DM sin perder la posición ni los desplegables abiertos.
function repintarLectura() {
  const abiertos = [...$$('#hoja details[open]')].map(d => d.dataset.lista + d.dataset.i);
  pintarHoja(true);
  $$('#hoja details').forEach(d => { if (abiertos.includes(d.dataset.lista + d.dataset.i)) d.open = true; });
  pintarHoraLectura();
}

function pintarHoraLectura() {
  const hora = escucha.horas.get(actual.id);
  $('#lectura-hora').textContent = hora ? 'cambiada a las ' + formatoHora(hora) : '';
}

function pintarPartidaDM(codigo) {
  const estado = history.state || {};
  if (estado.vista !== 'partida' || estado.codigo !== codigo) return;
  $('#dm-titulo').textContent = escucha.partida ? escucha.partida.nombre || 'Partida' : 'Partida';
  $('#dm-subtitulo').textContent = 'Código ' + mostrarCodigo(codigo);
  const cont = $('#dm-contenido');
  if (escucha.error) return cont.replaceChildren(h('p', { class: 'vacio' }, escucha.error));
  if (escucha.cargando && !escucha.personajes.size) return cont.replaceChildren(h('p', { class: 'vacio' }, 'Conectando…'));
  const pjs = [...escucha.personajes.values()].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
  cont.replaceChildren(
    h('div', { class: 'caja codigo-partida' },
      h('span', { class: 'etq' }, 'Código para los jugadores'),
      h('strong', { class: 'codigo-grande' }, mostrarCodigo(codigo)),
      h('button', { 'data-accion': 'compartirCodigo' }, 'Compartir código')),
    ...(escucha.esDM && pjs.length ? [h('button', { class: 'primario ancho dar-px', 'data-accion': 'abrirDarPX' }, '✨ Dar PX')] : []),
    ...(pjs.length
      ? pjs.map(tarjetaDM)
      : [h('p', { class: 'vacio' }, 'Todavía no se ha unido nadie. Los jugadores escriben el código en su hoja, en Ficha → Partida.')]));
}

function tarjetaDM(p) {
  const max = num(p.pg.max);
  const act = num(p.pg.act);
  const temp = num(p.pg.temp);
  const proporcion = max ? Math.max(0, Math.min(1, act / max)) : 0;
  const px = pxNum(p);
  const datos = [
    px !== null && `${miles(px)} PX`,
    `CA ${p.ca || '–'}`,
    `Iniciativa ${conSigno(modificador(p.punt.des) + num(p.iniciativaExtra))}`,
    `Pasiva ${10 + valorHabilidad('percepcion', p)}`,
    p.inspiracion && '✨ Inspiración',
    max && act === 0 && `💀 Muerte: ${p.muerte.exitos} éxitos, ${p.muerte.fallos} fallos`,
  ].filter(Boolean);
  const espacios = p.magia.espacios
    .map((e, i) => e.total && `Nv ${i + 1}: ${e.total - e.gastados}/${e.total}`)
    .filter(Boolean);
  const pacto = pactoCalculado(p);
  if (pacto) espacios.push(`Pacto (nv ${pacto.nivel}): ${pacto.cantidad - p.magia.pacto.gastados}/${pacto.cantidad}`);
  const hora = escucha.horas.get(p.id);
  return h('article', { class: 'tarjeta-pj tarjeta-dm' },
    h('button', { class: 'abrir', 'data-accion': 'verPersonaje', 'data-id': p.id },
      miniatura(p),
      h('div', { class: 'texto' },
        h('strong', {}, p.nombre || 'Sin nombre'),
        h('span', {}, resumen(p)),
        h('span', { class: 'pg-dm' }, `PG ${p.pg.act === '' ? '–' : act} / ${p.pg.max === '' ? '–' : max}` + (temp ? ` (+${temp} temp.)` : '')),
        h('div', { class: 'pg-barra' },
          h('span', { class: proporcion <= .25 ? 'bajo' : proporcion <= .5 ? 'medio' : '', style: `width: ${proporcion * 100}%` })),
        h('div', { class: 'chips' }, datos.map(d => h('span', { class: 'chip-dato' }, d))),
        espacios.length > 0 && h('div', { class: 'chips' }, espacios.map(d => h('span', { class: 'chip-dato magia' }, d))),
        hora && h('span', { class: 'hora' }, 'Cambiada a las ' + formatoHora(hora)))),
    escucha.esDM && h('div', { class: 'acciones' },
      h('button', { 'data-accion': 'quitarDePartida', 'data-id': p.id }, 'Quitar')));
}

async function compartirCodigo() {
  const nombre = escucha.partida ? escucha.partida.nombre : '';
  const texto = `Únete a la partida «${nombre}» en la Hoja de personaje con el código ${mostrarCodigo(escucha.codigo)}\n${location.origin + location.pathname}`;
  if (navigator.share) {
    try {
      await navigator.share({ text: texto });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(texto);
    aviso('Copiado: ya puedes pegarlo en el chat del grupo');
  } catch {
    aviso('Código: ' + mostrarCodigo(escucha.codigo));
  }
}

// ===== Dar PX (DM) =====
// El DM no toca las hojas: deja un «premio» en la partida y la app de cada jugador lo suma a su hoja.
function abrirDarPX() {
  const pjs = [...escucha.personajes.values()].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
  $('#px-cantidad').value = '';
  $('#px-motivo').value = '';
  $('#dlg-px [value=cada]').checked = true;
  $('#px-para').replaceChildren(...pjs.map(p => h('label', {},
    h('input', { type: 'checkbox', value: p.id, checked: true }), p.nombre || 'Sin nombre')));
  resumenDarPX();
  $('#dlg-px').showModal();
  $('#px-cantidad').focus();
}

// Cuántos PX recibe cada personaje elegido.
function repartoPX() {
  const total = Math.floor(num($('#px-cantidad').value));
  const para = [...$$('#px-para input:checked')].map(e => e.value);
  const repartir = $('#dlg-px [value=repartir]').checked;
  return { para, cada: para.length ? (repartir ? Math.floor(total / para.length) : total) : 0 };
}

function resumenDarPX() {
  const { para, cada } = repartoPX();
  $('#px-resumen').textContent = !para.length ? 'Elige al menos un personaje.'
    : cada > 0 ? `${para.length === 1 ? 'Recibe' : `Cada uno de los ${para.length} recibe`} ${miles(cada)} PX.` : '';
}

async function terminarDarPX(ev) {
  if (!ev.submitter || ev.submitter.value !== 'ok') return;
  const { para, cada } = repartoPX();
  if (!para.length || cada <= 0) {
    ev.preventDefault();
    return aviso(para.length ? 'Escribe los PX que ganan' : 'Elige al menos un personaje');
  }
  const motivo = $('#px-motivo').value.trim().slice(0, 100);
  try {
    await darPXNube(escucha.codigo, Math.min(cada, 1000000), para, motivo);
    aviso(`Enviado: ${miles(cada)} PX a ${para.length === 1 ? '1 personaje' : para.length + ' personajes'}`);
  } catch (e) {
    aviso(mensajeErrorNube(e));
  }
}

// ===== Premios de PX (jugador) =====
// Cada partida a la que hay hojas unidas se escucha mientras la app está abierta.
const escuchasPremios = new Map();  // código → función para dejar de escuchar (o promesa mientras conecta)
const MAX_RECIBIDOS = 200;

function escucharPremios() {
  const codigos = new Set(personajes.filter(p => p.partida).map(p => p.partida));
  for (const [codigo, cancelar] of escuchasPremios) {
    if (codigos.has(codigo)) continue;
    Promise.resolve(cancelar).then(f => f && f());
    escuchasPremios.delete(codigo);
  }
  for (const codigo of codigos) {
    if (escuchasPremios.has(codigo)) continue;
    const promesa = escucharPremiosNube(codigo, premios => recibirPremios(codigo, premios)).catch(() => {
      escuchasPremios.delete(codigo);  // sin conexión: se reintenta al volver internet
      return null;
    });
    escuchasPremios.set(codigo, promesa);
  }
}

function recibirPremios(codigo, premios) {
  const mensajes = [];
  for (const p of personajes) {
    if (p.partida !== codigo) continue;
    for (const pr of premios) {
      if (!Array.isArray(pr.para) || !pr.para.includes(p.id) || p.pxRecibidos.includes(pr.id)) continue;
      const px = Math.max(0, Math.floor(num(pr.px)));
      p.px = pxBase(p) + px;
      p.pxRecibidos = [...p.pxRecibidos, pr.id].slice(-MAX_RECIBIDOS);
      p.modificado = Date.now();
      mensajes.push(`${p.nombre || 'Sin nombre'}: +${miles(px)} PX` + (pr.motivo ? ` (${pr.motivo})` : ''));
      programarEnvio(p.id);
    }
  }
  if (!mensajes.length) return;
  guardarYa();
  if (actual && !modoLectura && personajes.includes(actual)) {
    rellenar();
    recalcular();
  } else if (!history.state || history.state.vista === 'lista') {
    pintarLista();
  }
  aviso('🎉 El DM te da PX. ' + mensajes.join(' · '), 7000);
}

// ===== Combate =====
function cantidadIntroducida() {
  const campo = $('#cantidad');
  const n = Math.floor(num(campo.value));
  if (n <= 0) {
    aviso('Escribe primero la cantidad');
    campo.focus();
    return 0;
  }
  campo.value = '';
  return n;
}

function aplicarDano(n) {
  const pg = actual.pg;
  const deTemporales = Math.min(num(pg.temp), n);
  pg.temp = num(pg.temp) - deTemporales || '';
  pg.act = Math.max(0, num(pg.act) - (n - deTemporales));
  aviso(`−${n} PG` + (deTemporales ? ` (${deTemporales} de temporales)` : ''));
}

function curar(n) {
  const pg = actual.pg;
  if (num(pg.act) === 0) actual.muerte = { exitos: 0, fallos: 0 };
  const max = num(pg.max);
  pg.act = max ? Math.min(max, num(pg.act) + n) : num(pg.act) + n;
}

function abrirDescansoCorto() {
  recalcular();
  const p = actual;
  $('#corto-dados').replaceChildren(...Object.entries(dadosGolpe(p)).map(([d, total]) => {
    const quedan = total - p.dg.gastados[d];
    return h('label', { class: 'campo ancho' }, `${d} que gastas (te quedan ${quedan})`,
      h('input', { type: 'number', inputmode: 'numeric', min: 0, max: quedan, value: 0, 'data-dado': d }));
  }));
  $('#corto-pg').value = '';
  $('#dlg-corto').showModal();
}

function terminarDescansoCorto(ev) {
  if (!ev.submitter || ev.submitter.value !== 'ok') return;
  const p = actual;
  const dados = dadosGolpe(p);
  let gastados = 0;
  $$('#corto-dados input').forEach(e => {
    const d = e.dataset.dado;
    const n = Math.min(dados[d] - p.dg.gastados[d], Math.max(0, Math.floor(num(e.value))));
    p.dg.gastados[d] += n;
    gastados += n;
  });
  const pgRecuperados = Math.max(0, Math.floor(num($('#corto-pg').value)));
  if (pgRecuperados) curar(pgRecuperados);
  const pacto = pactoCalculado(p) && p.magia.pacto.gastados > 0;
  p.magia.pacto.gastados = 0;  // el brujo recupera los espacios de pacto con un descanso corto
  guardar();
  rellenar();
  recalcular();
  aviso(`Descanso corto: +${pgRecuperados} PG, ${gastados} dado(s) de golpe gastado(s)` + (pacto ? ', espacios de pacto recuperados' : ''));
}

function descansoLargo() {
  if (!confirm('Descanso largo: recuperas todos los PG, los dados de golpe y los espacios de conjuro. ¿Continuar?')) return;
  const p = actual;
  if (p.pg.max !== '') p.pg.act = p.pg.max;
  p.pg.temp = '';
  for (const d of DADOS_GOLPE) p.dg.gastados[d] = 0;
  p.muerte = { exitos: 0, fallos: 0 };
  p.magia.espacios.forEach(e => { e.gastados = 0; });
  p.magia.pacto.gastados = 0;
  guardar();
  rellenar();
  recalcular();
  aviso('Descanso largo completado');
}

// ===== Subir de nivel =====
function abrirSubirNivel() {
  const p = actual;
  if (nivelTotal(p) >= 20) return aviso('Ya estás en el nivel máximo');
  $('#nivel-actual').textContent = `Ahora: ${resumen(p).split(' · ')[0]} (nivel total ${nivelTotal(p)}).`;
  const opcion = (valor, texto, marcada) => h('label', { class: 'opcion' },
    h('input', { type: 'radio', name: 'subir', value: valor, checked: marcada }), texto);
  $('#nivel-opciones').replaceChildren(
    ...p.clases.map((c, i) => opcion(i, `${c.nombre.trim() || 'Clase sin elegir'} ${nivelValido(c.nivel)} → ${nivelValido(c.nivel) + 1}`, i === 0)),
    opcion('nueva', 'Una clase nueva… (empieza en el nivel 1)', false));
  const yaTiene = p.clases.map(c => comparable(c.nombre));
  $('#nivel-clase').replaceChildren(
    h('option', { value: '' }, '— Elige —'),
    ...CLASES.filter(c => !yaTiene.includes(comparable(c.nombre))).map(c => h('option', { value: c.nombre }, c.nombre)),
    h('option', { value: OTRO }, 'Otro…'));
  $('#nivel-otra-dado').replaceChildren(...DADOS_GOLPE.map(d => h('option', { value: d, selected: d === 'd8' }, d)));
  $('#nivel-otra-nombre').value = '';
  delete $('#nivel-pg').dataset.dado;
  actualizarSubirNivel();
  $('#dlg-nivel').showModal();
}

// Clase elegida en el diálogo: { i } si ya la tiene, { nueva: { nombre, dado } } si es nueva.
function eleccionSubirNivel() {
  const v = ($('#nivel-opciones input:checked') || {}).value;
  if (v !== 'nueva') return { i: Number(v) };
  const sel = $('#nivel-clase').value;
  const d = datosClase(sel);
  if (d) return { nueva: { nombre: d.nombre, dado: 'd' + d.dado } };
  if (sel === OTRO) return { nueva: { nombre: $('#nivel-otra-nombre').value.trim(), dado: $('#nivel-otra-dado').value } };
  return { nueva: { nombre: '', dado: 'd8' } };
}

function actualizarSubirNivel() {
  const p = actual;
  const e = eleccionSubirNivel();
  const nueva = !!e.nueva;
  $('#nivel-nueva').hidden = !nueva;
  $('#nivel-otra').hidden = !nueva || $('#nivel-clase').value !== OTRO;
  const faltan = nueva && e.nueva.nombre ? requisitosMulticlase(p, e.nueva.nombre) : [];
  const req = $('#nivel-requisitos');
  req.hidden = !faltan.length;
  req.textContent = `⚠ Para la multiclase hace falta 13 o más en: ${faltan.join('; ')}. Puedes subir igualmente si tu DM lo permite.`;
  const dado = nueva ? e.nueva.dado : dadoClase(p.clases[e.i]);
  const caras = Number(dado.slice(1));
  const media = caras / 2 + 1;
  const con = modificador(p.punt.con);
  const duro = tieneDote(p, 'Duro') ? 2 : 0;  // la dote Duro da 2 PG más por nivel
  const campoPG = $('#nivel-pg');
  if (campoPG.dataset.dado !== dado) {  // no pisa lo que haya escrito el jugador si el dado no cambia
    campoPG.value = Math.max(1, media + con) + duro;
    campoPG.dataset.dado = dado;
  }
  const extra = conSigno(con) + (duro ? ' +2' : '');
  $('#nivel-pg-ayuda').textContent = `La media del ${dado} es ${media}, más tu Constitución (${conSigno(con)})` +
    (duro ? ' y +2 de la dote Duro' : '') + `. Si prefieres tirar el dado, escribe tu resultado ${extra}.`;
}

function terminarSubirNivel(ev) {
  if (!ev.submitter || ev.submitter.value !== 'ok') return;
  const p = actual;
  const e = eleccionSubirNivel();
  if (e.nueva && !e.nueva.nombre) {
    ev.preventDefault();
    return aviso('Elige la clase nueva');
  }
  const antes = huecosDote(p).length;
  let c;
  if (e.nueva) {
    c = { ...nuevaClase(), ...e.nueva };
    p.clases.push(c);
  } else {
    c = p.clases[e.i];
    c.nivel = nivelValido(c.nivel) + 1;
  }
  const pg = Math.max(0, Math.floor(num($('#nivel-pg').value)));
  if (pg) {
    p.pg.max = num(p.pg.max) + pg;
    if (p.pg.act !== '') p.pg.act = num(p.pg.act) + pg;
  }
  sincronizar(p);
  ajustarPX(p);
  const novedades = [];
  if (nivelValido(c.nivel) === NIVEL_SUBCLASE && !c.subclase) novedades.push(`ya puedes elegir la subclase de ${c.nombre}`);
  if (huecosDote(p).length > antes) novedades.push('tienes una dote nueva en Rasgos');
  guardar();
  pintarHoja(true);
  aviso(`¡Nivel ${p.nivel}!` + (pg ? ` +${pg} PG máximos.` : '') + (novedades.length ? ' Ahora ' + novedades.join(' y ') + '.' : ''));
}

// ===== Eventos =====
const acciones = {
  nuevo: crear,
  importar: () => $('#archivo-importar').click(),
  exportarTodos: () => {
    if (!personajes.length) return aviso('No hay personajes que exportar');
    exportar(personajes, `hojas_personaje_${new Date().toISOString().slice(0, 10)}.json`);
  },
  volver: () => history.back(),
  exportar: () => exportar([actual], nombreArchivo(actual.nombre)),
  borrarActual: () => { if (borrar(actual.id)) history.back(); },
  pestana: b => mostrarPestana(b.dataset.p),
  salv: b => { actual.salv[b.dataset.id] = !actual.salv[b.dataset.id]; },
  hab: b => { actual.hab[b.dataset.id] = ((actual.hab[b.dataset.id] || 0) + 1) % 3; },
  inspiracion: () => { actual.inspiracion = !actual.inspiracion; },
  muerte: b => {
    const i = Number(b.dataset.i);
    actual.muerte[b.dataset.tipo] = actual.muerte[b.dataset.tipo] === i + 1 ? i : i + 1;
  },
  dg: b => {
    const d = b.dataset.dado;
    actual.dg.gastados[d] = Math.min(dadosGolpe(actual)[d] || 0, Math.max(0, actual.dg.gastados[d] + Number(b.dataset.d)));
  },
  subirNivel: abrirSubirNivel,
  sumarPX: () => {
    const campo = $('#px-suma');
    const n = Math.floor(num(campo.value));
    if (n <= 0) {
      aviso('Escribe primero los PX ganados');
      campo.focus();
      return;
    }
    campo.value = '';
    actual.px = pxBase(actual) + n;
    $('[data-campo="px"]').value = actual.px;
    aviso(`+${n} PX`);
  },
  quitarClase: b => {
    const c = actual.clases[b.dataset.i];
    if (!confirm(`¿Quitar la clase «${c.nombre.trim() || 'sin nombre'} ${nivelValido(c.nivel)}»?`)) return;
    actual.clases.splice(b.dataset.i, 1);
    ajustarPX(actual);
    sincronizarCartas();
    pintarFicha();
    pintarDotes();
  },
  nuevaDote: () => {
    actual.dotesExtra.push('');
    pintarDotes();
    const sel = $$('#lista-dotes .dote-extra select');
    sel[sel.length - 1].focus();
  },
  quitarDote: b => {
    actual.dotesExtra.splice(b.dataset.i, 1);
    sincronizarCartas();
    pintarDotes();
  },
  espacioPacto: b => {
    const i = Number(b.dataset.i);
    actual.magia.pacto.gastados = actual.magia.pacto.gastados === i + 1 ? i : i + 1;
  },
  dano: () => { const n = cantidadIntroducida(); if (n) { aplicarDano(n); rellenar(); } },
  curar: () => { const n = cantidadIntroducida(); if (n) { curar(n); rellenar(); aviso(`+${n} PG`); } },
  corto: abrirDescansoCorto,
  largo: descansoLargo,
  espacioTotal: b => {
    const e = actual.magia.espacios[b.dataset.n];
    e.total = Math.min(9, Math.max(0, e.total + Number(b.dataset.d)));
    e.gastados = Math.min(e.gastados, e.total);
  },
  espacio: b => {
    const e = actual.magia.espacios[b.dataset.n];
    const i = Number(b.dataset.i);
    e.gastados = e.gastados === i + 1 ? i : i + 1;
  },
  nuevaArma: () => {
    actual.armas.push(nuevaArma());
    pintarArmas(actual.armas.length - 1);
    rellenar($('#lista-armas'));
    $('#lista-armas details[open] input').focus();
  },
  borrarArma: b => {
    const a = actual.armas[b.dataset.i];
    if (!confirm(`¿Borrar «${a.nombre || 'Sin nombre'}»?`)) return;
    actual.armas.splice(b.dataset.i, 1);
    pintarArmas();
    rellenar($('#lista-armas'));
  },
  nuevoConjuro: () => {
    actual.conjuros.push(nuevoConjuro());
    pintarConjuros(actual.conjuros.length - 1);
    rellenar($('#lista-conjuros'));
    $('#lista-conjuros details[open] input').focus();
  },
  borrarConjuro: b => {
    const c = actual.conjuros[b.dataset.i];
    if (!confirm(`¿Borrar «${c.nombre || 'Sin nombre'}»?`)) return;
    actual.conjuros.splice(b.dataset.i, 1);
    pintarConjuros();
    rellenar($('#lista-conjuros'));
  },
  subirImagen: () => $('#archivo-imagen').click(),
  encuadrar: () => {
    editandoImagen = !editandoImagen;
    pintarRetrato();
  },
  centrarImagen: () => {
    Object.assign(actual.imagen, { zoom: 1, x: .5, y: .5 });
    pintarRetrato();
  },
  quitarImagen: () => {
    if (!confirm('¿Quitar la imagen del personaje?')) return;
    actual.imagen = null;
    pintarRetrato();
  },
  ordenarConjuros: () => {
    actual.conjuros.sort((a, b) => num(a.nivel) - num(b.nivel) || a.nombre.localeCompare(b.nombre, 'es'));
    pintarConjuros();
    rellenar($('#lista-conjuros'));
  },
  unirse,
  salirPartida,
  visorDM: () => irA({ vista: 'dm' }),
  crearPartida,
  abrirCodigo: abrirPartidaConCodigo,
  abrirPartida: b => irA({ vista: 'partida', codigo: b.dataset.codigo }),
  olvidarPartida: b => {
    if (!confirm('¿Quitar esta partida de tu lista? (La partida sigue existiendo: puedes volver a abrirla con su código.)')) return;
    guardarPartidasDM(partidasDM().filter(x => x.codigo !== b.dataset.codigo));
    pintarInicioDM();
  },
  compartirCodigo,
  abrirDarPX,
  verPersonaje: b => {
    pestana = 'combate';
    irA({ vista: 'lectura', codigo: escucha.codigo, id: b.dataset.id });
  },
  quitarDePartida: b => {
    const p = escucha.personajes.get(b.dataset.id);
    if (!confirm(`¿Quitar a «${p.nombre || 'Sin nombre'}» de la partida?\nSu hoja no se borra del móvil del jugador. Sirve para hojas antiguas o repetidas: si el jugador sigue unido, volverá a aparecer cuando cambie algo.`)) return;
    quitarPersonajeNube(escucha.codigo, b.dataset.id).catch(e => aviso(mensajeErrorNube(e)));
  },
};
// Acciones que no modifican el personaje (no hace falta guardar ni recalcular).
const SIN_CAMBIOS = new Set(['nuevo', 'importar', 'exportarTodos', 'volver', 'exportar', 'borrarActual', 'pestana', 'corto', 'largo', 'subirNivel',
  'subirImagen', 'encuadrar', 'unirse', 'salirPartida', 'visorDM', 'crearPartida', 'abrirCodigo', 'abrirPartida', 'olvidarPartida',
  'compartirCodigo', 'abrirDarPX', 'verPersonaje', 'quitarDePartida']);

document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-accion]');
  if (!b) return;
  ev.preventDefault();
  const accion = b.dataset.accion;
  acciones[accion](b);
  if (actual && !SIN_CAMBIOS.has(accion)) {
    guardar();
    recalcular();
  }
});

$('#hoja').addEventListener('input', ev => {
  const t = ev.target;
  if (t.dataset.catOtro) {
    escribir(actual, t.dataset.catOtro, t.value);
    guardar();
    recalcular();
    return;
  }
  const ruta = t.dataset.campo;
  if (!ruta) return;
  let v = t.type === 'checkbox' ? t.checked : t.value;
  if (t.dataset.tipo === 'num' && v !== '') v = Number(v);
  escribir(actual, ruta, v);
  guardar();
  recalcular();
  if (t.tagName === 'TEXTAREA') autoajustar(t);
  const det = t.closest('details[data-lista]');
  if (det) pintarResumen(det);
});

// Desplegables del catálogo, y campos de los que dependen otras partes de la ficha
// (el nivel de una clase desbloquea la subclase y los huecos de dote).
$('#hoja').addEventListener('change', ev => {
  const t = ev.target;
  // Al terminar de cambiar el nivel de una clase o los PX, los PX se ajustan al nivel.
  if (ajustarPX(actual)) {
    $('[data-campo="px"]').value = actual.px;  // también si se estaba escribiendo en ella
    guardar();
    pintarPX();
  }
  if (t.dataset.cat) {
    const ruta = t.dataset.cat;
    const anterior = leer(actual, ruta);
    if (t.value === OTRO) {
      camposOtro.add(ruta);
      escribir(actual, ruta, '');
    } else {
      camposOtro.delete(ruta);
      escribir(actual, ruta, t.value);
    }
    alElegir(ruta, anterior);
  } else if (!t.dataset.catOtro && !t.hasAttribute('data-repinta')) {
    return;
  }
  guardar();
  sincronizarCartas();
  pintarFicha();
  pintarDotes();
  rellenar();
  recalcular();
  if (t.value === OTRO) {
    const otro = $(`[data-cat-otro="${t.dataset.cat}"]`);
    if (otro) otro.focus();
  }
});

// Al abrir un desplegable, ajusta la altura de sus notas.
$('#hoja').addEventListener('toggle', ev => {
  if (ev.target.open) ev.target.querySelectorAll('textarea').forEach(autoajustar);
}, true);

$('#archivo-importar').addEventListener('change', ev => {
  const archivo = ev.target.files[0];
  ev.target.value = '';
  if (archivo) importar(archivo);
});

$('#dlg-corto form').addEventListener('submit', terminarDescansoCorto);
$('#dlg-nivel form').addEventListener('submit', terminarSubirNivel);
$('#dlg-px form').addEventListener('submit', terminarDarPX);
$('#dlg-px').addEventListener('input', resumenDarPX);
$('#dlg-nivel').addEventListener('change', ev => { if (ev.target.id !== 'nivel-pg') actualizarSubirNivel(); });
$('#nivel-otra-nombre').addEventListener('input', actualizarSubirNivel);

$('#codigo-unirse').addEventListener('keydown', ev => { if (ev.key === 'Enter') unirse(); });
// Al volver la conexión, reintenta las hojas que no se pudieron enviar.
window.addEventListener('online', () => {
  for (const p of personajes) if (p.partida && (estadoEnvio.get(p.id) || {}).estado !== 'ok') programarEnvio(p.id);
  escucharPremios();
});

$('#archivo-imagen').addEventListener('change', ev => {
  const archivo = ev.target.files[0];
  ev.target.value = '';
  if (archivo) cargarImagen(archivo);
});
$('#retrato-zoom').addEventListener('input', ev => {
  zoomImagen(Number(ev.target.value));
  pintarRetrato();
  guardar();
});
const retrato = $('#retrato');
retrato.addEventListener('pointerdown', iniciarGestoImagen);
retrato.addEventListener('pointermove', moverGestoImagen);
retrato.addEventListener('pointerup', terminarGestoImagen);
retrato.addEventListener('pointercancel', terminarGestoImagen);
retrato.addEventListener('wheel', ev => {
  if (!editandoImagen || !actual.imagen) return;
  ev.preventDefault();
  zoomImagen(actual.imagen.zoom * (1 - ev.deltaY * .002));
  pintarRetrato();
  guardar();
}, { passive: false });

// ===== Inicio =====
$('#version').textContent = VERSION;
construirCaracteristicas();
if (location.hash) history.replaceState(null, '', location.pathname + location.search);
pintarLista();
// Reenvía las hojas unidas a una partida, por si quedó algún cambio sin enviar al cerrar la app.
for (const p of personajes) if (p.partida) programarEnvio(p.id);
escucharPremios();  // PX que haya dado el DM mientras la app estaba cerrada

if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js');
}
