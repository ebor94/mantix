module.exports = (sequelize, DataTypes) => {
  const CymHistoricoSq = sequelize.define('CymHistoricoSq', {
    id:              { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    predio_id:       { type: DataTypes.INTEGER, allowNull: false },
    posicion:        { type: DataTypes.TINYINT, allowNull: false },
    cedula_ant:      { type: DataTypes.STRING(20) },
    nombre_ant:      { type: DataTypes.STRING(200) },
    fecha_nac_ant:   { type: DataTypes.DATEONLY },
    fecha_fall_ant:  { type: DataTypes.DATEONLY },
    fecha_inhum_ant: { type: DataTypes.DATEONLY },
    cedula_nue:      { type: DataTypes.STRING(20) },
    nombre_nue:      { type: DataTypes.STRING(200) },
    fecha_nac_nue:   { type: DataTypes.DATEONLY },
    fecha_fall_nue:  { type: DataTypes.DATEONLY },
    fecha_inhum_nue: { type: DataTypes.DATEONLY },
    motivo:          { type: DataTypes.STRING(500) },
    usuario_id:      { type: DataTypes.INTEGER, allowNull: false }
  }, {
    tableName: 'cym_historico_sq',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  });

  CymHistoricoSq.associate = (models) => {
    CymHistoricoSq.belongsTo(models.CymPredio, { foreignKey: 'predio_id', as: 'predio' });
    CymHistoricoSq.belongsTo(models.Usuario,   { foreignKey: 'usuario_id', as: 'usuario' });
  };

  return CymHistoricoSq;
};
