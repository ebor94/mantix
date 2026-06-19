// identity/models/Sesion.js — org_sesion (refresh tokens del SSO)
module.exports = (sequelize, DataTypes) => {
  const Sesion = sequelize.define('OrgSesion', {
    sesion_id:           { type: DataTypes.CHAR(36), primaryKey: true },
    sesion_identidad_id: { type: DataTypes.INTEGER, allowNull: false },
    sesion_refresh_hash: { type: DataTypes.CHAR(64), allowNull: false },
    sesion_ua:           { type: DataTypes.STRING(250) },
    sesion_ip:           { type: DataTypes.STRING(45) },
    sesion_expires_at:   { type: DataTypes.DATE }
  }, {
    tableName: 'org_sesion',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'sesion_created_at',
    updatedAt: false
  });

  Sesion.associate = (models) => {
    if (models.OrgIdentidad) {
      Sesion.belongsTo(models.OrgIdentidad, { as: 'identidad', foreignKey: 'sesion_identidad_id' });
    }
  };

  return Sesion;
};
