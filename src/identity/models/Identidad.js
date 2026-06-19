// identity/models/Identidad.js — org_identidad (maestra SSO)
module.exports = (sequelize, DataTypes) => {
  const Identidad = sequelize.define('OrgIdentidad', {
    id_identidad:        { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    email_norm:          { type: DataTypes.STRING(150), allowNull: false, unique: true },
    nombre:              { type: DataTypes.STRING(100) },
    apellido:            { type: DataTypes.STRING(100) },
    telefono:            { type: DataTypes.STRING(20) },
    password_hash:       { type: DataTypes.STRING(255), allowNull: false },
    password_changed_at: { type: DataTypes.DATE },
    must_reset:          { type: DataTypes.TINYINT, defaultValue: 0 },
    activo:              { type: DataTypes.TINYINT, defaultValue: 1 },
    ultimo_login:        { type: DataTypes.DATE },
    twofa_secret:        { type: DataTypes.STRING(100) }
  }, {
    tableName: 'org_identidad',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  Identidad.associate = (models) => {
    if (models.OrgSesion) {
      Identidad.hasMany(models.OrgSesion, { as: 'sesiones', foreignKey: 'sesion_identidad_id' });
    }
  };

  return Identidad;
};
