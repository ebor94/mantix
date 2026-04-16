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
      type: DataTypes.ENUM('NUEVO', 'CAMBIO', 'TRASLADO', 'ACTUALIZACION', 'TRASLADO_COMPETENCIA'),
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
      type: DataTypes.ENUM('CC', 'TI', 'CE', 'PA', 'NIT', 'PPT'),
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

    // ── Trazabilidad del registro ──────────────────────────────
    asesorId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: 'Usuario (asesor) que registró la afiliación'
    },
    origen: {
      type: DataTypes.ENUM('ASESOR', 'VEOLIA'),
      allowNull: false,
      defaultValue: 'ASESOR',
      comment: 'VEOLIA = registro público; ASESOR = registrado por asesor'
    },

    // ── Primera cuota / soporte de pago ───────────────────────
    formaPago: {
      type: DataTypes.ENUM('EFECTIVO', 'TRANSFERENCIA', 'CORRESPONSAL', 'POSFECHADO'),
      allowNull: true,
      comment: 'Forma de pago de la primera cuota'
    },
    soportePago: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'Nombre del archivo soporte de pago primera cuota'
    },
    referenciaPago1: {
      type: DataTypes.STRING(200),
      allowNull: true,
      comment: 'Referencia de pago 1 (no. transacción, recibo, etc.)'
    },
    referenciaPago2: {
      type: DataTypes.STRING(200),
      allowNull: true,
      comment: 'Referencia de pago 2'
    },
    referenciaPago3: {
      type: DataTypes.STRING(200),
      allowNull: true,
      comment: 'Referencia de pago 3'
    },
    valorRecibido: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      comment: 'Valor efectivamente recibido en la primera cuota (puede diferir del valorCuota)'
    },
    fechaPagoTentativa: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      comment: 'Fecha tentativa de pago para forma POSFECHADO'
    },
    contratoCompetencia: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'Archivo contrato de la competencia (novedad TRASLADO_COMPETENCIA)'
    },

    // ── Afiliado diferente al contratante + cédula ─────────────
    diferenteAlContratante: {
      type: DataTypes.TINYINT(1).UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      comment: '1 = el afiliado es diferente al contratante'
    },
    cedulaFrontal: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'Nombre del archivo foto cédula cara frontal'
    },
    cedulaReverso: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'Nombre del archivo foto cédula cara reverso'
    },

    // ── Control de rechazo ─────────────────────────────────────
    rechazado: {
      type: DataTypes.TINYINT(1).UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      comment: '1 = rechazado por el aprobador; 0 = sin rechazo'
    },
    motivoRechazo: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Motivo de rechazo ingresado por el aprobador'
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

    // Un afiliado fue registrado por un asesor (usuario)
    Afiliado.belongsTo(models.Usuario, {
      as: 'asesor',
      foreignKey: 'asesorId'
    });

    // Trazabilidad de acciones sobre el afiliado
    Afiliado.hasMany(models.Trazabilidad, {
      as: 'trazabilidad',
      foreignKey: 'afiliadoId'
    });
  };

  return Afiliado;
};