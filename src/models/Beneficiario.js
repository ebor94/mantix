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
    },
    activo: {
      type: DataTypes.TINYINT(1),
      allowNull: false,
      defaultValue: 1,
      comment: '0 = inactivado por aprobador; 1 = activo'
    },
    motivoRechazo: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Motivo de inactivación dado por el aprobador'
    },

    // ── Documento adjunto del beneficiario (opcional) ──────────
    documentoUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'Nombre del archivo de documento adjunto del beneficiario'
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
      },
      {
        fields: ['activo']
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