module.exports = (sequelize, DataTypes) => {
  const R44SarlaftDatos = sequelize.define('R44SarlaftDatos', {
    id:                     { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    proveedor_id:           { type: DataTypes.INTEGER, allowNull: false },
    es_pep:                 DataTypes.BOOLEAN,
    familiar_pep:           DataTypes.BOOLEAN,
    descripcion_actividad:  DataTypes.TEXT,
    origen_fondos:          DataTypes.TEXT,
    maneja_efectivo:        DataTypes.BOOLEAN,
    operaciones_extranjero: DataTypes.BOOLEAN,
    paises_operacion:       DataTypes.STRING(300),
    en_listas_restrictivas: DataTypes.BOOLEAN,
    declaracion_veracidad:  { type: DataTypes.BOOLEAN, defaultValue: false },
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
