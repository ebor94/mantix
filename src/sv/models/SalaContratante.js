// sv/models/SalaContratante.js — sv_crm_salas_contratantes (migración 023)
module.exports = (sequelize, DataTypes) => {
  const SalaContratante = sequelize.define('SvSalaContratante', {
    sc_id:               { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    sc_homenaje_sala_id: { type: DataTypes.INTEGER, allowNull: false, unique: 'uq_sc_homenaje' },
    sc_prosp_id:         { type: DataTypes.INTEGER, allowNull: false },
    sc_usr_id:           { type: DataTypes.INTEGER, allowNull: false }
  }, {
    tableName: 'sv_crm_salas_contratantes',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'sc_created_at',
    updatedAt: false
  });

  SalaContratante.associate = (models) => {
    SalaContratante.belongsTo(models.SvProspecto, { as: 'prospecto',    foreignKey: 'sc_prosp_id' });
    SalaContratante.belongsTo(models.SvUsuario,   { as: 'vinculadoPor', foreignKey: 'sc_usr_id' });
  };
  return SalaContratante;
};
