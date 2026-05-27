// sv/models/Rol.js — sv_org_roles
module.exports = (sequelize, DataTypes) => {
  const Rol = sequelize.define('SvRol', {
    rol_id:       { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    rol_codigo:   { type: DataTypes.STRING(30), allowNull: false, unique: true },
    rol_nombre:   { type: DataTypes.STRING(80), allowNull: false },
    rol_nivel:    { type: DataTypes.SMALLINT, allowNull: false },
    rol_permisos: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    rol_activo:   { type: DataTypes.TINYINT, defaultValue: 1 }
  }, {
    tableName: 'sv_org_roles',
    freezeTableName: true,
    timestamps: false
  });

  Rol.associate = (models) => {
    Rol.hasMany(models.SvUsuario, { as: 'usuarios', foreignKey: 'usr_rol_id' });
  };
  return Rol;
};
