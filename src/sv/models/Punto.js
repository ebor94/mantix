// sv/models/Punto.js — sv_cfg_puntos_atencion
module.exports = (sequelize, DataTypes) => {
  const Punto = sequelize.define('SvPunto', {
    punto_id:        { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    punto_codigo:    { type: DataTypes.STRING(20),  allowNull: false, unique: true },
    punto_nombre:    { type: DataTypes.STRING(100), allowNull: false },
    punto_direccion: { type: DataTypes.STRING(200) },
    punto_ciudad:    { type: DataTypes.STRING(80), defaultValue: 'Cucuta' },
    punto_telefono:  { type: DataTypes.STRING(20) },
    punto_activo:    { type: DataTypes.TINYINT, defaultValue: 1 }
  }, {
    tableName: 'sv_cfg_puntos_atencion',
    freezeTableName: true,
    timestamps: false
  });
  return Punto;
};
