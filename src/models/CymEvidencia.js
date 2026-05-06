module.exports = (sequelize, DataTypes) => {
  const CymEvidencia = sequelize.define('CymEvidencia', {
    id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    mantenimiento_id: { type: DataTypes.INTEGER, allowNull: false },
    archivo_url:      { type: DataTypes.STRING(500), allowNull: false },
    descripcion:      { type: DataTypes.STRING(300) }
  }, {
    tableName: 'cym_evidencias',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  });

  CymEvidencia.associate = (models) => {
    CymEvidencia.belongsTo(models.CymMantenimiento, { foreignKey: 'mantenimiento_id', as: 'mantenimiento' });
  };

  return CymEvidencia;
};
