// ============================================
// src/models/Beneficiario.js - Modelo de Beneficiarios
// ============================================

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
      type: DataTypes.ENUM(
        'ABUELASTRO (A)', 'ABUELO (A)', 'AHIJADO (A)', 'ASEGURADO PRINCIPAL',
        'BISABUELO (A)', 'BISNIETO (A)', 'COMPAÑERO (A)', 'CONYUGE',
        'CUÑADO (A)', 'EX-ESPOSO (A)', 'HERMANASTRO (A)', 'HERMANO (A)',
        'HERMANO CON INCAPACIDAD', 'HIJASTRO (A)', 'HIJO (A)', 'HIJO ADOPTIVO',
        'HIJO CON INCAPACIDAD', 'MADRASTRA', 'MADRE', 'MADRINA',
        'NIETO (A)', 'OTRO', 'PADRASTRO', 'PADRE', 'PADRINO',
        'PRIMO (A)', 'PROTEGIDO (A)', 'SERVICIO DOMESTICO (A)', 'SOBRINO (A)',
        'SUEGRASTRO', 'SUEGRO (A)', 'TIO (A)', 'YERNO/NUERA'
      ),
      allowNull: false
    },
    genero: {
      type: DataTypes.ENUM('M', 'F'),
      allowNull: true
    },
    valorPorPersona: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      defaultValue: 0.00
    },
    tipoDocumento: {
      type: DataTypes.ENUM('CC', 'TI', 'CE', 'PA', 'NIT', 'PPT', 'ADT', 'RC'),
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
      allowNull: false,
      defaultValue: 'INGRESO'
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
      },
      {
        fields: ['estado']
      }
    ]
  });

  Beneficiario.associate = function(models) {
    // Un beneficiario pertenece a un afiliado
    Beneficiario.belongsTo(models.Afiliado, {
      as: 'afiliado',
      foreignKey: 'afiliadoId'
    });
  };

  return Beneficiario;
};