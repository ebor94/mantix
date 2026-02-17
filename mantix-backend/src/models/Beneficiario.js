module.exports = (sequelize, DataTypes) => {
  const Beneficiario = sequelize.define('Beneficiario', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    afiliadoId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      references: {
        model: 'afiliados',
        key: 'id'
      }
    },
    tipoBeneficiario: {
      type: DataTypes.ENUM('DE_LEY', 'ADICIONAL'),
      allowNull: false
    },
    parentesco: {
      type: DataTypes.ENUM('CONYUGE', 'HIJO(A)', 'PADRE', 'MADRE', 'HERMANO(A)', 'ABUELO(A)', 'OTRO'),
      allowNull: false
    },
    tipoDocumento: {
      type: DataTypes.ENUM('CC', 'TI', 'CE', 'PA', 'NIT', 'PPT', 'ADT'),
      allowNull: false
    },
    numeroDocumento: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    primerApellido: {
      type: DataTypes.STRING(80),
      allowNull: false
    },
    segundoApellido: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    primerNombre: {
      type: DataTypes.STRING(80),
      allowNull: false
    },
    segundoNombre: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    fechaNacimiento: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    edad: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false
    },
    estado: {
      type: DataTypes.ENUM('ACTUALIZACION', 'RETIRO', 'INGRESO'),
      allowNull: false
    }
  }, {
    tableName: 'beneficiarios',
    timestamps: true,
    indexes: [
      {
        fields: ['afiliadoId']
      },
      {
        fields: ['numeroDocumento']
      }
    ]
  });

  Beneficiario.associate = function(models) {
    Beneficiario.belongsTo(models.Afiliado, {
      as: 'afiliado',
      foreignKey: 'afiliadoId'
    });
  };

  return Beneficiario;
};