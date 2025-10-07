// MantenimientoProgramado model
class MantenimientoProgramado {
  constructor(data) {
    this.id = data.id;
    this.equipoId = data.equipoId;
    this.fechaProgramada = data.fechaProgramada;
    this.tipo = data.tipo;
    this.descripcion = data.descripcion;
    // Additional properties will be defined here
  }

  // Model methods will be implemented here
}

module.exports = MantenimientoProgramado;