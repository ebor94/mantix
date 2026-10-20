// trk_importaciones — registro de cada importación confirmada
module.exports = (sequelize, DataTypes) => {
  const TrkImportacion = sequelize.define('TrkImportacion', {
    id:                { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    usuario_id:        { type: DataTypes.INTEGER, allowNull: true },
    archivo_nombre:    { type: DataTypes.STRING(255), allowNull: false },
    archivo_sha256:    { type: DataTypes.CHAR(64), allowNull: false },
    filas_total:       { type: DataTypes.INTEGER, allowNull: false },
    filas_ok:          { type: DataTypes.INTEGER, allowNull: false },
    filas_advertencia: { type: DataTypes.INTEGER, allowNull: false },
    created_at:        { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'trk_importaciones',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  });
  return TrkImportacion;
};
