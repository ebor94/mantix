const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../models');
const TrkError = require('../utils/TrkError');
const { permisosTrk } = require('../utils/permisos');
const { ROLES_OPERATIVOS } = require('../config/constantes');

const generarPin = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const hashPin = (pin) => bcrypt.hash(pin, 10);

function secreto() {
  if (!process.env.TRK_JWT_SECRET) throw new Error('Falta TRK_JWT_SECRET');
  return process.env.TRK_JWT_SECRET;
}

function emitirTokenPin(usuarioId, tokenVersion) {
  return jwt.sign({ id: usuarioId, scope: 'trk', tv: tokenVersion }, secreto(), { expiresIn: '12h' });
}

const nombreVisible = (u) => `${u.nombre || ''} ${u.apellido || ''}`.trim();

function perfilDe(usuario) {
  return {
    id: usuario.id,
    nombre: nombreVisible(usuario),
    rol: usuario.rol ? usuario.rol.nombre : null,
    permisos: permisosTrk(usuario)
  };
}

async function loginConPin(usuarioId, pin) {
  const usuario = await db.Usuario.findByPk(usuarioId, { include: [{ model: db.Rol, as: 'rol' }] });
  const acceso = usuario ? await db.TrkAcceso.findByPk(usuario.id) : null;
  const esOperativo = usuario && usuario.rol && ROLES_OPERATIVOS.includes(usuario.rol.nombre);
  const valido = Boolean(usuario && usuario.activo && esOperativo && acceso && (await bcrypt.compare(pin, acceso.pin_hash)));
  if (!valido) throw new TrkError(401, 'NO_AUTENTICADO', 'Usuario o PIN incorrecto');
  return { token: emitirTokenPin(usuario.id, acceso.token_version), usuario: perfilDe(usuario) };
}

async function listarUsuariosPin() {
  const usuarios = await db.Usuario.findAll({
    where: { activo: true },
    include: [{ model: db.Rol, as: 'rol', where: { nombre: ROLES_OPERATIVOS } }],
    order: [['nombre', 'ASC']]
  });
  return usuarios.map((u) => ({ id: u.id, nombre: nombreVisible(u), rol: u.rol.nombre }));
}

module.exports = { generarPin, hashPin, emitirTokenPin, loginConPin, perfilDe, listarUsuariosPin, nombreVisible };
