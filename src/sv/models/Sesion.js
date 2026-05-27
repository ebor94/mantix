// sv/models/Sesion.js — sv_org_sesiones
module.exports = (sequelize, DataTypes) => {
  const Sesion = sequelize.define('SvSesion', {
    sesion_id:          { type: DataTypes.CHAR(36), primaryKey: true,
                          defaultValue: () => require('crypto').randomUUID() },
    sesion_usuario_id:  { type: DataTypes.INTEGER, allowNull: false },
    sesion_token_hash:  { type: DataTypes.STRING(255), allowNull: false },
    sesion_dispositivo: { type: DataTypes.STRING(200) },
    sesion_ip:          { type: DataTypes.STRING(45) },
    sesion_expires_at:  { type: DataTypes.DATE, allowNull: false }
  }, {
    tableName: 'sv_org_sesiones',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'sesion_created_at',
    updatedAt: false
  });

  Sesion.associate = (models) => {
    Sesion.belongsTo(models.SvUsuario, { as: 'usuario', foreignKey: 'sesion_usuario_id' });
  };
  return Sesion;
};
