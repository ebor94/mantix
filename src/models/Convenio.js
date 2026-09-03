// ============================================
// src/models/Convenio.js - Convenios empresariales
// ============================================
//
// Un convenio es un formulario público de autoafiliación parametrizado por
// datos, no por código: reglas de beneficiarios, defaults comerciales, marca y
// canales de contacto viven en esta fila. Dar de alta otra empresa es un INSERT,
// no un despliegue.
//
// Las cuatro columnas JSON están separadas a propósito porque cambian a ritmos
// distintos: `reglas` es contrato de negocio y el servidor la hace cumplir;
// `branding` y `formulario` son presentación y se pueden tocar sin riesgo;
// `contacto` es integración.
//
// ⚠️ Debe registrarse en models/index.js DESPUÉS de Empresa y ANTES de Afiliado.

module.exports = (sequelize, DataTypes) => {
  const Convenio = sequelize.define('Convenio', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },

    // Identificador de la URL pública: /afiliados/convenio/:slug
    slug: {
      type: DataTypes.STRING(60),
      allowNull: false,
      unique: true,
      comment: 'Identificador de la URL pública. No cambiar: se imprime y se comparte.'
    },
    nombre: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    nit: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    empresaId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: 'empresas', key: 'id' }
    },

    // ── Defaults comerciales ────────────────────────────────────────────────
    // En columnas tipadas y no dentro de un JSON porque son los mismos ENUM de
    // `afiliados` y deben poder filtrarse en SQL (reportes, plano de póliza).
    canal: {
      type: DataTypes.ENUM('EMPRESARIAL', 'INDIVIDUAL', 'CENS'),
      allowNull: true
    },
    producto: {
      type: DataTypes.ENUM('VERDE', 'INTEGRAL', 'CENS'),
      allowNull: true
    },
    grupo: {
      type: DataTypes.ENUM('UNIPERSONAL', 'UNIFAMILIAR', 'BASICO', 'CENS_II', 'INDIVIDUAL', 'TRADICIONAL', 'UNIFAMILIAR_INDIV_II', 'BASICO_INDIV_II'),
      allowNull: true
    },
    planNombre: {
      type: DataTypes.STRING(120),
      allowNull: true
    },

    // ── Configuración parametrizable ────────────────────────────────────────
    reglas: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: 'Reglas de beneficiarios. La evalúa src/rules/convenioRules.js.'
    },
    branding: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'bannerUrl (absoluta), colores, títulos.'
    },
    formulario: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Qué bloques del formulario se muestran.'
    },
    contacto: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'WhatsApp, Google Chat, correo de notificación. NO exponer completo al público.'
    },

    activo: {
      type: DataTypes.TINYINT(1),
      allowNull: false,
      defaultValue: 1,
      comment: '0 = el endpoint público responde 404. Se siembra en 0 hasta validar.'
    }
  }, {
    tableName: 'convenios',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['slug'] },
      { fields: ['activo'] },
      { fields: ['empresaId'] }
    ]
  });

  Convenio.associate = function (models) {
    Convenio.belongsTo(models.Empresa, {
      as: 'empresa',
      foreignKey: 'empresaId'
    });
    Convenio.hasMany(models.Afiliado, {
      as: 'afiliados',
      foreignKey: 'convenioId',
      onDelete: 'SET NULL'
    });
  };

  /**
   * MySQL/Sequelize devuelven las columnas JSON como objeto o como string según
   * la versión del driver. Mismo idiom defensivo que usa afiliado.service.js
   * para rol.permisos.
   */
  Convenio.prototype.json = function (campo) {
    const raw = this[campo];
    if (!raw) return null;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch { return null; }
    }
    return raw;
  };

  /**
   * Proyección segura para el endpoint público: nunca devuelve `contacto`
   * completo, porque incluye el webhook/etiqueta de Google Chat y el correo
   * interno de notificación.
   */
  Convenio.prototype.toPublicJSON = function (engineVersion) {
    const contacto = this.json('contacto') || {};
    return {
      slug: this.slug,
      nombre: this.nombre,
      nit: this.nit,
      planNombre: this.planNombre,
      comercial: {
        canal: this.canal,
        producto: this.producto,
        grupo: this.grupo
      },
      reglas: this.json('reglas'),
      branding: this.json('branding'),
      formulario: this.json('formulario'),
      contacto: { whatsapp: contacto.whatsapp || null },
      engineVersion
    };
  };

  return Convenio;
};
