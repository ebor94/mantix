module.exports = (sequelize, DataTypes) => {
  const CymParejaMiembro = sequelize.define('CymParejaMiembro', {
    id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    pareja_id:   { type: DataTypes.INTEGER, allowNull: false },
    posicion:    { type: DataTypes.TINYINT, allowNull: false },
    operario_id: { type: DataTypes.INTEGER, allowNull: false },
    activo:      { type: DataTypes.BOOLEAN, defaultValue: true }
  }, {
    tableName: 'cym_pareja_miembros',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  });

  CymParejaMiembro.associate = (models) => {
    CymParejaMiembro.belongsTo(models.CymPareja, { foreignKey: 'pareja_id', as: 'pareja' });
    CymParejaMiembro.belongsTo(models.Usuario,   { foreignKey: 'operario_id', as: 'operario' });
  };

  return CymParejaMiembro;
};
