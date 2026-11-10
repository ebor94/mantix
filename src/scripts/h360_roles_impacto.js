// node src/scripts/h360_roles_impacto.js
// Diagnóstico de SOLO LECTURA antes de desplegar la corrección de roles de H360 (comparación exacta de grupos).
// Lista quiénes tenían un rol solo porque el nombre de algún grupo suyo CONTENÍA el del grupo configurado.
// Esas personas pierden ese rol al desplegar: agregarlas al grupo correcto ANTES, si deben conservarlo.
require('dotenv').config();
const { diagnosticarRolesPorSubcadena } = require('../h360/services/ldap.service');

(async () => {
  const r = await diagnosticarRolesPorSubcadena();
  if (!r.length) {
    console.log('Sin cambios: nadie tenía un rol de H360 solo por coincidencia parcial del nombre del grupo.');
    return;
  }
  console.log('Perderían el rol al desplegar (estaban en un grupo PARECIDO, no en el configurado):\n');
  for (const x of r) {
    console.log(`- Rol "${x.rol}" (grupo configurado: ${x.grupo})`);
    console.log(`  vía ${x.grupoParecido}`);
    console.log(`  usuarios: ${x.usuarios.join(', ')}\n`);
  }
  console.log('Nota: el respaldo de administradores del dominio solo aplica a quien no tiene otro rol de H360.');
})().catch((e) => {
  console.error('h360_roles_impacto falló:', e.code || e.name);
  process.exitCode = 1;
});
