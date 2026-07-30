// ============================================
// src/models/ConvenioEmpleado.js - Nómina de un convenio
// ============================================
//
// Una fila es un empleado importado desde la nómina de la empresa (o cargado
// a mano por un asesor) para un convenio. El servidor la usa para validar
// quién puede autoafiliarse y para no invitar dos veces al mismo documento:
// el UNIQUE (convenioId, numeroDocumento) es lo que hace idempotente
// reimportar la misma nómina (Task 3 la usa con ON DUPLICATE KEY UPDATE).
//
// `afiliadoId` queda NULL hasta que el empleado completa la autoafiliación a
// través de una invitación (Task 3); a partir de ahí enlaza con el registro
// real en `afiliados`.
//
// ⚠️ Debe registrarse en models/index.js DESPUÉS de Convenio.

module.exports = (sequelize, DataTypes) => {
  const ConvenioEmpleado = sequelize.define('ConvenioEmpleado', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    convenioId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'convenios', key: 'id' }
    },
    tipoDocumento: {
      type: DataTypes.ENUM('CC', 'TI', 'CE', 'PA', 'NIT', 'PPT'),
      allowNull: false
    },
    numeroDocumento: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    primerNombre: {
      type: DataTypes.STRING(80),
      allowNull: false
    },
    primerApellido: {
      type: DataTypes.STRING(80),
      allowNull: false
    },
    celular: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    email: {
      type: DataTypes.STRING(150),
      allowNull: true
    },
    cargo: {
      type: DataTypes.STRING(150),
      allowNull: true
    },
    unidadNegocio: {
      type: DataTypes.STRING(150),
      allowNull: true
    },
    activo: {
      type: DataTypes.TINYINT(1),
      allowNull: false,
      defaultValue: 1,
      comment: '0 = el empleado ya no está en la nómina; no se le puede invitar'
    },
    afiliadoId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: 'afiliados', key: 'id' },
      comment: 'Se completa cuando el empleado termina la autoafiliación'
    }
  }, {
    tableName: 'convenio_empleados',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['convenioId', 'numeroDocumento'] },
      { fields: ['convenioId'] }
    ]
  });

  ConvenioEmpleado.associate = function (models) {
    ConvenioEmpleado.belongsTo(models.Convenio, {
      as: 'convenio',
      foreignKey: 'convenioId'
    });
    ConvenioEmpleado.belongsTo(models.Afiliado, {
      as: 'afiliado',
      foreignKey: 'afiliadoId'
    });
  };

  return ConvenioEmpleado;
};
