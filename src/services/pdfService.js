// ============================================
// src/services/pdfService.js - VERSIÓN MEJORADA
// ============================================
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
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

  // ============================================
  // RECIBO DE CAJA — PDF de una sola página
  // ============================================
  /**
   * Genera el PDF del recibo de caja en uploads/recibos/{numeroRecibo}.pdf
   * @param {object} recibo  Instancia de ReciboCaja (puede ser .toJSON())
   * @param {object} afiliado Instancia/JSON de Afiliado con datos de identidad
   * @param {object} asesor  { nombre, apellido }
   * @returns {Promise<{ fileName:string, filePath:string, url:string }>}
   */
  async generarReciboCajaPDF(recibo, afiliado, asesor) {
    return new Promise((resolve, reject) => {
      try {
        // 1. Configuración de página y paleta sobria integrada
        const doc = new PDFDocument({
          size: 'LETTER',
          margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });

        const dir = path.join(__dirname, '../../uploads/recibos');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const fileName = `${recibo.numeroRecibo}.pdf`;
        const filePath = path.join(dir, fileName);
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        // Paleta sobria
        const PRIMARY_COLOR = COLORES.verde_oscuro || '#111827';
        const TEXT_MAIN     = '#1F2937';
        const TEXT_MUTED    = '#4B5563';
        const BG_LIGHT      = '#F9FAFB';
        const BORDER_COLOR  = '#E5E7EB';

        // ── ENCABEZADO ──────────────────────────────────────────────
        // Logo (izquierda)
        const logoPath = path.join(__dirname, '../../assets/logoConv.png');
        try {
          if (fs.existsSync(logoPath)) {
            doc.image(logoPath, 50, 40, { fit: [130, 65] });
          }
        } catch (e) { /* Logo opcional */ }

        // Título (derecha) — coordenadas absolutas
        doc.fillColor(PRIMARY_COLOR).font('Helvetica-Bold').fontSize(18)
          .text('RECIBO DE CAJA', 50, 42, { align: 'right', width: 512 });
        doc.fillColor(TEXT_MUTED).font('Helvetica-Bold').fontSize(11)
          .text(`No. ${recibo.numeroRecibo}`, 50, 64, { align: 'right', width: 512 });
        doc.font('Helvetica').fontSize(9).fillColor(TEXT_MUTED)
          .text(`Fecha de Emisión: ${this.formatearFecha(recibo.fechaEmision)}`, 50, 80, { align: 'right', width: 512 });

        // Línea separadora
        doc.moveTo(50, 118).lineTo(562, 118).strokeColor(BORDER_COLOR).lineWidth(1).stroke();

        // ── DOS COLUMNAS: EMPRESA (izq) | AFILIADO (der) ──────────
        // Todas las y son absolutas para evitar desplazamiento del cursor

        // Columna izquierda — empresa
        doc.fillColor(PRIMARY_COLOR).font('Helvetica-Bold').fontSize(8)
          .text('EMITIDO POR', 50, 132);
        doc.fillColor(TEXT_MAIN).font('Helvetica-Bold').fontSize(10)
          .text('SERFUNORTE LOS OLIVOS', 50, 146);
        doc.font('Helvetica').fontSize(8.5).fillColor(TEXT_MUTED)
          .text('NIT: 800.254.697-5', 50, 161)
          .text('Teléfono: (607) 578 4777', 50, 174);

        // Columna derecha — afiliado
        const nombreCompleto = [
          afiliado.primerNombre, afiliado.segundoNombre,
          afiliado.primerApellido, afiliado.segundoApellido
        ].filter(Boolean).join(' ');

        doc.fillColor(PRIMARY_COLOR).font('Helvetica-Bold').fontSize(8)
          .text('RECIBIDO DE (AFILIADO)', 310, 132);
        doc.fillColor(TEXT_MAIN).font('Helvetica-Bold').fontSize(10)
          .text(nombreCompleto, 310, 146, { width: 252 });
        doc.font('Helvetica').fontSize(8.5).fillColor(TEXT_MUTED)
          .text(`${afiliado.tipoDocumento || 'CC'}: ${afiliado.numeroDocumento || 'N/A'}`, 310, 161)
          .text(`Celular: ${afiliado.celular || 'N/A'}`, 310, 174)
          .text(`Email: ${afiliado.email || 'N/A'}`, 310, 187);

        // Línea separadora
        doc.moveTo(50, 204).lineTo(562, 204).strokeColor(BORDER_COLOR).lineWidth(0.5).stroke();

        // ── TABLA DE DETALLE ────────────────────────────────────────
        const tY = 214; // y inicio tabla
        const COL1 = 50;  // x etiqueta
        const COL2 = 260; // x valor
        const ROW_H = 26; // alto de cada fila

        // Título sección
        doc.fillColor(PRIMARY_COLOR).font('Helvetica-Bold').fontSize(10)
          .text('DETALLE DE LA TRANSACCIÓN', COL1, tY);

        // Encabezado tabla
        const thY = tY + 18;
        doc.rect(COL1, thY, 512, 22).fill(BG_LIGHT);
        doc.fillColor(TEXT_MAIN).font('Helvetica-Bold').fontSize(9)
          .text('Concepto', COL1 + 10, thY + 7)
          .text('Información Reportada', COL2 + 10, thY + 7);

        // Filas
        const formaPagoLabel = {
          EFECTIVO:           'Efectivo',
          PAGO_EN_CAJA:       'Pago en caja',
          TRANSFERENCIA:      'Transferencia bancaria',
          CORRESPONSAL:       'Corresponsal bancario',
          POSFECHADO_COBRADO: 'Posfechado (cobrado)'
        }[recibo.formaPago] || recibo.formaPago;

        const filasTabla = [
          { desc: 'Forma de Pago',       valor: formaPagoLabel },
          { desc: 'Entidad Bancaria',     valor: recibo.banco || '—' },
          { desc: 'Referencia / Soporte', valor: recibo.referencia || '—' },
          { desc: 'Asesor Responsable',   valor: `${asesor?.nombre || ''} ${asesor?.apellido || ''}`.trim() || '—' }
        ];

        let rowY = thY + 22;
        filasTabla.forEach((fila, i) => {
          if (i % 2 === 1) doc.rect(COL1, rowY, 512, ROW_H).fill('#FAFAFA');
          doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(9)
            .text(fila.desc, COL1 + 10, rowY + 9);
          doc.fillColor(TEXT_MAIN).font('Helvetica-Bold').fontSize(9)
            .text(fila.valor, COL2 + 10, rowY + 9, { width: 290 });
          doc.moveTo(COL1, rowY + ROW_H).lineTo(562, rowY + ROW_H)
            .strokeColor(BORDER_COLOR).lineWidth(0.5).stroke();
          rowY += ROW_H;
        });

        // ── TOTAL ───────────────────────────────────────────────────
        const totalY = rowY + 20;
        doc.rect(310, totalY, 252, 48).fill(BG_LIGHT);
        doc.rect(310, totalY, 252, 48).strokeColor(BORDER_COLOR).lineWidth(1).stroke();
        doc.fillColor(TEXT_MUTED).font('Helvetica-Bold').fontSize(9)
          .text('TOTAL RECIBIDO:', 322, totalY + 10);
        doc.fillColor(PRIMARY_COLOR).font('Helvetica-Bold').fontSize(18)
          .text(`$ ${this.formatearNumero(recibo.valor)}`, 322, totalY + 24, { width: 228, align: 'right' });

        // ── PIE DE PÁGINA ───────────────────────────────────────────
        const footerY = 680;
        doc.moveTo(50, footerY).lineTo(562, footerY).strokeColor(BORDER_COLOR).lineWidth(1).stroke();
        doc.fontSize(7.5).fillColor(TEXT_MUTED).font('Helvetica-Oblique')
          .text(
            'Este documento constituye una representación física y válida del recaudo registrado en el sistema. El cuadre definitivo está sujeto a la conciliación de la auditoría interna de la compañía.',
            50, footerY + 12, { width: 512, align: 'center', lineGap: 2 }
          );

        // Finalización del documento
        doc.end();

        stream.on('finish', () => {
          resolve({
            fileName,
            filePath,
            url: `/uploads/recibos/${fileName}`
          });
        });
        stream.on('error', reject);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Escapa caracteres especiales para uso seguro dentro de elementos <text> en SVG.
   * @param {*} v
   * @returns {string}
   */
  escapeXml(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Genera una imagen PNG con el diseño del recibo de caja en formato voucher
   * compacto pensado para WhatsApp. Se renderiza desde una plantilla SVG
   * embebida (con logo en base64) y se convierte a PNG usando sharp.
   *
   * Tamaño de salida: 800x1000 px.
   * Ubicación: uploads/recibos/{numeroRecibo}.png
   *
   * @param {object} recibo  Recibo de caja (numeroRecibo, valor, formaPago, banco, referencia, fechaEmision)
   * @param {object} afiliado Afiliado (primerNombre, segundoNombre, primerApellido, segundoApellido, tipoDocumento, numeroDocumento, celular, email)
   * @param {object} asesor  { nombre, apellido }
   * @returns {Promise<{ fileName:string, filePath:string, url:string }>}
   */
  async generarReciboCajaImagen(recibo, afiliado, asesor) {
    // Asegurar carpeta de salida
    const dir = path.join(__dirname, '../../uploads/recibos');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const fileName = `${recibo.numeroRecibo}.png`;
    const filePath = path.join(dir, fileName);

    // Logo embebido (opcional): si existe lo metemos como data URI
    let logoTag = '';
    const logoPath = path.join(__dirname, '../../assets/logoConv.png');
    try {
      if (fs.existsSync(logoPath)) {
        const logoB64 = fs.readFileSync(logoPath).toString('base64');
        // 200x90 con preserveAspectRatio para no deformar
        logoTag = `<image x="40" y="30" width="200" height="90"
          preserveAspectRatio="xMinYMid meet"
          href="data:image/png;base64,${logoB64}"/>`;
      }
    } catch (_) { /* logo opcional */ }

    // ── Datos calculados ────────────────────────────────────────────
    const nombre = [
      afiliado.primerNombre, afiliado.segundoNombre,
      afiliado.primerApellido, afiliado.segundoApellido
    ].filter(Boolean).join(' ');

    const formaPagoLabel = {
      EFECTIVO:           'Efectivo',
      PAGO_EN_CAJA:       'Pago en caja',
      TRANSFERENCIA:      'Transferencia bancaria',
      CORRESPONSAL:       'Corresponsal bancario',
      POSFECHADO_COBRADO: 'Posfechado (cobrado)'
    }[recibo.formaPago] || (recibo.formaPago || 'N/A');

    const fechaEmision = this.formatearFecha(recibo.fechaEmision);
    const valorFmt     = this.formatearNumero(recibo.valor);
    const asesorTxt    = `${asesor?.nombre || ''} ${asesor?.apellido || ''}`.trim() || 'N/A';
    const docTxt       = `${afiliado.tipoDocumento || 'CC'}: ${afiliado.numeroDocumento || 'N/A'}`;
    const celTxt       = `Cel: ${afiliado.celular || 'N/A'}`;
    const banco        = recibo.banco || 'N/A';
    const referencia   = recibo.referencia || 'N/A';

    const esc = this.escapeXml.bind(this);

    // ── Plantilla SVG ─────────────────────────────────────────────
    // Paleta: verde corporativo + grises sobrios. Usamos sans-serif
    // (DejaVu Sans en Linux es el fallback estándar de librsvg).
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="800" height="1000" viewBox="0 0 800 1000" xmlns="http://www.w3.org/2000/svg">
  <style>
    .ff { font-family: 'DejaVu Sans', 'Liberation Sans', 'Arial', sans-serif; }
    .label  { fill: #6B7280; font-size: 13px; letter-spacing: 0.5px; }
    .value  { fill: #111827; font-size: 17px; font-weight: 700; }
    .small  { fill: #4B5563; font-size: 13px; }
    .title  { fill: #1A3C2E; font-size: 24px; font-weight: 700; letter-spacing: 0.5px; }
    .subtitle { fill: #4B5563; font-size: 14px; }
    .totalLabel { fill: #A7F3D0; font-size: 16px; letter-spacing: 1px; }
    .totalValue { fill: #FFFFFF; font-size: 46px; font-weight: 800; }
    .footer { fill: #6B7280; font-size: 11px; }
    .brand  { fill: #9CA3AF; font-size: 10px; }
  </style>

  <!-- Fondo -->
  <rect width="800" height="1000" fill="#FFFFFF"/>

  <!-- Encabezado blanco con separador -->
  ${logoTag}
  <line x1="40" y1="148" x2="760" y2="148" stroke="#E5E7EB" stroke-width="1"/>
  <text x="760" y="60"  class="ff title"    text-anchor="end">RECIBO DE CAJA</text>
  <text x="760" y="90"  class="ff subtitle" text-anchor="end">No. ${esc(recibo.numeroRecibo)}</text>
  <text x="760" y="115" class="ff subtitle" text-anchor="end">Fecha de Emisión: ${esc(fechaEmision)}</text>

  <!-- Datos del cliente -->
  <text x="40"  y="200" class="ff label">RECIBIDO DE</text>
  <text x="40"  y="230" class="ff value">${esc(nombre)}</text>
  <text x="40"  y="255" class="ff small">${esc(docTxt)} · ${esc(celTxt)}</text>

  <line x1="40" y1="290" x2="760" y2="290" stroke="#E5E7EB" stroke-width="1"/>

  <!-- Detalle del pago (caja) -->
  <text x="40"  y="335" class="ff value" style="font-size:19px">DETALLE DEL PAGO</text>

  <rect x="40"  y="355" width="720" height="240" fill="#F9FAFB" stroke="#E5E7EB" stroke-width="1" rx="10"/>

  <text x="65"  y="395" class="ff label">FORMA DE PAGO</text>
  <text x="65"  y="425" class="ff value">${esc(formaPagoLabel)}</text>

  <text x="65"  y="475" class="ff label">BANCO / ENTIDAD</text>
  <text x="65"  y="505" class="ff value">${esc(banco)}</text>

  <text x="65"  y="555" class="ff label">ASESOR RESPONSABLE</text>
  <text x="65"  y="585" class="ff value">${esc(asesorTxt)}</text>

  <text x="420" y="395" class="ff label">REFERENCIA / SOPORTE</text>
  <text x="420" y="425" class="ff value">${esc(referencia)}</text>

  <text x="420" y="475" class="ff label">ESTADO</text>
  <text x="420" y="505" class="ff value">Recibido</text>

  <!-- Total destacado -->
  <rect x="40" y="635" width="720" height="120" fill="#0F766E" rx="10"/>
  <text x="65" y="685" class="ff totalLabel">TOTAL RECIBIDO</text>
  <text x="740" y="720" class="ff totalValue" text-anchor="end">$ ${esc(valorFmt)}</text>

  <!-- Pie -->
  <text x="400" y="820" class="ff footer" text-anchor="middle">
    Este documento es la representación válida del recaudo registrado en el sistema.
  </text>
  <text x="400" y="838" class="ff footer" text-anchor="middle">
    El cuadre definitivo está sujeto a la conciliación de auditoría interna.
  </text>

  <line x1="40" y1="900" x2="760" y2="900" stroke="#E5E7EB" stroke-width="1"/>

  <text x="400" y="935" class="ff brand" text-anchor="middle">
    SERFUNORTE LOS OLIVOS · NIT: 800.254.697-5 · Tel: (607) 578 4777
  </text>
  <text x="400" y="955" class="ff brand" text-anchor="middle">
    cucuta.losolivos.co
  </text>
</svg>`;

    // Render SVG → PNG con sharp
    await sharp(Buffer.from(svg, 'utf-8'))
      .png({ quality: 95, compressionLevel: 6 })
      .toFile(filePath);

    return {
      fileName,
      filePath,
      url: `/uploads/recibos/${fileName}`
    };
  }

  /**
   * Genera el carné digital de afiliación superponiendo los datos del afiliado
   * (Empresa, Nombre, Cédula, Vigencia) sobre la imagen base de la plantilla.
   * La base se recibe como Buffer (descargada de CARNET_BASE_URL). Se usa
   * sharp.composite con un overlay SVG transparente — así no se re-codifica la
   * foto de fondo y el texto queda nítido.
   *
   * Las coordenadas son fraccionales respecto al tamaño real de la plantilla,
   * definidas en CARNET_POS (calibrables sin tocar la lógica).
   *
   * @param {object} afiliado  { id, nombreEmpresa, primerNombre, segundoNombre, primerApellido, segundoApellido, numeroDocumento, vigenciaDesde, vigenciaHasta }
   * @param {Buffer} baseBuffer  imagen base de la plantilla (PNG/JPG)
   * @returns {Promise<{ fileName:string, filePath:string, url:string }>}
   */
  async generarCarnetImagen(afiliado, baseBuffer) {
    const dir = path.join(__dirname, '../../uploads/carnets');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const fileName = `${afiliado.id}.png`;
    const filePath = path.join(dir, fileName);

    const meta = await sharp(baseBuffer).metadata();
    const W = meta.width  || 850;
    const H = meta.height || 1400;

    const esc = this.escapeXml.bind(this);

    // ── Datos ────────────────────────────────────────────────────
    const empresa = (afiliado.nombreEmpresa || 'SERFUNORTE LOS OLIVOS').toUpperCase();
    const nombre  = [
      afiliado.primerNombre, afiliado.segundoNombre,
      afiliado.primerApellido, afiliado.segundoApellido
    ].filter(Boolean).join(' ').toUpperCase();
    const cedula  = String(afiliado.numeroDocumento || '')
      .replace(/\B(?=(\d{3})+(?!\d))/g, '.');   // separadores de miles

    const anio = (d) => (d ? new Date(d).getFullYear() : null);
    const vDesde = anio(afiliado.vigenciaDesde);
    const vHasta = anio(afiliado.vigenciaHasta);
    const vigencia = (vDesde && vHasta)
      ? (vDesde === vHasta ? `${vDesde}` : `${vDesde} - ${vHasta}`)
      : String(vDesde || vHasta || new Date().getFullYear());

    // ── Posiciones fraccionales (calibrables) ────────────────────
    // x/y en fracción de W/H; fs en fracción de W.
    const P = {
      xLabel: 0.07, xValue: 0.295,
      yEmpresa: 0.245, yNombre: 0.297, yCedula: 0.345, yVigencia: 0.393,
      fsLabel: 0.036, fsValue: 0.036
    };
    const px = (f) => Math.round(W * f);
    const py = (f) => Math.round(H * f);
    const xL = px(P.xLabel), xV = px(P.xValue);
    const fsL = px(P.fsLabel), fsV = px(P.fsValue);

    // Nombre puede ser largo: si excede ~22 chars, reduce un poco la fuente.
    const fsNombre = nombre.length > 22 ? Math.round(fsV * 0.85) : fsV;

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <style>
    .lbl { font-family:'DejaVu Sans','Liberation Sans','Arial',sans-serif; font-weight:700; fill:#FFFFFF; }
    .val { font-family:'DejaVu Sans','Liberation Sans','Arial',sans-serif; font-weight:700; fill:#FFFFFF; }
  </style>
  <text x="${xL}" y="${py(P.yEmpresa)}"  class="lbl" font-size="${fsL}">Empresa:</text>
  <text x="${xV}" y="${py(P.yEmpresa)}"  class="val" font-size="${fsV}">${esc(empresa)}</text>

  <text x="${xL}" y="${py(P.yNombre)}"   class="lbl" font-size="${fsL}">Nombre:</text>
  <text x="${xV}" y="${py(P.yNombre)}"   class="val" font-size="${fsNombre}">${esc(nombre)}</text>

  <text x="${xL}" y="${py(P.yCedula)}"   class="lbl" font-size="${fsL}">Cédula:</text>
  <text x="${xV}" y="${py(P.yCedula)}"   class="val" font-size="${fsV}">${esc(cedula)}</text>

  <text x="${xL}" y="${py(P.yVigencia)}" class="lbl" font-size="${fsL}">Vigencia:</text>
  <text x="${xV}" y="${py(P.yVigencia)}" class="val" font-size="${fsV}">${esc(vigencia)}</text>
</svg>`;

    await sharp(baseBuffer)
      .composite([{ input: Buffer.from(svg, 'utf-8'), top: 0, left: 0 }])
      .png({ quality: 95, compressionLevel: 6 })
      .toFile(filePath);

    return {
      fileName,
      filePath,
      url: `/uploads/carnets/${fileName}`
    };
  }

  /**
   * Genera el PDF de "Liquidación de afiliaciones" en el stream provisto.
   * No escribe a disco — el controlador pipea PDFDocument directo al res.
   *
   * Layout (LETTER, 50 pt de margen):
   *   - Encabezado con logo + título + asesor + fecha
   *   - Sección 1: tabla con detalle por afiliación
   *   - Sección 2: tabla de agregados (Concepto / Cantidad / Unitario / Total)
   *   - Footer: TOTAL GENERAL destacado + nota legal
   *
   * @param {object[]} afiliaciones  Instancias Sequelize de Afiliado con includes
   * @param {object}   totales       Objeto producido por afiliado.service.calcularLiquidacion
   * @param {object}   asesor        { nombre, apellido, prefijoRecibo }
   * @param {Writable} outStream     Stream al que se pipea el PDF (res del controller)
   * @returns {Promise<void>}        Resuelve cuando el stream termina de escribir
   */
  generarLiquidacionPDF(afiliaciones, totales, asesor, outStream) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'LETTER',
          margins: { top: 50, bottom: 50, left: 40, right: 40 }
        });

        const PRIMARY = '#006838';
        const DARK    = '#111827';
        const MUTED   = '#6B7280';
        const BORDER  = '#E5E7EB';
        const BG_SOFT = '#F9FAFB';

        // Pipear al stream del caller (response HTTP)
        doc.pipe(outStream);
        outStream.on('finish', resolve);
        outStream.on('error', reject);

        // ── Helpers locales ─────────────────────────────────────────
        const formatearRango = (min, max) => {
          if (min == null && max == null) return '—';
          if (min === max) return `$ ${this.formatearNumero(min)}`;
          return `$ ${this.formatearNumero(min)} – $ ${this.formatearNumero(max)}`;
        };
        const nombreCompleto = (a) =>
          [a.primerNombre, a.segundoNombre, a.primerApellido, a.segundoApellido]
            .filter(Boolean).join(' ');

        // ── ENCABEZADO ──────────────────────────────────────────────
        const logoPath = path.join(__dirname, '../../assets/logoConv.png');
        try {
          if (fs.existsSync(logoPath)) {
            doc.image(logoPath, 40, 40, { width: 110, fit: [110, 55] });
          }
        } catch (_) { /* logo opcional */ }

        doc.fillColor(PRIMARY).font('Helvetica-Bold').fontSize(18)
          .text('LIQUIDACIÓN DE AFILIACIONES', 200, 45, { align: 'right', width: 372 });

        const prefijo = asesor?.prefijoRecibo || asesor?.prefijo_recibo || '—';
        const nombreAsesor = `${asesor?.nombre || ''} ${asesor?.apellido || ''}`.trim() || '—';
        doc.fillColor(MUTED).font('Helvetica').fontSize(10)
          .text(`Asesor: ${nombreAsesor}  ·  Prefijo: ${prefijo}`, 200, 75, { align: 'right', width: 372 });
        doc.text(
          `Generado: ${this.formatearFechaHora(new Date())}  ·  ${totales.cantidadAfiliados} afiliación(es)`,
          200, 92, { align: 'right', width: 372 }
        );

        doc.moveTo(40, 120).lineTo(572, 120).strokeColor(BORDER).lineWidth(1).stroke();

        // ── SECCIÓN 1: Detalle por afiliación ───────────────────────
        let y = 140;
        doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11)
          .text('DETALLE DE AFILIACIONES', 40, y);
        y += 18;

        // Encabezado tabla detalle
        const detalleCols = [
          { label: 'ID',         x: 40,  w: 35,  align: 'left'  },
          { label: 'Afiliado',   x: 75,  w: 140, align: 'left'  },
          { label: 'Producto',   x: 215, w: 90,  align: 'left'  },
          { label: 'V. Plan',    x: 305, w: 60,  align: 'right' },
          { label: 'Asist.',     x: 365, w: 50,  align: 'right' },
          { label: 'Seguros',    x: 415, w: 55,  align: 'right' },
          { label: 'Adic.',      x: 470, w: 50,  align: 'right' },
          { label: 'Total',      x: 520, w: 52,  align: 'right' }
        ];

        doc.rect(40, y, 532, 18).fill(BG_SOFT);
        doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8);
        detalleCols.forEach(c => doc.text(c.label, c.x + 3, y + 5, { width: c.w - 4, align: c.align }));
        y += 18;

        doc.font('Helvetica').fontSize(8).fillColor(DARK);
        for (const a of afiliaciones) {
          if (y > 700) { // salto de página
            doc.addPage();
            y = 50;
          }
          const contrato = a.contrato || {};
          const seguros  = Array.isArray(a.seguros) ? a.seguros : [];
          const benefs   = Array.isArray(a.beneficiarios) ? a.beneficiarios : [];
          const primaSeg = seguros.reduce((s, x) => s + Number(x.prima || 0), 0);
          const cantAdic = benefs.filter(b => b.tipoBeneficiario === 'ADICIONAL').length;

          const filas = [
            `#${a.id}`,
            nombreCompleto(a),
            `${a.producto || ''} · ${a.grupo || ''}`,
            this.formatearNumero(contrato.valorPlanExequial),
            a.asistenciaFueraDeCasa === 'SI'
              ? this.formatearNumero(contrato?.tarifa?.valorAsistencia)
              : '—',
            seguros.length ? this.formatearNumero(primaSeg) : '—',
            cantAdic ? `${cantAdic} · ${this.formatearNumero(contrato.valorAdicionales)}` : '—',
            this.formatearNumero(contrato.valorTotal)
          ];

          // Medir altura máxima de la fila antes de dibujar (evita solapamiento
          // cuando texto wrappea: ej. "INTEGRAL · UNIPERSONAL" a 2 líneas).
          const alturas = detalleCols.map((c, i) =>
            doc.heightOfString(filas[i], { width: c.w - 4, align: c.align })
          );
          const rowH = Math.max(14, ...alturas) + 6;

          detalleCols.forEach((c, i) =>
            doc.text(filas[i], c.x + 3, y + 4, { width: c.w - 4, align: c.align })
          );

          doc.moveTo(40, y + rowH).lineTo(572, y + rowH).strokeColor(BORDER).lineWidth(0.3).stroke();
          y += rowH + 1;
        }

        // ── SECCIÓN 2: Resumen agregado ─────────────────────────────
        y += 16;
        if (y > 600) { doc.addPage(); y = 50; }

        doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11)
          .text('RESUMEN AGREGADO', 40, y);
        y += 18;

        const resumenCols = [
          { label: 'Concepto',       x: 40,  w: 230, align: 'left'  },
          { label: 'Cantidad',       x: 270, w: 70,  align: 'center'},
          { label: 'Valor unitario', x: 340, w: 130, align: 'right' },
          { label: 'Valor total',    x: 470, w: 102, align: 'right' }
        ];

        doc.rect(40, y, 532, 18).fill(BG_SOFT);
        doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9);
        resumenCols.forEach(c => doc.text(c.label, c.x + 4, y + 5, { width: c.w - 6, align: c.align }));
        y += 18;

        const fila = (concepto, cantidad, min, max, total, opts = {}) => {
          if (y > 720) { doc.addPage(); y = 50; }
          const isSub = !!opts.subheader;
          if (isSub) {
            doc.font('Helvetica-Bold').fontSize(9).fillColor(PRIMARY);
            doc.text(concepto, resumenCols[0].x + 4, y + 4, { width: resumenCols[0].w - 6 });
          } else {
            doc.font('Helvetica').fontSize(9).fillColor(DARK);
            doc.text(`  ${concepto}`, resumenCols[0].x + 4, y + 4, { width: resumenCols[0].w - 6 });
            doc.text(String(cantidad), resumenCols[1].x + 4, y + 4, { width: resumenCols[1].w - 6, align: 'center' });
            doc.text(formatearRango(min, max), resumenCols[2].x + 4, y + 4, { width: resumenCols[2].w - 6, align: 'right' });
            doc.text(`$ ${this.formatearNumero(total)}`, resumenCols[3].x + 4, y + 4, { width: resumenCols[3].w - 6, align: 'right' });
          }
          doc.moveTo(40, y + 16).lineTo(572, y + 16).strokeColor(BORDER).lineWidth(0.3).stroke();
          y += 17;
        };

        // Productos
        fila('PRODUCTOS', null, null, null, null, { subheader: true });
        const grupos = Object.keys(totales.productosPorGrupo).sort();
        if (grupos.length === 0) {
          fila('(sin productos)', 0, null, null, 0);
        } else {
          for (const g of grupos) {
            const s = totales.productosPorGrupo[g];
            fila(g, s.cantidad, s.min, s.max, s.total);
          }
        }

        // Asistencia
        fila('ASISTENCIA FUERA DE CASA', null, null, null, null, { subheader: true });
        const a = totales.asistencia;
        fila('Asistencia fuera de casa', a.cantidad, a.min, a.max, a.total);

        // Seguros
        fila('SEGUROS', null, null, null, null, { subheader: true });
        const segs = Object.keys(totales.segurosPorNombre).sort();
        if (segs.length === 0) {
          fila('(sin seguros)', 0, null, null, 0);
        } else {
          for (const n of segs) {
            const s = totales.segurosPorNombre[n];
            fila(n, s.cantidad, s.min, s.max, s.total);
          }
        }

        // Beneficiarios adicionales
        fila('BENEFICIARIOS ADICIONALES', null, null, null, null, { subheader: true });
        const ad = totales.adicionales;
        fila('Tarifa adicionales (por afiliación)', ad.cantidad, ad.min, ad.max, ad.total);

        // ── TOTAL GENERAL ───────────────────────────────────────────
        y += 8;
        if (y > 720) { doc.addPage(); y = 50; }
        doc.rect(40, y, 532, 32).fill(PRIMARY);
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(12)
          .text('TOTAL GENERAL DE LA LIQUIDACIÓN', 50, y + 11);
        doc.fontSize(14)
          .text(`$ ${this.formatearNumero(totales.totalGeneral)}`, 350, y + 9, { width: 215, align: 'right' });
        y += 40;

        // ── Pie ─────────────────────────────────────────────────────
        if (y > 720) { doc.addPage(); y = 50; }
        doc.font('Helvetica-Oblique').fontSize(7).fillColor(MUTED)
          .text(
            'Documento generado automáticamente para soporte de comisiones y conciliación con cartera. ' +
            'Los valores reflejan la información registrada en el sistema al momento de la consulta.',
            40, y, { width: 532, align: 'center', lineGap: 1.5 }
          );

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}
module.exports = new PDFService();