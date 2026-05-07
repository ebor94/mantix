module.exports = (sequelize, DataTypes) => {
  const CymPareja = sequelize.define('CymPareja', {
    id:     { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nombre: { type: DataTypes.STRING(100), allowNull: false },
    activo: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, {
    tableName: 'cym_parejas',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  CymPareja.associate = (models) => {
    CymPareja.hasMany(models.CymParejaMiembro, { foreignKey: 'pareja_id', as: 'miembros' });
  };

  return CymPareja;
};
