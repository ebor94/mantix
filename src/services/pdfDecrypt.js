// ============================================
// pdfDecrypt.js — Quita la protección de un PDF antes de la extracción con IA.
// La API de Anthropic rechaza los PDF encriptados ("The PDF specified is
// password protected"). Muchos documentos (RUT/DIAN, bancos) traen encriptado
// solo de PERMISOS (sin contraseña de usuario), que qpdf puede quitar sin
// contraseña. Si tiene contraseña de usuario, no se puede: se deja el original.
// Es best-effort: cualquier fallo (qpdf ausente, archivo no PDF, etc.) deja el
// archivo intacto y nunca rompe la subida.
// ============================================
const { execFile } = require('child_process');
const fs = require('fs');

// qpdf: exit 0 = ok, 3 = ok con advertencias (igual produce salida válida).
function quitarProteccionPdf(ruta) {
  return new Promise((resolve) => {
    if (!ruta || !/\.pdf$/i.test(ruta) || !fs.existsSync(ruta)) {
      return resolve({ ok: false, motivo: 'no_pdf' });
    }
    const tmp = `${ruta}.dec`;
    execFile('qpdf', ['--decrypt', ruta, tmp], (err) => {
      if (err && err.code === 'ENOENT') {
        console.error('[pdfDecrypt] qpdf no está instalado en el servidor; no se pudo quitar la protección.');
        return resolve({ ok: false, motivo: 'qpdf_no_instalado' });
      }
      const code = err && typeof err.code === 'number' ? err.code : 0;
      const salidaOk = (!err || code === 3) && fs.existsSync(tmp) && fs.statSync(tmp).size > 0;
      if (salidaOk) {
        try {
          fs.renameSync(tmp, ruta);     // reemplaza el original por el descifrado
          return resolve({ ok: true });
        } catch (e) {
          try { fs.unlinkSync(tmp); } catch { /* noop */ }
          return resolve({ ok: false, motivo: e.message });
        }
      }
      // No se pudo (p. ej. contraseña de usuario): limpiar y conservar original.
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* noop */ }
      resolve({ ok: false, motivo: (err && (err.stderr || err.message)) || 'desconocido' });
    });
  });
}

module.exports = { quitarProteccionPdf };
