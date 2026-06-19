// sv/models/FidelizMovimiento.js — sv_crm_fideliz_movimientos
// Libro mayor del presupuesto de fidelización por empresa. Inmutable.
module.exports = (sequelize, DataTypes) => {
  const FidelizMovimiento = sequelize.define('SvFidelizMovimiento', {
    mov_id:          { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    mov_empresa_id:  { type: DataTypes.INTEGER, allowNull: false },
    mov_envio_id:    { type: DataTypes.BIGINT },
    mov_tipo:        { type: DataTypes.STRING(20), allowNull: false }, // ASIGNACION | AJUSTE | CONSUMO
    mov_monto:       { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    mov_descripcion: { type: DataTypes.STRING(250) },
    mov_usuario_id:  { type: DataTypes.INTEGER, allowNull: false }
  }, {
    tableName: 'sv_crm_fideliz_movimientos',
    freezeTableName: true,
    timestamps: true,
    createdAt: 'mov_fecha',
    updatedAt: false,
    hooks: {
      beforeUpdate: () => { throw new Error('SvFidelizMovimiento es inmutable'); },
      beforeDestroy: () => { throw new Error('SvFidelizMovimiento es inmutable'); }
    }
  });

  FidelizMovimiento.associate = (models) => {
    FidelizMovimiento.belongsTo(models.SvEmpresa, { as: 'empresa', foreignKey: 'mov_empresa_id' });
    FidelizMovimiento.belongsTo(models.SvUsuario, { as: 'usuario', foreignKey: 'mov_usuario_id' });
    if (models.SvEnvio) {
      FidelizMovimiento.belongsTo(models.SvEnvio, { as: 'envio', foreignKey: 'mov_envio_id' });
    }
  };

  return FidelizMovimiento;
};
