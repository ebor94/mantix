// ============================================
// src/models/ConvenioInvitacion.js - Invitaciones de autoafiliación
// ============================================
//
// Una invitación es un enlace de un solo uso para que un empleado de la
// nómina (`ConvenioEmpleado`) se autoafilie al convenio. El `token` lo genera
// Task 3 con crypto.randomBytes(32).toString('base64url') — no con el
// hashId.js reversible que usa el resto del proyecto — de ahí CHAR(43).
//
// `usadoEn` marca que el token ya se consumió (queda enlazado a `afiliadoId`);
// `enviadoEn`/`canalEnvio` registran cómo se entregó, no si se usó.
//
// Solo tiene `createdAt`, sin `updatedAt`: una invitación no se edita, se crea
// y luego se marca como usada.
//
// ⚠️ Debe registrarse en models/index.js DESPUÉS de Convenio y de
// ConvenioEmpleado (depende de ambas).

module.exports = (sequelize, DataTypes) => {
  const ConvenioInvitacion = sequelize.define('ConvenioInvitacion', {
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
    empleadoId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: { model: 'convenio_empleados', key: 'id' }
    },
    token: {
      type: DataTypes.CHAR(43),
      allowNull: false,
      unique: true,
      comment: "crypto.randomBytes(32).toString('base64url'), generado en el servicio (Task 3)"
    },
    expiraEn: {
      type: DataTypes.DATE,
      allowNull: false
    },
    usadoEn: {
      type: DataTypes.DATE,
      allowNull: true
    },
    afiliadoId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      references: { model: 'afiliados', key: 'id' }
    },
    enviadoEn: {
      type: DataTypes.DATE,
      allowNull: true
    },
    canalEnvio: {
      type: DataTypes.ENUM('WHATSAPP', 'EMAIL', 'MANUAL'),
      allowNull: true
    },
    creadoPorUsuarioId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'usuarios', key: 'id' }
    }
  }, {
    tableName: 'convenio_invitaciones',
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: false,
    indexes: [
      { fields: ['empleadoId'] },
      { fields: ['convenioId'] }
    ]
  });

  ConvenioInvitacion.associate = function (models) {
    ConvenioInvitacion.belongsTo(models.Convenio, {
      as: 'convenio',
      foreignKey: 'convenioId'
    });
    ConvenioInvitacion.belongsTo(models.ConvenioEmpleado, {
      as: 'empleado',
      foreignKey: 'empleadoId'
    });
    ConvenioInvitacion.belongsTo(models.Afiliado, {
      as: 'afiliado',
      foreignKey: 'afiliadoId'
    });
    ConvenioInvitacion.belongsTo(models.Usuario, {
      as: 'creadoPor',
      foreignKey: 'creadoPorUsuarioId'
    });
  };

  return ConvenioInvitacion;
};
