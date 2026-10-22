// Fábricas de datos para pruebas de integración TRK. Datos ficticios.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../../models');
const { hashPin, emitirTokenPin } = require('../services/authPin.service');
const { normalizarTexto } = require('../utils/normalizar');

let secuencia = 0;
const sufijo = () => `${Date.now()}${++secuencia}`;

const rolPorNombre = (nombre) => db.Rol.findOne({ where: { nombre } });

async function crearAdmin({ superAdmin = false } = {}) {
  const rol = await rolPorNombre('Administrador');
  const usuario = await db.Usuario.create({
    rol_id: rol.id, nombre: 'Admin', apellido: 'Prueba', email: `admin${sufijo()}@prueba.test`,
    password: 'secreta123', es_super_admin: superAdmin, activo: true
  });
  const token = jwt.sign({ id: usuario.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { usuario, token };
}

async function crearOperativo(rolNombre, { nombre = 'Operativo', pin = '123456', activo = true } = {}) {
  const rol = await rolPorNombre(rolNombre);
  const usuario = await db.Usuario.create({
    rol_id: rol.id, nombre, apellido: '', email: `op${sufijo()}@trikipeludos.local`,
    password: crypto.randomBytes(24).toString('hex'), activo
  });
  const acceso = await db.TrkAcceso.create({ usuario_id: usuario.id, pin_hash: await hashPin(pin), token_version: 0 });
  return { usuario, pin, token: emitirTokenPin(usuario.id, acceso.token_version) };
}

const categoria = (codigo) => db.TrkCategoria.findOne({ where: { codigo } });

async function crearParticipante(overrides = {}) {
  const { categoriaCodigo = 'PEQ_MED', ...resto } = overrides;
  const cat = await categoria(categoriaCodigo);
  const mascota = resto.mascota_nombre || `Firulais ${sufijo()}`;
  return db.TrkParticipante.create({
    categoria_id: cat.id,
    responsable_nombre: 'Ana María Pérez',
    responsable_documento: String(1000000000 + Math.floor(Math.random() * 8999999999)).slice(0, 10),
    responsable_telefono: '3001234567',
    responsable_correo: 'ana@ejemplo.test',
    especie: 'PERRO',
    raza: 'Criollo',
    edad_texto: '3',
    sexo: 'MACHO',
    disfraz_nombre: 'Vampiro',
    estado: 'PRESENTE',
    origen: 'IMPORTACION',
    ...resto,
    mascota_nombre: mascota,
    mascota_nombre_norm: normalizarTexto(mascota)
  });
}

async function criteriosDe(participante) {
  const cat = await db.TrkCategoria.findByPk(participante.categoria_id);
  return db.TrkCriterio.findAll({ where: { rubrica_id: cat.rubrica_id }, order: [['orden', 'ASC']] });
}

// Inserta una calificación bloqueada directo en BD (para pruebas de ranking, fusión, etc.).
async function calificar(participante, juradoUsuario, puntajesPorCodigo) {
  const criterios = await criteriosDe(participante);
  const total = criterios.reduce((s, c) => s + puntajesPorCodigo[c.codigo], 0);
  const cal = await db.TrkCalificacion.create({ participante_id: participante.id, jurado_id: juradoUsuario.id, total, enviada_at: new Date(), bloqueada: true });
  await db.TrkCalificacionDetalle.bulkCreate(criterios.map((c) => ({ calificacion_id: cal.id, criterio_id: c.id, puntaje: puntajesPorCodigo[c.codigo] })));
  return cal;
}

// Inserta/actualiza borradores directo en BD (pruebas de matriz y envío final). { CODIGO: entero|null }.
async function borrador(participante, juradoUsuario, puntajesPorCodigo) {
  const criterios = await criteriosDe(participante);
  const filas = criterios
    .filter((c) => Object.prototype.hasOwnProperty.call(puntajesPorCodigo, c.codigo))
    .map((c) => ({ participante_id: participante.id, jurado_id: juradoUsuario.id, criterio_id: c.id, puntaje: puntajesPorCodigo[c.codigo] }));
  await db.TrkBorrador.bulkCreate(filas, { updateOnDuplicate: ['puntaje', 'updated_at'] });
}

module.exports = { sufijo, crearAdmin, crearOperativo, categoria, crearParticipante, criteriosDe, calificar, borrador };
