module.exports = (sequelize, DataTypes) => {
  const R44RepresentanteLegal = sequelize.define('R44RepresentanteLegal', {
    id:           { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    proveedor_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, unique: true },
    nombres_apellidos:  DataTypes.STRING(250),
    tipo_documento:     DataTypes.ENUM('CC','CE','PAS','NIT','TI'),
    numero_documento:   DataTypes.STRING(30),
    ciudad_expedicion:  DataTypes.STRING(100),
    fecha_expedicion:   DataTypes.DATEONLY,
    fecha_nacimiento:   DataTypes.DATEONLY,
    lugar_nacimiento:   DataTypes.STRING(100),
    cedula_numero_serie: DataTypes.STRING(30),
    correo:             DataTypes.STRING(150),
    telefono:           DataTypes.STRING(30),
    direccion_domicilio: DataTypes.STRING(250),
    municipio:          DataTypes.STRING(100),
    departamento:       DataTypes.STRING(100),
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
