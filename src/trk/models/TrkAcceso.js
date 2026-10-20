// trk_accesos — PIN de usuarios operativos (extensión 1:1 de usuarios)
module.exports = (sequelize, DataTypes) => {
  const TrkAcceso = sequelize.define('TrkAcceso', {
    usuario_id:    { type: DataTypes.INTEGER, primaryKey: true },
    pin_hash:      { type: DataTypes.STRING(100), allowNull: false },
    token_version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    created_at:    { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at:    { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'trk_accesos',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  TrkAcceso.associate = (models) => {
    TrkAcceso.belongsTo(models.Usuario, { foreignKey: 'usuario_id', as: 'usuario' });
  };
  return TrkAcceso;
};
