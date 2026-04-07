// Validation functions
const validators = {
  // Validate user data
  validateUser: (userData) => {
    const errors = [];
    
    if (!userData.nombre) errors.push('Nombre is required');
    if (!userData.email) errors.push('Email is required');
    if (!userData.password) errors.push('Password is required');
    
    return {
      isValid: errors.length === 0,
      errors
    };
  },

  // Validate equipment data
  validateEquipment: (equipmentData) => {
    const errors = [];
    
    if (!equipmentData.nombre) errors.push('Nombre is required');
    if (!equipmentData.sedeId) errors.push('Sede ID is required');
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
};

module.exports = validators;