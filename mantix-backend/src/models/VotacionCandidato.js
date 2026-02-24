// ============================================
// src/models/VotacionCandidato.js
// ============================================
module.exports = (sequelize, DataTypes) => {
  const VotacionCandidato = sequelize.define('VotacionCandidato', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    evento_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    nombre: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    cedula: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    foto: {
      type: DataTypes.STRING(500),
      allowNull: true,
      defaultValue: null,
    },
    sede_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    activo: {
      type: DataTypes.TINYINT(1),
      defaultValue: 1,
    },
  }, {
    tableName: 'votacion_candidatos',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  VotacionCandidato.associate = (models) => {
    VotacionCandidato.belongsTo(models.VotacionEvento, { foreignKey: 'evento_id', as: 'evento' });
    VotacionCandidato.belongsTo(models.Sede, { foreignKey: 'sede_id', as: 'sede' });
    VotacionCandidato.hasMany(models.VotacionVoto, { foreignKey: 'candidato_id', as: 'votos' });
  };

  return VotacionCandidato;
};
