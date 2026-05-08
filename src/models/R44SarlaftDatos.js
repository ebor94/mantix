module.exports = (sequelize, DataTypes) => {
  const R44SarlaftDatos = sequelize.define('R44SarlaftDatos', {
    id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    proveedor_id: { type: DataTypes.INTEGER, allowNull: false },
    tiene_sistema_control:       DataTypes.BOOLEAN,
    tiene_cod_conducta:          { type: DataTypes.BOOLEAN, defaultValue: false },
    tiene_manual_siplaft:        { type: DataTypes.BOOLEAN, defaultValue: false },
    tiene_manual_procedimientos: { type: DataTypes.BOOLEAN, defaultValue: false },
    tiene_manual_sarlaft:        { type: DataTypes.BOOLEAN, defaultValue: false },
    maneja_recursos_publicos:    DataTypes.BOOLEAN,
    es_pep:                      DataTypes.BOOLEAN,
    vinculo_familiar_pep:        DataTypes.BOOLEAN,
    pep_nombre:                  DataTypes.STRING(250),
    pep_identificacion:          DataTypes.STRING(30),
    pep_parentesco:              DataTypes.STRING(100),
    pep_tipo_identificacion:     DataTypes.STRING(30),
    opera_moneda_extranjera:     DataTypes.BOOLEAN,
    moneda_ext_cuales:           DataTypes.TEXT,
    posee_cuentas_ext:           DataTypes.BOOLEAN,
    cuenta_ext_banco:            DataTypes.STRING(150),
    cuenta_ext_moneda:           DataTypes.STRING(50),
    cuenta_ext_numero:           DataTypes.STRING(50),
    cuenta_ext_ciudad:           DataTypes.STRING(100),
    cuenta_ext_pais:             DataTypes.STRING(100),
    cuenta_ext_monto_mensual:    DataTypes.BIGINT,
    declaracion_origen_fondos:   DataTypes.TEXT,
    sancionado_laft:             DataTypes.BOOLEAN,
    sancion_detalles:            DataTypes.TEXT,
  }, {
    tableName: 'r44_sarlaft_datos',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  R44SarlaftDatos.associate = (models) => {
    R44SarlaftDatos.belongsTo(models.R44Proveedor, { foreignKey: 'proveedor_id', as: 'proveedor' });
  };

  return R44SarlaftDatos;
};
