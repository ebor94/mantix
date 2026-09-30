// src/models/EmpresaPlan.js — Plan negociado por empresa (canal empresarial)
module.exports = (sequelize, DataTypes) => {
  const EmpresaPlan = sequelize.define('EmpresaPlan', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    empresaId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'empresa_id',
      references: { model: 'empresas', key: 'id' }
    },
    planTipo: {
      type: DataTypes.ENUM('UNIPERSONAL', 'BASICO', 'UNIFAMILIAR'),
      allowNull: false,
      field: 'plan_tipo'
    },
    valorMensual: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'valor_mensual'
    },
    reglas: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: 'Reglas de beneficiarios (formato convenioRules.js). Default = plantilla del tipo, editable.'
    },
    activo: {
      type: DataTypes.TINYINT(1),
      allowNull: false,
      defaultValue: 1
    }
  }, {
    tableName: 'empresa_planes',
    timestamps: true,
    indexes: [{ unique: true, fields: ['empresa_id', 'plan_tipo'] }]
  });

  EmpresaPlan.associate = function (models) {
    EmpresaPlan.belongsTo(models.Empresa, { as: 'empresa', foreignKey: 'empresaId' });
  };

  return EmpresaPlan;
};
