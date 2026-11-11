// Propuesta de vinculación masiva beneficiario ↔ usuario del AD por nombre (sin correo corporativo en el listado).
// Función pura: no lee el AD ni la BD. "Segura" solo si no hay ambigüedad en ningún sentido:
//  - las palabras del nombre más corto están TODAS en el más largo, y son al menos dos
//    ("William Leal" ⊂ "William Antonio Leal Castañeda");
//  - el beneficiario tiene exactamente un candidato y ese usuario del AD no es candidato de nadie más;
//  - el usuario del AD no está vinculado ya a otro beneficiario.
// Lo demás queda como "revisar" (con sus candidatos) o "sin coincidencia", para hacerlo a mano.
const { claveNombre, PARTICULAS } = require('./listadoXlsx');

const palabras = (s) => [...new Set(claveNombre(s || '').split(' ').filter((w) => w.length >= 2 && !PARTICULAS.has(w)))];

function coincide(a, b) {
  const [corto, largo] = a.length <= b.length ? [a, new Set(b)] : [b, new Set(a)];
  return corto.length >= 2 && corto.every((w) => largo.has(w));
}
function parecido(a, b) {
  const sb = new Set(b);
  return a.filter((w) => sb.has(w)).length >= 2;
}

/**
 * @param beneficiarios [{ id, nombre }] activos y sin vincular
 * @param usuariosAd    [{ usuario, nombre, cn }] usuarios activos del dominio
 * @param vinculados    usuarios del AD ya vinculados a algún beneficiario (cualquier mayúscula)
 */
function proponerVinculos(beneficiarios, usuariosAd, vinculados = []) {
  const tomados = new Set(vinculados.map((u) => String(u).toLowerCase()));
  const ad = usuariosAd
    .map((u) => ({ usuario: String(u.usuario).toLowerCase(), nombre: u.nombre || u.cn || '', p: palabras(u.nombre || u.cn) }))
    .filter((u) => u.usuario && !tomados.has(u.usuario) && u.p.length > 0);

  const porBeneficiario = beneficiarios.map((b) => {
    const p = palabras(b.nombre);
    return { b, candidatos: ad.filter((u) => coincide(p, u.p)), parecidos: ad.filter((u) => !coincide(p, u.p) && parecido(p, u.p)) };
  });
  const vecesCandidato = new Map();
  for (const x of porBeneficiario) for (const u of x.candidatos) vecesCandidato.set(u.usuario, (vecesCandidato.get(u.usuario) || 0) + 1);

  const seguros = []; const revisar = []; const sinCoincidencia = [];
  for (const { b, candidatos, parecidos } of porBeneficiario) {
    const vista = (u) => ({ usuario: u.usuario, nombreAd: u.nombre });
    if (candidatos.length === 1 && vecesCandidato.get(candidatos[0].usuario) === 1) {
      seguros.push({ id: b.id, nombre: b.nombre, ...vista(candidatos[0]) });
    } else if (candidatos.length || parecidos.length) {
      revisar.push({ id: b.id, nombre: b.nombre, candidatos: [...candidatos, ...parecidos].slice(0, 5).map(vista) });
    } else {
      sinCoincidencia.push({ id: b.id, nombre: b.nombre });
    }
  }
  return { seguros, revisar, sinCoincidencia };
}

module.exports = { proponerVinculos };
