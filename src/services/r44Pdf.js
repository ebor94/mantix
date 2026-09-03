// ============================================
// r44Pdf.js — Generador del Formato R-44 V09 en PDF (pdfkit)
//
// generarR44Pdf(proveedor) -> Promise<Buffer>
//   Recibe un proveedor cargado con TODAS sus asociaciones
//   (usar cargarProveedorCompleto) y produce el formato completo:
//   secciones I–XI, leyendas VII/VIII/IX (texto legal literal del
//   formato oficial), firma electrónica del proveedor y el espacio
//   exclusivo de verificación.
//
// No requiere dependencias de sistema: pdfkit ya está en package.json.
// ============================================
const PDFDocument = require('pdfkit');

// ── Paleta / geometría ─────────────────────────────────────
const VERDE = '#1a4a2e';
const BORDE = '#cfcfca';
const A4W = 595.28;
const A4H = 841.89;
const M   = 36;                 // margen
const CW  = A4W - M * 2;        // ancho de contenido (~523)

// ── Textos legales literales (Formato R-44 V09) ────────────
const LEG = {
  origenFondos:
    'Como Representante Legal, de manera voluntaria declaro que: 1. Mis recursos y los de la empresa que represento no provienen de ninguna actividad considerada ilícita de las contempladas en el código penal Colombiano o en cualquier norma que la modifique, ni efectuaré transacciones destinadas a tales actividades o en favor de personas relacionadas con ellas. 2. No admitiré que terceros efectúen depósitos a mis cuentas con fondos provenientes de actividades ilícitas. 3. La información que he suministrado es verdadera y autorizo su verificación sin limitación entre tanto esté vigente la sociedad, eximiendo a la empresa de toda responsabilidad que se derive por cualquier inexactitud o falsedad de la misma.',
  pep:
    'Se considerarán como Personas Expuestas Políticamente (PEP) los servidores públicos de cualquier sistema de nomenclatura y clasificación de empleos de la administración pública nacional y territorial, cuando tengan asignadas o delegadas funciones de: expedición de normas o regulaciones, dirección general, formulación de políticas institucionales y adopción de planes, programas y proyectos, manejo directo de bienes, dineros o valores del Estado, administración de justicia o facultades administrativo sancionatorias, y los particulares que tengan a su cargo la dirección o manejo de recursos en los movimientos o partidos políticos.',
  vii:
    'Obrando en nombre propio o en nombre y representación de la persona jurídica identificada en este formato, autorizo a SERFUNORTE el tratamiento de mis datos personales y los datos personales de los colaboradores de la empresa que represento, de quienes manifiesto tener la respectiva autorización conforme la ley, para que sean recolectados, almacenados, usados, consultados o cedidos a terceras personas, para las siguientes finalidades: 1) Vincularme como contraparte contractual y/o proveedor. 2) Efectuar las acciones pertinentes para el desarrollo y el cumplimiento de los contratos que celebre con SERFUNORTE. 3) Suministrar la información a terceros con los cuales SERFUNORTE tenga relación contractual y que sea necesario entregársela para el desarrollo y cumplimiento de los contratos que celebre con ella. 4) Mantener contacto con SERFUNORTE en el marco de la ejecución de los contratos que se celebre con ella. 5) Permitirme a mí o al personal a mi cargo cuando aplique, el acceso a sistemas de información de SERFUNORTE cuando así se requiera. 6) Expedir certificaciones de la prestación del servicio. 7) Controlar el cumplimiento de requisitos para acceder al Sistema General de Seguridad Social Integral. 8) Permitir la elaboración de informes, reportes y demás documentos que sean necesarios en cuanto a accidentes o incidentes relacionados con la salud y seguridad de mi trabajo o del personal a mi cargo. 9) Realizar gestiones establecidas en la legislación colombiana sobre lavado de activos y financiación del terrorismo. 10) Verificación de antecedentes judiciales, fiscales, disciplinarios y de policía, tanto propias como del personal a mi cargo. 11) Permitirme el acceso a las instalaciones de SERFUNORTE, así como del personal a mi cargo. 12) Preservar la seguridad de las instalaciones de SERFUNORTE. 13) Consulta, almacenamiento, administración, transferencia, procesamiento y reporte de información a las Centrales de Información o bases de datos debidamente constituidas referentes al comportamiento crediticio, financiero y comercial. 14) Las demás contenidas en la Política de Tratamiento de Datos Personales de SERFUNORTE, la cual declaro haber conocido y haber puesto en conocimiento del personal a mi cargo. He sido informado que, como titular de la información, tengo el derecho a conocer, actualizar y rectificar mis datos personales, solicitar prueba de la autorización otorgada para su tratamiento, ser informado sobre el uso que se ha dado a los mismos, presentar quejas ante la Superintendencia de Industria y Comercio por infracción a la ley, revocar la autorización y/o solicitar la supresión de mis datos en los casos en que sea procedente y acceder en forma gratuita a los mismos. También declaro haber sido informado que la Política de Tratamiento de Datos Personales está disponible para su consulta en la página web https://cucuta.losolivos.co/',
  viiiTitulo:
    'VIII. RESPONSABILIDAD EN EL TRATAMIENTO DE DATOS PERSONALES. La siguiente cláusula aplica sólo para proveedores que realizarán tratamiento de datos personales suministrados por Serfunorte Los Olivos (encargados del tratamiento de datos).',
  viii:
    'En los casos en que, obrando en nombre propio o en nombre y representación de la empresa que represento, o cualquier miembro que haga parte de mi personal, que en la ejecución de los contratos que celebre con SERFUNORTE accedan o puedan llegar a acceder a los datos personales contenidos en cualquiera de sus bases de datos susceptibles de tratamiento, deberá dar estricto cumplimiento a las obligaciones surgidas de la Ley 1581 de 2012 y sus decretos reglamentarios. De este modo, nos obligamos al secreto profesional respecto de los datos personales y a no revelar la información que reciba durante la ejecución y cumplimiento del objeto del contrato celebrado. Así mismo, nos abstendremos de obtener, compilar, sustraer, ofrecer, vender, intercambiar, enviar, comprar, interceptar, divulgar, modificar y/o emplear los mencionados datos para actividades o fines diferentes a los contratados. Igualmente, nos comprometemos a devolver o suprimir los datos personales suministrados, terminada la vigencia de las relaciones contractuales. Esta condición aplica aún después de la vigencia de la relación contractual y se obliga a mantenerla de manera confidencial protegiendo los datos personales para evitar su divulgación no autorizada.',
  ix:
    'PARÁGRAFO PRIMERO. En caso de que, como Contratista, no haya implementado las disposiciones establecidas en la ley colombiana de protección de datos personales, me obligo a adoptar las medidas establecidas por SERFUNORTE para garantizar la seguridad de los datos personales a los que daré tratamiento y evitar su alteración, pérdida y/o tratamiento no autorizado. PARÁGRAFO SEGUNDO. Como Contratista admitiré los controles y auditorías que, de forma razonable, pretenda realizar SERFUNORTE, a efectos del cumplimiento de lo aquí establecido en cuanto a la protección, controles y seguridad que he implementado para tratar los datos personales que me han sido encomendados. PARÁGRAFO TERCERO. De mi parte o cualquier miembro que haga parte de mi personal, nos obligamos a reportar o comunicar inmediatamente a SERFUNORTE cuando tenga conocimiento de pérdida, vulneración, modificación o cualquier otro tipo de incidente que ponga en peligro la seguridad, integridad o confidencialidad de los datos personales a los que les dé tratamiento en la ejecución de las actividades contratadas. PARÁGRAFO CUARTO. El incumplimiento de lo aquí dispuesto, así como lo que se derive de ello, será asumido por mí o por la persona jurídica que represento, pudiendo constituir causal de terminación unilateral del contrato por parte de SERFUNORTE. PARÁGRAFO QUINTO. Como Contratista declaro tener conocimiento de la Política de Tratamiento de Datos Personales de SERFUNORTE y haberla puesto en conocimiento del personal a mi cargo. Dicha política está disponible para su consulta en la página web https://cucuta.losolivos.co/',
  juramento:
    'Bajo la gravedad de juramento manifiesto que la información acá consignada, así como los anexos respectivos, es veraz y verificable; que como persona natural no estoy incluido, y que la persona jurídica que represento, sus representantes legales, su revisor fiscal, los miembros de la junta directiva, sus accionistas o socios, no estamos incluidos en ninguna de las listas establecidas a nivel local o internacional para el control de Lavado de Activos y Financiación del Terrorismo, para lo cual autorizo la verificación de esta situación ante cualquier persona natural o jurídica, privada o pública, desde ahora y por el tiempo que se mantenga alguna relación comercial con SERFUNORTE en mi calidad de TERCERO.',
  actualizacion:
    'Declaro que cumpliré con la obligación de actualizar los datos contenidos en este formato al menos una vez por año, cuando se produzca algún cambio en el mismo o cuando expresamente me lo solicite SERFUNORTE.',
};

// ── Formateadores ──────────────────────────────────────────
const fmt = (v) => {
  const s = v === 0 ? '0' : String(v ?? '').trim();
  return s === '' ? '—' : s;
};
const fdate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
};
const sino = (v) => {
  if (v === true || v === 1 || v === '1' || /^(si|sí|true)$/i.test(String(v))) return 'Sí';
  if (v === false || v === 0 || v === '0' || /^(no|false)$/i.test(String(v))) return 'No';
  return '—';
};
const money = (v) => {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return '$ ' + n.toLocaleString('es-CO');
};

// ── Utilidades de layout ───────────────────────────────────
const bottom = (doc) => doc.page.height - doc.page.margins.bottom;
function ensure(doc, need) { if (doc.y + need > bottom(doc)) doc.addPage(); }

function sectionBar(doc, txt) {
  ensure(doc, 26);
  const y = doc.y + 5;
  doc.save().rect(M, y, CW, 16).fill(VERDE).restore();
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9)
     .text(String(txt).toUpperCase(), M + 6, y + 4.5, { width: CW - 12, lineBreak: false });
  doc.fillColor('#000000').font('Helvetica').fontSize(8.5);
  doc.x = M; doc.y = y + 16 + 6;
}

function subTitle(doc, txt) {
  ensure(doc, 16);
  doc.fillColor(VERDE).font('Helvetica-Bold').fontSize(8.5)
     .text(txt, M, doc.y, { width: CW });
  doc.fillColor('#000000').font('Helvetica').fontSize(8.5);
  doc.x = M; doc.y += 2;
}

// Campos etiqueta/valor en dos columnas. items: [{ l, v, full }]
function fields(doc, items) {
  const gap = 14;
  const colW = (CW - gap) / 2;
  const labelH = 8.5;
  let i = 0;
  while (i < items.length) {
    const a = items[i];
    if (a.full) { renderField(doc, a.l, a.v, M, CW); i += 1; continue; }
    const b = (items[i + 1] && !items[i + 1].full) ? items[i + 1] : null;
    doc.font('Helvetica').fontSize(9);
    const va = fmt(a.v), vb = b ? fmt(b.v) : '';
    const ha = doc.heightOfString(va, { width: colW });
    const hb = b ? doc.heightOfString(vb, { width: colW }) : 0;
    const rowH = labelH + Math.max(ha, hb) + 6;
    ensure(doc, rowH);
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(6.6).fillColor('#777')
       .text(String(a.l).toUpperCase(), M, y, { width: colW, lineBreak: false });
    doc.font('Helvetica').fontSize(9).fillColor('#111')
       .text(va, M, y + labelH, { width: colW });
    if (b) {
      const x2 = M + colW + gap;
      doc.font('Helvetica-Bold').fontSize(6.6).fillColor('#777')
         .text(String(b.l).toUpperCase(), x2, y, { width: colW, lineBreak: false });
      doc.font('Helvetica').fontSize(9).fillColor('#111')
         .text(vb, x2, y + labelH, { width: colW });
    }
    doc.fillColor('#000'); doc.x = M; doc.y = y + rowH;
    i += b ? 2 : 1;
  }
}

function renderField(doc, l, v, x, w) {
  const vs = fmt(v);
  const labelH = 8.5;
  doc.font('Helvetica').fontSize(9);
  const h = doc.heightOfString(vs, { width: w });
  ensure(doc, labelH + h + 6);
  const y = doc.y;
  doc.font('Helvetica-Bold').fontSize(6.6).fillColor('#777')
     .text(String(l).toUpperCase(), x, y, { width: w, lineBreak: false });
  doc.font('Helvetica').fontSize(9).fillColor('#111')
     .text(vs, x, y + labelH, { width: w });
  doc.fillColor('#000'); doc.x = M; doc.y = y + labelH + h + 6;
}

// Párrafo de texto legal (fluye y pagina solo)
function paragraph(doc, txt, opts = {}) {
  ensure(doc, 26);
  doc.font(opts.font || 'Helvetica').fontSize(opts.size || 7.6).fillColor(opts.color || '#333')
     .text(txt, M, doc.y, { width: CW, align: opts.align || 'justify' });
  doc.fillColor('#000'); doc.x = M; doc.y += opts.gap ?? 5;
}

// Pregunta / respuesta (SARLAFT)
function qa(doc, q, a) {
  const ansW = 46;
  const qW = CW - ansW - 6;
  doc.font('Helvetica').fontSize(8);
  const h = doc.heightOfString(q, { width: qW });
  ensure(doc, h + 5);
  const y = doc.y;
  doc.fillColor('#222').text(q, M, y, { width: qW });
  doc.font('Helvetica-Bold').fontSize(8).fillColor(VERDE)
     .text(a, M + qW + 6, y, { width: ansW, align: 'right', lineBreak: false });
  doc.fillColor('#000'); doc.x = M; doc.y = y + h + 4;
}

// Tabla con encabezado verde. weights: pesos relativos por columna
function table(doc, headers, rows, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((x) => (x / total) * CW);
  const padX = 3, padY = 3;

  const drawRow = (cells, isHeader) => {
    doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(isHeader ? 6.8 : 7.4);
    let hMax = 0;
    cells.forEach((c, i) => {
      const h = doc.heightOfString(String(c ?? ''), { width: widths[i] - padX * 2 });
      if (h > hMax) hMax = h;
    });
    const rowH = Math.max(hMax + padY * 2, 14);
    ensure(doc, rowH);
    const y = doc.y;
    let x = M;
    cells.forEach((c, i) => {
      if (isHeader) doc.save().rect(x, y, widths[i], rowH).fill(VERDE).restore();
      else doc.save().lineWidth(0.5).rect(x, y, widths[i], rowH).stroke(BORDE).restore();
      doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(isHeader ? 6.8 : 7.4)
         .fillColor(isHeader ? '#ffffff' : '#111')
         .text(String(c ?? ''), x + padX, y + padY, { width: widths[i] - padX * 2 });
      x += widths[i];
    });
    doc.fillColor('#000'); doc.x = M; doc.y = y + rowH;
  };

  drawRow(headers, true);
  if (!rows.length) {
    ensure(doc, 14);
    doc.font('Helvetica-Oblique').fontSize(7.4).fillColor('#999')
       .text('Sin registros', M + padX, doc.y + 3, { width: CW });
    doc.fillColor('#000'); doc.x = M; doc.y += 15;
  } else {
    rows.forEach((r) => drawRow(r, false));
  }
  doc.y += 5;
}

// data:image/png;base64,... -> Buffer (pdfkit sólo soporta PNG/JPEG)
function firmaBuffer(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const idx = dataUrl.indexOf('base64,');
  const b64 = idx >= 0 ? dataUrl.slice(idx + 7) : dataUrl;
  try { return Buffer.from(b64, 'base64'); } catch { return null; }
}

// ── Generador principal ────────────────────────────────────
function generarR44Pdf(p) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: M, bottom: M + 16, left: M, right: M },
        bufferPages: true,
        info: {
          Title: `Formato R-44 · ${p.radicado || ''}`,
          Author: 'Serfunorte · Los Olivos Cúcuta',
          Subject: 'Formato de conocimiento y vinculación de terceros (R-44 V09)',
        },
      });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const esPN = p.tipo_persona !== 'juridica';
      const rl   = p.representante_legal || {};
      const fin  = p.financiero || {};
      const sar  = p.sarlaft || {};
      const firma = p.firma || {};
      const rev  = p.revision || {};
      const nombre = p.pj_razon_social || p.pn_nombre_completo || '—';
      const ident  = esPN
        ? `${p.pn_tipo_documento || 'CC'} ${fmt(p.pn_numero_documento)}`
        : `NIT ${fmt(p.pj_nit)}${p.pj_dv ? '-' + p.pj_dv : ''}`;

      // ── Encabezado ──
      doc.save().rect(0, 0, A4W, 54).fill(VERDE).restore();
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(15)
         .text('LOS OLIVOS CÚCUTA', M, 12, { width: CW, lineBreak: false });
      doc.font('Helvetica').fontSize(8).fillColor('#d9e5dd')
         .text('Serfunorte · Formato R-44 V09 — Conocimiento y vinculación de terceros', M, 32, { width: CW, lineBreak: false });
      doc.fillColor('#000000');
      doc.x = M; doc.y = 66;

      // Franja de identificación del proveedor
      doc.save().rect(M, doc.y, CW, 30).fill('#f2f5f2').restore();
      doc.fillColor('#111').font('Helvetica-Bold').fontSize(11)
         .text(nombre, M + 8, doc.y + 5, { width: CW - 160, lineBreak: false });
      doc.font('Helvetica').fontSize(8).fillColor('#444')
         .text(ident, M + 8, doc.y + 19, { width: CW - 160, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(VERDE)
         .text(`Radicado ${fmt(p.radicado)}`, M + CW - 150, doc.y + 6, { width: 142, align: 'right', lineBreak: false });
      doc.font('Helvetica').fontSize(7.5).fillColor('#555')
         .text(`Año ${fmt(p.anio_vinculacion)} · ${esPN ? 'Persona Natural' : 'Persona Jurídica'}`,
               M + CW - 150, doc.y + 19, { width: 142, align: 'right', lineBreak: false });
      doc.fillColor('#000'); doc.x = M; doc.y += 38;

      // ── I. DILIGENCIAMIENTO ──
      const tipoVincTxt = p.tipo_vinculacion === 'vinculacion' ? 'Vinculación'
        : p.tipo_vinculacion === 'actualizacion' ? 'Actualización' : fmt(p.tipo_vinculacion);
      sectionBar(doc, 'I. Datos de diligenciamiento');
      fields(doc, [
        { l: 'Tipo de vinculación', v: tipoVincTxt, full: true },
      ]);

      // ── II. IDENTIFICACIÓN ──
      if (esPN) {
        sectionBar(doc, 'II. Identificación — Persona Natural');
        fields(doc, [
          { l: 'Nombre completo', v: p.pn_nombre_completo, full: true },
          { l: 'Tipo de documento', v: p.pn_tipo_documento },
          { l: 'Número de documento', v: p.pn_numero_documento },
          { l: 'Fecha de expedición', v: fdate(p.pn_fecha_expedicion) },
          { l: 'Lugar de expedición', v: p.pn_lugar_expedicion },
          { l: 'Fecha de nacimiento', v: fdate(p.pn_fecha_nacimiento) },
          { l: 'Lugar de nacimiento', v: p.pn_lugar_nacimiento },
          { l: 'Departamento', v: p.pn_departamento },
          { l: 'Municipio', v: p.pn_municipio },
          { l: 'Nacionalidad', v: p.pn_nacionalidad },
          { l: 'Género', v: p.genero },
          { l: 'Estado civil', v: p.pn_estado_civil },
          { l: 'Estrato', v: p.pn_estrato },
          { l: 'Dirección de domicilio', v: p.pn_direccion_domicilio, full: true },
          { l: 'Municipio domicilio', v: p.pn_municipio_domicilio },
          { l: 'Departamento domicilio', v: p.pn_dpto_domicilio },
          { l: 'Teléfono domicilio', v: p.pn_telefono_domicilio },
          { l: 'Correo electrónico', v: p.pn_correo },
          { l: 'Nombre empresa / negocio', v: p.pn_nombre_empresa, full: true },
          { l: 'Dirección empresa', v: p.pn_dir_empresa, full: true },
          { l: 'Teléfono empresa', v: p.pn_telefono_empresa },
          { l: 'Ocupación', v: p.pn_ocupacion },
          { l: 'Actividad económica', v: p.pn_actividad_economica, full: true },
          { l: 'Código CIIU', v: p.pn_ciiu },
          { l: 'Código municipio (DANE)', v: p.municipio_codigo },
        ]);
      } else {
        sectionBar(doc, 'II. Identificación — Persona Jurídica');
        fields(doc, [
          { l: 'Razón social', v: p.pj_razon_social, full: true },
          { l: 'Nombre comercial', v: p.pj_nombre_comercial },
          { l: 'Sigla', v: p.pj_sigla },
          { l: 'NIT', v: p.pj_nit },
          { l: 'Dígito de verificación', v: p.pj_dv },
          { l: 'Tipo de empresa', v: p.pj_tipo_empresa || p.pj_tipo_empresa_otro },
          { l: 'Tamaño de empresa', v: p.pj_tamano_empresa },
          { l: 'Fecha de constitución', v: fdate(p.pj_fecha_constitucion) },
          { l: 'País de constitución', v: p.pj_pais_constitucion },
          { l: 'Matrícula mercantil No.', v: p.pj_matricula_numero },
          { l: 'Fecha de matrícula', v: fdate(p.pj_fecha_matricula) },
          { l: 'Último año renovado', v: p.pj_ultimo_anio_renovado },
          { l: 'Grupo NIIF', v: p.pj_grupo_niif },
          { l: 'Actividad económica', v: p.pj_actividad_economica || p.pj_descripcion_actividad, full: true },
          { l: 'CIIU principal', v: p.pj_ciiu_principal },
          { l: 'CIIU secundario', v: p.pj_ciiu_secundario },
          // La descripción larga solo se muestra aparte si existe además de la actividad corta
          ...(p.pj_actividad_economica && p.pj_descripcion_actividad
            ? [{ l: 'Descripción de la actividad', v: p.pj_descripcion_actividad, full: true }] : []),
          { l: 'Dirección', v: p.pj_direccion, full: true },
          { l: 'Municipio', v: p.pj_municipio },
          { l: 'Departamento', v: p.pj_departamento },
          { l: 'Teléfono fijo', v: p.pj_telefono_fijo },
          { l: 'Celular', v: p.pj_celular },
          { l: 'Correo electrónico', v: p.pj_correo },
          { l: 'Código municipio (DANE)', v: p.municipio_codigo },
          { l: 'Persona de contacto', v: p.pj_persona_contacto },
          { l: 'Teléfono de contacto', v: p.pj_tel_contacto },
        ]);

        // Representante legal
        subTitle(doc, 'Datos del Representante Legal');
        fields(doc, [
          { l: 'Nombres y apellidos', v: rl.nombres_apellidos, full: true },
          { l: 'Tipo de documento', v: rl.tipo_documento },
          { l: 'Número de documento', v: rl.numero_documento },
          { l: 'Ciudad de expedición', v: rl.ciudad_expedicion },
          { l: 'Fecha de expedición', v: fdate(rl.fecha_expedicion) },
          { l: 'Fecha de nacimiento', v: fdate(rl.fecha_nacimiento) },
          { l: 'Lugar de nacimiento', v: rl.lugar_nacimiento },
          { l: 'Dirección de domicilio', v: rl.direccion_domicilio, full: true },
          { l: 'Municipio', v: rl.municipio },
          { l: 'Departamento', v: rl.departamento },
          { l: 'Teléfono', v: rl.telefono },
          { l: 'Correo electrónico', v: rl.correo },
        ]);

        // Composición accionaria
        subTitle(doc, 'Composición accionaria');
        table(
          doc,
          ['Tipo doc.', 'Número', 'Nombre / Razón social', 'Admin. rec. públicos', 'PEP', '% Part.'],
          (p.accionistas || []).map((a) => [
            fmt(a.tipo_documento), fmt(a.numero_documento), fmt(a.razon_social_nombre),
            sino(a.administra_rec_publicos), sino(a.es_pep),
            a.porcentaje_participacion != null ? `${a.porcentaje_participacion}%` : '—',
          ]),
          [8, 12, 34, 16, 8, 10]
        );
      }

      // ── III. INFORMACIÓN GENERAL ──
      sectionBar(doc, 'III. Información general del negocio');
      fields(doc, [
        { l: 'Productos / servicios que ofrece', v: p.productos_servicios, full: true },
        { l: 'Tiene sistema de gestión de calidad', v: sino(p.tiene_sistema_gestion) },
        { l: 'Certificación', v: p.cual_certificacion },
        { l: 'Total de empleados', v: p.total_empleados },
      ]);

      // ── IV. INFORMACIÓN FINANCIERA ──
      sectionBar(doc, 'IV. Información financiera');
      fields(doc, [
        { l: 'Año gravable', v: fin.anio_gravable },
        { l: 'Fecha de corte', v: (fin.dia_corte || fin.mes_corte) ? `${fmt(fin.dia_corte)}/${fmt(fin.mes_corte)}/${fmt(fin.anio_gravable)}` : '—' },
        { l: 'Ingresos mensuales', v: money(fin.ingresos_mensuales) },
        { l: 'Otros ingresos', v: money(fin.otros_ingresos) },
        { l: 'Egresos mensuales', v: money(fin.egresos_mensuales) },
        { l: 'Total ingresos brutos', v: money(fin.total_ingresos_brutos) },
        { l: 'Total activos', v: money(fin.total_activos) },
        { l: 'Total pasivos', v: money(fin.total_pasivos) },
        { l: 'Total patrimonio', v: money(fin.total_patrimonio) },
        { l: 'Utilidad operacional', v: money(fin.utilidad_operacional) },
        { l: 'Opera en instrumentos derivados', v: sino(fin.derivados) },
        { l: 'Fuente', v: fin.fuente },
      ]);

      // ── V. REFERENCIAS ──
      sectionBar(doc, 'V. Referencias');
      subTitle(doc, 'Referencias bancarias');
      table(
        doc,
        ['Entidad', 'Tipo de cuenta', 'No. de cuenta', 'Ciudad', 'Teléfono'],
        (p.referencias_bancarias || []).map((r) => [
          fmt(r.entidad), fmt(r.tipo_cuenta), fmt(r.numero_cuenta), fmt(r.ciudad), fmt(r.telefono),
        ]),
        [26, 18, 22, 16, 18]
      );
      subTitle(doc, 'Referencias comerciales');
      table(
        doc,
        ['Empresa', 'Contacto', 'Teléfono', 'Ciudad', 'Actividad / relación'],
        (p.referencias_comerciales || []).map((r) => [
          fmt(r.empresa), fmt(r.contacto), fmt(r.telefono), fmt(r.ciudad), fmt(r.actividad_relacion),
        ]),
        [24, 18, 16, 14, 28]
      );

      // ── VI. SARLAFT / PLAFT ──
      sectionBar(doc, 'VI. Prevención de LA/FT (SARLAFT)');
      qa(doc, '¿Dispone de medios o herramientas para prevenir y controlar el lavado de activos?', sino(sar.tiene_sistema_control));
      qa(doc, '¿Cuenta con código de conducta?', sino(sar.tiene_cod_conducta));
      qa(doc, '¿Cuenta con manual SIPLAFT?', sino(sar.tiene_manual_siplaft));
      qa(doc, '¿Cuenta con manual de procedimientos?', sino(sar.tiene_manual_procedimientos));
      qa(doc, '¿Cuenta con manual SARLAFT?', sino(sar.tiene_manual_sarlaft));
      qa(doc, '¿Por su cargo o actividad maneja recursos públicos?', sino(sar.maneja_recursos_publicos));
      qa(doc, '¿Es considerada una Persona Políticamente Expuesta (PEP)?', sino(sar.es_pep));
      qa(doc, '¿Existe algún vínculo familiar entre usted y una persona PEP?', sino(sar.vinculo_familiar_pep));
      if (sino(sar.vinculo_familiar_pep) === 'Sí' || sar.pep_nombre) {
        fields(doc, [
          { l: 'PEP — Nombre', v: sar.pep_nombre },
          { l: 'PEP — Identificación', v: sar.pep_identificacion },
          { l: 'PEP — Parentesco', v: sar.pep_parentesco },
          { l: 'PEP — Tipo identificación', v: sar.pep_tipo_identificacion },
        ]);
      }
      qa(doc, '¿Efectúa operaciones en moneda extranjera?', sino(sar.opera_moneda_extranjera));
      qa(doc, '¿Posee cuentas en moneda extranjera?', sino(sar.posee_cuentas_ext));
      if (sino(sar.posee_cuentas_ext) === 'Sí' || sar.cuenta_ext_banco) {
        fields(doc, [
          { l: 'Cuenta ext. — Banco', v: sar.cuenta_ext_banco },
          { l: 'Cuenta ext. — Moneda', v: sar.cuenta_ext_moneda },
          { l: 'Cuenta ext. — Número', v: sar.cuenta_ext_numero },
          { l: 'Cuenta ext. — País', v: sar.cuenta_ext_pais },
          { l: 'Cuenta ext. — Ciudad', v: sar.cuenta_ext_ciudad },
          { l: 'Monto promedio mensual', v: money(sar.cuenta_ext_monto_mensual) },
        ]);
      }

      subTitle(doc, 'Definición de PEP');
      paragraph(doc, LEG.pep, { size: 7 });

      subTitle(doc, 'Declaración voluntaria de origen de fondos');
      paragraph(doc, LEG.origenFondos);
      qa(doc, 'El proveedor suscribe la declaración de origen de fondos.', sino(sar.declaracion_origen_fondos));

      // ── VII. AUTORIZACIÓN TRATAMIENTO DE DATOS ──
      sectionBar(doc, 'VII. Autorización para el tratamiento de datos');
      paragraph(doc, LEG.vii);

      // ── VIII. RESPONSABILIDAD ──
      sectionBar(doc, 'VIII. Responsabilidad en el tratamiento de datos');
      paragraph(doc, LEG.viiiTitulo, { font: 'Helvetica-Bold', size: 7.4, color: '#111' });
      paragraph(doc, LEG.viii);

      // ── IX. RESPONSABILIDAD (PARÁGRAFOS) ──
      sectionBar(doc, 'IX. Responsabilidad en el tratamiento — parágrafos');
      paragraph(doc, LEG.ix);

      // ── OTRAS DECLARACIONES ──
      sectionBar(doc, 'Otras declaraciones');
      qa(doc, '¿Ha sido sancionado o investigado por procesos de lavado de activos o financiación del terrorismo?', sino(sar.sancionado_laft));
      if (sino(sar.sancionado_laft) === 'Sí' || sar.sancion_detalles) {
        renderField(doc, 'Detalles de la sanción / investigación', sar.sancion_detalles, M, CW);
      }
      paragraph(doc, LEG.actualizacion);
      paragraph(doc, LEG.juramento);

      // ── FIRMA ──
      sectionBar(doc, 'Firma del proveedor');
      const buf = firmaBuffer(firma.firma_electronica);
      ensure(doc, buf ? 92 : 46);
      const yF = doc.y;
      if (buf) {
        doc.save().lineWidth(0.5).rect(M, yF, 200, 60).stroke(BORDE).restore();
        try { doc.image(buf, M + 6, yF + 4, { fit: [188, 52] }); } catch (e) { /* imagen inválida: se omite */ }
        doc.font('Helvetica').fontSize(6.6).fillColor('#888')
           .text('Firma electrónica', M, yF + 62, { width: 200, align: 'center', lineBreak: false });
      } else {
        doc.font('Helvetica-Oblique').fontSize(8).fillColor('#999')
           .text('(Sin firma electrónica registrada)', M, yF + 20, { width: 200, lineBreak: false });
      }
      // Datos de la firma a la derecha
      const xR = M + 220;
      const wR = CW - 220;
      doc.fillColor('#000');
      const linea = (l, v, y) => {
        doc.font('Helvetica-Bold').fontSize(6.6).fillColor('#777').text(String(l).toUpperCase(), xR, y, { width: wR, lineBreak: false });
        doc.font('Helvetica').fontSize(8.5).fillColor('#111').text(fmt(v), xR, y + 8, { width: wR, lineBreak: false });
        doc.fillColor('#000');
      };
      // Si no hay firmante explícito, se toma el representante legal
      // (o la persona natural / razón social como último recurso).
      const firmanteNombre = firma.nombre_firmante || rl.nombres_apellidos
        || (esPN ? p.pn_nombre_completo : p.pj_razon_social);
      const firmanteDoc = firma.documento_firmante || rl.numero_documento
        || (esPN ? p.pn_numero_documento : p.pj_nit);
      linea('Nombre del firmante', firmanteNombre, yF);
      linea('Documento', firmanteDoc, yF + 20);
      linea('Ciudad y fecha de firma', `${fmt(firma.ciudad_firma)} · ${fdate(firma.fecha_firma)}`, yF + 40);
      doc.x = M; doc.y = yF + 78;
      fields(doc, [
        { l: 'Acepta tratamiento de datos', v: sino(firma.acepta_tratamiento) },
        { l: 'Acepta declaración de veracidad', v: sino(firma.acepta_declaracion) },
        { l: 'IP de firma', v: firma.ip_firma },
      ]);

      // ── ESPACIO EXCLUSIVO SERFUNORTE ──
      sectionBar(doc, 'Espacio exclusivo — Verificación Serfunorte');
      const resultadoTxt = { aceptado: 'ACEPTADO', rechazado: 'RECHAZADO', pendiente: 'PENDIENTE' };
      fields(doc, [
        { l: 'Resultado de la verificación', v: resultadoTxt[rev.resultado_verificacion] || fmt(rev.resultado_verificacion) },
        { l: 'Funcionario que verifica', v: rev.funcionario_verificacion },
        { l: 'Fecha de verificación', v: fdate(rev.fecha_verificacion) },
        { l: 'Estado del proveedor', v: p.estado },
        { l: 'Observaciones', v: rev.observaciones, full: true },
      ]);

      // ── Pie de página (numeración) ──
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        const yFoot = doc.page.height - M - 4;
        doc.font('Helvetica').fontSize(6.5).fillColor('#999');
        doc.text(`Formato R-44 V09 · Radicado ${fmt(p.radicado)} · Documento generado electrónicamente`,
                 M, yFoot, { width: CW * 0.7, lineBreak: false });
        doc.text(`Página ${i - range.start + 1} de ${range.count}`,
                 M + CW * 0.7, yFoot, { width: CW * 0.3, align: 'right', lineBreak: false });
      }
      doc.fillColor('#000');

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ── Carga del proveedor con todas las asociaciones ─────────
async function cargarProveedorCompleto(id) {
  const {
    R44Proveedor, R44RepresentanteLegal, R44Accionista, R44InfoFinanciera,
    R44RefBancaria, R44RefComercial, R44SarlaftDatos, R44Firma, R44Revision,
  } = require('../models');

  return R44Proveedor.findByPk(id, {
    include: [
      { model: R44RepresentanteLegal, as: 'representante_legal' },
      { model: R44Accionista,         as: 'accionistas' },
      { model: R44InfoFinanciera,     as: 'financiero' },
      { model: R44RefBancaria,        as: 'referencias_bancarias' },
      { model: R44RefComercial,       as: 'referencias_comerciales' },
      { model: R44SarlaftDatos,       as: 'sarlaft' },
      { model: R44Firma,              as: 'firma',
        attributes: ['nombre_firmante', 'documento_firmante', 'ciudad_firma', 'fecha_firma',
                     'ip_firma', 'acepta_tratamiento', 'acepta_declaracion', 'firma_electronica'] },
      { model: R44Revision,           as: 'revision' },
    ],
  });
}

module.exports = { generarR44Pdf, cargarProveedorCompleto };
