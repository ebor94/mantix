module.exports = (sequelize, DataTypes) => {
  const Afiliado = sequelize.define('Afiliado', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    tipoDocumento: {
      type: DataTypes.ENUM('CC', 'TI', 'CE', 'PA', 'NIT'),
      allowNull: false
    },
    numeroDocumento: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true
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
    sexo: {
      type: DataTypes.ENUM('F', 'M', 'X'),
      allowNull: false
    },
    estadoCivil: {
      type: DataTypes.ENUM('SOLTERO', 'CASADO', 'UNION_LIBRE', 'DIVORCIADO', 'VIUDO', 'SEPARADO'),
      allowNull: false
    },
    celular: {
      type: DataTypes.STRING(15),
      allowNull: false
    },
    email: {
      type: DataTypes.STRING(120),
      allowNull: true,
      validate: {
        isEmail: true
      }
    },
    direccion: {
      type: DataTypes.STRING(200),
      allowNull: true
    },
    canal: {
      type: DataTypes.ENUM('BANCARIO', 'LIBRANZA', 'CAJA', 'PSE', 'TRANSFERENCIA', 'OTRO'),
      allowNull: false
    },
    producto: {
      type: DataTypes.ENUM('INTEGRAL', 'BASICO', 'OTRO'),
      allowNull: false
    },
    grupo: {
      type: DataTypes.ENUM('BASICO', 'PLUS', 'PREMIUM', 'OTRO'),
      allowNull: false
    }
  }, {
    tableName: 'afiliados',
    timestamps: true
  });

  Afiliado.associate = function(models) {
    Afiliado.hasMany(models.Beneficiario, {
      as: 'beneficiarios',
      foreignKey: 'afiliadoId',
      onDelete: 'CASCADE'
    });
  };

  return Afiliado;
};