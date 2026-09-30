// src/models/EmpresarialParametro.js — Parámetros globales del canal empresarial, por año
module.exports = (sequelize, DataTypes) => {
  const EmpresarialParametro = sequelize.define('EmpresarialParametro', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    anio: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      unique: true
    },
    valorAdicionalMenor50: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'valor_adicional_menor50'
    },
    valorAdicionalMayor50: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'valor_adicional_mayor50'
    },
    valorAsistencia: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'valor_asistencia'
    },
    preciosEstandar: {
      type: DataTypes.JSON,
      allowNull: false,
      field: 'precios_estandar',
      comment: '{ "R7": {"UNIPERSONAL":n,"BASICO":n,"UNIFAMILIAR":n}, "R15": {...} }'
    },
    activo: {
      type: DataTypes.TINYINT(1),
      allowNull: false,
      defaultValue: 0
    }
  }, {
    tableName: 'empresarial_parametros',
    timestamps: true
  });

  return EmpresarialParametro;
};
