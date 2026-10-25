'use strict';

// Conexión con Firebase. Solo se usa para las hojas unidas a una partida y para el visor del DM;
// el resto de la app funciona sin ella. Firebase se descarga la primera vez que hace falta.
//
// Estructura en Firestore:
//   partidas/{codigo}                       { nombre, dm (uid de quien la creó), creada }
//   partidas/{codigo}/personajes/{id}       { uid (dueño), json (hoja completa), actualizado }
//   partidas/{codigo}/premios/{id}          { px, para (ids de personaje), motivo, creado } — solo los crea el DM

const FIREBASE_VERSION = '10.14.1';
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyD78P210agzl-jSurOPIv11jSe2iD3hEFA',
  authDomain: 'hoja-personaje-dnd.firebaseapp.com',
  projectId: 'hoja-personaje-dnd',
  storageBucket: 'hoja-personaje-dnd.firebasestorage.app',
  messagingSenderId: '812102032747',
  appId: '1:812102032747:web:8b59b5855716cfcc37c02e',
};

// Sin letras ni números que se confundan (O/0, I/1).
const LETRAS_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

let promesaNube = null;

function conectarNube() {
  if (!promesaNube) {
    promesaNube = (async () => {
      const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;
      const [appMod, authMod, fs] = await Promise.all([
        import(base + 'firebase-app.js'),
        import(base + 'firebase-auth.js'),
        import(base + 'firebase-firestore.js'),
      ]);
      const app = appMod.initializeApp(FIREBASE_CONFIG);
      const auth = authMod.getAuth(app);
      await auth.authStateReady();
      if (!auth.currentUser) await authMod.signInAnonymously(auth);
      // La caché persistente guarda los cambios sin conexión y los envía al recuperarla.
      const db = fs.initializeFirestore(app, {
        localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
      });
      return { fs, db, uid: auth.currentUser.uid };
    })();
    promesaNube.catch(() => { promesaNube = null; });  // se podrá reintentar
  }
  return promesaNube;
}

function mensajeErrorNube(e) {
  const codigo = (e && e.code) || '';
  if (codigo.includes('permission-denied')) return 'Esta hoja ya está en la partida desde otro móvil. Pide al DM que la quite y vuelve a unirte.';
  if (codigo.includes('unavailable') || codigo.includes('network') || !navigator.onLine) return 'Sin conexión. Inténtalo cuando tengas internet.';
  if (e instanceof TypeError) return 'No se ha podido conectar. Comprueba la conexión a internet.';
  return 'Error de conexión: ' + (e && e.message || e);
}

function nuevoCodigo() {
  const azar = crypto.getRandomValues(new Uint32Array(6));
  return Array.from(azar, n => LETRAS_CODIGO[n % LETRAS_CODIGO.length]).join('');
}
const normalizarCodigo = texto => String(texto || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const mostrarCodigo = codigo => codigo.slice(0, 3) + '-' + codigo.slice(3);

async function crearPartidaNube(nombre) {
  const { fs, db, uid } = await conectarNube();
  let codigo;
  do {
    codigo = nuevoCodigo();
  } while ((await fs.getDoc(fs.doc(db, 'partidas', codigo))).exists());
  await fs.setDoc(fs.doc(db, 'partidas', codigo), { nombre, dm: uid, creada: fs.serverTimestamp() });
  return codigo;
}

async function buscarPartidaNube(codigo) {
  const { fs, db } = await conectarNube();
  const snap = await fs.getDoc(fs.doc(db, 'partidas', codigo));
  return snap.exists() ? snap.data() : null;
}

async function enviarPersonajeNube(p) {
  const { fs, db, uid } = await conectarNube();
  const json = JSON.stringify(p);
  if (json.length > 900000) throw new Error('la hoja ocupa demasiado (prueba con una imagen más pequeña)');
  await fs.setDoc(fs.doc(db, 'partidas', p.partida, 'personajes', p.id), { uid, json, actualizado: fs.serverTimestamp() });
}

async function quitarPersonajeNube(codigo, id) {
  const { fs, db } = await conectarNube();
  await fs.deleteDoc(fs.doc(db, 'partidas', codigo, 'personajes', id));
}

async function darPXNube(codigo, px, para, motivo) {
  const { fs, db } = await conectarNube();
  await fs.addDoc(fs.collection(db, 'partidas', codigo, 'premios'), { px, para, motivo, creado: fs.serverTimestamp() });
}

// Escucha los premios de PX de una partida. alCambiar recibe [{ id, px, para, motivo }]. Devuelve la función para dejar de escuchar.
async function escucharPremiosNube(codigo, alCambiar) {
  const { fs, db } = await conectarNube();
  return fs.onSnapshot(fs.collection(db, 'partidas', codigo, 'premios'),
    snap => alCambiar(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    () => {});  // sin permiso o sin conexión: se reintentará al volver a abrir la app
}

// Escucha en directo los personajes de una partida. alCambiar recibe [{ id, json, actualizado }].
async function escucharPartidaNube(codigo, alCambiar, alError) {
  const { fs, db, uid } = await conectarNube();
  const partida = await buscarPartidaNube(codigo);
  if (!partida) return null;
  const cancelar = fs.onSnapshot(fs.collection(db, 'partidas', codigo, 'personajes'),
    snap => alCambiar(snap.docs.map(d => {
      const datos = d.data({ serverTimestamps: 'estimate' });
      return { id: d.id, json: datos.json, actualizado: datos.actualizado ? datos.actualizado.toDate() : null };
    })),
    alError);
  return { partida, esDM: partida.dm === uid, cancelar };
}
