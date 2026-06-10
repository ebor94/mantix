module.exports = (sequelize, DataTypes) => {
  const R44Usuario = sequelize.define('R44Usuario', {
    id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nombre:        { type: DataTypes.STRING(150), allowNull: false },
    email:         { type: DataTypes.STRING(150), allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    rol:           { type: DataTypes.ENUM('proveedor','revisor_compras','revisor_excelencia','admin'), defaultValue: 'proveedor' },
    activo:        { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    tableName: 'r44_usuarios',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  R44Usuario.associate = (models) => {
    R44Usuario.hasMany(models.R44Proveedor, { foreignKey: 'usuario_id', as: 'proveedores' });
    // Nota: la tabla r44_revision_serfunorte desplegada no tiene la columna
    // revisor_id (sí está en migration.sql, pero no en el esquema en uso).
    // El revisor se registra por nombre en funcionario_verificacion, así que
    // esta asociación no se usa y, al añadir revisor_id como atributo, rompía
    // los SELECT que incluyen 'revision' (detalle, aprobación). Se elimina.
  };

  return R44Usuario;
};
