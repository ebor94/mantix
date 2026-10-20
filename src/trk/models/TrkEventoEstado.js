// trk_evento_estado — fila única id = 1
module.exports = (sequelize, DataTypes) => {
  const TrkEventoEstado = sequelize.define('TrkEventoEstado', {
    id:                          { type: DataTypes.TINYINT.UNSIGNED, primaryKey: true },
    participante_en_pasarela_id: { type: DataTypes.UUID, allowNull: true },
    modo_pantalla:               { type: DataTypes.ENUM('PASARELA', 'RANKING'), allowNull: false, defaultValue: 'PASARELA' },
    categoria_pantalla_id:       { type: DataTypes.INTEGER, allowNull: true },
    updated_at:                  { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'trk_evento_estado',
    freezeTableName: true,
    timestamps: true,
    createdAt: false,
    updatedAt: 'updated_at'
  });

  TrkEventoEstado.associate = (models) => {
    TrkEventoEstado.belongsTo(models.TrkParticipante, { foreignKey: 'participante_en_pasarela_id', as: 'enPasarela' });
    TrkEventoEstado.belongsTo(models.TrkCategoria, { foreignKey: 'categoria_pantalla_id', as: 'categoriaPantalla' });
  };
  return TrkEventoEstado;
};
