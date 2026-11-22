// Lecturas del horno: valor actual, serie para gráficas, tabla paginada y Excel.
const express = require('express');
const apiCodigo = require('../middleware/apiCodigo');
const HornoError = require('../utils/HornoError');
const aw = require('../utils/aw');
const { leerRango } = require('../utils/rango');
const { LIMITE_EXCEL } = require('../services/lecturas.service');
const { escribirLecturasXlsx } = require('../services/lecturasXlsx');

function leerPaginacion(query) {
  const pagina = query.pagina === undefined ? 1 : Number(query.pagina);
  const tamano = query.tamano === undefined ? 50 : Number(query.tamano);
  if (!Number.isInteger(pagina) || pagina < 1 || !Number.isInteger(tamano) || tamano < 1 || tamano > 500) {
    throw new HornoError(400, 'VALIDACION', 'pagina debe ser 1 o más y tamano entre 1 y 500');
  }
  return { pagina, tamano };
}

const compacta = (texto) => texto.slice(0, 10).replace(/-/g, '');

function crearRouterLecturas({ autenticar, lecturas }) {
  const router = express.Router();

  router.get('/lecturas/ultima', apiCodigo('HOR-LEC-001'), autenticar, aw(async (req, res) => {
    res.json({ success: true, data: await lecturas.ultima() });
  }));

  router.get('/lecturas/serie', apiCodigo('HOR-LEC-002'), autenticar, aw(async (req, res) => {
    res.json({ success: true, data: await lecturas.serie(leerRango(req.query)) });
  }));

  router.get('/lecturas', apiCodigo('HOR-LEC-003'), autenticar, aw(async (req, res) => {
    const { desde, hasta } = leerRango(req.query);
    res.json({ success: true, data: await lecturas.listar({ desde, hasta, ...leerPaginacion(req.query) }) });
  }));

  router.get('/lecturas.xlsx', apiCodigo('HOR-LEC-004'), autenticar, aw(async (req, res) => {
    const { desde, hasta } = leerRango(req.query);
    const total = await lecturas.contar({ desde, hasta });
    if (total > LIMITE_EXCEL) {
      throw new HornoError(413, 'DEMASIADOS_REGISTROS',
        `El rango tiene ${total} registros y el máximo por descarga es ${LIMITE_EXCEL}. Reduce el rango.`);
    }
    const filas = await lecturas.filasParaExcel({ desde, hasta });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="horno_incol_${compacta(desde)}_${compacta(hasta)}.xlsx"`);
    await escribirLecturasXlsx(res, filas);
  }));

  return router;
}

module.exports = { crearRouterLecturas };
