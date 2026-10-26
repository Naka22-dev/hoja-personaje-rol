'use strict';

// Mazos de cartas de Forja de Cartas: el DM los exporta en CSV y cada jugador importa el suyo en su personaje.
// La columna «origenes» dice a quién pertenece cada carta (ver Contextos/traspaso_forja_etiquetas_hoja.md):
//   tipo:Nombre@nivel!modo; ...   tipo = clase | subclase | especie | linaje | trasfondo | dote | conjuro
//                                 modo = lista (para elegir) | siempre (se asigna sola) | forma (forma salvaje)
// El texto de las cartas es del DM: se guarda solo en este móvil, fuera de la hoja (no se envía a la partida
// ni va en las copias de seguridad).
// Se carga después de app.js y usa sus funciones.

const CLAVE_MAZOS = 'hojasDnD.mazos';  // { idPersonaje: { archivo, importado, cartas: [{ t, d }] } }
const MAX_CARTAS = 2000;

let mazos = cargarMazos();
let verTodoMazo = false;

function cargarMazos() {
  try {
    const m = JSON.parse(localStorage.getItem(CLAVE_MAZOS));
    return m && typeof m === 'object' && !Array.isArray(m) ? m : {};
  } catch {
    return {};
  }
}
function guardarMazos() {
  try {
    localStorage.setItem(CLAVE_MAZOS, JSON.stringify(mazos));
    return true;
  } catch (e) {
    aviso(e.name === 'QuotaExceededError' ? 'No queda espacio en el móvil para el mazo.' : 'No se ha podido guardar el mazo: ' + e.message);
    return false;
  }
}
const mazoDe = id => mazos[id] || null;
const cartasDe = id => (mazoDe(id) || { cartas: [] }).cartas;

// ===== Leer el CSV (igual que lo lee Forja) =====
function leerCSV(texto) {
  const primera = texto.split(/\r?\n/)[0];
  const sep = [';', ',', '\t'].sort((a, b) => primera.split(b).length - primera.split(a).length)[0];
  const filas = [];
  let fila = [], campo = '', comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; } else comillas = false;
      } else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); filas.push(fila); fila = []; campo = '';
    } else campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter(f => f.some(v => v.trim()));
}

function tipoCarta(o) {
  const t = (o.tarjeta || '').toLowerCase();
  if (t.startsWith('obj')) return 'objeto';
  if (t.startsWith('conj') || t.startsWith('truc')) return 'conjuro';
  if (/^(reg|tal|dot|cond|rasg|gen|esp|tras)/.test(t)) return 'regla';
  if (t.startsWith('cri') || t.startsWith('mon') || t.startsWith('pnj')) return 'criatura';
  if ('puntos_golpe' in o || 'fue' in o) return 'criatura';
  if ('escuela' in o) return 'conjuro';
  return 'regla';
}

async function importarMazo(archivo) {
  const p = actual;
  const bytes = await archivo.arrayBuffer();
  let texto;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    texto = new TextDecoder('windows-1252').decode(bytes);
  }
  const filas = leerCSV(texto.replace(/^﻿/, ''));
  const cab = (filas[0] || []).map(s => s.trim().toLowerCase());
  if (filas.length < 2 || !cab.includes('nombre')) return aviso('El archivo no es un mazo de Forja de Cartas (CSV)');
  const cartas = [];
  for (const f of filas.slice(1, MAX_CARTAS + 1)) {
    const d = {};
    cab.forEach((k, i) => { if (k) d[k] = (f[i] || '').replace(/\\n/g, '\n').trim(); });
    if (d.nombre) cartas.push({ t: tipoCarta(d), d });
  }
  if (!cartas.length) return aviso('El mazo no tiene cartas');
  const viejo = mazoDe(p.id);
  if (viejo && !confirm(`¿Cambiar el mazo «${viejo.archivo}» (${viejo.cartas.length} cartas) por «${archivo.name}» (${cartas.length} cartas)?`)) return;
  mazos[p.id] = { archivo: archivo.name, importado: Date.now(), cartas };
  if (!guardarMazos()) return;
  const etiquetadas = cartas.filter(c => c.d.origenes).length;
  verTodoMazo = false;
  sincronizarCartas();
  pintarCartas();
  aviso(`Mazo importado: ${cartas.length} cartas` + (etiquetadas < cartas.length ? ` (${cartas.length - etiquetadas} sin orígenes)` : ''), 4000);
}

function quitarMazo() {
  const m = mazoDe(actual.id);
  if (!m || !confirm(`¿Quitar el mazo «${m.archivo}» de este personaje?\nLos conjuros que se añadieron solos desde el mazo también se quitarán de Magia.`)) return;
  delete mazos[actual.id];
  guardarMazos();
  actual.conjuros = actual.conjuros.filter(c => !c.auto);
  guardar();
  pintarConjuros();
  rellenar($('#lista-conjuros'));
  pintarCartas();
}

// Al duplicar o borrar un personaje, su mazo va con él.
function copiarMazo(deId, aId) {
  if (!mazos[deId]) return;
  mazos[aId] = JSON.parse(JSON.stringify(mazos[deId]));
  guardarMazos();
}
function borrarMazo(id) {
  if (!mazos[id]) return;
  delete mazos[id];
  guardarMazos();
}

// ===== Orígenes: ¿le toca esta carta al personaje? =====
function leerOrigenes(texto) {
  return String(texto || '').split(';').map(s => s.trim()).filter(Boolean).map(s => {
    const m = s.match(/^([a-záéíóúñ]+)\s*:\s*(.*?)\s*(?:@\s*(\d+))?\s*(?:!\s*([a-z]+))?$/i);
    if (!m) return null;
    return { tipo: m[1].toLowerCase(), nombre: m[2], nivel: m[3] ? Number(m[3]) : 1, modo: m[4] ? m[4].toLowerCase() : '' };
  }).filter(Boolean);
}

const filaClase = (p, nombre) => p.clases.find(c => comparable(c.nombre) === comparable(nombre));

// Nivel de conjuro más alto que puede lanzar una clase (como si fuera la única: así se preparan en multiclase).
// El brujo llega más alto que su pacto con el Arcanum místico.
function nivelMaxConjuro(fila) {
  const solo = { clases: [fila] };
  const pacto = pactoCalculado(solo);
  if (pacto) return Math.max(pacto.nivel, ...ARCANUM.filter(([nv]) => nivelValido(fila.nivel) >= nv).map(([, c]) => c));
  const espacios = espaciosCalculados(solo);
  for (let i = 8; i >= 0; i--) if (espacios[i]) return i + 1;
  return 0;
}

// VD máximo de las formas salvajes según el nivel de druida (el Círculo de la luna llega más alto).
function vdMaxForma(fila) {
  const nv = nivelValido(fila.nivel);
  if (comparable(fila.subclase) === comparable('Círculo de la luna') && subclaseDesbloqueada(fila)) return Math.max(1, Math.floor(nv / 3));
  return nv >= 8 ? 1 : nv >= 4 ? 0.5 : 0.25;
}
const valorVD = t => {
  const s = String(t || '').trim().replace(',', '.');
  const m = s.match(/^(\d+)\s*\/\s*(\d+)/);
  return m ? Number(m[1]) / Number(m[2]) : s === '' ? 0 : Number.parseFloat(s) || 0;
};

// Comprueba una entrada de origen. Devuelve { modo, motivo } si se cumple, o null.
function cumpleOrigen(p, carta, o) {
  const nivel = nivelTotal(p);
  const [a, b] = o.nombre.split('/').map(s => s.trim());
  const conjuro = carta.t === 'conjuro';
  let modo = o.modo || (conjuro && o.tipo === 'clase' ? 'lista' : 'siempre');
  let motivo;
  switch (o.tipo) {
    case 'clase': {
      const f = filaClase(p, a);
      if (!f || nivelValido(f.nivel) < o.nivel) return null;
      motivo = `${f.nombre} ${o.nivel > 1 ? o.nivel : ''}`.trim();
      if (conjuro && modo === 'lista' && num(carta.d.nivel) > nivelMaxConjuro(f)) return null;
      if (modo === 'forma') {
        if (carta.t === 'criatura' && valorVD(carta.d.vd) > vdMaxForma(f)) return null;
        motivo = 'Forma salvaje';
      }
      break;
    }
    case 'subclase': {
      const f = filaClase(p, a);
      if (!f || !subclaseDesbloqueada(f) || comparable(f.subclase) !== comparable(b) || nivelValido(f.nivel) < o.nivel) return null;
      // Caballero arcano, Embaucador arcano…: su lista de conjuros, hasta el nivel que pueden lanzar
      if (conjuro && modo === 'lista' && num(carta.d.nivel) > nivelMaxConjuro(f)) return null;
      motivo = f.subclase;
      break;
    }
    case 'especie':
      if (comparable(p.especie) !== comparable(a) || nivel < o.nivel) return null;
      motivo = p.especie;
      break;
    case 'linaje':
      if (comparable(p.especie) !== comparable(a) || comparable(p.linaje) !== comparable(b) || nivel < o.nivel) return null;
      motivo = `${p.especie} ${p.linaje}`;
      break;
    case 'trasfondo':
      if (comparable(p.trasfondo) !== comparable(a) || nivel < o.nivel) return null;
      motivo = p.trasfondo;
      break;
    case 'dote':
      if (!tieneDote(p, o.nombre) || nivel < o.nivel) return null;
      motivo = o.nombre;
      break;
    case 'conjuro':
      if (!p.conjuros.some(c => comparable(c.nombre) === comparable(o.nombre)) || nivel < o.nivel) return null;
      motivo = o.nombre;
      break;
    default:
      return null;
  }
  return { modo, motivo };
}

// Estado de cada carta del mazo para el personaje: siempre > forma > lista; null si no le toca.
const PRIORIDAD = { siempre: 3, forma: 2, lista: 1 };
function estadoCarta(p, carta) {
  let mejor = null;
  const motivos = [];
  for (const o of leerOrigenes(carta.d.origenes)) {
    const r = cumpleOrigen(p, carta, o);
    if (!r) continue;
    if (!motivos.includes(r.motivo)) motivos.push(r.motivo);
    if (!mejor || PRIORIDAD[r.modo] > PRIORIDAD[mejor]) mejor = r.modo;
  }
  return mejor && { modo: mejor, motivos };
}

// Las cartas de tabla («Tabla (Escudriñar)») acompañan a su conjuro: no salen sueltas.
const nombreTabla = carta => {
  const m = carta.t === 'regla' && String(carta.d.tipo || '').match(/^tabla\s*\((.+)\)\s*$/i);
  return m ? m[1] : null;
};

// opciones = cartas para elegir que no son conjuros (invocaciones del brujo…), por su «tipo»;
// las que el jugador ha elegido salen también en los rasgos.
function clasificarCartas(p) {
  const r = { rasgos: [], conjuros: [], elegir: [], opciones: {}, criaturas: [], sinOrigen: [], noTocan: [] };
  const elegidas = new Set(p.elegidas.map(comparable));
  for (const carta of cartasDe(p.id)) {
    if (nombreTabla(carta)) continue;
    if (!carta.d.origenes) { r.sinOrigen.push({ carta }); continue; }
    const e = estadoCarta(p, carta);
    if (!e) { r.noTocan.push({ carta }); continue; }
    const item = { carta, ...e };
    if (carta.t === 'criatura') r.criaturas.push(item);
    else if (carta.t === 'conjuro') (e.modo === 'lista' ? r.elegir : r.conjuros).push(item);
    else if (e.modo === 'lista') {
      const tipo = carta.d.tipo || 'Rasgos';
      (r.opciones[tipo] = r.opciones[tipo] || []).push(item);
      if (elegidas.has(comparable(carta.d.nombre))) r.rasgos.push({ ...item, motivos: ['Elegida', ...item.motivos] });
    } else r.rasgos.push(item);
  }
  return r;
}

function elegirCarta(nombre) {
  const p = actual;
  const i = p.elegidas.findIndex(n => comparable(n) === comparable(nombre));
  if (i >= 0) p.elegidas.splice(i, 1);
  else p.elegidas.push(nombre);
  guardar();
  pintarCartas();
}

// ===== Conjuros de las cartas en Magia =====
// auto = lo puso la Hoja (conjuro «siempre»): se quita solo si deja de tocarle. carta = viene de una carta.
// Lo escrito a mano nunca se toca.
function conjuroDeCarta(carta, auto) {
  const d = carta.d;
  return {
    ...nuevoConjuro(),
    nivel: Math.max(0, Math.min(9, Math.floor(num(d.nivel)))),
    nombre: d.nombre,
    tiempo: d.tiempo_lanzamiento || '',
    alcance: d.alcance || '',
    c: /concentraci/i.test(d.duracion || ''),
    r: /ritual/i.test(`${d.tiempo_lanzamiento || ''} ${d.escuela || ''}`),
    m: /(^|[\s,])M\b/.test(d.componentes || ''),
    notas: d.duracion ? 'Duración: ' + d.duracion : '',
    carta: d.nombre,
    auto,
  };
}

// Añade los conjuros «siempre» que tocan y quita los automáticos que ya no. Devuelve true si cambia algo.
function sincronizarCartas(p = actual) {
  if (!p || modoLectura || !mazoDe(p.id)) return false;
  const siempre = clasificarCartas(p).conjuros.map(i => i.carta);
  const nombres = new Set(siempre.map(c => comparable(c.d.nombre)));
  const antes = p.conjuros.length;
  p.conjuros = p.conjuros.filter(c => !c.auto || nombres.has(comparable(c.carta)));
  let cambio = p.conjuros.length !== antes;
  for (const carta of siempre) {
    const ya = p.conjuros.find(c => comparable(c.nombre) === comparable(carta.d.nombre));
    if (ya) {
      if (ya.carta && !ya.auto) { ya.auto = true; cambio = true; }  // lo había elegido de la lista y ahora le toca siempre
      continue;
    }
    p.conjuros.push(conjuroDeCarta(carta, true));
    cambio = true;
  }
  if (cambio) {
    p.conjuros.sort((a, b) => num(a.nivel) - num(b.nivel) || a.nombre.localeCompare(b.nombre, 'es'));
    guardar();
    pintarConjuros();
    rellenar($('#lista-conjuros'));
  }
  return cambio;
}

function prepararConjuro(nombre) {
  const p = actual;
  const i = p.conjuros.findIndex(c => comparable(c.nombre) === comparable(nombre));
  if (i >= 0) {
    if (p.conjuros[i].auto) return aviso('Este conjuro te toca siempre: no se puede quitar');
    p.conjuros.splice(i, 1);
    aviso(`«${nombre}» quitado de Magia`);
  } else {
    const carta = cartasDe(p.id).find(c => c.t === 'conjuro' && comparable(c.d.nombre) === comparable(nombre));
    if (!carta) return;
    p.conjuros.push(conjuroDeCarta(carta, false));
    p.conjuros.sort((a, b) => num(a.nivel) - num(b.nivel) || a.nombre.localeCompare(b.nombre, 'es'));
    aviso(`«${nombre}» añadido a Magia`);
  }
  guardar();
  pintarConjuros();
  rellenar($('#lista-conjuros'));
  sincronizarCartas();  // un conjuro puede dar cartas (familiar de «Encontrar familiar»)
  pintarCartas();
}

// ===== Pestaña Cartas =====
const SUBTITULO_NIVEL = n => (num(n) === 0 ? 'Trucos' : `Nivel ${num(n)}`);

function filaCarta(item, extra) {
  const { carta } = item;
  const d = carta.d;
  const sub = carta.t === 'conjuro' ? (num(d.nivel) ? `Nivel ${num(d.nivel)}` : 'Truco') + (d.escuela ? ' · ' + d.escuela : '')
    : carta.t === 'criatura' ? [d.tipo_tamano_alineamiento || d.rol_especie_actitud, d.vd && 'VD ' + d.vd].filter(Boolean).join(' · ')
      : d.tipo || d.requisito || '';
  // Por posición en el mazo: dos clases pueden tener una carta con el mismo nombre («Don épico»).
  return h('div', { class: 'fila-carta' },
    h('button', { class: 'abrir-carta', 'data-accion': 'verCarta', 'data-i': cartasDe(actual.id).indexOf(carta), style: colorCarta(carta) },
      h('span', { class: 'n' }, d.nombre),
      h('span', { class: 's' }, [sub, item.motivos && item.motivos.join(', ')].filter(Boolean).join(' · '))),
    extra);
}

function colorCarta(carta) {
  const c = String(carta.d.color || '').trim();
  return /^#?[0-9a-f]{6}$/i.test(c) ? `--color-carta: ${c[0] === '#' ? c : '#' + c}` : null;
}

// Bloques plegables: se recuerda cuáles ha abierto o cerrado el jugador mientras la app sigue abierta.
const bloquesAbiertos = new Map();  // clave → abierto
const GRUPO_ABIERTO = 5;  // los grupos pequeños salen abiertos; los grandes, cerrados
function plegable(clave, porDefecto, clase, resumen, ...contenido) {
  return h('details', {
    class: clase, open: bloquesAbiertos.has(clave) ? bloquesAbiertos.get(clave) : porDefecto,
    ontoggle: ev => bloquesAbiertos.set(clave, ev.target.open),
  }, h('summary', {}, ...[resumen].flat()), ...contenido);
}

function bloqueCartas(titulo, items, ayuda, extra, porDefecto = true) {
  if (!items.length) return null;
  return plegable(titulo, porDefecto, 'caja bloque-cartas', h('h2', {}, `${titulo} (${items.length})`),
    ayuda && h('p', { class: 'ayuda' }, ayuda),
    items.map(i => filaCarta(i, extra && extra(i))));
}

// Subgrupo dentro de un bloque: conjuros de un nivel, criaturas de un conjuro…
function grupoCartas(clave, titulo, items, extra, marcados = 0) {
  return plegable(clave, items.length <= GRUPO_ABIERTO, 'grupo-cartas',
    [h('span', {}, titulo), h('span', { class: 'cuenta' }, marcados ? `${items.length} · ✓ ${marcados}` : String(items.length))],
    items.map(i => filaCarta(i, extra && extra(i))));
}

function pintarCartas() {
  const cont = $('#cartas-contenido');
  if (!cont || !actual) return;
  if (modoLectura) {
    // El DM no tiene el mazo, pero sí ve qué ha elegido el jugador (solo los nombres, que van en la hoja).
    cont.replaceChildren(...[
      actual.elegidas.length > 0 && h('div', { class: 'caja' },
        h('h2', {}, `Elegidas del mazo (${actual.elegidas.length})`),
        h('p', { class: 'ayuda' }, 'Invocaciones y otras opciones que el jugador ha marcado con «Elegir».'),
        h('ul', { class: 'lista-elegidas' }, [...actual.elegidas].sort((a, b) => a.localeCompare(b, 'es')).map(n => h('li', {}, n)))),
      h('p', { class: 'vacio' }, 'El texto de las cartas está solo en el móvil del jugador. Los conjuros que ha preparado están en Magia.'),
    ].filter(Boolean));
    return;
  }
  const m = mazoDe(actual.id);
  if (!m) {
    cont.replaceChildren(
      h('div', { class: 'caja' },
        h('h2', {}, 'Mazo de cartas'),
        h('p', { class: 'ayuda' }, 'Importa el mazo que te ha pasado tu DM (el archivo CSV de Forja de Cartas). La hoja te mostrará las cartas que te tocan según tu clase, subclase, especie, trasfondo, dotes y nivel, y se actualizarán solas cuando cambies algo.'),
        h('button', { class: 'primario ancho', 'data-accion': 'importarMazo' }, 'Importar mazo (CSV)')));
    return;
  }
  const r = clasificarCartas(actual);
  const preparados = new Set(actual.conjuros.map(c => comparable(c.nombre)));
  const porNivel = {};
  for (const i of r.elegir) (porNivel[num(i.carta.d.nivel)] = porNivel[num(i.carta.d.nivel)] || []).push(i);
  const botonPreparar = i => {
    if (i.carta.t !== 'conjuro') return null;
    const ya = preparados.has(comparable(i.carta.d.nombre));
    return h('button', { class: 'preparar' + (ya ? ' on' : ''), 'data-accion': 'prepararConjuro', 'data-nombre': i.carta.d.nombre,
      'aria-pressed': ya }, ya ? '✓ Preparado' : 'Preparar');
  };
  const elegidas = new Set(actual.elegidas.map(comparable));
  const botonElegir = i => {
    const ya = elegidas.has(comparable(i.carta.d.nombre));
    return h('button', { class: 'preparar' + (ya ? ' on' : ''), 'data-accion': 'elegirCarta', 'data-nombre': i.carta.d.nombre,
      'aria-pressed': ya }, ya ? '✓ Elegida' : 'Elegir');
  };
  const opciones = Object.entries(r.opciones);
  // Criaturas agrupadas por lo que las da (Polimorfar, Encontrar familiar, Forma salvaje…), de menor a mayor VD.
  const porOrigen = {};
  for (const i of r.criaturas) (porOrigen[i.motivos.join(', ')] = porOrigen[i.motivos.join(', ')] || []).push(i);
  for (const lista of Object.values(porOrigen)) {
    lista.sort((a, b) => valorVD(a.carta.d.vd) - valorVD(b.carta.d.vd) || a.carta.d.nombre.localeCompare(b.carta.d.nombre, 'es'));
  }
  const total = r.rasgos.length + r.conjuros.length + r.elegir.length + r.criaturas.length + opciones.length;
  cont.replaceChildren(...[
    bloqueCartas('Rasgos y atributos', r.rasgos),
    ...opciones.map(([tipo, items]) => bloqueCartas(`Para elegir: ${tipo}`, items,
      'Las que puedes tener según tu nivel. Cuántas te tocan lo dice la carta de la clase. «Elegir» la pasa a tus rasgos.', botonElegir,
      items.length <= GRUPO_ABIERTO)),
    bloqueCartas('Conjuros que te tocan siempre', r.conjuros, 'Ya están en Magia, en «Trucos y conjuros preparados».'),
    r.elegir.length && plegable('elegir', true, 'caja bloque-cartas', h('h2', {}, `Para elegir (${r.elegir.length})`),
      h('p', { class: 'ayuda' }, 'Conjuros de tus listas hasta el nivel que puedes lanzar. «Preparar» los añade a Magia.'),
      Object.keys(porNivel).sort((a, b) => a - b).map(n => grupoCartas('elegir' + n, SUBTITULO_NIVEL(n), porNivel[n], botonPreparar,
        porNivel[n].filter(i => preparados.has(comparable(i.carta.d.nombre))).length))),
    r.criaturas.length && plegable('criaturas', true, 'caja bloque-cartas', h('h2', {}, `Formas y criaturas (${r.criaturas.length})`),
      Object.entries(porOrigen).map(([origen, items]) => grupoCartas('criaturas:' + origen, origen, items))),
    r.sinOrigen.length && bloqueCartas('Cartas sin orígenes', r.sinOrigen.map(i => ({ carta: i.carta })),
      'Estas cartas no dicen a quién pertenecen: se muestran todas.'),
    !total && !r.sinOrigen.length && h('p', { class: 'vacio' }, 'Ninguna carta del mazo te toca todavía. Revisa la clase, la especie y el resto de la Ficha.'),
    r.noTocan.length && h('div', { class: 'caja' },
      h('button', { class: 'ancho', 'data-accion': 'verTodoMazo' }, verTodoMazo ? 'Ocultar el resto del mazo' : `Ver el resto del mazo (${r.noTocan.length} cartas que no te tocan)`),
      verTodoMazo && r.noTocan.map(i => filaCarta({ carta: i.carta }))),
    h('div', { class: 'caja mazo-info' },
      h('p', { class: 'ayuda' }, `Mazo «${m.archivo}» · ${m.cartas.length} cartas · importado el ${new Date(m.importado).toLocaleDateString('es')}`),
      h('div', { class: 'botonera dos' },
        h('button', { 'data-accion': 'importarMazo' }, 'Cambiar mazo'),
        h('button', { class: 'peligro', 'data-accion': 'quitarMazo' }, 'Quitar mazo'))),
  ].filter(Boolean));
}

// ===== Ver una carta =====
// Marcado de Forja: ***negrita cursiva***, **negrita**, *cursiva*, líneas con «|» = tabla.
const escaparHTML = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const formato = t => escaparHTML(t)
  .replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>')
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace(/\*(.+?)\*/g, '<i>$1</i>');

function textoCarta(valor) {
  let html = '';
  let tabla = [];
  const cerrarTabla = () => {
    if (!tabla.length) return;
    const cols = Math.max(...tabla.map(f => f.length));
    html += '<table>' + tabla.map((f, k) => '<tr>' + Array.from({ length: cols }, (_, i) =>
      `<${k ? 'td' : 'th'}>${formato(f[i] || '')}</${k ? 'td' : 'th'}>`).join('') + '</tr>').join('') + '</table>';
    tabla = [];
  };
  for (const linea of String(valor).split(/\r\n|\r|\n/)) {
    if (linea.trim().startsWith('|')) {
      const celdas = linea.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      if (!celdas.every(c => /^:?-{2,}:?$/.test(c))) tabla.push(celdas);
    } else {
      cerrarTabla();
      if (linea.trim()) html += `<p>${formato(linea)}</p>`;
    }
  }
  cerrarTabla();
  return html;
}

function contenidoCarta(carta) {
  const d = carta.d;
  const partes = [];
  const datos = filas => {
    const f = filas.filter(([, v]) => v);
    if (f.length) partes.push('<dl class="datos-carta">' + f.map(([k, v]) => `<dt>${k}</dt><dd>${formato(v)}</dd>`).join('') + '</dl>');
  };
  const seccion = (titulo, valor) => {
    if (!valor) return;
    if (titulo) partes.push(`<h3>${escaparHTML(titulo)}</h3>`);
    partes.push(textoCarta(valor));
  };
  if (carta.t === 'conjuro') {
    const nv = num(d.nivel);
    partes.push(`<p class="sub-carta">${escaparHTML((nv ? `Nivel ${nv}` : 'Truco') + (d.escuela ? ` · ${d.escuela}` : '') + (d.clases ? ` (${d.clases})` : ''))}</p>`);
    datos([['Tiempo de lanzamiento', d.tiempo_lanzamiento], ['Alcance', d.alcance], ['Componentes', d.componentes], ['Duración', d.duracion]]);
    seccion('', d.descripcion);
    seccion(nv ? 'Usando un espacio de nivel superior' : 'Mejora de truco', d.niveles_superiores);
  } else if (carta.t === 'criatura') {
    partes.push(`<p class="sub-carta">${escaparHTML([d.tipo_tamano_alineamiento || d.rol_especie_actitud, d.vd && `VD ${d.vd}` + (d.px ? ` (${d.px} PX)` : '')].filter(Boolean).join(' · '))}</p>`);
    datos([['CA', d.ca], ['Iniciativa', [d.iniciativa_bonus, d.iniciativa_valor && `(${d.iniciativa_valor})`].filter(Boolean).join(' ')], ['Puntos de golpe', d.puntos_golpe], ['Velocidad', d.velocidad]]);
    const car = [['FUE', d.fue], ['DES', d.des], ['CON', d.con], ['INT', d.int], ['SAB', d.sab], ['CAR', d.car]];
    if (car.some(([, v]) => v)) partes.push('<div class="carac-carta">' + car.map(([k, v]) => `<div><b>${k}</b><span>${escaparHTML(v || '–')}</span></div>`).join('') + '</div>');
    datos([['Salvaciones', d.salvaciones], ['Habilidades', d.habilidades], ['Vulnerabilidades', d.vulnerabilidades], ['Resistencias', d.resistencias],
      ['Inmunidades a daño', d.inmunidades_dano], ['Inmunidades a estados', d.inmunidades_estado], ['Equipo', d.equipo_armadura],
      ['Sentidos', d.sentidos_percepcion_pasiva], ['Idiomas', d.idiomas]]);
    seccion('Rasgos', d.rasgos);
    seccion('Acciones', d.acciones);
    seccion('Acciones adicionales', d.acciones_adicionales);
    seccion('Reacciones', d.reacciones);
    seccion('Acciones legendarias', d.acciones_legendarias);
  } else if (carta.t === 'objeto') {
    partes.push(`<p class="sub-carta">${escaparHTML([d.tipo, d.rareza, d.sintonizacion && 'Sintonización: ' + d.sintonizacion].filter(Boolean).join(' · '))}</p>`);
    datos([['Coste', d.coste], ['Peso', d.peso], ['Daño', d.dano], ['Maestría', d.maestria], ['CA', d.ca_armadura], ['Fuerza', d.requisito_fue],
      ['Sigilo', d.sigilo], ['Propiedades', d.propiedades], ['Cargas', d.cargas]]);
    seccion('', d.descripcion);
    seccion('Efectos', d.efectos);
    seccion('Maldición', d.maldicion);
  } else {
    partes.push(`<p class="sub-carta">${escaparHTML([d.tipo, d.requisito && 'Requisito: ' + d.requisito].filter(Boolean).join(' · '))}</p>`);
    if (d.datos) partes.push('<p class="banda-carta">' + String(d.datos).split(/\r\n|\r|\n/).map(formato).join(' · ') + '</p>');
    seccion('', d.descripcion);
    for (let i = 1; i <= 4; i++) seccion(d[`seccion${i}_titulo`], d[`seccion${i}_texto`]);
  }
  seccion('Notas', d.notas);
  return partes.join('');
}

function verCarta(i) {
  const cartas = cartasDe(actual.id);
  const carta = cartas[i];
  if (!carta) return aviso('Esta carta no está en tu mazo');
  const tablas = cartas.filter(c => comparable(nombreTabla(c)) === comparable(carta.d.nombre));
  const cuerpo = $('#carta-cuerpo');
  cuerpo.setAttribute('style', colorCarta(carta) || '');
  $('#carta-titulo').textContent = carta.d.nombre;
  cuerpo.innerHTML = contenidoCarta(carta) + tablas.map(contenidoCarta).join('');
  $('#dlg-carta').showModal();
  $('#dlg-carta').scrollTop = 0;
}

// ===== Eventos =====
Object.assign(acciones, {
  importarMazo: () => $('#archivo-mazo').click(),
  quitarMazo,
  verCarta: b => verCarta(Number(b.dataset.i)),
  prepararConjuro: b => prepararConjuro(b.dataset.nombre),
  elegirCarta: b => elegirCarta(b.dataset.nombre),
  verTodoMazo: () => { verTodoMazo = !verTodoMazo; pintarCartas(); },
});
for (const a of ['importarMazo', 'quitarMazo', 'verCarta', 'prepararConjuro', 'elegirCarta', 'verTodoMazo']) SIN_CAMBIOS.add(a);

$('#archivo-mazo').addEventListener('change', ev => {
  const archivo = ev.target.files[0];
  ev.target.value = '';
  if (archivo) importarMazo(archivo);
});
