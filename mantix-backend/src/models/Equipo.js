// Equipo model
class Equipo {
  constructor(data) {
    this.id = data.id;
    this.nombre = data.nombre;
    this.descripcion = data.descripcion;
    this.sedeId = data.sedeId;
    // Additional properties will be defined here
  }

  // Model methods will be implemented here
}

module.exports = Equipo;