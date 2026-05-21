// ============================================
// src/models/ReciboCaja.js
// Recibo de caja generado al reportar un pago inicial (excepto POSFECHADO)
// o al marcar como cobrado un pago POSFECHADO previo.
// 1:1 con Afiliado (unique afiliado_id).
// ============================================

module.exports = (sequelize, DataTypes) => {
  const ReciboCaja = sequelize.define('ReciboCaja', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true
    },
    afiliadoId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'afiliado_id',
      references: { model: 'afiliados', key: 'id' }
    },
    asesorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'asesor_id',
      comment: 'Snapshot del asesor que emitió el recibo'
    },
    prefijo: {
      type: DataTypes.STRING(10),
      allowNull: false,
      comment: 'Snapshot del prefijo del asesor al momento de emitir'
    },
    consecutivo: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false
    },
    numeroRecibo: {
      type: DataTypes.STRING(20),
      allowNull: false,
      field: 'numero_recibo',
      unique: true,
      comment: 'Formato: prefijo-NNNNNN (padStart 6)'
    },
    formaPago: {
      type: DataTypes.ENUM('EFECTIVO', 'TRANSFERENCIA', 'CORRESPONSAL', 'POSFECHADO_COBRADO'),
      allowNull: false,
      field: 'forma_pago'
    },
    valor: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false
    },
    banco: {
      type: DataTypes.STRING(200),
      allowNull: true
    },
    referencia: {
      type: DataTypes.STRING(200),
      allowNull: true
    },
    soporteUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'soporte_url'
    },
    estadoCuadre: {
      type: DataTypes.ENUM('PENDIENTE', 'APROBADO'),
      allowNull: false,
      field: 'estado_cuadre',
      defaultValue: 'PENDIENTE'
    },
    aprobadoPor: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'aprobado_por',
      comment: 'FK a usuarios — cajero que aprobó'
    },
    aprobadoAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'aprobado_at'
    },
    observacionCajero: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'observacion_cajero'
    },
    pdfUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'pdf_url'
    },
    whatsappEnviado: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      field: 'whatsapp_enviado',
      defaultValue: false
    },
    whatsappEnviadoAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'whatsapp_enviado_at'
    },
    fechaEmision: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'fecha_emision',
      comment: 'Fecha contable del recibo'
    }
  }, {
    tableName: 'recibos_caja',
    timestamps: true,
    indexes: [
      { fields: ['asesor_id', 'fecha_emision'] },
      { fields: ['estado_cuadre', 'fecha_emision'] },
      { unique: true, fields: ['prefijo', 'consecutivo'] },
      { unique: true, fields: ['afiliado_id'] }
    ]
  });

  ReciboCaja.associate = (models) => {
    ReciboCaja.belongsTo(models.Afiliado, {
      as: 'afiliado',
      foreignKey: 'afiliadoId'
    });
    ReciboCaja.belongsTo(models.Usuario, {
      as: 'asesor',
      foreignKey: 'asesorId'
    });
    ReciboCaja.belongsTo(models.Usuario, {
      as: 'aprobador',
      foreignKey: 'aprobadoPor'
    });
  };

  return ReciboCaja;
};
