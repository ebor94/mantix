// sv/models/Presupuesto.js — sv_org_presupuestos (migración 028)
module.exports = (sequelize, DataTypes) => {
  const UNICA = 'uq_presupuesto'; // asesor, área, año, mes y categoría
  const Presupuesto = sequelize.define('SvPresupuesto', {
    pre_id:         { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    pre_usr_id:     { type: DataTypes.INTEGER, allowNull: false, unique: UNICA },
    pre_area_id:    { type: DataTypes.INTEGER, allowNull: false, unique: UNICA },
    pre_anio:       { type: DataTypes.SMALLINT, allowNull: false, unique: UNICA },
    pre_mes:        { type: DataTypes.TINYINT, allowNull: false, unique: UNICA },
    pre_categoria:  { type: DataTypes.STRING(50), allowNull: false, unique: UNICA },
    pre_valor:      { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    pre_created_by: { type: DataTypes.INTEGER, allowNull: false },
    pre_updated_by: { type: DataTypes.INTEGER, allowNull: false }
  }, {
    tableName: 'sv_org_presupuestos',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'pre_created_at',
    updatedAt: 'pre_updated_at'
  });

  Presupuesto.associate = (models) => {
    Presupuesto.belongsTo(models.SvUsuario, { as: 'asesor', foreignKey: 'pre_usr_id' });
    Presupuesto.belongsTo(models.SvUsuario, { as: 'editor', foreignKey: 'pre_updated_by' });
  };
  return Presupuesto;
};
