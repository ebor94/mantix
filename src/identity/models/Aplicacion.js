// identity/models/Aplicacion.js — org_aplicacion (catálogo extensible de apps SSO)
module.exports = (sequelize, DataTypes) => {
  const Aplicacion = sequelize.define('OrgAplicacion', {
    app_id:             { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    app_codigo:         { type: DataTypes.STRING(40), allowNull: false, unique: true },
    app_nombre:         { type: DataTypes.STRING(120), allowNull: false },
    app_descripcion:    { type: DataTypes.STRING(250) },
    app_url_base:       { type: DataTypes.STRING(250), allowNull: false },
    app_icon:           { type: DataTypes.STRING(20), defaultValue: '📱' },
    app_color_hex:      { type: DataTypes.STRING(7) },
    app_orden:          { type: DataTypes.INTEGER, defaultValue: 0 },
    app_activa:         { type: DataTypes.TINYINT, defaultValue: 1 },
    app_tabla_users:    { type: DataTypes.STRING(60) },
    app_columna_fk:     { type: DataTypes.STRING(40) },
    app_columna_activo: { type: DataTypes.STRING(40), defaultValue: 'activo' }
  }, {
    tableName: 'org_aplicacion',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'app_created_at',
    updatedAt: false
  });

  return Aplicacion;
};
