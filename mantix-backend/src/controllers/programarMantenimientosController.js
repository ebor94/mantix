// ============================================
// src/controllers/programarMantenimientosController.js
// ============================================
const db = require('../models');
const { Op } = require('sequelize');

const {
    PlanActividad,
    MantenimientoProgramado,
    PlanMantenimiento,
    Estado,
    Usuario,
    UsuarioCategoria,
    sequelize,
    Equipo,
    Sede
} = db;

const { Periodicidad } = require('../models');
const logger = require('../utils/logger');

// Función auxiliar para calcular las fechas de programación según periodicidad
const calcularFechasProgramacion = async (fechaInicio, fechaFin, periodicidad_id, excluirFinesSemana = true) => {
    const fechas = [];
    const inicio = new Date(fechaInicio);
    const fin = new Date(fechaFin);

    // Obtener la periodicidad desde la base de datos
    const periodicidad = await Periodicidad.findByPk(periodicidad_id);

    if (!periodicidad) {
        throw new Error('Periodicidad no encontrada');
    }

    const dias = periodicidad.dias;
    let fechaActual = new Date(inicio);

    while (fechaActual <= fin) {
        let fechaProgramada = new Date(fechaActual);
        
        // Excluir fines de semana si está habilitado
        if (excluirFinesSemana) {
            // 0 = Domingo, 6 = Sábado
            while (fechaProgramada.getDay() === 0 || fechaProgramada.getDay() === 6) {
                fechaProgramada.setDate(fechaProgramada.getDate() + 1);
            }
        }
        
        // Solo agregar si la fecha ajustada está dentro del rango
        if (fechaProgramada <= fin) {
            fechas.push(new Date(fechaProgramada));
        }
        
        fechaActual.setDate(fechaActual.getDate() + dias);
    }

    return fechas;
};

// Generar código único para mantenimiento
const generarCodigoMantenimiento = async (anio) => {
    const ultimoMantenimiento = await MantenimientoProgramado.findOne({
        where: {
            codigo: {
                [Op.like]: `MNT-${anio}-%`
            }
        },
        order: [['codigo', 'DESC']]
    });

    let numeroSecuencial = 1;
    if (ultimoMantenimiento) {
        const ultimoCodigo = ultimoMantenimiento.codigo;
        const ultimoNumero = parseInt(ultimoCodigo.split('-')[2]);
        numeroSecuencial = ultimoNumero + 1;
    }

    return `MNT-${anio}-${String(numeroSecuencial).padStart(4, '0')}`;
};

// Programar mantenimientos para una actividad específica (con verificación de permisos)
exports.programarActividad = async (req, res) => {
    try {
        console.log('=== INICIO programarActividad ===');
        
        const { id } = req.params; // ID de la actividad
        const { fecha_inicio, fecha_fin, estado_id, prioridad, excluir_fines_semana, exigencias } = req.body;

        console.log('Parámetros recibidos:', {
            actividad_id: id,
            fecha_inicio,
            fecha_fin,
            estado_id,
            prioridad,
            excluir_fines_semana
        });

        // ⚠️ VALIDACIÓN CRÍTICA: Verificar que req.usuario existe
        if (!req.usuario) {
            console.error('❌ ERROR CRÍTICO: req.usuario es undefined');
            console.error('Esto significa que el middleware de autenticación NO se ejecutó');
            return res.status(401).json({
                success: false,
                message: 'No autenticado. El token JWT no fue procesado correctamente.'
            });
        }

        console.log('✅ Usuario autenticado:', {
            id: req.usuario.id,
            email: req.usuario.email,
            es_super_admin: req.usuario.es_super_admin
        });

        // Obtener la actividad con sus relaciones
        const actividad = await PlanActividad.findByPk(id, {
            include: [
                {
                    model: PlanMantenimiento,
                    as: 'plan',
                    required: false
                }
            ]
        });

        if (!actividad) {
            return res.status(404).json({
                success: false,
                message: 'Actividad no encontrada'
            });
        }

        console.log('✅ Actividad encontrada:', {
            id: actividad.id,
            nombre: actividad.nombre,
            categoria_id: actividad.categoria_id
        });

        // Verificar si el usuario tiene acceso a la categoría de esta actividad
        if (!req.usuario.es_super_admin) {
            console.log('⚠️ Usuario NO es super admin, verificando acceso a categoría...');
            
            const tieneAcceso = await req.usuario.tieneAccesoCategoria(actividad.categoria_id);

            console.log('Resultado verificación acceso:', tieneAcceso);

            if (!tieneAcceso) {
                return res.status(403).json({
                    success: false,
                    message: 'No tienes permiso para programar mantenimientos en esta categoría'
                });
            }
        } else {
            console.log('✅ Usuario es super admin - tiene acceso total');
        }

        // Determinar fechas del plan
        const fechaInicioPrograma = fecha_inicio ;
        const fechaFinPrograma = fecha_fin ;

        if (!fechaInicioPrograma || !fechaFinPrograma) {
            return res.status(400).json({
                success: false,
                message: 'No se pueden determinar las fechas de programación'
            });
        }

        logger.info('📅 Fechas de programación:', {
            inicio: fechaInicioPrograma,
            fin: fechaFinPrograma
        });

        logger

        const fechasProgramadas = await calcularFechasProgramacion(
            fechaInicioPrograma,
            fechaFinPrograma,
            actividad.periodicidad_id,
            excluir_fines_semana
        );

        console.log(`📊 Fechas generadas: ${fechasProgramadas.length}`);

        if (fechasProgramadas.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No se generaron fechas de programación'
            });
        }

        // Obtener el estado por defecto (Programado)
        const estadoPorDefecto = estado_id || 1;
        const prioridadPorDefecto = prioridad ;

        // Crear los mantenimientos programados
        const mantenimientosCreados = [];
        const anio = new Date(fechaInicioPrograma).getFullYear();

        for (const fecha of fechasProgramadas) {
            const codigo = await generarCodigoMantenimiento(anio);

            const mantenimiento = await MantenimientoProgramado.create({
                plan_actividad_id: actividad.id,
                codigo,
                fecha_programada: fecha.toISOString().split('T')[0],
                hora_programada: '08:00:00',
                estado_id: estadoPorDefecto,
                prioridad: prioridadPorDefecto,
                reprogramaciones: 0,
                notificacion_enviada: false,
                exigencias: exigencias ,
                observaciones: `Generado automáticamente desde: ${actividad.nombre}`
            });

            mantenimientosCreados.push(mantenimiento);
        }

        console.log(`✅ Mantenimientos creados: ${mantenimientosCreados.length}`);
        console.log('=== FIN programarActividad ===');

        res.status(201).json({
            success: true,
            message: `Se programaron ${mantenimientosCreados.length} mantenimientos exitosamente`,
            data: {
                actividad_id: actividad.id,
                actividad_nombre: actividad.nombre,
                total_programados: mantenimientosCreados.length,
                mantenimientos: mantenimientosCreados
            }
        });
    } catch (error) {
        console.error('❌ Error al programar actividad:', error);
        res.status(500).json({
            success: false,
            message: 'Error al programar los mantenimientos',
            error: error.message
        });
    }
};

// Programar mantenimientos para todo un plan (con verificación de permisos)
exports.programarPlan = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado_id, prioridad, solo_activas = true } = req.body;

        // Validación de autenticación
        if (!req.usuario) {
            return res.status(401).json({
                success: false,
                message: 'No autenticado'
            });
        }

        const usuarioId = req.usuario.id;

        // Obtener el plan con sus actividades
        const plan = await PlanMantenimiento.findByPk(id, {
            include: [
                {
                    model: PlanActividad,
                    as: 'actividades',
                    where: solo_activas === true || solo_activas === 'true' ? { activo: true } : undefined,
                    required: false
                }
            ]
        });

        if (!plan) {
            return res.status(404).json({
                success: false,
                message: 'Plan de mantenimiento no encontrado'
            });
        }

        if (!plan.actividades || plan.actividades.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'El plan no tiene actividades para programar'
            });
        }

        // Filtrar actividades según permisos del usuario
        let actividadesPermitidas = plan.actividades;

        if (!req.usuario.es_super_admin) {
            const categoriasPermitidas = await UsuarioCategoria.findAll({
                where: { usuario_id: usuarioId },
                attributes: ['categoria_id']
            });

            const categoriasIds = categoriasPermitidas.map(uc => uc.categoria_id);

            if (categoriasIds.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'No tienes categorías asignadas para programar mantenimientos'
                });
            }

            // Filtrar solo las actividades de las categorías permitidas
            actividadesPermitidas = plan.actividades.filter(
                actividad => categoriasIds.includes(actividad.categoria_id)
            );

            if (actividadesPermitidas.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'No tienes permiso para programar ninguna actividad de este plan'
                });
            }
        }

        const estadoPorDefecto = estado_id || 1;
        const prioridadPorDefecto = prioridad || 'media';
        const anio = plan.anio;

        let totalProgramados = 0;
        const resultadosPorActividad = [];

        // Programar cada actividad permitida
        for (const actividad of actividadesPermitidas) {
            try {
                // Calcular fechas según periodicidad
                const fechasProgramadas = await calcularFechasProgramacion(
                    plan.fecha_inicio,
                    plan.fecha_fin,
                    actividad.periodicidad_id
                );

                const mantenimientosActividad = [];

                for (const fecha of fechasProgramadas) {
                    const codigo = await generarCodigoMantenimiento(anio);

                    const mantenimiento = await MantenimientoProgramado.create({
                        plan_actividad_id: actividad.id,
                        codigo,
                        fecha_programada: fecha.toISOString().split('T')[0],
                        hora_programada: '08:00:00',
                        estado_id: estadoPorDefecto,
                        prioridad: prioridadPorDefecto,
                        reprogramaciones: 0,
                        notificacion_enviada: false,
                        observaciones: `Generado automáticamente desde plan: ${plan.nombre}`
                    });

                    mantenimientosActividad.push(mantenimiento);
                    totalProgramados++;
                }

                resultadosPorActividad.push({
                    actividad_id: actividad.id,
                    actividad_nombre: actividad.nombre,
                    mantenimientos_generados: mantenimientosActividad.length
                });
            } catch (error) {
                console.error(`Error al programar actividad ${actividad.id}:`, error);
                resultadosPorActividad.push({
                    actividad_id: actividad.id,
                    actividad_nombre: actividad.nombre,
                    error: error.message
                });
            }
        }

        res.status(201).json({
            success: true,
            message: `Se programaron ${totalProgramados} mantenimientos para ${resultadosPorActividad.length} actividades`,
            data: {
                plan_id: plan.id,
                plan_nombre: plan.nombre,
                anio: plan.anio,
                total_actividades_plan: plan.actividades.length,
                total_actividades_programadas: actividadesPermitidas.length,
                total_mantenimientos_programados: totalProgramados,
                detalle_por_actividad: resultadosPorActividad
            }
        });
    } catch (error) {
        console.error('Error al programar plan:', error);
        res.status(500).json({
            success: false,
            message: 'Error al programar los mantenimientos del plan',
            error: error.message
        });
    }
};

// Reprogramar mantenimientos de una actividad (con verificación de permisos)
exports.reprogramarActividad = async (req, res) => {
    try {
        const { id } = req.params;
        const { fecha_inicio, fecha_fin, eliminar_existentes = true } = req.body;

        // Validación de autenticación
        if (!req.usuario) {
            return res.status(401).json({
                success: false,
                message: 'No autenticado'
            });
        }

        const actividad = await PlanActividad.findByPk(id, {
            include: [
                {
                    model: PlanMantenimiento,
                    as: 'plan',
                    required: false
                }
            ]
        });

        if (!actividad) {
            return res.status(404).json({
                success: false,
                message: 'Actividad no encontrada'
            });
        }

        // Verificar si el usuario tiene acceso a la categoría de esta actividad
        if (!req.usuario.es_super_admin) {
            const tieneAcceso = await req.usuario.tieneAccesoCategoria(actividad.categoria_id);

            if (!tieneAcceso) {
                return res.status(403).json({
                    success: false,
                    message: 'No tienes permiso para reprogramar mantenimientos en esta categoría'
                });
            }
        }

        // Si se solicita, eliminar mantenimientos existentes pendientes
        if (eliminar_existentes === true || eliminar_existentes === 'true') {
            await MantenimientoProgramado.destroy({
                where: {
                    plan_actividad_id: id,
                    estado_id: {
                        [Op.in]: [1, 2] // Estados: Programado, Reprogramado
                    }
                }
            });
        }

        // Programar nuevamente
        const fechaInicioPrograma = fecha_inicio || (actividad.plan ? actividad.plan.fecha_inicio : null);
        const fechaFinPrograma = fecha_fin || (actividad.plan ? actividad.plan.fecha_fin : null);

        if (!fechaInicioPrograma || !fechaFinPrograma) {
            return res.status(400).json({
                success: false,
                message: 'No se pueden determinar las fechas de reprogramación'
            });
        }

        const fechasProgramadas = await calcularFechasProgramacion(
            fechaInicioPrograma,
            fechaFinPrograma,
            actividad.periodicidad_id
        );

        const mantenimientosCreados = [];
        const anio = new Date(fechaInicioPrograma).getFullYear();

        for (const fecha of fechasProgramadas) {
            const codigo = await generarCodigoMantenimiento(anio);

            const mantenimiento = await MantenimientoProgramado.create({
                plan_actividad_id: actividad.id,
                codigo,
                fecha_programada: fecha.toISOString().split('T')[0],
                hora_programada: '08:00:00',
                estado_id: 1, // Programado
                prioridad: 'media',
                reprogramaciones: 0,
                notificacion_enviada: false,
                observaciones: `Reprogramado: ${actividad.nombre}`
            });

            mantenimientosCreados.push(mantenimiento);
        }

        res.status(201).json({
            success: true,
            message: `Se reprogramaron ${mantenimientosCreados.length} mantenimientos exitosamente`,
            data: {
                actividad_id: actividad.id,
                actividad_nombre: actividad.nombre,
                total_reprogramados: mantenimientosCreados.length,
                mantenimientos: mantenimientosCreados
            }
        });
    } catch (error) {
        console.error('Error al reprogramar actividad:', error);
        res.status(500).json({
            success: false,
            message: 'Error al reprogramar los mantenimientos',
            error: error.message
        });
    }
};

// Vista previa de programación (con verificación de permisos)
exports.previsualizarProgramacion = async (req, res) => {
    try {
        const { actividad_id, fecha_inicio, fecha_fin } = req.query;

        // Validación de autenticación
        if (!req.usuario) {
            return res.status(401).json({
                success: false,
                message: 'No autenticado'
            });
        }

        if (!actividad_id) {
            return res.status(400).json({
                success: false,
                message: 'El ID de la actividad es requerido'
            });
        }

        const actividad = await PlanActividad.findByPk(actividad_id, {
            include: [
                {
                    model: PlanMantenimiento,
                    as: 'plan',
                    required: false
                }
            ]
        });

        if (!actividad) {
            return res.status(404).json({
                success: false,
                message: 'Actividad no encontrada'
            });
        }

        // Verificar si el usuario tiene acceso a la categoría de esta actividad
        if (!req.usuario.es_super_admin) {
            const tieneAcceso = await req.usuario.tieneAccesoCategoria(actividad.categoria_id);

            if (!tieneAcceso) {
                return res.status(403).json({
                    success: false,
                    message: 'No tienes permiso para previsualizar programaciones de esta categoría'
                });
            }
        }

        const fechaInicioPrograma = fecha_inicio || (actividad.plan ? actividad.plan.fecha_inicio : null);
        const fechaFinPrograma = fecha_fin || (actividad.plan ? actividad.plan.fecha_fin : null);

        if (!fechaInicioPrograma || !fechaFinPrograma) {
            return res.status(400).json({
                success: false,
                message: 'No se pueden determinar las fechas de programación'
            });
        }

        const fechasProgramadas = await calcularFechasProgramacion(
            fechaInicioPrograma,
            fechaFinPrograma,
            actividad.periodicidad_id
        );

        const preview = fechasProgramadas.map(fecha => ({
            fecha_programada: fecha.toISOString().split('T')[0],
            hora_programada: '08:00:00',
            actividad: actividad.nombre
        }));

        res.json({
            success: true,
            data: {
                actividad_id: actividad.id,
                actividad_nombre: actividad.nombre,
                periodicidad_id: actividad.periodicidad_id,
                fecha_inicio: fechaInicioPrograma,
                fecha_fin: fechaFinPrograma,
                total_a_programar: preview.length,
                fechas_programadas: preview
            }
        });
    } catch (error) {
        console.error('Error al previsualizar programación:', error);
        res.status(500).json({
            success: false,
            message: 'Error al previsualizar la programación',
            error: error.message
        });
    }
};
/**
 * Programar mantenimientos para un grupo masivo de actividades completas
 */
exports.programarGrupo = async (req, res) => {
  console.log('=== INICIO programarGrupo ===');
  
  const { grupoMasivoId } = req.params;
  const { 
    fecha_inicio, 
    fecha_fin, 
    prioridad, 
    exigencia, 
    excluir_fines_semana 
  } = req.body;

  console.log('Parámetros recibidos:', {
    grupo_masivo_id: grupoMasivoId,
    fecha_inicio,
    fecha_fin,
    prioridad,
    exigencia,
    excluir_fines_semana
  });

  const transaction = await sequelize.transaction();

  try {
    // ⚠️ VALIDACIÓN CRÍTICA: Verificar autenticación
    if (!req.usuario) {
      console.error('❌ ERROR CRÍTICO: req.usuario es undefined');
      await transaction.rollback();
      return res.status(401).json({
        success: false,
        message: 'No autenticado. El token JWT no fue procesado correctamente.'
      });
    }

    console.log('✅ Usuario autenticado:', {
      id: req.usuario.id,
      email: req.usuario.email,
      es_super_admin: req.usuario.es_super_admin
    });

    // Validaciones de parámetros
    if (!grupoMasivoId) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false,
        message: 'Se requiere el ID del grupo masivo' 
      });
    }

    if (!fecha_inicio || !fecha_fin) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false,
        message: 'Se requieren fechas de inicio y fin' 
      });
    }

    if (!prioridad || !exigencia) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false,
        message: 'Se requieren prioridad y exigencia' 
      });
    }

    // Buscar todas las actividades del grupo
    const actividades = await PlanActividad.findAll({
      where: {
        grupo_masivo_id: grupoMasivoId
      },
      include: [
        {
          model: Equipo,
          as: 'equipo',
          required: true,
          include: [
            {
              model: Sede,
              as: 'sede'
            }
          ]
        },
        {
          model: Periodicidad,
          as: 'periodicidad',
          required: true
        },
        {
          model: PlanMantenimiento,
          as: 'plan',
          required: true
        }
      ],
      transaction
    });

    if (actividades.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false,
        message: 'No se encontraron actividades para este grupo' 
      });
    }

    console.log(`✅ Actividades del grupo encontradas: ${actividades.length}`);

    // Verificar permisos (si no es super admin, verificar acceso a categorías)
    if (!req.usuario.es_super_admin) {
      console.log('⚠️ Usuario NO es super admin, verificando acceso a categorías...');
      
      for (const actividad of actividades) {
        const tieneAcceso = await req.usuario.tieneAccesoCategoria(actividad.categoria_id);
        
        if (!tieneAcceso) {
          await transaction.rollback();
          return res.status(403).json({
            success: false,
            message: `No tienes permiso para programar mantenimientos en la categoría de la actividad: ${actividad.nombre}`
          });
        }
      }
    } else {
      console.log('✅ Usuario es super admin - tiene acceso total');
    }

    const fechaInicioPrograma = fecha_inicio;
    const fechaFinPrograma = fecha_fin;

    logger.info('📅 Fechas de programación:', {
      inicio: fechaInicioPrograma,
      fin: fechaFinPrograma,
      grupo_masivo_id: grupoMasivoId
    });

    // Buscar estado "Programado" - ✅ CORREGIDO
    const estadoProgramado = await Estado.findOne({
      where: { nombre: 'Programado' },
      transaction
    });

    if (!estadoProgramado) {
      throw new Error('No se encontró el estado "Programado"');
    }

    console.log('✅ Estado encontrado:', {
      id: estadoProgramado.id,
      nombre: estadoProgramado.nombre
    });

    let totalMantenimientosCreados = 0;
    const resultadoPorActividad = [];
    const anio = new Date(fechaInicioPrograma).getFullYear();
   

    // 1. Buscamos el último código una sola vez antes de empezar los bucles
const ultimoMantenimiento = await MantenimientoProgramado.findOne({
    where: { codigo: { [Op.like]: `MNT-${anio}-%` } },
    order: [['codigo', 'DESC']],
    transaction // Importante incluir la transacción por si acaso
});

let contadorSecuencial = 1;
if (ultimoMantenimiento) {
    const ultimoNumero = parseInt(ultimoMantenimiento.codigo.split('-')[2]);
    contadorSecuencial = ultimoNumero + 1;
}

    // Procesar cada actividad del grupo
    for (const actividad of actividades) {
      console.log(`📋 Procesando actividad: ${actividad.nombre}`);      
      // Calcular fechas para esta actividad según su periodicidad
      const fechasProgramadas = await calcularFechasProgramacion(
        fechaInicioPrograma,
        fechaFinPrograma,
        actividad.periodicidad_id,
        excluir_fines_semana
      );

      console.log(`📊 Fechas generadas para ${actividad.nombre}: ${fechasProgramadas.length}`);

 

      // Crear mantenimientos para cada fecha
      for (const fecha of fechasProgramadas) {
        //const codigo = await generarCodigoMantenimiento(anio);
        const codigo = `MNT-${anio}-${String(contadorSecuencial).padStart(4, '0')}`;
        
        await MantenimientoProgramado.create({
          plan_actividad_id: actividad.id,
          codigo,
          fecha_programada: fecha.toISOString().split('T')[0],
          hora_programada: '08:00:00',
          estado_id: estadoProgramado.id, // ✅ CORREGIDO: usar .id en lugar de .id_estado
          prioridad: prioridad,
          exigencias: exigencia,
          reprogramaciones: 0,
          notificacion_enviada: false,
          observaciones: `Programación grupal (Grupo ${grupoMasivoId}) - ${actividad.nombre}`
        }, { transaction });

       contadorSecuencial++;
        totalMantenimientosCreados++;
      }

      resultadoPorActividad.push({
        id_actividad: actividad.id,
        nombre_actividad: actividad.nombre,
        equipo: actividad.equipo.nombre,
        sede: actividad.equipo.sede?.nombre || 'N/A',
        mantenimientos_creados: totalMantenimientosCreados
      });

      //console.log(`✅ ${mantenimientosCreados} mantenimientos creados para ${actividad.nombre}`);
    }

    await transaction.commit();

    console.log(`✅ TOTAL: ${totalMantenimientosCreados} mantenimientos creados para el grupo`);
    console.log('=== FIN programarGrupo ===');

    res.status(201).json({
      success: true,
      message: `Se programaron ${totalMantenimientosCreados} mantenimientos para el grupo ${grupoMasivoId} (${actividades.length} actividades)`,
      data: {
        grupo_masivo_id: grupoMasivoId,
        total_mantenimientos: totalMantenimientosCreados,
        total_actividades: actividades.length,
        detalle: resultadoPorActividad
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error en programación de grupo:', error);
    
    res.status(500).json({ 
      success: false,
      message: 'Error al programar mantenimientos del grupo',
      error: error.message 
    });
  }
};

/**
 * Programar mantenimientos masivos para múltiples actividades seleccionadas
 */
exports.programarMasivo = async (req, res) => {
  console.log('=== INICIO programarMasivo ===');
  
  const {
    ids_actividades,
    fecha_inicio,
    fecha_fin,
    prioridad,
    exigencia,
    excluir_fines_semana
  } = req.body;

  console.log('Parámetros recibidos:', {
    ids_actividades,
    fecha_inicio,
    fecha_fin,
    prioridad,
    exigencia,
    excluir_fines_semana
  });

  const transaction = await sequelize.transaction();

  try {
    // Validación de autenticación
    if (!req.usuario) {
      console.error('❌ ERROR CRÍTICO: req.usuario es undefined');
      await transaction.rollback();
      return res.status(401).json({
        success: false,
        message: 'No autenticado. El token JWT no fue procesado correctamente.'
      });
    }

    console.log('✅ Usuario autenticado:', {
      id: req.usuario.id,
      email: req.usuario.email,
      es_super_admin: req.usuario.es_super_admin
    });

    // Validaciones
    if (!ids_actividades || !Array.isArray(ids_actividades) || ids_actividades.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false,
        message: 'Se requiere un array de IDs de actividades' 
      });
    }

    if (!fecha_inicio || !fecha_fin) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false,
        message: 'Se requieren fechas de inicio y fin' 
      });
    }

    if (!prioridad || !exigencia) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false,
        message: 'Se requieren prioridad y exigencia' 
      });
    }

    // Cargar actividades
    const actividades = await PlanActividad.findAll({
      where: {
        id: ids_actividades
      },
      include: [
        {
          model: Equipo,
          as: 'equipo',
          required: true,
          include: [
            {
              model: require('../models').Sede,
              as: 'sede'
            }
          ]
        },
        {
          model: Periodicidad,
          as: 'periodicidad',
          required: true
        },
        {
          model: PlanMantenimiento,
          as: 'plan',
          required: true
        }
      ],
      transaction
    });

    if (actividades.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false,
        message: 'No se encontraron actividades válidas' 
      });
    }

    console.log(`✅ Actividades encontradas: ${actividades.length}`);

    // Verificar permisos
    if (!req.usuario.es_super_admin) {
      for (const actividad of actividades) {
        const tieneAcceso = await req.usuario.tieneAccesoCategoria(actividad.categoria_id);
        
        if (!tieneAcceso) {
          await transaction.rollback();
          return res.status(403).json({
            success: false,
            message: `No tienes permiso para programar mantenimientos en la categoría de la actividad: ${actividad.nombre}`
          });
        }
      }
    }

    const fechaInicioPrograma = fecha_inicio;
    const fechaFinPrograma = fecha_fin;

    // Buscar estado "Programado"
    const estadoProgramado = await Estado.findOne({
      where: { nombre: 'Programado' },
      transaction
    });

    if (!estadoProgramado) {
      throw new Error('No se encontró el estado "Programado"');
    }

    let totalMantenimientosCreados = 0;
    const resultadoPorActividad = [];
    const anio = new Date(fechaInicioPrograma).getFullYear();

    // Procesar cada actividad
    for (const actividad of actividades) {
      const fechasProgramadas = await calcularFechasProgramacion(
        fechaInicioPrograma,
        fechaFinPrograma,
        actividad.periodicidad_id,
        excluir_fines_semana
      );

      let mantenimientosCreados = 0;

      for (const fecha of fechasProgramadas) {
        const codigo = await generarCodigoMantenimiento(anio);

        await MantenimientoProgramado.create({
          plan_actividad_id: actividad.id,
          codigo,
          fecha_programada: fecha.toISOString().split('T')[0],
          hora_programada: '08:00:00',
          estado_id: estadoProgramado.id_estado,
          prioridad: prioridad,
          exigencias: exigencia,
          reprogramaciones: 0,
          notificacion_enviada: false,
          observaciones: `Programación masiva - ${actividad.nombre}`
        }, { transaction });

        mantenimientosCreados++;
        totalMantenimientosCreados++;
      }

      resultadoPorActividad.push({
        id_actividad: actividad.id,
        nombre_actividad: actividad.nombre,
        equipo: actividad.equipo.nombre,
        sede: actividad.equipo.sede?.nombre || 'N/A',
        mantenimientos_creados: mantenimientosCreados
      });
    }

    await transaction.commit();

    console.log(`✅ TOTAL: ${totalMantenimientosCreados} mantenimientos creados`);
    console.log('=== FIN programarMasivo ===');

    res.status(201).json({
      success: true,
      message: `Se programaron ${totalMantenimientosCreados} mantenimientos para ${actividades.length} actividades`,
      data: {
        total_mantenimientos: totalMantenimientosCreados,
        total_actividades: actividades.length,
        detalle: resultadoPorActividad
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error en programación masiva:', error);
    
    res.status(500).json({ 
      success: false,
      message: 'Error al programar mantenimientos de forma masiva',
      error: error.message 
    });
  }
};

