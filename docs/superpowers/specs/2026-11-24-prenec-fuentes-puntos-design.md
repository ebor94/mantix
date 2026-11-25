# Fuentes y puntos de Prenecesidad — diseño

**Fecha:** 2026-11-24 · **Rama:** `feat/catalogos-prenec` · **Estado:** aprobado por el usuario

## Objetivo

Al crear un prospecto de Prenecesidad deben verse exactamente las fuentes y los puntos que pidió la líder del área. Es un cambio de datos: no toca código y no requiere deploy.

## Fuentes (solo área `PRENEC`)

| Orden | Nombre | Código | Origen | Lista masiva |
|---|---|---|---|---|
| 1 | Telemercadeo | `LISTA_TELE` | renombra "Lista Telemercadeo" | Sí |
| 2 | Referido | `REFERIDO` | existe | No |
| 3 | R-95 | `R-95` | nueva | No |
| 4 | Encuestas | `ENCUESTA` | renombra "Encuesta" | No |
| 5 | Títulos | `TITULO` | renombra "Título de Propiedad" (confirmado por el usuario) | Sí |
| 6 | Base de exhumaciones | `BASE_EXHUMACIONES` | nueva | Sí |
| 7 | R-116 | `R-116` | nueva | No |
| 8 | Otros | `OTROS` | nueva | No |

Cualquier otra fuente de PRENEC se desactiva; ninguna se borra, porque los prospectos apuntan a ellas. `SALA_VELACION` y `EVENTO_PUBLICO` quedan inactivas a propósito: `salas.service` y `eventoPool.service` las buscan por código sin mirar `fuente_activa`, así que las siguen asignando, pero nadie las elige a mano. Si algún día se filtra por `fuente_activa` en esos servicios, dejarían de encontrarlas.

## Puntos (todas las áreas, por decisión del usuario)

Activos: `SJ` Punto San José, `GC` Punto Gran Colombia, `PARQUE` Punto Oficina Parque, `KIOSCO` Punto Kiosco. Los demás se desactivan (Los Olivos y Torcoroma según el seed). Los prospectos y usuarios que ya los tienen los conservan.

El selector muestra "código — nombre" y ordena por código; cambiar eso requiere código y queda fuera.

## Pruebas

En un contenedor MySQL desechable y sin red, con el seed, las fuentes de las migraciones 020 y 023 y variantes hechas a mano (una fuente `TELEMERCADEO`, un código en minúsculas, un punto `KIOSCO` previo, un punto ajeno al seed, dos prospectos con fuente y punto que se desactivan). Resultado en 8.0.46 y 8.4.11:

- las ocho fuentes y los cuatro puntos exactos;
- segunda corrida sin cambios;
- otras áreas, prospectos y usuarios sin cambios;
- la reversión con el respaldo, quitando las filas nuevas, deja las dos tablas igual que antes.

## Fuera de alcance

- La columna "PUNTO DE ATENCIÓN" del Excel de telemercadeo mezcla fuentes y puntos (PARQUE parece ser Oficina Parque): se resuelve en esa migración, que está en pausa.
- Los productos y precios 2026: diseño aparte.
