// SolicitudAdicional model
class SolicitudAdicional {
  constructor(data) {
    this.id = data.id;
    this.usuarioId = data.usuarioId;
    this.equipoId = data.equipoId;
    this.fechaSolicitud = data.fechaSolicitud;
    this.motivo = data.motivo;
    this.estado = data.estado;
    // Additional properties will be defined here
  }

  // Model methods will be implemented here
}

module.exports = SolicitudAdicional;