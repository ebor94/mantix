module.exports = (sequelize, DataTypes) => {
  const R44RepresentanteLegal = sequelize.define('R44RepresentanteLegal', {
    id:                  { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    proveedor_id:        { type: DataTypes.INTEGER, allowNull: false },
    nombre:              DataTypes.STRING(200),
    cedula:              DataTypes.STRING(20),
    cargo:               DataTypes.STRING(100),
    fecha_expedicion:    DataTypes.DATEONLY,
    ciudad_expedicion:   DataTypes.STRING(100),
    fecha_nacimiento:    DataTypes.DATEONLY,
    lugar_nacimiento:    DataTypes.STRING(100),
    cedula_numero_serie: DataTypes.STRING(50),
  }, {
    tableName: 'r44_datos_representante_legal',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  R44RepresentanteLegal.associate = (models) => {
    R44RepresentanteLegal.belongsTo(models.R44Proveedor, { foreignKey: 'proveedor_id', as: 'proveedor' });
  };

  return R44RepresentanteLegal;
};
