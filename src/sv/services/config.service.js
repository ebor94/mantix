/**
 * sv/services/config.service.js
 * getBootstrap: carga en una sola respuesta toda la configuración requerida
 * por el frontend para operar dentro de un área específica.
 */
const { SvArea, SvGrupo, SvProducto, SvEstado, SvResultado, SvFuente, SvPunto, SvTipoEmpresa } = require('../models');

async function getBootstrap(areaId) {
  const area = await SvArea.findByPk(areaId);
  if (!area) return null;

  const [grupos, productos, fuentes, puntos] = await Promise.all([
    SvGrupo.findAll({ where: { grupo_area_id: areaId, grupo_activo: 1 }, order: [['grupo_id', 'ASC']] }),
    SvProducto.findAll({ where: { prod_area_id: areaId, prod_activo: 1 },  order: [['prod_orden_display', 'ASC'], ['prod_nombre', 'ASC']] }),
    SvFuente.findAll({ where: { fuente_area_id: areaId, fuente_activa: 1 }, order: [['fuente_orden', 'ASC']] }),
    SvPunto.findAll({ where: { punto_activo: 1 }, order: [['punto_codigo', 'ASC']] })
  ]);

  const grupoIds = grupos.map(g => g.grupo_id);
  const [estados, resultados] = await Promise.all([
    SvEstado.findAll({ where: { estado_grupo_id: grupoIds, estado_activo: 1 }, order: [['estado_grupo_id', 'ASC'], ['estado_orden', 'ASC']] }),
    SvResultado.findAll({ where: { resultado_grupo_id: grupoIds, resultado_activo: 1 }, order: [['resultado_grupo_id', 'ASC'], ['resultado_orden', 'ASC']] })
  ]);

  // Catálogo de tipos / categorías de empresa (sólo relevante para PREV-EMP, pero
  // se incluye siempre para evitar requests adicionales y no contamina nada).
  const tiposEmpresa = await SvTipoEmpresa.findAll({
    where: { tipoemp_activo: 1 },
    order: [['tipoemp_orden', 'ASC'], ['tipoemp_nombre', 'ASC']]
  });

  return { area, grupos, productos, estados, resultados, fuentes, puntos, tipos_empresa: tiposEmpresa };
}

async function getAllAreas() {
  return SvArea.findAll({ order: [['area_id', 'ASC']] });
}

module.exports = { getBootstrap, getAllAreas };
