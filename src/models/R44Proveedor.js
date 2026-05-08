module.exports = (sequelize, DataTypes) => {
  const R44Proveedor = sequelize.define('R44Proveedor', {
    id:       { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    radicado: { type: DataTypes.STRING(20), unique: true }, // generado por trigger MySQL
    usuario_id: { type: DataTypes.INTEGER },
    tipo_persona: { type: DataTypes.ENUM('juridica','natural'), defaultValue: 'juridica' },
    estado: {
      type: DataTypes.ENUM('borrador','documentos_cargados','extraccion_completada','en_revision','aprobado','rechazado'),
      defaultValue: 'borrador',
    },
    // Persona Jurídica
    pj_nit:                 DataTypes.STRING(20),
    pj_razon_social:        DataTypes.STRING(200),
    pj_nombre_comercial:    DataTypes.STRING(200),
    pj_tipo_empresa:        DataTypes.ENUM('Privada','Pública','Mixta','Solidaria','Otra'),
    pj_direccion:           DataTypes.STRING(300),
    pj_ciudad:              DataTypes.STRING(100),
    pj_departamento:        DataTypes.STRING(100),
    pj_telefono:            DataTypes.STRING(50),
    pj_correo:              DataTypes.STRING(150),
    pj_pagina_web:          DataTypes.STRING(200),
    pj_ciiu:                DataTypes.STRING(10),
    pj_matricula_mercantil: DataTypes.STRING(50),
    pj_persona_contacto:    DataTypes.STRING(150),
    pj_telefono_contacto:   DataTypes.STRING(50),
    pj_productos_servicios: DataTypes.TEXT,
    pj_empleados_total:     DataTypes.INTEGER,
    pj_sistema_gestion:     DataTypes.STRING(200),
    // Persona Natural
    pn_cedula:              DataTypes.STRING(20),
    pn_nombre_completo:     DataTypes.STRING(200),
    pn_direccion:           DataTypes.STRING(300),
    pn_ciudad:              DataTypes.STRING(100),
    pn_departamento:        DataTypes.STRING(100),
    pn_telefono:            DataTypes.STRING(50),
    pn_correo:              DataTypes.STRING(150),
    pn_ciiu:                DataTypes.STRING(10),
    pn_persona_contacto:    DataTypes.STRING(150),
    pn_telefono_contacto:   DataTypes.STRING(50),
    pn_productos_servicios: DataTypes.TEXT,
  }, {
    tableName: 'r44_proveedores',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  R44Proveedor.associate = (models) => {
    R44Proveedor.belongsTo(models.R44Usuario,            { foreignKey: 'usuario_id',  as: 'usuario' });
    R44Proveedor.hasOne(models.R44RepresentanteLegal,    { foreignKey: 'proveedor_id', as: 'representante_legal' });
    R44Proveedor.hasMany(models.R44Accionista,           { foreignKey: 'proveedor_id', as: 'accionistas' });
    R44Proveedor.hasOne(models.R44InfoFinanciera,        { foreignKey: 'proveedor_id', as: 'financiero' });
    R44Proveedor.hasMany(models.R44RefBancaria,          { foreignKey: 'proveedor_id', as: 'referencias_bancarias' });
    R44Proveedor.hasMany(models.R44RefComercial,         { foreignKey: 'proveedor_id', as: 'referencias_comerciales' });
    R44Proveedor.hasOne(models.R44SarlaftDatos,          { foreignKey: 'proveedor_id', as: 'sarlaft' });
    R44Proveedor.hasMany(models.R44Documento,            { foreignKey: 'proveedor_id', as: 'documentos' });
    R44Proveedor.hasMany(models.R44ExtraccionLlm,        { foreignKey: 'proveedor_id', as: 'extracciones' });
    R44Proveedor.hasOne(models.R44Firma,                 { foreignKey: 'proveedor_id', as: 'firma' });
    R44Proveedor.hasMany(models.R44Revision,             { foreignKey: 'proveedor_id', as: 'revisiones' });
  };

  return R44Proveedor;
};
