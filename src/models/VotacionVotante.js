// ============================================
// src/models/VotacionVotante.js
// ============================================
module.exports = (sequelize, DataTypes) => {
  const VotacionVotante = sequelize.define('VotacionVotante', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    evento_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    cedula: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    nombre: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    telefono: {
      type: DataTypes.STRING(15),
      allowNull: false,
    },
    sede_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    ya_voto: {
      type: DataTypes.TINYINT(1),
      defaultValue: 0,
    },
    fecha_voto: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    token_otp: {
      type: DataTypes.STRING(5),
      allowNull: true,
      defaultValue: null,
    },
    token_expira: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    ip_voto: {
      type: DataTypes.STRING(45),
      allowNull: true,
      defaultValue: null,
    },
  }, {
    tableName: 'votacion_votantes',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  VotacionVotante.associate = (models) => {
    VotacionVotante.belongsTo(models.VotacionEvento, { foreignKey: 'evento_id', as: 'evento' });
    VotacionVotante.belongsTo(models.Sede, { foreignKey: 'sede_id', as: 'sede' });
    VotacionVotante.hasOne(models.VotacionVoto, { foreignKey: 'votante_id', as: 'voto' });
  };

  return VotacionVotante;
};
