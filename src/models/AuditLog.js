// ============================================
// src/models/AuditLog.js
// ============================================
module.exports = (sequelize, DataTypes) => {
  const AuditLog = sequelize.define('AuditLog', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    usuario_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    accion: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    tabla: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    registro_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    datos_anteriores: {
      type: DataTypes.JSON,
      allowNull: true
    },
    datos_nuevos: {
      type: DataTypes.JSON,
      allowNull: true
    },
    ip_address: {
      type: DataTypes.STRING(45),
      allowNull: true
    },
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'audit_log',
    timestamps: true,
    updatedAt: false,
    underscored: true
  });

  return AuditLog;
};