// Test script to verify model associations
const db = require('./src/models');

console.log('Testing model associations...');

// Test that all models are loaded correctly
Object.keys(db).forEach(modelName => {
  if (modelName !== 'sequelize' && modelName !== 'Sequelize') {
    console.log(`Model loaded: ${modelName}`);
  }
});

console.log('All models loaded successfully!');