module.exports = (sequelize, DataTypes) => {
  const EmpresaNomina = sequelize.define('EmpresaNomina', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    empresaId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'empresa_id', references: { model: 'empresas', key: 'id' } },
    numeroDocumento: { type: DataTypes.STRING(20), allowNull: false, field: 'numero_documento' },
    primerNombre: { type: DataTypes.STRING(80), allowNull: true, field: 'primer_nombre' },
    segundoNombre: { type: DataTypes.STRING(80), allowNull: true, field: 'segundo_nombre' },
    primerApellido: { type: DataTypes.STRING(80), allowNull: true, field: 'primer_apellido' },
    segundoApellido: { type: DataTypes.STRING(80), allowNull: true, field: 'segundo_apellido' },
    estadoCivil: { type: DataTypes.ENUM('SOLTERO','CASADO','UNION_LIBRE','DIVORCIADO','VIUDO','SEPARADO'), allowNull: true, field: 'estado_civil' },
    fechaNacimiento: { type: DataTypes.DATEONLY, allowNull: true, field: 'fecha_nacimiento' },
    direccion: { type: DataTypes.STRING(255), allowNull: true },
    celular: { type: DataTypes.STRING(20), allowNull: true },
    email: { type: DataTypes.STRING(150), allowNull: true },
    planTipo: { type: DataTypes.ENUM('UNIPERSONAL','BASICO','UNIFAMILIAR'), allowNull: true, field: 'plan_tipo' },
    activo: { type: DataTypes.TINYINT(1), allowNull: false, defaultValue: 1 }
  }, {
    tableName: 'empresa_nomina',
    timestamps: true,
    indexes: [{ unique: true, fields: ['empresa_id', 'numero_documento'] }]
  });
  return EmpresaNomina;
};
