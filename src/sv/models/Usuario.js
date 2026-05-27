// sv/models/Usuario.js — sv_org_usuarios
module.exports = (sequelize, DataTypes) => {
  const Usuario = sequelize.define('SvUsuario', {
    usr_id:            { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    usr_area_id:       { type: DataTypes.INTEGER },
    usr_grupo_id:      { type: DataTypes.INTEGER },
    usr_rol_id:        { type: DataTypes.INTEGER, allowNull: false },
    usr_punto_id:      { type: DataTypes.INTEGER },
    usr_email:         { type: DataTypes.STRING(150), allowNull: false, unique: true },
    usr_nombre:        { type: DataTypes.STRING(100), allowNull: false },
    usr_apellido:      { type: DataTypes.STRING(100), allowNull: false },
    usr_telefono:      { type: DataTypes.STRING(20) },
    usr_password_hash: { type: DataTypes.STRING(255), allowNull: false },
    usr_2fa_secret:    { type: DataTypes.STRING(100) },
    usr_preferencias:  { type: DataTypes.JSON },
    usr_activo:        { type: DataTypes.TINYINT, defaultValue: 1 },
    usr_ultimo_login:  { type: DataTypes.DATE },
    // Fase 7: tracking GPS (Habeas Data)
    usr_consentimiento_geo_at: { type: DataTypes.DATE },
    usr_horario_laboral:       { type: DataTypes.JSON }  // {lun:[7,19], mar:[7,19], ...}
  }, {
    tableName: 'sv_org_usuarios',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'usr_created_at',
    updatedAt: 'usr_updated_at',
    defaultScope: {
      attributes: { exclude: ['usr_password_hash', 'usr_2fa_secret'] }
    },
    scopes: {
      withPassword: { attributes: { include: ['usr_password_hash'] } }
    }
  });

  Usuario.associate = (models) => {
    Usuario.belongsTo(models.SvArea,  { as: 'area',  foreignKey: 'usr_area_id'  });
    Usuario.belongsTo(models.SvGrupo, { as: 'grupo', foreignKey: 'usr_grupo_id' });
    Usuario.belongsTo(models.SvRol,   { as: 'rol',   foreignKey: 'usr_rol_id'   });
    Usuario.belongsTo(models.SvPunto, { as: 'punto', foreignKey: 'usr_punto_id' });
    Usuario.hasMany(models.SvSesion,  { as: 'sesiones', foreignKey: 'sesion_usuario_id' });

    // Fase 3.1: grupos adicionales que supervisa (multi-grupo)
    Usuario.belongsToMany(models.SvGrupo, {
      as: 'gruposExtra',
      through: 'sv_org_usuario_grupos',
      foreignKey: 'usr_id',
      otherKey:   'grupo_id',
      timestamps: false
    });

    // Fase 3.2: áreas adicionales accesibles (multi-área)
    Usuario.belongsToMany(models.SvArea, {
      as: 'areasExtra',
      through: 'sv_org_usuario_areas',
      foreignKey: 'usr_id',
      otherKey:   'area_id',
      timestamps: false
    });
  };
  return Usuario;
};
