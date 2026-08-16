// ============================================
// r44Carpeta.js — Nombre de la carpeta del proveedor en Google Drive.
// Incluye el prefijo del tipo de vinculación para diferenciar en la
// estructura del Drive: "Actualización - Nombre (NIT)" / "Vinculación - ...".
// Se usa tanto al archivar los documentos como el formato R-44 en PDF,
// para que ambos caigan en la MISMA carpeta.
// ============================================

function prefijoTipo(tipo) {
  if (tipo === 'vinculacion') return 'Vinculación - ';
  if (tipo === 'actualizacion') return 'Actualización - ';
  return '';
}

function carpetaProveedor(p) {
  const esJuridica = p.tipo_persona === 'juridica';
  const nombre = esJuridica ? (p.pj_razon_social || p.pj_nombre_comercial) : p.pn_nombre_completo;
  const ident  = esJuridica ? p.pj_nit : p.pn_numero_documento;
  return `${prefijoTipo(p.tipo_vinculacion)}${nombre || ('Proveedor ' + p.id)}${ident ? ' (' + ident + ')' : ''}`
    .replace(/[\\/]/g, '-').trim();
}

module.exports = { carpetaProveedor, prefijoTipo };
