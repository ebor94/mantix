// ============================================
// src/models/VotacionVoto.js
// ============================================
module.exports = (sequelize, DataTypes) => {
  const VotacionVoto = sequelize.define('VotacionVoto', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    evento_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    votante_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    candidato_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    sede_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    fecha_voto: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    ip_address: {
      type: DataTypes.STRING(45),
      allowNull: true,
      defaultValue: null,
    },
  }, {
    tableName: 'votacion_votos',
    timestamps: false,
  });

  VotacionVoto.associate = (models) => {
    VotacionVoto.belongsTo(models.VotacionEvento, { foreignKey: 'evento_id', as: 'evento' });
    VotacionVoto.belongsTo(models.VotacionVotante, { foreignKey: 'votante_id', as: 'votante' });
    VotacionVoto.belongsTo(models.VotacionCandidato, { foreignKey: 'candidato_id', as: 'candidato' });
    VotacionVoto.belongsTo(models.Sede, { foreignKey: 'sede_id', as: 'sede' });
  };

  return VotacionVoto;
};
