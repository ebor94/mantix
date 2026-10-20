const crypto = require('crypto');
const db = require('../../models');
const TrkError = require('../utils/TrkError');
const { slug } = require('../utils/normalizar');
const { ROLES_OPERATIVOS } = require('../config/constantes');
const { generarPin, hashPin, nombreVisible } = require('./authPin.service');
const { registrarAuditoria } = require('./auditoria.service');

const vista = (u) => ({ id: u.id, nombre: nombreVisible(u), rol: u.rol.nombre, activo: Boolean(u.activo) });

const emailSintetico = (nombre) => `${slug(nombre)}-${crypto.randomBytes(3).toString('hex')}@trikipeludos.local`;

async function obtenerOperativo(id, transaction) {
  const usuario = await db.Usuario.findByPk(id, { include: [{ model: db.Rol, as: 'rol' }], transaction });
  if (!usuario || !usuario.rol || !ROLES_OPERATIVOS.includes(usuario.rol.nombre)) {
    throw new TrkError(404, 'NO_ENCONTRADO', 'Usuario operativo no encontrado');
  }
  return usuario;
}

async function listarOperativos() {
  const usuarios = await db.Usuario.findAll({
    include: [{ model: db.Rol, as: 'rol', where: { nombre: ROLES_OPERATIVOS } }],
    order: [[{ model: db.Rol, as: 'rol' }, 'nombre', 'ASC'], ['nombre', 'ASC']]
  });
  return usuarios.map(vista);
}

async function crearOperativo({ nombre, rol }, ctx) {
  const rolDb = await db.Rol.findOne({ where: { nombre: rol } });
  if (!rolDb || !ROLES_OPERATIVOS.includes(rol)) throw new TrkError(400, 'VALIDACION', 'Rol inválido');
  const pin = generarPin();
  const pinHash = await hashPin(pin);
  const usuario = await db.sequelize.transaction(async (transaction) => {
    const u = await db.Usuario.create({
      rol_id: rolDb.id, nombre, apellido: '', email: emailSintetico(nombre),
      password: crypto.randomBytes(32).toString('hex'), activo: true
    }, { transaction });
    await db.TrkAcceso.create({ usuario_id: u.id, pin_hash: pinHash, token_version: 0 }, { transaction });
    await registrarAuditoria(ctx, { entidad: 'usuario', entidadId: u.id, accion: 'CREAR', despues: { nombre, rol } }, { transaction });
    return u;
  });
  return { usuario: { id: usuario.id, nombre, rol, activo: true }, pin };
}

async function actualizarOperativo(id, cambios, ctx) {
  return db.sequelize.transaction(async (transaction) => {
    const usuario = await obtenerOperativo(id, transaction);
    const antes = vista(usuario);
    if (cambios.nombre !== undefined) usuario.nombre = cambios.nombre;
    if (cambios.activo !== undefined) usuario.activo = cambios.activo;
    await usuario.save({ transaction });
    if (cambios.activo === false) {
      await db.TrkAcceso.increment('token_version', { where: { usuario_id: usuario.id }, transaction });
    }
    const despues = vista(usuario);
    await registrarAuditoria(ctx, { entidad: 'usuario', entidadId: usuario.id, accion: 'EDITAR', antes, despues }, { transaction });
    return despues;
  });
}

async function regenerarPin(id, ctx) {
  const pin = generarPin();
  const pinHash = await hashPin(pin);
  await db.sequelize.transaction(async (transaction) => {
    const usuario = await obtenerOperativo(id, transaction);
    const acceso = await db.TrkAcceso.findByPk(usuario.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (acceso) {
      await acceso.update({ pin_hash: pinHash, token_version: acceso.token_version + 1 }, { transaction });
    } else {
      await db.TrkAcceso.create({ usuario_id: usuario.id, pin_hash: pinHash, token_version: 0 }, { transaction });
    }
    await registrarAuditoria(ctx, { entidad: 'usuario', entidadId: usuario.id, accion: 'REGENERAR_PIN' }, { transaction });
  });
  return { pin };
}

module.exports = { listarOperativos, crearOperativo, actualizarOperativo, regenerarPin };
