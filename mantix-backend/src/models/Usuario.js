// Usuario model
class Usuario {
  constructor(data) {
    this.id = data.id;
    this.nombre = data.nombre;
    this.email = data.email;
    this.password = data.password;
    // Additional properties will be defined here
  }

  // Model methods will be implemented here
}

module.exports = Usuario;