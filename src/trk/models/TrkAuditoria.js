// trk_auditoria — quién, qué, antes, después, cuándo, con el código de API (RNF-6)
module.exports = (sequelize, DataTypes) => {
  const TrkAuditoria = sequelize.define('TrkAuditoria', {
    id:         { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    usuario_id: { type: DataTypes.INTEGER, allowNull: true },
    api_codigo: { type: DataTypes.STRING(20), allowNull: false },
    entidad:    { type: DataTypes.STRING(50), allowNull: false },
    entidad_id: { type: DataTypes.STRING(36), allowNull: true },
    accion:     { type: DataTypes.STRING(50), allowNull: false },
    antes:      { type: DataTypes.JSON, allowNull: true },
    despues:    { type: DataTypes.JSON, allowNull: true },
    ip:         { type: DataTypes.STRING(45), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'trk_auditoria',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  });
  return TrkAuditoria;
};
