// generateHash.js
const bcrypt = require('bcryptjs');

async function generarHash() {
  const hash = await bcrypt.hash('Admin123!', 10);
  console.log('Hash generado:');
  console.log(hash);
  console.log('\nCopia este hash y úsalo en el SQL');
}

generarHash();