module.exports = (sequelize, DataTypes) => {
  const R44Proveedor = sequelize.define('R44Proveedor', {
    id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    radicado:   { type: DataTypes.STRING(20), unique: true },
    usuario_id: { type: DataTypes.INTEGER },
    tipo_vinculacion:        DataTypes.STRING(50),
    tipo_persona:            { type: DataTypes.ENUM('juridica','natural'), defaultValue: 'juridica' },
    estado: {
      type: DataTypes.ENUM('borrador','documentos_cargados','extraccion_completada','pendiente_revision','aprobado','rechazado','requiere_correccion'),
      defaultValue: 'borrador',
    },
    ciudad_diligenciamiento: DataTypes.STRING(100),
    funcionario_diligencia:  DataTypes.STRING(150),
    telefono_funcionario:    DataTypes.STRING(50),
    ip_registro:             DataTypes.STRING(50),

    // Persona Jurídica
    pj_razon_social:          DataTypes.STRING(200),
    pj_nombre_comercial:      DataTypes.STRING(200),
    pj_sigla:                 DataTypes.STRING(50),
    pj_nit:                   DataTypes.STRING(20),
    pj_dv:                    DataTypes.STRING(2),
    pj_tipo_empresa:          DataTypes.STRING(100),
    pj_tipo_empresa_otro:     DataTypes.STRING(100),
    pj_fecha_constitucion:    DataTypes.DATEONLY,
    pj_pais_constitucion:     DataTypes.STRING(100),
    pj_actividad_economica:   DataTypes.STRING(200),
    pj_ciiu_principal:        DataTypes.STRING(10),
    pj_ciiu_secundario:       DataTypes.STRING(10),
    pj_descripcion_actividad: DataTypes.TEXT,
    pj_direccion:             DataTypes.STRING(300),
    pj_municipio:             DataTypes.STRING(100),
    pj_departamento:          DataTypes.STRING(100),
    pj_telefono_fijo:         DataTypes.STRING(50),
    pj_celular:               DataTypes.STRING(50),
    pj_correo:                DataTypes.STRING(150),
    pj_persona_contacto:      DataTypes.STRING(150),
    pj_tel_contacto:          DataTypes.STRING(50),
    pj_matricula_numero:      DataTypes.STRING(50),
    pj_fecha_matricula:       DataTypes.DATEONLY,
    pj_ultimo_anio_renovado:  DataTypes.INTEGER,
    pj_grupo_niif:            DataTypes.STRING(50),
    pj_tamano_empresa:        DataTypes.STRING(50),

    // Persona Natural
    pn_nombre_completo:       DataTypes.STRING(200),
    pn_primer_apellido:       DataTypes.STRING(100),
    pn_segundo_apellido:      DataTypes.STRING(100),
    pn_primer_nombre:         DataTypes.STRING(100),
    pn_otros_nombres:         DataTypes.STRING(100),
    pn_tipo_documento:        DataTypes.STRING(20),
    pn_numero_documento:      DataTypes.STRING(20),
    pn_fecha_expedicion:      DataTypes.DATEONLY,
    pn_lugar_expedicion:      DataTypes.STRING(100),
    pn_fecha_nacimiento:      DataTypes.DATEONLY,
    pn_lugar_nacimiento:      DataTypes.STRING(100),
    pn_departamento:          DataTypes.STRING(100),
    pn_municipio:             DataTypes.STRING(100),
    pn_nacionalidad:          DataTypes.STRING(100),
    pn_direccion_domicilio:   DataTypes.STRING(300),
    pn_municipio_domicilio:   DataTypes.STRING(100),
    pn_dpto_domicilio:        DataTypes.STRING(100),
    pn_nombre_empresa:        DataTypes.STRING(200),
    pn_dir_empresa:           DataTypes.STRING(300),
    pn_municipio_empresa:     DataTypes.STRING(100),
    pn_dpto_empresa:          DataTypes.STRING(100),
    pn_telefono_domicilio:    DataTypes.STRING(50),
    pn_telefono_empresa:      DataTypes.STRING(50),
    pn_estrato:               DataTypes.INTEGER,
    pn_ocupacion:             DataTypes.STRING(150),
    pn_estado_civil:          DataTypes.STRING(50),
    pn_actividad_economica:   DataTypes.STRING(200),
    pn_ciiu:                  DataTypes.STRING(10),
    pn_correo:                DataTypes.STRING(150),

    // Compartidos
    productos_servicios:      DataTypes.TEXT,
    tiene_sistema_gestion:    DataTypes.BOOLEAN,
    cual_certificacion:       DataTypes.STRING(200),
    total_empleados:          DataTypes.INTEGER,
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
    R44Proveedor.hasOne(models.R44Revision,              { foreignKey: 'proveedor_id', as: 'revision' });
  };

  return R44Proveedor;
};
