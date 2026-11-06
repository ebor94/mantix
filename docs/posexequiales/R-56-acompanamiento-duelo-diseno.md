# R-56 · Acompañamiento y apoyo al duelo — diseño

Módulo de servicios posexequiales, primer proceso: **divulgación de los
servicios de duelo y registro de la atención psicológica**.

Fecha: 2026-11-05 · Estado: aprobado, pendiente de plan de implementación

---

## 1. Qué resuelve

Hoy las dos psicólogas y la auxiliar trabajan sobre un Excel de 103 columnas
(`R-56 ACOMPAÑAMIENTO DE DUELO V7 2025`). Cada mañana consultan en Karingsoft
las órdenes del día anterior y del día en curso, se desplazan a las salas de
velación a ofrecer los servicios a los que la familia tiene derecho, y cuando
no hay sala —o el homenaje es en otra ciudad— hacen gestión telefónica. Si una
familia pide atención durante la velación, la atienden y lo registran.

El módulo reemplaza ese Excel por la bandeja del día, la bitácora de intentos,
el estado de cada servicio ofrecido y el registro de atención.

**No reemplaza** la entrega de los servicios (la conferencia, la misa, los
talleres). Eso son procesos siguientes; el próximo a especificar es la
**programación personalizada de asistencia**.

## 2. La evidencia que sostiene el diseño

Medido sobre el Excel (3008 casos, 2026-01-01 a 2026-11-05, ~300/mes) y sobre
Karingsoft y H360 en producción (ventana de 30 días).

| Hallazgo | Dato | Consecuencia de diseño |
|---|---|---|
| H360 no cubre el universo de casos | 336 órdenes en el ERP, **180** con asistencia en H360 | La bandeja sale de **Karingsoft**. H360 *enriquece* cuando el contrato coincide. Si saliera de H360 se perderían 156 familias (46%) |
| Un tercio de la carga es atención real, no divulgación | 803 «atención en el homenaje» + 138 «atención por llamada» = **941 de 3008 (31%)** | El registro de atención es una pieza de primera clase, con su propia tabla y su propio permiso |
| La ubicación del homenaje está sin normalizar | **340 valores distintos** («SALA DE VELACIÓN 06 EDEN» y «SALA DE VELACION 06 EDEN» conviven; «FUNERARIA PAEZ» 99 veces) | Lista cerrada alimentada por H360, con texto libre solo como salida de emergencia |
| Los intentos no son uno | máximo **17**, mediana 1, **469 casos (16%)** con más de 3 | Bitácora de intentos, no un contador y un campo de texto |
| Un tercio de los casos no alcanza los servicios presenciales | `FUERA DE LA CIUDAD` **1004 veces** en misa de mes | «Fuera de ciudad» es un estado del servicio, no un valor que compite con «SI» |
| El ERP no siempre tiene teléfono | 245 de 336 (**73%**) | La gestión guarda el teléfono que realmente sirvió; H360 puede tapar parte del hueco |
| Las mascotas están mezcladas en el ERP | 41/mes, prefijo `MAS-`, centro de costo propio, columna `nombres_animal` | Entran a la bandeja (decisión del negocio) **marcadas como tal** |
| Solo hay dos psicólogas | JAZMIN 1850, ELIANA 1026, ambas 124 | La psicóloga sale del login, no de un campo de texto. La atención admite una acompañante |

## 3. Actores y permisos

Un único rol funcional: **`psicologia`**, para las dos psicólogas y la
auxiliar. Autenticación por directorio activo, como el resto de H360.

**Decisión registrada y su consecuencia.** Se pidió que las tres hagan de todo
con los mismos permisos, y a la vez que las notas clínicas solo las vea
psicología. Con un rol único **la auxiliar lee las notas clínicas**: «solo
psicología» significa «el módulo, y nadie más de H360» — ni coordinación, ni
supervisión, ni contabilidad. Es coherente si las tres son el mismo equipo y
responden por lo mismo. Si se quisiera que la auxiliar no las viera, hay que
partirlo en dos roles; cambiarlo después implica migrar permisos.

`admin` conserva acceso, como en el resto del sistema.

### Dependencia externa que bloquea la entrega

Hace falta que TI **cree el grupo en el directorio activo** y que se agregue su
variable al `.env` del servidor:

```
LDAP_GROUP_PSICOLOGIA=Psicologia_360     # el nombre exacto lo define TI al crear el grupo
```

Sin esto el rol existe en el código y nadie puede entrar. Ya pasó con
recepción. El repo no lleva el inventario de estas variables, así que se
documenta acá.

## 4. De dónde sale la bandeja

Fuente: `salas_ordenes_view` en Karingsoft, **solo lectura** (H360 nunca
escribe en el ERP), con `tipo_documento = 50` y `fecha` entre ayer y hoy — el
rango es un parámetro, el defecto son esos dos días.

Se cruza por número de contrato (`orden_servicio`) contra:

- **`asistencias`** de H360 → aporta sala, sede y hora de encuentro cuando el
  caso existe en 360. Es el «apalancarnos en home360».
- **`h360_duelo_gestion`** → dice qué ya se trabajó y qué falta.

Campos del ERP que el módulo aprovecha, además de los tres de búsqueda:
`telefono_fallecido`, `direccion_fallecido`, `barrio_fallecido`,
`municipio_fallecido`, `edad_fallecimiento`, `causa_deceso`, `convenio`,
`entidad`, `descripcion_centro_costo`.

### Búsqueda

Tres criterios, como se pidió:

1. **Número de contrato** — `orden_servicio`, exacto.
2. **Nombre del ser querido** — `LIKE` sobre la concatenación de
   `primer_apellido_fallecido`, `segundo_apellido_fallecido` y
   `nombres_fallecido`, sin tildes ni dobles espacios.
3. **Fecha de fallecimiento** — `fecha_fallecimiento`, con rango opcional.

### Las tres ramas de gestión

Se derivan de los datos, no se eligen a mano:

Cada fila de la bandeja dice además **si la rama está confirmada o es una
suposición**. Está confirmada cuando sale de la ubicación de la asistencia de
H360 o cuando hay una señal que dice que el servicio es de otra ciudad —el
convenio `OLIVOS <ciudad>` o una sede foránea conocida—; no lo está cuando es el
valor por defecto —que es casi la mitad de las filas, y justo las más
recientes—. Sin esa distinción la pantalla afirmaba «Residencia» como hecho y
una psicóloga podía planificar una visita a domicilio para un caso donde
todavía nadie sabe dónde va a ser la velación.

Una sede que **no** es local y que tampoco se reconoce como foránea se gestiona
como otra ciudad, pero **sin confirmar**: una sede desconocida no es un dato,
es la ausencia de uno. Si el ERP gana un centro de costo o renombra uno local,
esas familias caen en la rama telefónica, y afirmarlo las dejaría con la
insignia plena de «otra ciudad» sin que nadie las visite ni las llame como
locales. La lista de sedes foráneas conocidas vive en el controlador y hoy está
**vacía**: no hay centros de costo foráneos medidos, y el convenio sigue siendo
la señal que confirma.

| Rama | Cómo se detecta | Gestión |
|---|---|---|
| **Sala de velación** | H360 tiene homenaje en sala → sede y sala conocidas | Visita presencial. Gran Colombia concentra 239 de 336; San José solo 7 |
| **Residencia** | H360 tiene homenaje en residencia | Gestión telefónica o visita a la dirección (`direccion_fallecido` del ERP) |
| **Otra ciudad** | El convenio es de otra sucursal de Olivos (`OLIVOS <ciudad>`: Bucaramanga, Bogotá, Barrancabermeja…) o la sede es una foránea conocida (hoy ninguna): rama **confirmada**. Una sede que no es local y que nadie reconoce también cae aquí, pero **sin confirmar**. Que no haya caso en 360 no la decide: con sede local (o sin sede) la orden es Residencia sin confirmar | Solo gestión telefónica. Los servicios presenciales quedan `FUERA_DE_CIUDAD` |

## 5. Modelo de datos

Prefijo `h360_` obligatorio: la base `serfuweb` es compartida con el core de
Mantix y una tabla sin prefijo contamina datos ajenos.

**Ningún dato del ERP se copia.** Igual que el R-34 hoy, el contrato se lee en
vivo al mostrar la ficha. Acá vive solo lo que es nuestro.

### `h360_duelo_gestion` — una fila por orden trabajada

| Columna | Tipo | Notas |
|---|---|---|
| `id` | INT UNSIGNED PK | |
| `orden_servicio` | VARCHAR(20) NOT NULL **UNIQUE** | El contrato. Único: una orden se gestiona una vez |
| `asistencia_id` | INT UNSIGNED NULL | Caso de H360 cuando existe. Nulo en el 46% |
| `ubicacion_tipo` | ENUM('SALA','RESIDENCIA','OTRA_CIUDAD','EXTERNA','OTRO') NOT NULL | |
| `ubicacion_detalle` | VARCHAR(120) NULL | Sala y sede desde H360; texto libre solo si no hay forma |
| `es_mascota` | TINYINT(1) NOT NULL DEFAULT 0 | Del prefijo `MAS-` y el centro de costo |
| `titular_nombre` | VARCHAR(160) NULL | Con quién se habló |
| `titular_parentesco` | VARCHAR(40) NULL | Catálogo `parentesco` del ERP |
| `telefonos` | VARCHAR(120) NULL | El o los que sirvieron. El Excel guarda dos separados por guion |
| `tipificacion` | ENUM NULL | Nula mientras no se haya trabajado la gestión: nace `PENDIENTE` y todavía no hay nada que tipificar. Vocabulario del R-56, para el reporte: `OFRECIDO_EN_HOMENAJE`, `ATENCION_EN_HOMENAJE`, `OFRECIDO_POR_LLAMADA`, `ATENCION_POR_LLAMADA`, `OFRECIDO_POR_MENSAJE`, `COORDINA_ASISTENCIA`, `NO_CONTESTO`, `REPETIDO` |
| `estado` | ENUM NOT NULL DEFAULT 'PENDIENTE' | Para la bandeja: `PENDIENTE`, `EN_GESTION`, `GESTIONADA`, `NO_LOGRADA`, `NO_APLICA`, `REPETIDA` |
| `observaciones` | TEXT NULL | |
| `psicologa` | VARCHAR(50) NOT NULL | Quién tiene el caso **ahora**. Sale del login al crear y **se puede reasignar**: una psicóloga sale de turno, se incapacita o entra a vacaciones, y la otra continúa. La auditoría no se pierde porque `created_by` guarda quién lo abrió y no es editable |
| `psicologa_acompanante` | VARCHAR(50) NULL | Los 124 casos atendidos por las dos |
| `cerrada_at` | DATETIME NULL | |
| `created_by`, `created_at`, `updated_at` | | |

`tipificacion` y `estado` no son lo mismo y no son duplicación: la primera es
la palabra que el R-56 exige en su columna; el segundo es lo que mueve la
bandeja. Un caso puede estar `GESTIONADA` con tipificación
`OFRECIDO_POR_MENSAJE`.

### `h360_duelo_intentos` — N por gestión

| Columna | Tipo | Notas |
|---|---|---|
| `id` | INT UNSIGNED PK | |
| `gestion_id` | INT UNSIGNED NOT NULL → `h360_duelo_gestion` | |
| `momento` | DATETIME NOT NULL | Reemplaza la hora escrita dentro de la observación |
| `canal` | ENUM('VISITA_SALA','VISITA_RESIDENCIA','LLAMADA','MENSAJE','WHATSAPP') NOT NULL | |
| `resultado` | ENUM('CONTACTADO','NO_CONTESTO','NUMERO_ERRADO','NO_DISPONIBLE','RECHAZA') NOT NULL | |
| `observacion` | TEXT NULL | |
| `usuario` | VARCHAR(50) NOT NULL | |
| `created_at` | | |

Índice en `(gestion_id, momento)`. El contador de intentos del R-56 se calcula
contando filas; no se guarda, para que no se desfase.

### `h360_duelo_servicios` — hasta 6 por gestión

| Columna | Tipo | Notas |
|---|---|---|
| `id` | INT UNSIGNED PK | |
| `gestion_id` | INT UNSIGNED NOT NULL → `h360_duelo_gestion` | |
| `servicio` | ENUM('CARTILLA_RENACER','CONFERENCIA_RENACER','MISA_DE_MES','TALLER_NINOS','GRUPO_APOYO_HIJOS','TALLER_JOVENES') NOT NULL | |
| `estado` | ENUM('ACEPTA','NO_DESEA','NO_APLICA','OFRECIDO_SIN_RESPUESTA','FUERA_DE_CIUDAD','DESISTE') NOT NULL | |
| `modalidad` | ENUM('PRESENCIAL','VIRTUAL','MENSAJE') NULL | El `SI` / `SIV` del Excel |
| `detalle` | VARCHAR(60) NULL | Religión en misa de mes: `CRISTIANA`, `CATOLICA`, `MIXTA`, `MUSULMANA`, `TESTIGOS_JEHOVA` |
| `observacion` | VARCHAR(255) NULL | |

`UNIQUE (gestion_id, servicio)`. Las tres cosas que el Excel mezcla en una
celda —si acepta, por qué medio, y por qué no aplica— quedan en columnas
distintas.

Los 6 servicios van como constante en código, no como tabla de catálogo: son
estables desde hace un año y agregar uno es un cambio de dos líneas. Si se
espera que cambien seguido, conviene la tabla; no se hace ahora por no
construir lo que nadie pidió.

### `h360_duelo_atenciones` — dato sensible, tabla aparte

| Columna | Tipo | Notas |
|---|---|---|
| `id` | INT UNSIGNED PK | |
| `gestion_id` | INT UNSIGNED NOT NULL → `h360_duelo_gestion` | |
| `momento` | DATETIME NOT NULL | |
| `modalidad` | ENUM('PRESENCIAL','TELEFONICA','VIRTUAL') NOT NULL | |
| `psicologa` | VARCHAR(50) NOT NULL | |
| `acompanante` | VARCHAR(50) NULL | |
| `atendido_nombre` | VARCHAR(160) NULL | A quién se atendió |
| `atendido_parentesco` | VARCHAR(40) NULL | |
| `motivo` | VARCHAR(200) NULL | Una línea |
| `notas` | TEXT NULL | **Contenido clínico. Acceso restringido** |
| `created_by`, `created_at`, `updated_at` | | |

Está en su propia tabla para que el permiso sea a nivel de tabla y para poder
excluirla de consultas y exportes generales sin acordarse de filtrar columnas.

## 5bis. Cómo se cierra una gestión

El pedido original era saber **a cuáles ya se les hizo gestión**, así que poder
cerrar un caso no es un detalle: sin eso la psicóloga ve los mismos casos todos
los días y tiene que acordarse de memoria, que es el Excel otra vez.

Se cierra con **un solo selector**, con las palabras del R-56 que el equipo ya
usa. De esa elección se deducen la tipificación y el estado, para que no haya
dos campos que llenar ni combinaciones sin sentido. La correspondencia sale de
medir los 3008 casos del año:

| Lo que elige | `tipificacion` | `estado` |
|---|---|---|
| Ofrecido en el homenaje | `OFRECIDO_EN_HOMENAJE` | `GESTIONADA` |
| Atención en el homenaje | `ATENCION_EN_HOMENAJE` | `GESTIONADA` |
| Ofrecido por llamada | `OFRECIDO_POR_LLAMADA` | `GESTIONADA` |
| Atención por llamada | `ATENCION_POR_LLAMADA` | `GESTIONADA` |
| Ofrecido por mensaje | `OFRECIDO_POR_MENSAJE` | `GESTIONADA` |
| **Coordina una atención** | `COORDINA_ASISTENCIA` | **`EN_GESTION`** |
| No contestó | `NO_CONTESTO` | `NO_LOGRADA` |
| Repetido | `REPETIDO` | `REPETIDA` |
| No aplica | *(ninguna)* | `NO_APLICA` |

**«Coordina una atención» no cierra el caso**, y la pantalla lo dice antes de
guardar: si se está coordinando una atención para más adelante, alguien
todavía tiene que ir. Eran 33 casos en el año y quedarían marcados como
terminados sin estarlo.

Una gestión cerrada **se puede reabrir** eligiendo esa opción. Al reabrirse se
borra la hora de cierre, así que un cierre posterior toma su propia hora; la
pantalla avisa de eso antes de guardar.

## 6. Privacidad

Las notas de atención son datos de salud de un tercero. La Ley 1581 de 2012 los
trata como sensibles y exige autorización previa y acceso restringido.

Lo que el diseño hace:

- `notas` vive en una tabla aparte, no en la gestión.
- Solo el rol `psicologia` y `admin` leen `h360_duelo_atenciones`. El permiso se
  aplica en el controlador **y** se verifica en pruebas.
- Ninguna respuesta del módulo fuera de `GET /gestion/:id/atenciones` incluye
  `notas` — ni la bandeja, ni la ficha, ni las métricas, que usan conteos de
  atención y no su contenido. La regla aplica igual al exporte del R-56 cuando
  se construya.
- Las notas no se escriben a ningún log.

Lo que el diseño **no** resuelve, y hay que saberlo:

- La base `serfuweb` es compartida con el core de Mantix y **los respaldos salen
  completos**. Quien tenga acceso al respaldo tiene las notas. Cifrarlas en
  columna o separarlas de base es una decisión aparte, con su costo.
- No se registra consentimiento de la familia. Si se considera necesario, es un
  campo más en la atención y hay que definir quién y cómo lo recoge.

## 7. API

Todo bajo `/api/h360/duelo`, rol `psicologia` o `admin`.

| Método y ruta | Qué hace |
|---|---|
| `GET /bandeja?desde=&hasta=&sede=&estado=&incluir_mascotas=` | Órdenes del ERP del rango, enriquecidas con H360 y con el estado de gestión. Defecto: ayer y hoy. Máximo **90 días** por consulta: un año son ~3008 órdenes y la petición se queda sin responder en vez de tardar |
| `GET /buscar?contrato=&nombre=&fecha_fallecimiento=&fecha_hasta=` | Los tres criterios de búsqueda |
| `GET /gestion/:orden_servicio` | Ficha: contrato en vivo del ERP + datos de 360 + gestión + intentos + servicios. La asistencia de H360 trae `nombre_contacto` y `telefono_contacto` (§11) |
| `POST /gestion` | Abre la gestión de una orden. El cuerpo manda `sede` (del ERP) y **no** `es_mascota`: eso lo calcula el servidor con el mismo criterio de la bandeja. Un texto más largo que su columna, una orden de más de 20 caracteres o un `asistencia_id` que no es un número, 400 |
| `PATCH /gestion/:id` | Ubicación, titular, teléfonos, tipificación, estado, observaciones. Un id que no existe es 404; un texto más largo que su columna o un `asistencia_id` que no es un número (`null` lo desvincula), 400. El 400 dice el campo, el tope y el largo que llegó, nunca el texto: son cosas que contó una familia |
| `POST /gestion/:id/intentos` | Registra un intento |
| `PUT /gestion/:id/servicios` | Guarda de una vez el estado de los 6 servicios |
| `GET /gestion/:id/atenciones` | **Restringido.** Las atenciones con sus notas |
| `POST /gestion/:id/atenciones` | **Restringido.** Registra una atención |

Cuando el ERP no responde, `/bandeja` y `/buscar` devuelven 503 con un mensaje
que lo dice; la ficha de una gestión ya abierta sigue funcionando sin los datos
del contrato, igual que hace hoy el bloque del ERP en el detalle de asistencia.

## 8. Pantallas

| Ruta | Para qué |
|---|---|
| `/duelo` | Bandeja del día: ayer y hoy, con filtro por sede, estado y mascotas. Cada fila dice de qué rama es y qué le falta |
| `/duelo/buscar` | Búsqueda por contrato, nombre o fecha de fallecimiento |
| `/duelo/:orden` | Ficha de gestión: contrato del ERP, datos de 360, bitácora de intentos, los 6 servicios, y el bloque de atenciones |

El bloque de atenciones solo se renderiza para quien puede leerlo; no se oculta
con CSS.

## 9. Pruebas

- Normalización de los valores del R-56 (`SIV` → virtual, `FUERA DE LA CIUDAD` →
  estado, religión en misa de mes), con los valores reales medidos del Excel.
- Búsqueda por los tres criterios, incluida la de nombre sin tildes.
- La bandeja marca correctamente lo ya gestionado y no pierde órdenes sin caso
  en H360.
- `incluir_mascotas` las separa sin ocultarlas.
- **Permisos**: un rol que no es `psicologia` recibe 403 en las rutas de
  atenciones, y ninguna otra respuesta del módulo —bandeja, búsqueda, ficha—
  trae el campo `notas`, ni siquiera para quien sí puede leerlo.
- Degradación: con el ERP caído, la bandeja responde 503 y la ficha abierta no
  se rompe.

## 10. Fuera de este alcance

Cada uno es una decisión pendiente, no un olvido:

1. **Entrega de los servicios** — la conferencia Renacer, la misa de mes, los
   talleres y el grupo de apoyo, con sus listas y asistentes. Son los procesos
   siguientes. El próximo a especificar es la **programación personalizada de
   asistencia**.
2. **Informe e indicadores de posexequiales.** Decidido: no se hace exporte del
   R-56 con su formato. El informe y los indicadores se construyen después, como
   pieza propia, sobre los datos que este módulo ya deja estructurados.
   Consecuencia asumida: hasta entonces el Excel sigue siendo el registro formal
   que se entrega, y el módulo convive con él en vez de reemplazarlo.
3. **Migración de los 3008 casos de 2026.** Es viable —los valores están
   medidos y se pueden mapear— pero hay 340 ubicaciones distintas y valores
   mezclados que exigen criterio caso por caso.
4. **Cifrado de las notas o base aparte**, por el asunto de los respaldos.
5. **Registro de consentimiento** de la familia para el tratamiento de datos.

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| El grupo del AD no se crea a tiempo | Pedirlo ya; bloquea la entrega entera |
| El ERP se cae y la bandeja es inusable | 503 explícito; la gestión abierta sigue sirviendo |
| 91 de 336 órdenes sin teléfono | Se completa con el contacto de H360 cuando el caso existe; el resto queda `NO_LOGRADA` con su bitácora |
| Las notas clínicas salen en los respaldos completos | Documentado arriba; decisión pendiente |
| La auxiliar lee notas clínicas | Consecuencia aceptada del rol único; registrado en §3 |
