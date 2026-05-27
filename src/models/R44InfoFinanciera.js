module.exports = (sequelize, DataTypes) => {
  const R44InfoFinanciera = sequelize.define('R44InfoFinanciera', {
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    proveedor_id: { type: DataTypes.INTEGER, allowNull: false },
    anio_gravable:               DataTypes.INTEGER,
    mes_corte:                   DataTypes.TINYINT,
    dia_corte:                   DataTypes.TINYINT,
    ingresos_brutos_trabajo:     DataTypes.BIGINT,
    ingresos_brutos_capital:     DataTypes.BIGINT,
    ingresos_brutos_no_laborales: DataTypes.BIGINT,
    total_ingresos_brutos:       DataTypes.BIGINT,
    ingresos_mensuales:          DataTypes.BIGINT,
    egresos_mensuales:           DataTypes.BIGINT,
    costos_deducciones:          DataTypes.BIGINT,
    utilidad_operacional:        DataTypes.BIGINT,
    otros_ingresos:              DataTypes.BIGINT,
    derivados:                   DataTypes.STRING(200),
    activo_corriente:            DataTypes.BIGINT,
    activo_no_corriente:         DataTypes.BIGINT,
    total_activos:               DataTypes.BIGINT,
    pasivo_corriente:            DataTypes.BIGINT,
    pasivo_no_corriente:         DataTypes.BIGINT,
    total_pasivos:               DataTypes.BIGINT,
    total_patrimonio:            DataTypes.BIGINT,
    renta_liquida_ordinaria:     DataTypes.BIGINT,
    renta_liquida_gravable:      DataTypes.BIGINT,
    impuesto_neto_renta:         DataTypes.BIGINT,
    total_impuesto_cargo:        DataTypes.BIGINT,
    total_saldo_favor:           DataTypes.BIGINT,
    fuente: {
      type: DataTypes.ENUM('renta', 'camara', 'manual', 'mixto'),
      defaultValue: 'renta',
    },
    numero_formulario:  DataTypes.STRING(30),
    fecha_presentacion: DataTypes.DATEONLY,
  }, {
    tableName: 'r44_info_financiera',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  R44InfoFinanciera.associate = (models) => {
    R44InfoFinanciera.belongsTo(models.R44Proveedor, { foreignKey: 'proveedor_id', as: 'proveedor' });
  };

  return R44InfoFinanciera;
};
