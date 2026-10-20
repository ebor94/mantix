// Fábricas de datos para pruebas de integración TRK. Datos ficticios.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../../models');
const { hashPin, emitirTokenPin } = require('../services/authPin.service');

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

module.exports = { sufijo, crearAdmin, crearOperativo };
