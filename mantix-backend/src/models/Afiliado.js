// ============================================
// src/models/Afiliado.js - Modelo de Afiliados
// ============================================

module.exports = (sequelize, DataTypes) => {
  const Afiliado = sequelize.define('Afiliado', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },

    // ── Datos de la solicitud ──────────────────────────────────
    sucursal: {
      type: DataTypes.ENUM('CUCUTA', 'PAMPLONA', 'OCAÑA', 'SARAVENA', 'ARAUCA', 'TAME', 'CRISTO REY', 'ARAUQUITA'),
      allowNull: true
    },
    novedad: {
      type: DataTypes.ENUM('NUEVO', 'CAMBIO', 'TRASLADO', 'ACTUALIZACION'),
      allowNull: true
    },
    vigenciaDesde: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    vigenciaHasta: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },

    // ── Identificación ─────────────────────────────────────────
    tipoDocumento: {
      type: DataTypes.ENUM('CC', 'TI', 'CE', 'PA', 'NIT'),
      allowNull: false
    },
    numeroDocumento: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true
    },
    primerApellido: {
      type: DataTypes.STRING(80),
      allowNull: false
    },
    segundoApellido: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    primerNombre: {
      type: DataTypes.STRING(80),
      allowNull: false
    },
    segundoNombre: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    fechaNacimiento: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    edad: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false
    },
    sexo: {
      type: DataTypes.ENUM('F', 'M', 'X'),
      allowNull: false
    },
    estadoCivil: {
      type: DataTypes.ENUM('SOLTERO', 'CASADO', 'UNION_LIBRE', 'DIVORCIADO', 'VIUDO', 'SEPARADO'),
      allowNull: false
    },

    // ── Contacto ───────────────────────────────────────────────
    celular: {
      type: DataTypes.STRING(15),
      allowNull: false
    },
    celular2: {
      type: DataTypes.STRING(15),
      allowNull: true
    },
    email: {
      type: DataTypes.STRING(120),
      allowNull: true,
      validate: {
        isEmail: true
      }
    },

    // ── Ubicación ──────────────────────────────────────────────
    departamento: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    ciudad: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    barrio: {
      type: DataTypes.STRING(120),
      allowNull: true
    },
    direccion: {
      type: DataTypes.STRING(200),
      allowNull: true
    },

    // ── Empresa ────────────────────────────────────────────────
    empresaId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: {
        model: 'empresas',
        key: 'id'
      }
    },
    nit: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    nombreEmpresa: {
      type: DataTypes.STRING(200),
      allowNull: true
    },

    // ── Información comercial ──────────────────────────────────
    canal: {
      type: DataTypes.ENUM('EMPRESARIAL', 'INDIVIDUAL', 'CENS'),
      allowNull: true
    },
    producto: {
      type: DataTypes.ENUM('VERDE', 'INTEGRAL', 'CENS'),
      allowNull: true
    },
    grupo: {
      type: DataTypes.ENUM('UNIPERSONAL', 'UNIFAMILIAR', 'BASICO', 'CENS_II', 'INDIVIDUAL', 'TRADICIONAL'),
      allowNull: true
    },
    asistenciaFueraDeCasa: {
      type: DataTypes.ENUM('SI', 'NO'),
      allowNull: true
    },

    // ── Actividad económica ────────────────────────────────────
    actividadEconomica: {
      type: DataTypes.STRING(200),
      allowNull: true
    },
    ocupacion: {
      type: DataTypes.STRING(150),
      allowNull: true
    },
    codigoCiiu: {
      type: DataTypes.STRING(10),
      allowNull: true
    },

    // ── Campos exclusivos canal CENS ───────────────────────────
    usuarioCens: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    cicloEstrato: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    relacionPredio: {
      type: DataTypes.ENUM('FAMILIAR', 'ARRENDADO', 'PROPIETARIO'),
      allowNull: true
    },

    // ── Observaciones ──────────────────────────────────────────
    observaciones: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    // ── Control de estado ──────────────────────────────────────
    notificacionRecibo: {
      type: DataTypes.INTEGER(1).UNSIGNED,
      allowNull: true,
      defaultValue: 0
    },
    fechaNotificacionRecibo: {
      type: DataTypes.DATE,
      allowNull: true
    },
    estadoRegistro: {
      type: DataTypes.INTEGER(1).UNSIGNED,
      allowNull: true,
      defaultValue: 0
    },
    notificacionAprobacion: {
      type: DataTypes.INTEGER(1).UNSIGNED,
      allowNull: true,
      defaultValue: 0
    },
    fechaNotificacionAprobacion: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'afiliados',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['numeroDocumento']
      },
      {
        fields: ['empresaId']
      },
      {
        fields: ['estadoRegistro']
      }
    ]
  });

  Afiliado.associate = function(models) {
    // Un afiliado tiene muchos beneficiarios
    Afiliado.hasMany(models.Beneficiario, {
      as: 'beneficiarios',
      foreignKey: 'afiliadoId',
      onDelete: 'CASCADE'
    });

    // Un afiliado pertenece a una empresa (opcional)
    Afiliado.belongsTo(models.Empresa, {
      as: 'empresa',
      foreignKey: 'empresaId'
    });

    // Un afiliado puede tener muchos seguros
    Afiliado.hasMany(models.Seguro, {
      as: 'seguros',
      foreignKey: 'afiliadoId',
      onDelete: 'CASCADE'
    });

    // Un afiliado tiene un contrato (relación 1:1)
    Afiliado.hasOne(models.ContratoValor, {
      as: 'contrato',
      foreignKey: 'afiliadoId',
      onDelete: 'CASCADE'
    });
  };

  return Afiliado;
};