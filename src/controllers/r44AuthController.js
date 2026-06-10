// ============================================
// r44AuthController — Autenticación del Portal de Proveedores
// Rutas: POST /api/r44/auth/login  |  POST /api/r44/auth/logout
// ============================================
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { R44Usuario } = require('../models');

const r44AuthController = {

  /**
   * POST /api/r44/auth/login
   * Body: { email, password }
   */
  async login(req, res, next) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ ok: false, error: 'Email y contraseña requeridos' });
      }

      const usuario = await R44Usuario.findOne({ where: { email: email.trim().toLowerCase(), activo: true } });
      if (!usuario) {
        return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
      }

      const valid = await bcrypt.compare(password, usuario.password_hash);
      if (!valid) {
        return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
      }

      const token = jwt.sign(
        { id: usuario.id, rol: usuario.rol, r44: true },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
      );

      return res.json({
        ok: true,
        data: {
          token,
          usuario: {
            id:     usuario.id,
            nombre: usuario.nombre,
            email:  usuario.email,
            rol:    usuario.rol,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/r44/auth/logout
   * (Stateless JWT — solo indicación al cliente de borrar el token)
   */
  async logout(req, res) {
    return res.json({ ok: true, message: 'Sesión cerrada' });
  },

  /**
   * POST /api/r44/auth/password
   * Cambia la contraseña del usuario autenticado.
   * Body: { password_actual, password_nueva }
   */
  async cambiarPassword(req, res, next) {
    try {
      const { password_actual, password_nueva } = req.body;

      if (!password_actual || !password_nueva) {
        return res.status(400).json({ ok: false, error: 'Contraseña actual y nueva requeridas' });
      }
      if (String(password_nueva).length < 8) {
        return res.status(400).json({ ok: false, error: 'La nueva contraseña debe tener al menos 8 caracteres' });
      }

      // req.r44Usuario no trae password_hash (lo omite el middleware) — recargamos el registro.
      const usuario = await R44Usuario.findByPk(req.r44Usuario.id);
      if (!usuario) {
        return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
      }

      const valid = await bcrypt.compare(password_actual, usuario.password_hash);
      if (!valid) {
        return res.status(401).json({ ok: false, error: 'La contraseña actual es incorrecta' });
      }

      usuario.password_hash = await bcrypt.hash(password_nueva, 10);
      await usuario.save();

      return res.json({ ok: true, message: 'Contraseña actualizada' });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/r44/auth/registro
   * Crea un nuevo usuario proveedor.
   * Body: { nombre, email, password }
   */
  async registro(req, res, next) {
    try {
      const { nombre, email, password } = req.body;

      if (!nombre || !email || !password) {
        return res.status(400).json({ ok: false, error: 'Nombre, email y contraseña requeridos' });
      }

      const existe = await R44Usuario.findOne({ where: { email: email.trim().toLowerCase() } });
      if (existe) {
        return res.status(409).json({ ok: false, error: 'El correo ya está registrado' });
      }

      const password_hash = await bcrypt.hash(password, 10);
      const usuario = await R44Usuario.create({
        nombre: nombre.trim(),
        email:  email.trim().toLowerCase(),
        password_hash,
        rol: 'proveedor',
      });

      const token = jwt.sign(
        { id: usuario.id, rol: usuario.rol, r44: true },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
      );

      return res.status(201).json({
        ok: true,
        data: {
          token,
          usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol },
        },
      });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = r44AuthController;
