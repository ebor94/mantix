module.exports = (sequelize, DataTypes) => {
  const CymPredio = sequelize.define('CymPredio', {
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    sector:       { type: DataTypes.STRING(100), allowNull: false },
    numero_lote:  { type: DataTypes.STRING(50),  allowNull: false },
    acomodacion:  { type: DataTypes.ENUM('sencilla','doble','triple'), allowNull: false },
    sq_cedula:    { type: DataTypes.STRING(20) },
    sq_nombre:    { type: DataTypes.STRING(200) },
    sq_fecha_nac:  { type: DataTypes.DATEONLY },
    sq_fecha_fall: { type: DataTypes.DATEONLY },
    sq_fecha_inhum:{ type: DataTypes.DATEONLY },
    // Ser querido 2 (solo en acomodacion doble o triple)
    sq2_cedula:    { type: DataTypes.STRING(20) },
    sq2_nombre:    { type: DataTypes.STRING(200) },
    sq2_fecha_nac: { type: DataTypes.DATEONLY },
    sq2_fecha_fall:{ type: DataTypes.DATEONLY },
    sq2_fecha_inhum:{ type: DataTypes.DATEONLY },
    // Ser querido 3 (solo en acomodacion triple)
    sq3_cedula:    { type: DataTypes.STRING(20) },
    sq3_nombre:    { type: DataTypes.STRING(200) },
    sq3_fecha_nac: { type: DataTypes.DATEONLY },
    sq3_fecha_fall:{ type: DataTypes.DATEONLY },
    sq3_fecha_inhum:{ type: DataTypes.DATEONLY },
    activo_mant:          { type: DataTypes.BOOLEAN, defaultValue: true },
    motivo_inactivacion:  { type: DataTypes.STRING(500) }
  }, {
    tableName: 'cym_predios',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  CymPredio.associate = (models) => {
    CymPredio.hasMany(models.CymContrato,     { foreignKey: 'predio_id', as: 'contratos' });
    CymPredio.hasOne(models.CymAsignacion,    { foreignKey: 'predio_id', as: 'asignacion' });
    CymPredio.hasMany(models.CymMantenimiento,{ foreignKey: 'predio_id', as: 'mantenimientos' });
    CymPredio.hasMany(models.CymHistoricoSq,  { foreignKey: 'predio_id', as: 'historico_sq' });
  };

  return CymPredio;
};
