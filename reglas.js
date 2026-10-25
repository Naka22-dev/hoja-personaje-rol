'use strict';

// Nombres y datos de mecánica del Manual del Jugador 2024, sin texto de reglas.
// Copia de Contextos/catalogo_reglas_2024.json (el mismo catálogo que usa Forja de Cartas):
// si cambia allí, hay que cambiarlo aquí también.

// principal = características que pide la multiclase (13 o más); basta_una = con una es suficiente.
// dotes = niveles de la clase con dote general (el 19 es el don épico); estilo = nivel con dote de estilo de combate.
const CLASES = [
  { nombre: 'Bárbaro', dado: 12, salvaciones: ['fue', 'con'], lanzamiento: 'ninguno', aptitud: null, principal: ['fue'],
    subclases: ['Senda del Árbol del Mundo', 'Senda del berserker', 'Senda del corazón salvaje', 'Senda del fanático'] },
  { nombre: 'Bardo', dado: 8, salvaciones: ['des', 'car'], lanzamiento: 'completo', aptitud: 'car', principal: ['car'],
    subclases: ['Colegio de la danza', 'Colegio del conocimiento', 'Colegio del glamour', 'Colegio del valor'] },
  { nombre: 'Brujo', dado: 8, salvaciones: ['sab', 'car'], lanzamiento: 'pacto', aptitud: 'car', principal: ['car'],
    subclases: ['Patrón celestial', 'Patrón feérico', 'Patrón infernal', 'Patrón primigenio'] },
  { nombre: 'Clérigo', dado: 8, salvaciones: ['sab', 'car'], lanzamiento: 'completo', aptitud: 'sab', principal: ['sab'],
    subclases: ['Dominio de la guerra', 'Dominio de la luz', 'Dominio de la vida', 'Dominio del engaño'] },
  { nombre: 'Druida', dado: 8, salvaciones: ['int', 'sab'], lanzamiento: 'completo', aptitud: 'sab', principal: ['sab'],
    subclases: ['Círculo de la luna', 'Círculo de la tierra', 'Círculo de las estrellas', 'Círculo del mar'] },
  { nombre: 'Explorador', dado: 10, salvaciones: ['fue', 'des'], lanzamiento: 'medio', aptitud: 'sab', principal: ['des', 'sab'], estilo: 2,
    subclases: ['Acechador en la penumbra', 'Cazador', 'Errante feérico', 'Señor de las bestias'] },
  { nombre: 'Guerrero', dado: 10, salvaciones: ['fue', 'con'], lanzamiento: 'ninguno', aptitud: null, principal: ['fue', 'des'], basta_una: true,
    estilo: 1, dotes: [4, 6, 8, 12, 14, 16, 19],
    subclases: ['Caballero arcano', 'Campeón', 'Guerrero psiónico', 'Maestro del combate'],
    lanzadoras: { 'Caballero arcano': { lanzamiento: 'tercio', aptitud: 'int' } } },
  { nombre: 'Hechicero', dado: 6, salvaciones: ['con', 'car'], lanzamiento: 'completo', aptitud: 'car', principal: ['car'],
    subclases: ['Hechicería aberrante', 'Hechicería de magia salvaje', 'Hechicería dracónica', 'Hechicería mecánica'] },
  { nombre: 'Mago', dado: 6, salvaciones: ['int', 'sab'], lanzamiento: 'completo', aptitud: 'int', principal: ['int'],
    subclases: ['Abjurador', 'Adivino', 'Evocador', 'Ilusionista'] },
  { nombre: 'Monje', dado: 8, salvaciones: ['fue', 'des'], lanzamiento: 'ninguno', aptitud: null, principal: ['des', 'sab'],
    subclases: ['Guerrero de la mano abierta', 'Guerrero de la misericordia', 'Guerrero de la sombra', 'Guerrero de los elementos'] },
  { nombre: 'Paladín', dado: 10, salvaciones: ['sab', 'car'], lanzamiento: 'medio', aptitud: 'car', principal: ['fue', 'car'], estilo: 2,
    subclases: ['Juramento de entrega', 'Juramento de gloria', 'Juramento de los antiguos', 'Juramento de venganza'] },
  { nombre: 'Pícaro', dado: 8, salvaciones: ['des', 'int'], lanzamiento: 'ninguno', aptitud: null, principal: ['des'],
    dotes: [4, 8, 10, 12, 16, 19],
    subclases: ['Asesino', 'Embaucador arcano', 'Ladrón', 'Rebanaalmas'],
    lanzadoras: { 'Embaucador arcano': { lanzamiento: 'tercio', aptitud: 'int' } } },
];
const NIVELES_DOTE = [4, 8, 12, 16, 19];
const NIVEL_SUBCLASE = 3;
const NIVEL_DON_EPICO = 19;

// linaje = cómo llama el libro a la elección dentro de la especie.
const ESPECIES = [
  { nombre: 'Aasimar', tamano: ['Mediano', 'Pequeño'], velocidad: '9 m', linajes: [] },
  { nombre: 'Dracónido', tamano: ['Mediano'], velocidad: '9 m', linaje: 'Linaje dracónico',
    linajes: ['Azul', 'Blanco', 'Bronce', 'Cobre', 'Negro', 'Oro', 'Oropel', 'Plata', 'Rojo', 'Verde'] },
  { nombre: 'Elfo', tamano: ['Mediano'], velocidad: '9 m', linaje: 'Linaje élfico',
    linajes: ['Alto elfo', 'Drow', 'Elfo de los bosques'] },
  { nombre: 'Enano', tamano: ['Mediano'], velocidad: '9 m', linajes: [] },
  { nombre: 'Gnomo', tamano: ['Pequeño'], velocidad: '9 m', linaje: 'Linaje gnomo',
    linajes: ['Gnomo de las rocas', 'Gnomo de los bosques'] },
  { nombre: 'Goliat', tamano: ['Mediano'], velocidad: '10,5 m', linaje: 'Linaje gigante',
    linajes: ['Gigante de fuego', 'Gigante de las colinas', 'Gigante de las nubes', 'Gigante de escarcha', 'Gigante de piedra', 'Gigante de las tormentas'] },
  { nombre: 'Humano', tamano: ['Mediano', 'Pequeño'], velocidad: '9 m', linajes: [] },
  { nombre: 'Mediano', tamano: ['Pequeño'], velocidad: '9 m', linajes: [] },
  { nombre: 'Orco', tamano: ['Mediano'], velocidad: '9 m', linajes: [] },
  { nombre: 'Tiefling', tamano: ['Mediano', 'Pequeño'], velocidad: '9 m', linaje: 'Legado infernal',
    linajes: ['Abisal', 'Ctónico', 'Infernal'] },
];
const TAMANOS = ['Diminuto', 'Pequeño', 'Mediano', 'Grande', 'Enorme', 'Gargantuesco'];

const TRASFONDOS = [
  ['Acólito', 'Iniciado en la magia (clérigo)'],
  ['Animador', 'Músico'],
  ['Artesano', 'Fabricante'],
  ['Campesino', 'Duro'],
  ['Charlatán', 'Habilidoso'],
  ['Comerciante', 'Afortunado'],
  ['Criminal', 'Alerta'],
  ['Ermitaño', 'Sanador'],
  ['Erudito', 'Iniciado en la magia (mago)'],
  ['Escriba', 'Habilidoso'],
  ['Guardia', 'Alerta'],
  ['Guía', 'Iniciado en la magia (druida)'],
  ['Marinero', 'Matón de taberna'],
  ['Noble', 'Habilidoso'],
  ['Soldado', 'Atacante salvaje'],
  ['Vagabundo', 'Afortunado'],
].map(([nombre, dote]) => ({ nombre, dote }));

// Las variantes ya van en el nombre, como en las etiquetas de Forja: «Iniciado en la magia (clérigo)».
const DOTES = {
  origen: ['Afortunado', 'Alerta', 'Atacante salvaje', 'Duro', 'Fabricante', 'Habilidoso',
    'Iniciado en la magia (clérigo)', 'Iniciado en la magia (druida)', 'Iniciado en la magia (mago)',
    'Matón de taberna', 'Músico', 'Sanador'],
  general: ['Acechador', 'Actor', 'Apresador', 'Atacante a la carga', 'Atleta', 'Azote de magos', 'Centinela', 'Chef',
    'Combatiente con dos armas', 'Combatiente montado', 'Duelista defensivo', 'Entrenamiento con armas marciales',
    'Envenenador', 'Experto en ballestas', 'Experto en habilidades', 'Influencia feérica', 'Influencia sombría',
    'Lanzador en combate', 'Lanzador preciso', 'Lanzador ritual', 'Líder inspirador', 'Ligeramente acorazado',
    'Maestro de armas', 'Maestro en armaduras medias', 'Maestro en armaduras pesadas', 'Maestro en armas de asta',
    'Maestro en armas pesadas', 'Maestro en escudos', 'Mejora de característica', 'Mente aguda', 'Moderadamente acorazado',
    'Muy acorazado', 'Observador', 'Perforador', 'Rebanador', 'Resiliente', 'Resistente', 'Telepático', 'Telequinético',
    'Tirador de primera', 'Triturador', 'Veloz', 'Versado en un elemento'],
  estilo: ['Combate con armas a dos manos', 'Combate con armas arrojadizas', 'Combate con dos armas', 'Combate sin armas',
    'Defensa', 'Duelo', 'Intercepción', 'Lucha a ciegas', 'Protección', 'Tiro con arco'],
  epico: ['Don de la fortaleza', 'Don de la habilidad', 'Don de la pericia en combate', 'Don de la recuperación',
    'Don de la resistencia a energías', 'Don de la velocidad', 'Don de la visión verdadera', 'Don del ataque imparable',
    'Don del destino', 'Don del espíritu de la noche', 'Don del recuerdo de conjuros', 'Don del viaje dimensional'],
};
const GRUPOS_DOTES = [
  ['origen', 'De origen'], ['general', 'Generales'], ['estilo', 'Estilo de combate'], ['epico', 'Dones épicos'],
];

// Puntos de experiencia acumulados para llegar a cada nivel (índice 0 = nivel 1).
const PX_NIVEL = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];

// Espacios de conjuro por nivel de lanzador (índice 0 = nivel 1), de nivel de conjuro 1 a 9.
const ESPACIOS = [
  [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];
// Magia de pacto del brujo: cuántos espacios y de qué nivel, según el nivel de brujo.
const espaciosPacto = nivel => ({
  cantidad: nivel >= 17 ? 4 : nivel >= 11 ? 3 : nivel >= 2 ? 2 : 1,
  nivel: Math.min(5, Math.ceil(nivel / 2)),
});

const DADOS_GOLPE = ['d6', 'd8', 'd10', 'd12'];
