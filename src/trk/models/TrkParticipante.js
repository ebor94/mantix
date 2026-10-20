// trk_participantes
module.exports = (sequelize, DataTypes) => {
  const TrkParticipante = sequelize.define('TrkParticipante', {
    id:                       { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    categoria_id:             { type: DataTypes.INTEGER, allowNull: false },
    categoria_propuesta_id:   { type: DataTypes.INTEGER, allowNull: true },
    responsable_nombre:       { type: DataTypes.STRING(150), allowNull: false },
    responsable_documento:    { type: DataTypes.STRING(20), allowNull: true },
    responsable_telefono:     { type: DataTypes.STRING(20), allowNull: true },
    responsable_correo:       { type: DataTypes.STRING(150), allowNull: true },
    mascota_nombre:           { type: DataTypes.STRING(100), allowNull: false },
    mascota_nombre_norm:      { type: DataTypes.STRING(100), allowNull: false },
    especie:                  { type: DataTypes.ENUM('PERRO', 'GATO'), allowNull: true },
    raza:                     { type: DataTypes.STRING(100), allowNull: true },
    edad_texto:               { type: DataTypes.STRING(50), allowNull: true },
    sexo:                     { type: DataTypes.ENUM('MACHO', 'HEMBRA'), allowNull: true },
    disfraz_nombre:           { type: DataTypes.STRING(150), allowNull: true },
    foto_inscripcion_url:     { type: DataTypes.STRING(500), allowNull: true },
    foto_oficial_path:        { type: DataTypes.STRING(255), allowNull: true },
    foto_oficial_at:          { type: DataTypes.DATE, allowNull: true },
    estado:                   { type: DataTypes.ENUM('INSCRITO', 'PRESENTE', 'EN_PASARELA', 'PRESENTADO', 'AUSENTE'), allowNull: false, defaultValue: 'INSCRITO' },
    orden_pasarela:           { type: DataTypes.INTEGER, allowNull: true },
    llegada_at:               { type: DataTypes.DATE, allowNull: true },
    desempate_manual:         { type: DataTypes.INTEGER, allowNull: true },
    autoriza_datos:           { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    autoriza_reglamento:      { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    fecha_inscripcion:        { type: DataTypes.DATEONLY, allowNull: true },
    notas_importacion:        { type: DataTypes.TEXT, allowNull: true },
    advertencias_importacion: { type: DataTypes.JSON, allowNull: true },
    fusionado_en_id:          { type: DataTypes.UUID, allowNull: true },
    origen:                   { type: DataTypes.ENUM('IMPORTACION', 'CABINA'), allowNull: false },
    created_at:               { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at:               { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'trk_participantes',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  TrkParticipante.associate = (models) => {
    TrkParticipante.belongsTo(models.TrkCategoria, { foreignKey: 'categoria_id', as: 'categoria' });
    TrkParticipante.belongsTo(models.TrkCategoria, { foreignKey: 'categoria_propuesta_id', as: 'categoriaPropuesta' });
    TrkParticipante.hasMany(models.TrkCalificacion, { foreignKey: 'participante_id', as: 'calificaciones' });
  };
  return TrkParticipante;
};
