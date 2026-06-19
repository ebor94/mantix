// sv/models/Envio.js — sv_fideliz_envios (INMUTABLE)
// 1 fila por persona+evento+año. No se puede editar ni borrar desde el ORM.
module.exports = (sequelize, DataTypes) => {
  const Envio = sequelize.define('SvEnvio', {
    env_id:                { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    env_persona_id:        { type: DataTypes.INTEGER, allowNull: false },
    env_empresa_id:        { type: DataTypes.INTEGER, allowNull: false },
    env_fecha_especial_id: { type: DataTypes.INTEGER },                              // NULL si es derivada (madre/padre)
    env_evento_anio:       { type: DataTypes.SMALLINT, allowNull: false },
    env_evento_tipo:       { type: DataTypes.STRING(30), allowNull: false },
    env_agente_id:         { type: DataTypes.INTEGER, allowNull: false },
    env_fecha_envio:       { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    env_tipo_detalle:      { type: DataTypes.STRING(100) },
    env_direccion_entrega: { type: DataTypes.STRING(250) },
    env_estado:            { type: DataTypes.STRING(20), defaultValue: 'enviado' },  // enviado | confirmado | devuelto
    env_evidencia_url:     { type: DataTypes.STRING(255) },
    env_comentario:        { type: DataTypes.TEXT },
    env_costo:             { type: DataTypes.DECIMAL(15, 2) }   // migración 015: descuenta del presupuesto fideliz si está presente
  }, {
    tableName: 'sv_fideliz_envios',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'env_created_at',
    updatedAt: false
  });

  // Permitir update SOLO de estado/evidencia/comentario (confirmar/devolver/agregar foto).
  // Bloquear el resto y bloquear DELETE total.
  Envio.beforeUpdate((instance) => {
    const ALLOWED = ['env_estado', 'env_evidencia_url', 'env_comentario'];
    const changed = instance.changed() || [];
    const invalid = changed.filter(f => !ALLOWED.includes(f));
    if (invalid.length) {
      throw new Error(`Envío inmutable: solo se pueden actualizar ${ALLOWED.join(', ')}. Inválidos: ${invalid.join(', ')}`);
    }
  });
  Envio.beforeDestroy(() => {
    throw new Error('Los envíos son INMUTABLES: no pueden eliminarse.');
  });

  Envio.associate = (models) => {
    Envio.belongsTo(models.SvPersona,        { as: 'persona',        foreignKey: 'env_persona_id' });
    Envio.belongsTo(models.SvEmpresa,        { as: 'empresa',        foreignKey: 'env_empresa_id' });
    Envio.belongsTo(models.SvFechaEspecial,  { as: 'fechaEspecial',  foreignKey: 'env_fecha_especial_id' });
    Envio.belongsTo(models.SvUsuario,        { as: 'agente',         foreignKey: 'env_agente_id' });
  };
  return Envio;
};
