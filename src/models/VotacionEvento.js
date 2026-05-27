// ============================================
// src/models/VotacionEvento.js
// ============================================
module.exports = (sequelize, DataTypes) => {
  const VotacionEvento = sequelize.define('VotacionEvento', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    nombre: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    descripcion: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    fecha_inicio: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    fecha_fin: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    activo: {
      type: DataTypes.TINYINT(1),
      defaultValue: 1,
    },
  }, {
    tableName: 'votacion_eventos',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  VotacionEvento.associate = (models) => {
    VotacionEvento.hasMany(models.VotacionVotante, { foreignKey: 'evento_id', as: 'votantes' });
    VotacionEvento.hasMany(models.VotacionCandidato, { foreignKey: 'evento_id', as: 'candidatos' });
    VotacionEvento.hasMany(models.VotacionVoto, { foreignKey: 'evento_id', as: 'votos' });
  };

  return VotacionEvento;
};
