// Regla de negocio de los grupos INDIV II: un beneficiario de ley con
// parentesco PADRE o MADRE debe tener entre 75 y 80 años (inclusive).
const AppError = require('../utils/AppError');

const GRUPOS_INDIV_II = ['UNIFAMILIAR_INDIV_II', 'BASICO_INDIV_II'];
const PADRE_MADRE = ['PADRE', 'MADRE'];

function validarGrupoIndivII(grupo, beneficiarios = []) {
  if (!GRUPOS_INDIV_II.includes(grupo)) return;
  for (const b of beneficiarios) {
    if (b && b.tipoBeneficiario === 'DE_LEY' && PADRE_MADRE.includes(b.parentesco)) {
      const edad = Number(b.edad);
      if (!Number.isFinite(edad) || edad < 75 || edad > 80) {
        throw new AppError('La edad del padre o madre no aplica en este plan (debe estar entre 75 y 80 años).', 400);
      }
    }
  }
}

module.exports = { validarGrupoIndivII, GRUPOS_INDIV_II };
