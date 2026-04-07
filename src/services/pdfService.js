// ============================================
// src/services/pdfService.js - VERSIÓN MEJORADA
// ============================================
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const empresaConfig = require('../config/empresa');
// Paleta de colores de Olivos
const COLORES = {
  verde_olivos: '#006838',      // Verde principal
  verde_oscuro: '#004d29',      // Verde oscuro
  dorado: '#FDB515',            // Dorado/Amarillo
  gris_oscuro: '#1f2937',       // Texto principal
  gris_medio: '#6b7280',        // Texto secundario
  gris_claro: '#f9fafb',        // Fondos claros
  blanco: '#ffffff',
  verde_claro: '#f0fdf4',       // Fondo verde suave
  borde_verde: '#86efac'        // Borde verde claro
};

class PDFService {
  /**
   * Generar PDF de mantenimiento ejecutado
   */
  async generarPDFMantenimiento(mantenimiento) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'LETTER',
          margins: {
            top: 50,
            bottom: 50,
            left: 50,
            right: 50
          },
          bufferPages: true
        });

        const fileName = `mantenimiento_${mantenimiento.codigo}_${Date.now()}.pdf`;
        const pdfPath = path.join(__dirname, '../../uploads/pdfs', fileName);

        const pdfDir = path.join(__dirname, '../../uploads/pdfs');
        if (!fs.existsSync(pdfDir)) {
          fs.mkdirSync(pdfDir, { recursive: true });
        }

        const stream = fs.createWriteStream(pdfPath);
        doc.pipe(stream);

        // Generar contenido
        this.agregarHeader(doc, mantenimiento);
        this.agregarInformacionGeneral(doc, mantenimiento);

        if (mantenimiento.ejecucion) {
          this.agregarInformacionEjecucion(doc, mantenimiento.ejecucion);

          if (mantenimiento.ejecucion.checklist?.length > 0) {
            this.agregarChecklist(doc, mantenimiento.ejecucion.checklist);
          }

          if (mantenimiento.ejecucion.materiales?.length > 0) {
            this.agregarMateriales(doc, mantenimiento.ejecucion.materiales);
          }

          if (mantenimiento.ejecucion.evidencias?.length > 0) {
            this.agregarEvidencias(doc, mantenimiento.ejecucion.evidencias);
          }

          this.agregarFirmas(doc, mantenimiento);
        }

        doc.end();

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
   * Header del PDF con Logo
   */
  agregarHeader(doc, mantenimiento) {
    const logoPath = path.join(__dirname, '../../assets/logoConv.png');
    let logoAgregado = false;

    try {
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 40, {
          width: 120,
          height: 80,
          fit: [120, 80]
        });
        logoAgregado = true;
      }
    } catch (error) {
      console.error('Error al cargar logo:', error.message);
    }

    const infoX = 190;

    // Información de la empresa (a la derecha del logo o texto)
      doc.fontSize(7)
      .fillColor('#6b7280')
      .text(empresaConfig.nombre.toUpperCase(), infoX, 45)
      .text(empresaConfig.slogan, infoX, 60)
      .fontSize(8)
      .fillColor('#6b7280')
      .text(empresaConfig.web, infoX, 80);

    doc.fontSize(8)
      .fillColor('#6b7280')
      .text(`Tel: ${empresaConfig.telefono}`, 420, 45)
      .text(`Email: ${empresaConfig.email}`, 420, 60)
      .text(`${empresaConfig.ciudad}, ${empresaConfig.pais}`, 420, 75);
      doc.y = 120;



doc.fontSize(20)
   .fillColor(COLORES.verde_olivos)
   .font('Helvetica-Bold')
   .text('REPORTE DE MANTENIMIENTO', 50, doc.y, { // ✅ Agregar posición X
     align: 'center',
     width: 512  // ✅ Ancho total del área de contenido (612 - 50 - 50 de márgenes)
   })
   .font('Helvetica')
   .moveDown(0.3);

    // Código
    doc.fontSize(11)
      .fillColor(COLORES.gris_medio)
      .text(`Código: ${mantenimiento.codigo}`, { align: 'right' })
      .moveDown(0.8);

    // Badge de estado
    const estadoColor = this.getEstadoColor(mantenimiento.estado?.nombre);
    const estadoX = 462;

    doc.roundedRect(estadoX, doc.y, 100, 22, 5)
      .fillAndStroke(estadoColor.bg, estadoColor.border);

    doc.fontSize(10)
      .fillColor(estadoColor.text)
      .font('Helvetica-Bold')
      .text(mantenimiento.estado?.nombre || 'N/A', estadoX, doc.y + 6, {
        width: 100,
        align: 'center'
      })
      .font('Helvetica');

    doc.moveDown(2);

    // Línea separadora
    doc.moveTo(50, doc.y)
      .lineTo(562, doc.y)
      .strokeColor(COLORES.verde_olivos)
      .lineWidth(2)
      .stroke();

    doc.moveDown(1);
  }

  /**
   * Obtener colores según estado
   */
  getEstadoColor(estado) {
    const colores = {
      'Programado': { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
      'En Proceso': { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
      'Ejecutado': { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
      'Atrasado': { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
      'Cancelado': { bg: '#f3f4f6', border: '#6b7280', text: '#374151' }
    };

    return colores[estado] || colores['Programado'];
  }

  /**
   * Información General
   */
  agregarInformacionGeneral(doc, mantenimiento) {
    // Título de sección
    doc.fontSize(13)
      .fillColor(COLORES.gris_oscuro)
      .font('Helvetica-Bold')
      .text('INFORMACIÓN GENERAL', 50, doc.y)
      .font('Helvetica')
      .moveDown(0.5);

    // Fondo con borde
    const boxY = doc.y;
    doc.roundedRect(50, boxY, 512, 165, 8)
      .fillAndStroke(COLORES.gris_claro, '#e5e7eb');

    let currentY = boxY + 20;

    // Grid de información
    const data = [
      { label: 'Actividad:', value: mantenimiento.actividad?.nombre || 'N/A' },
      { label: 'Sede:', value: mantenimiento.actividad?.sede?.nombre || 'N/A' },
      { label: 'Categoría:', value: mantenimiento.actividad?.categoria?.nombre || 'N/A' },
      { label: 'Equipo:', value: mantenimiento.actividad?.equipo?.nombre || 'N/A' },
      { label: 'Código Equipo:', value: mantenimiento.actividad?.equipo?.codigo || 'N/A' },
      { label: 'Fecha Programada:', value: this.formatearFecha(mantenimiento.fecha_programada) },
      { label: 'Hora:', value: mantenimiento.hora_programada || 'N/A' },
      { label: 'Prioridad:', value: mantenimiento.prioridad?.toUpperCase() || 'N/A' }
    ];

    data.forEach((item, index) => {
      const x = index % 2 === 0 ? 70 : 327;

      doc.fontSize(8)
        .fillColor(COLORES.gris_medio)
        .text(item.label, x, currentY);

      doc.fontSize(10)
        .fillColor(COLORES.gris_oscuro)
        .font('Helvetica-Bold')
        .text(item.value, x, currentY + 12, { width: 220 })
        .font('Helvetica');

      if (index % 2 === 1) {
        currentY += 38;
      }
    });

    doc.y = boxY + 180;
    doc.moveDown(1);
  }

  /**
   * Información de Ejecución
   */
  agregarInformacionEjecucion(doc, ejecucion) {
    if (doc.y > 650) {
      doc.addPage();
    }

    // Título de sección
    doc.fontSize(13)
      .fillColor(COLORES.verde_olivos)
      .font('Helvetica-Bold')
      .text('EJECUCIÓN REALIZADA', 50, doc.y)
      .font('Helvetica')
      .moveDown(0.5);

    // Fondo verde claro
    const boxY = doc.y;
    doc.roundedRect(50, boxY, 512, 145, 8)
      .fillAndStroke(COLORES.verde_claro, COLORES.borde_verde);

    let currentY = boxY + 8;

    // ✅ Calcular duración correctamente
    let duracionTexto = 'N/A';
    if (ejecucion.hora_inicio && ejecucion.hora_fin) {
      const [horaIni, minIni] = ejecucion.hora_inicio.split(':').map(Number);
      const [horaFin, minFin] = ejecucion.hora_fin.split(':').map(Number);

      let minutosInicio = horaIni * 60 + minIni;
      let minutosFin = horaFin * 60 + minFin;

      // Si la hora fin es menor, asumimos que cruzó la medianoche
      if (minutosFin < minutosInicio) {
        minutosFin += 24 * 60;
      }

      const duracionMinutos = minutosFin - minutosInicio;
      const horas = Math.floor(duracionMinutos / 60);
      const minutos = duracionMinutos % 60;

      duracionTexto = `${horas}h ${minutos}min`;
    } else if (ejecucion.duracion_horas) {
      const duracion = parseFloat(ejecucion.duracion_horas);
      if (duracion > 0) {
        const horas = Math.floor(duracion);
        const minutos = Math.round((duracion - horas) * 60);
        duracionTexto = `${horas}h ${minutos}min`;
      }
    }

   // const costoReal = ejecucion.costo_real ? `$${this.formatearNumero(ejecucion.costo_real)}` : 'N/A';

    const data = [
      { label: 'Fecha de Ejecución:', value: this.formatearFecha(ejecucion.fecha_ejecucion) },
      { label: 'Hora Inicio:', value: ejecucion.hora_inicio },
      { label: 'Hora Fin:', value: ejecucion.hora_fin },
      { label: 'Duración:', value: duracionTexto },
      { label: 'Ejecutado por:', value: ejecucion.nombre_recibe || 'N/A' },
      { label: 'N° Trabajadores:', value: ejecucion.trabajadores_cantidad || '1' },
      //{ label: 'Costo Real:', value: costoReal }
    ];

    data.forEach((item, index) => {
      const x = index % 2 === 0 ? 70 : 327;

      doc.fontSize(8)
        .fillColor(COLORES.verde_oscuro)
        .text(item.label, x, currentY);

      doc.fontSize(10)
        .fillColor(COLORES.gris_oscuro)
        .font('Helvetica-Bold')
        .text(item.value, x, currentY + 12, { width: 220 })
        .font('Helvetica');

      if (index % 2 === 1) {
        currentY += 38;
      }
    });

    doc.y = boxY + 160;

    // Trabajo realizado
    if (ejecucion.trabajo_realizado) {
      doc.fontSize(8)
        .fillColor(COLORES.verde_oscuro)
        .font('Helvetica-Bold')
        .text('Trabajo Realizado:', 70, doc.y)
        .font('Helvetica');

      doc.fontSize(9)
        .fillColor(COLORES.gris_oscuro)
        .text(ejecucion.trabajo_realizado, 70, doc.y + 12, {
          width: 482,
          align: 'justify'
        });

      doc.moveDown(1.5);
    }

    // Observaciones
    if (ejecucion.observaciones) {
      doc.fontSize(8)
        .fillColor(COLORES.verde_oscuro)
        .font('Helvetica-Bold')
        .text('Observaciones:', 70, doc.y)
        .font('Helvetica');

      doc.fontSize(9)
        .fillColor(COLORES.gris_oscuro)
        .text(ejecucion.observaciones, 70, doc.y + 12, {
          width: 482,
          align: 'justify'
        });
    }

    doc.moveDown(2);
  }

  /**
   * Checklist
   */
  agregarChecklist(doc, checklist) {
    if (doc.y > 600) {
      doc.addPage();
    }

    // Título de sección
    doc.fontSize(13)
      .fillColor(COLORES.gris_oscuro)
      .font('Helvetica-Bold')
      .text('CHECKLIST DE ACTIVIDADES', 50, doc.y)
      .font('Helvetica')
      .moveDown(0.5);

    const tableTop = doc.y;
    const itemHeight = 30;

    // Headers de tabla
    doc.fontSize(10)
      .fillColor(COLORES.blanco)
      .font('Helvetica-Bold');

    doc.roundedRect(50, tableTop, 450, 25, 5)
      .fill(COLORES.verde_olivos);

    doc.text('Actividad', 65, tableTop + 8, { width: 350 });
    doc.text('Estado', 430, tableTop + 8, { width: 60, align: 'center' });

    let currentY = tableTop + 25;

    doc.font('Helvetica');

    // Filas
    checklist.forEach((item, index) => {
      const bgColor = index % 2 === 0 ? COLORES.blanco : COLORES.gris_claro;

      doc.rect(50, currentY, 450, itemHeight)
        .fillAndStroke(bgColor, '#e5e7eb');

      // Número
      doc.fontSize(9)
        .fillColor(COLORES.gris_medio)
        .text(`${index + 1}.`, 60, currentY + 10, { width: 20 });

      // Texto
      doc.fontSize(9)
        .fillColor(COLORES.gris_oscuro)
        .text(item.actividad, 85, currentY + 10, { width: 330 });

      // Estado con círculo
      if (item.completada) {
        doc.circle(455, currentY + 15, 9)
          .fillAndStroke('#22c55e', '#16a34a');

        doc.fontSize(11)
          .fillColor(COLORES.blanco)
          .text('✓', 450, currentY + 8);
      } else {
        doc.circle(455, currentY + 15, 9)
          .fillAndStroke('#ef4444', '#dc2626');

        doc.fontSize(11)
          .fillColor(COLORES.blanco)
          .text('✗', 450, currentY + 8);
      }

      currentY += itemHeight;
    });

    // Resumen
    const completadas = checklist.filter(item => item.completada).length;
    const porcentaje = Math.round((completadas / checklist.length) * 100);

    doc.roundedRect(50, currentY, 450, 30, 5)
      .fill(COLORES.gris_claro);

    doc.fontSize(9)
      .fillColor(COLORES.gris_oscuro)
      .text(`Total: ${checklist.length} actividades`, 65, currentY + 11)
      .text(`Completadas: ${completadas}`, 220, currentY + 11)
      .font('Helvetica-Bold')
      .fillColor(COLORES.verde_olivos)
      .text(`${porcentaje}% Completado`, 380, currentY + 11)
      .font('Helvetica');

    doc.y = currentY + 40;
    doc.moveDown(1);
  }

  /**
   * Materiales
   */
  agregarMateriales(doc, materiales) {
    if (doc.y > 600) {
      doc.addPage();
    }

    // Título
    doc.fontSize(13)
      .fillColor(COLORES.gris_oscuro)
      .font('Helvetica-Bold')
      .text('MATERIALES UTILIZADOS', 50, doc.y)
      .font('Helvetica')
      .moveDown(0.5);

    const tableTop = doc.y;
    const rowHeight = 25;

    // Headers
    doc.fontSize(9)
      .fillColor(COLORES.blanco)
      .font('Helvetica-Bold');

    doc.roundedRect(50, tableTop, 512, 22, 5)
      .fill(COLORES.verde_olivos);

    doc.text('Material', 60, tableTop + 6, { width: 220 });
    doc.text('Cant.', 290, tableTop + 6, { width: 50, align: 'center' });
    doc.text('Unidad', 350, tableTop + 6, { width: 70, align: 'center' });
    doc.text('C. Unit.', 430, tableTop + 6, { width: 60, align: 'right' });
    doc.text('Total', 500, tableTop + 6, { width: 60, align: 'right' });

    let currentY = tableTop + 22;
    let total = 0;

    doc.font('Helvetica');

    // Filas
    materiales.forEach((material, index) => {
      const bgColor = index % 2 === 0 ? COLORES.blanco : COLORES.gris_claro;

      doc.rect(50, currentY, 512, rowHeight)
        .fillAndStroke(bgColor, '#e5e7eb');

      doc.fontSize(8)
        .fillColor(COLORES.gris_oscuro)
        .text(material.descripcion, 60, currentY + 8, { width: 220 })
        .text(material.cantidad, 290, currentY + 8, { width: 50, align: 'center' })
        .text(material.unidad, 350, currentY + 8, { width: 70, align: 'center' })
        .text(`$${this.formatearNumero(material.costo_unitario)}`, 430, currentY + 8, { width: 60, align: 'right' })
        .font('Helvetica-Bold')
        .text(`$${this.formatearNumero(material.costo_total)}`, 500, currentY + 8, { width: 60, align: 'right' })
        .font('Helvetica');

      total += parseFloat(material.costo_total || 0);
      currentY += rowHeight;
    });

    // Total
/*     doc.roundedRect(50, currentY, 512, 30, 5)
      .fill(COLORES.verde_claro);

    doc.fontSize(11)
      .fillColor(COLORES.verde_oscuro)
      .text('TOTAL MATERIALES:', 350, currentY + 10, { width: 140, align: 'right' })
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor(COLORES.verde_olivos)
      .text(`$${this.formatearNumero(total)}`, 500, currentY + 9, { width: 60, align: 'right' })
      .font('Helvetica'); */

    doc.y = currentY + 40;
    doc.moveDown(1);
  }

  /**
   * Evidencias fotográficas
   */
  agregarEvidencias(doc, evidencias) {
    doc.addPage();

    doc.fontSize(13)
      .fillColor(COLORES.gris_oscuro)
      .font('Helvetica-Bold')
      .text('EVIDENCIAS FOTOGRÁFICAS', 50, 50)
      .font('Helvetica')
      .moveDown(1);

    const tipos = [
      { key: 'antes', label: 'ANTES DEL MANTENIMIENTO', color: COLORES.verde_oscuro },
      { key: 'durante', label: 'DURANTE EL MANTENIMIENTO', color: COLORES.dorado },
      { key: 'despues', label: 'DESPUÉS DEL MANTENIMIENTO', color: COLORES.verde_olivos }
    ];

    let currentY = doc.y;

    tipos.forEach(tipo => {
      const evidenciasTipo = evidencias.filter(e => e.tipo === tipo.key);

      if (evidenciasTipo.length > 0) {
        if (currentY > 700) {
          doc.addPage();
          currentY = 50;
        }

        // Subtítulo
        doc.roundedRect(50, currentY, 512, 25, 5)
          .fill(tipo.color);

        doc.fontSize(11)
          .fillColor(COLORES.blanco)
          .font('Helvetica-Bold')
          .text(tipo.label, 60, currentY + 8)
          .font('Helvetica');

        currentY += 35;

        let column = 0;

        evidenciasTipo.forEach((evidencia, index) => {
          const imgPath = path.join(__dirname, '../../', evidencia.ruta_archivo);

          try {
            if (fs.existsSync(imgPath)) {
              if (currentY > 650) {
                doc.addPage();
                currentY = 50;
                column = 0;
              }

              const x = column === 0 ? 60 : 312;
              const imgWidth = 230;
              const imgHeight = 170;

              doc.roundedRect(x - 5, currentY - 5, imgWidth + 10, imgHeight + 45, 5)
                .stroke('#e5e7eb');

              doc.image(imgPath, x, currentY, {
                fit: [imgWidth, imgHeight],
                align: 'center'
              });

              const descripcion = evidencia.descripcion || `Evidencia ${index + 1}`;
              doc.fontSize(8)
                .fillColor(COLORES.gris_medio)
                .text(descripcion, x, currentY + imgHeight + 5, {
                  width: imgWidth,
                  align: 'center'
                });

              doc.fontSize(7)
                .fillColor(COLORES.gris_medio)
                .text(`${evidencia.tamanio_kb} KB`, x, currentY + imgHeight + 20, {
                  width: imgWidth,
                  align: 'center'
                });

              column++;

              if (column === 2) {
                currentY += imgHeight + 55;
                column = 0;
              }
            }
          } catch (error) {
            console.error('Error al agregar imagen:', error);
          }
        });

        if (column === 1) {
          currentY += 225;
        }

        currentY += 10;
      }
    });
  }

  /**
   * Sección de Firmas
   */
  agregarFirmas(doc, mantenimiento) {
    doc.addPage();

    doc.fontSize(15)
      .fillColor(COLORES.gris_oscuro)
      .font('Helvetica-Bold')
      .text('FIRMAS Y APROBACIONES', { align: 'center' })
      .font('Helvetica')
      .moveDown(2);

    const currentY = doc.y + 20;
    const boxHeight = 120;
    const boxWidth = 220;

    // Firma del Ejecutor
    doc.roundedRect(60, currentY, boxWidth, boxHeight, 8)
      .stroke(COLORES.verde_olivos);

    doc.fontSize(9)
      .fillColor(COLORES.gris_medio)
      .text('Ejecutado por:', 70, currentY + 10);

    doc.fontSize(11)
      .fillColor(COLORES.gris_oscuro)
      .font('Helvetica-Bold')
      .text(
        mantenimiento.ejecucion?.nombre_recibe || 'N/A',
        70,
        currentY + 25,
        { width: boxWidth - 20 }
      )
      .font('Helvetica');

    doc.fontSize(8)
      .fillColor(COLORES.gris_medio)
      .text('(Espacio para firma)', 70, currentY + 55, {
        width: boxWidth - 20,
        align: 'center'
      });

    doc.moveTo(80, currentY + 85)
      .lineTo(260, currentY + 85)
      .stroke(COLORES.gris_medio);

    doc.fontSize(8)
      .fillColor(COLORES.gris_medio)
      .text('Firma del Ejecutor', 70, currentY + 90, {
        width: boxWidth - 20,
        align: 'center'
      });

    doc.fontSize(7)
      .fillColor(COLORES.gris_medio)
      .text(
        `Fecha: ${this.formatearFecha(mantenimiento.ejecucion?.fecha_ejecucion)}`,
        70,
        currentY + 105,
        { width: boxWidth - 20, align: 'center' }
      );

    // Firma de Aprobación
    doc.roundedRect(322, currentY, boxWidth, boxHeight, 8)
      .stroke(COLORES.verde_olivos);

    doc.fontSize(9)
      .fillColor(COLORES.gris_medio)
      .text('Aprobado por:', 332, currentY + 10);

    doc.fontSize(11)
      .fillColor(COLORES.gris_oscuro)
      .font('Helvetica-Bold')
      .text(
        mantenimiento.actividad?.sede?.nombre || 'Responsable de Sede',
        332,
        currentY + 25,
        { width: boxWidth - 20 }
      )
      .font('Helvetica');

    doc.fontSize(8)
      .fillColor(COLORES.gris_medio)
      .text('(Espacio para firma)', 332, currentY + 55, {
        width: boxWidth - 20,
        align: 'center'
      });

    doc.moveTo(342, currentY + 85)
      .lineTo(522, currentY + 85)
      .stroke(COLORES.gris_medio);

    doc.fontSize(8)
      .fillColor(COLORES.gris_medio)
      .text('Firma de Aprobación', 332, currentY + 90, {
        width: boxWidth - 20,
        align: 'center'
      });

    doc.fontSize(7)
      .fillColor(COLORES.gris_medio)
      .text(
        `Fecha: ${this.formatearFecha(new Date())}`,
        332,
        currentY + 105,
        { width: boxWidth - 20, align: 'center' }
      );

    // Sello
    const selloY = currentY + boxHeight + 40;
    const selloWidth = 150;
    const selloHeight = 100;
    const selloX = (612 - selloWidth) / 2;

    doc.roundedRect(selloX, selloY, selloWidth, selloHeight, 8)
      .stroke(COLORES.verde_olivos);

    doc.fontSize(8)
      .fillColor(COLORES.gris_medio)
      .text('(Espacio para sello)', selloX + 10, selloY + 35, {
        width: selloWidth - 20,
        align: 'center'
      });

    doc.fontSize(7)
      .fillColor(COLORES.gris_medio)
      .text('Sello de la Empresa', selloX + 10, selloY + 80, {
        width: selloWidth - 20,
        align: 'center'
      });

    // Nota final
    doc.fontSize(7)
      .fillColor(COLORES.gris_medio)
      .text(
        'Este documento certifica la ejecución del mantenimiento según lo especificado.',
        50,
        selloY + selloHeight + 30,
        { width: 512, align: 'center', italic: true }
      );
  }
  /**

  Helpers de formato
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