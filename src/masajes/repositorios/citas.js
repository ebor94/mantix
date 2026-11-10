// src/masajes/repositorios/citas.js
// Citas activas = las que retienen franja (slot_key IS NOT NULL; ver ck_msj_citas_claves).

// Para el empleado ni siquiera se leen datos del beneficiario: no hay nada que filtrar después.
const SQL_ACTIVAS = `SELECT c.id, c.inicio, c.estado
  FROM msj_citas c WHERE c.inicio >= ? AND c.inicio < ? AND c.slot_key IS NOT NULL`;
const SQL_ACTIVAS_CON_BENEFICIARIO = `SELECT c.id, c.inicio, c.estado, c.beneficiario_id, b.nombre AS beneficiario_nombre
  FROM msj_citas c JOIN msj_beneficiarios b ON b.id = c.beneficiario_id
  WHERE c.inicio >= ? AND c.inicio < ? AND c.slot_key IS NOT NULL`;

async function activasEnRango(ejecutor, desde, hasta, { conBeneficiario }) {
  const [filas] = await ejecutor.execute(conBeneficiario ? SQL_ACTIVAS_CON_BENEFICIARIO : SQL_ACTIVAS, [desde, hasta]);
  return filas;
}

module.exports = { activasEnRango };
