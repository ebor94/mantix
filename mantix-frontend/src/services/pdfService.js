// ============================================
// src/services/pdfService.js
// ============================================
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class PDFService {
  /**
   * Generar PDF de mantenimiento ejecutado
   */
  async generarPDFMantenimiento(mantenimiento) {
    return new Promise((resolve, reject) => {
      try {
        // Crear documento PDF
        const doc = new PDFDocument({
          size: 'LETTER',
          margins: {
            top: 50,
            bottom: 50,
            left: 50,
            right: 50
          }
        });

        // Generar nombre único para el archivo
        const fileName = `mantenimiento_${mantenimiento.codigo}_${Date.now()}.pdf`;
        const pdfPath = path.join(__dirname, '../../uploads/pdfs', fileName);

        // Crear carpeta si no existe
        const pdfDir = path.join(__dirname, '../../uploads/pdfs');
        if (!fs.existsSync(pdfDir)) {
          fs.mkdirSync(pdfDir, { recursive: true });
        }

        // Stream para guardar el archivo
        const stream = fs.createWriteStream(pdfPath);
        doc.pipe(stream);

        // ==========================================
        // HEADER - Logo y título
        // ==========================================
        this.agregarHeader(doc, mantenimiento);

        // ==========================================
        // INFORMACIÓN GENERAL
        // ==========================================
        this.agregarInformacionGeneral(doc, mantenimiento);

        // ==========================================
        // INFORMACIÓN DE EJECUCIÓN
        // ==========================================
        if (mantenimiento.ejecucion) {
          this.agregarInformacionEjecucion(doc, mantenimiento.ejecucion);

          // ==========================================
          // CHECKLIST
          // ==========================================
          if (mantenimiento.ejecucion.checklist?.length > 0) {
            this.agregarChecklist(doc, mantenimiento.ejecucion.checklist);
          }

          // ==========================================
          // MATERIALES
          // ==========================================
          if (mantenimiento.ejecucion.materiales?.length > 0) {
            this.agregarMateriales(doc, mantenimiento.ejecucion.materiales);
          }

          // ==========================================
          // EVIDENCIAS FOTOGRÁFICAS
          // ==========================================
          if (mantenimiento.ejecucion.evidencias?.length > 0) {
            this.agregarEvidencias(doc, mantenimiento.ejecucion.evidencias);
          }
        }

        // ==========================================
        // FOOTER
        // ==========================================
        this.agregarFooter(doc);

        // Finalizar documento
        doc.end();

        // Cuando termine de escribir
        stream.on('finish', () => {
          resolve({
            success: true,
            fileName,
            filePath: pdfPath,
            url: `/uploads/pdfs/${fileName}`
          });
        });

        stream.on('error', (error) => {
          reject(error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Header del PDF
   */
  agregarHeader(doc, mantenimiento) {
    // Título principal
    doc.fontSize(20)
       .fillColor('#2563eb')
       .text('REPORTE DE MANTENIMIENTO', { align: 'center' })
       .moveDown(0.5);

    // Código
    doc.fontSize(12)
       .fillColor('#666')
       .text(`Código: ${mantenimiento.codigo}`, { align: 'center' })
       .moveDown(1);

    // Línea separadora
    doc.moveTo(50, doc.y)
       .lineTo(562, doc.y)
       .strokeColor('#2563eb')
       .lineWidth(2)
       .stroke();

    doc.moveDown(1);
  }

  /**
   * Información General
   */
  agregarInformacionGeneral(doc, mantenimiento) {
    const y = doc.y;

    // Título de sección
    doc.fontSize(14)
       .fillColor('#1f2937')
       .text('INFORMACIÓN GENERAL', 50, y)
       .moveDown(0.5);

    // Fondo gris claro
    doc.rect(50, doc.y, 512, 140)
       .fillAndStroke('#f3f4f6', '#e5e7eb');

    let currentY = doc.y + 10;

    // Grid de información
    const data = [
      { label: 'Actividad:', value: mantenimiento.actividad?.nombre || 'N/A' },
      { label: 'Sede:', value: mantenimiento.actividad?.sede?.nombre || 'N/A' },
      { label: 'Categoría:', value: mantenimiento.actividad?.categoria?.nombre || 'N/A' },
      { label: 'Equipo:', value: mantenimiento.actividad?.equipo?.nombre || 'N/A' },
      { label: 'Fecha Programada:', value: this.formatearFecha(mantenimiento.fecha_programada) },
      { label: 'Estado:', value: mantenimiento.estado?.nombre || 'N/A' },
      { label: 'Prioridad:', value: mantenimiento.prioridad?.toUpperCase() || 'N/A' }
    ];

    data.forEach((item, index) => {
      const x = index % 2 === 0 ? 60 : 312;
      
      doc.fontSize(9)
         .fillColor('#6b7280')
         .text(item.label, x, currentY, { continued: true })
         .fillColor('#1f2937')
         .text(` ${item.value}`);

      if (index % 2 === 1) {
        currentY += 20;
      }
    });

    doc.y = currentY + 20;
    doc.moveDown(1);
  }

  /**
   * Información de Ejecución
   */
  agregarInformacionEjecucion(doc, ejecucion) {
    // Verificar si hay espacio suficiente, si no, crear nueva página
    if (doc.y > 650) {
      doc.addPage();
    }

    const y = doc.y;

    // Título de sección
    doc.fontSize(14)
       .fillColor('#16a34a')
       .text('EJECUCIÓN REALIZADA', 50, y)
       .moveDown(0.5);

    // Fondo verde claro
    doc.rect(50, doc.y, 512, 120)
       .fillAndStroke('#f0fdf4', '#86efac');

    let currentY = doc.y + 10;

    const data = [
      { label: 'Fecha de Ejecución:', value: this.formatearFecha(ejecucion.fecha_ejecucion) },
      { label: 'Hora Inicio:', value: ejecucion.hora_inicio },
      { label: 'Hora Fin:', value: ejecucion.hora_fin },
      { label: 'Duración:', value: `${ejecucion.duracion_horas} horas` },
      { label: 'Ejecutado por:', value: ejecucion.nombre_recibe || 'N/A' },
      { label: 'Costo Real:', value: ejecucion.costo_real ? `$${this.formatearNumero(ejecucion.costo_real)}` : 'N/A' }
    ];

    data.forEach((item, index) => {
      const x = index % 2 === 0 ? 60 : 312;
      
      doc.fontSize(9)
         .fillColor('#15803d')
         .text(item.label, x, currentY, { continued: true })
         .fillColor('#1f2937')
         .text(` ${item.value}`);

      if (index % 2 === 1) {
        currentY += 20;
      }
    });

    doc.y = currentY + 10;

    // Trabajo realizado
    if (ejecucion.trabajo_realizado) {
      doc.y += 10;
      doc.fontSize(9)
         .fillColor('#15803d')
         .text('Trabajo Realizado:', 60, doc.y);
      
      doc.fontSize(9)
         .fillColor('#1f2937')
         .text(ejecucion.trabajo_realizado, 60, doc.y + 15, {
           width: 492,
           align: 'justify'
         });
    }

    doc.moveDown(2);
  }

  /**
   * Checklist
   */
  agregarChecklist(doc, checklist) {
    // Nueva página si no hay espacio
    if (doc.y > 600) {
      doc.addPage();
    }

    // Título de sección
    doc.fontSize(14)
       .fillColor('#1f2937')
       .text('CHECKLIST DE ACTIVIDADES', 50, doc.y)
       .moveDown(0.5);

    const tableTop = doc.y;
    const itemHeight = 25;

    // Headers de tabla
    doc.fontSize(10)
       .fillColor('#fff');

    doc.rect(50, tableTop, 400, 20)
       .fill('#2563eb');

    doc.text('Actividad', 60, tableTop + 5, { width: 310 });
    doc.text('Estado', 380, tableTop + 5, { width: 60, align: 'center' });

    let currentY = tableTop + 20;

    // Filas
    checklist.forEach((item, index) => {
      const bgColor = index % 2 === 0 ? '#f9fafb' : '#ffffff';
      
      doc.rect(50, currentY, 400, itemHeight)
         .fillAndStroke(bgColor, '#e5e7eb');

      // Texto
      doc.fontSize(9)
         .fillColor('#1f2937')
         .text(item.actividad, 60, currentY + 8, { width: 310 });

      // Estado (checkmark o X)
      const symbol = item.completada ? '✓' : '✗';
      const color = item.completada ? '#16a34a' : '#dc2626';
      
      doc.fontSize(14)
         .fillColor(color)
         .text(symbol, 400, currentY + 5, { width: 60, align: 'center' });

      currentY += itemHeight;
    });

    doc.y = currentY + 10;
    doc.moveDown(1);
  }

  /**
   * Materiales
   */
  agregarMateriales(doc, materiales) {
    // Nueva página si no hay espacio
    if (doc.y > 600) {
      doc.addPage();
    }

    // Título de sección
    doc.fontSize(14)
       .fillColor('#1f2937')
       .text('MATERIALES UTILIZADOS', 50, doc.y)
       .moveDown(0.5);

    const tableTop = doc.y;
    const rowHeight = 25;

    // Headers
    doc.fontSize(9)
       .fillColor('#fff');

    doc.rect(50, tableTop, 512, 20)
       .fill('#2563eb');

    doc.text('Material', 60, tableTop + 5, { width: 220 });
    doc.text('Cantidad', 290, tableTop + 5, { width: 70, align: 'center' });
    doc.text('Unidad', 370, tableTop + 5, { width: 70, align: 'center' });
    doc.text('Costo Unit.', 450, tableTop + 5, { width: 50, align: 'right' });
    doc.text('Total', 510, tableTop + 5, { width: 50, align: 'right' });

    let currentY = tableTop + 20;
    let total = 0;

    // Filas
    materiales.forEach((material, index) => {
      const bgColor = index % 2 === 0 ? '#f9fafb' : '#ffffff';
      
      doc.rect(50, currentY, 512, rowHeight)
         .fillAndStroke(bgColor, '#e5e7eb');

      doc.fontSize(8)
         .fillColor('#1f2937')
         .text(material.descripcion, 60, currentY + 8, { width: 220 })
         .text(material.cantidad, 290, currentY + 8, { width: 70, align: 'center' })
         .text(material.unidad, 370, currentY + 8, { width: 70, align: 'center' })
         .text(`$${this.formatearNumero(material.costo_unitario)}`, 450, currentY + 8, { width: 50, align: 'right' })
         .text(`$${this.formatearNumero(material.costo_total)}`, 510, currentY + 8, { width: 50, align: 'right' });

      total += parseFloat(material.costo_total || 0);
      currentY += rowHeight;
    });

    // Total
    doc.rect(50, currentY, 512, 25)
       .fill('#f3f4f6');

    doc.fontSize(10)
       .fillColor('#1f2937')
       .text('TOTAL:', 450, currentY + 8, { width: 50, align: 'right' })
       .font('Helvetica-Bold')
       .text(`$${this.formatearNumero(total)}`, 510, currentY + 8, { width: 50, align: 'right' })
       .font('Helvetica');

    doc.y = currentY + 35;
    doc.moveDown(1);
  }

  /**
   * Evidencias fotográficas
   */
  agregarEvidencias(doc, evidencias) {
    // Nueva página
    doc.addPage();

    // Título de sección
    doc.fontSize(14)
       .fillColor('#1f2937')
       .text('EVIDENCIAS FOTOGRÁFICAS', 50, 50)
       .moveDown(1);

    const tipos = ['antes', 'durante', 'despues'];
    let currentY = doc.y;

    tipos.forEach(tipo => {
      const evidenciasTipo = evidencias.filter(e => e.tipo === tipo);
      
      if (evidenciasTipo.length > 0) {
        // Subtítulo
        doc.fontSize(11)
           .fillColor('#2563eb')
           .text(tipo.toUpperCase(), 50, currentY)
           .moveDown(0.5);

        currentY = doc.y;

        evidenciasTipo.forEach((evidencia, index) => {
          const imgPath = path.join(__dirname, '../../', evidencia.ruta_archivo);

          try {
            if (fs.existsSync(imgPath)) {
              // Verificar si hay espacio, si no crear nueva página
              if (currentY > 650) {
                doc.addPage();
                currentY = 50;
              }

              // Agregar imagen (máx 200x150)
              doc.image(imgPath, 60, currentY, {
                fit: [200, 150],
                align: 'center'
              });

              // Descripción
              if (evidencia.descripcion) {
                doc.fontSize(8)
                   .fillColor('#6b7280')
                   .text(evidencia.descripcion, 60, currentY + 160, {
                     width: 200,
                     align: 'center'
                   });
              }

              currentY += 200;
            }
          } catch (error) {
            console.error('Error al agregar imagen:', error);
          }
        });

        currentY += 20;
      }
    });
  }

  /**
   * Footer
   */
  agregarFooter(doc) {
    const pages = doc.bufferedPageRange();
    
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);

      // Línea superior
      doc.moveTo(50, 742)
         .lineTo(562, 742)
         .strokeColor('#e5e7eb')
         .stroke();

      // Texto del footer
      doc.fontSize(8)
         .fillColor('#9ca3af')
         .text(
           `Generado: ${this.formatearFechaHora(new Date())}`,
           50,
           750,
           { align: 'left' }
         )
         .text(
           `Página ${i + 1} de ${pages.count}`,
           0,
           750,
           { align: 'center' }
         )
         .text(
           'Sistema de Gestión de Mantenimiento',
           0,
           750,
           { align: 'right', width: 512 }
         );
    }
  }

  /**
   * Helpers de formato
   */
  formatearFecha(fecha) {
    if (!fecha) return 'N/A';
    const date = new Date(fecha);
    return date.toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  formatearFechaHora(fecha) {
    if (!fecha) return 'N/A';
    return fecha.toLocaleString('es-CO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatearNumero(numero) {
    if (!numero) return '0';
    return parseFloat(numero).toLocaleString('es-CO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  }
}

module.exports = new PDFService();