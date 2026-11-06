# R-56 Acompañamiento al duelo — Plan de implementación

> **Para quien ejecute esto con agentes:** SUB-SKILL REQUERIDA — usar
> `superpowers:subagent-driven-development` (recomendado) o
> `superpowers:executing-plans` para ir tarea por tarea. Los pasos usan
> casillas (`- [ ]`) para llevar el control.

**Objetivo:** reemplazar el Excel R-56 por un módulo donde las psicólogas vean
la bandeja del día desde Karingsoft, registren intentos y servicios ofrecidos,
y dejen el registro de atención psicológica con acceso restringido.

**Arquitectura:** la bandeja se arma leyendo el ERP en vivo (SQL Server, solo
lectura) y cruzando por número de contrato contra las asistencias de H360 —que
aportan sala y sede— y contra la gestión ya hecha en MySQL. Nada del ERP se
copia; en MySQL vive solo lo que es nuestro. El registro clínico va en tabla,
servicio y controlador aparte para que el permiso sea una frontera de archivo y
no un `if` perdido.

**Stack:** Node 18 + Express 4, `mysql2` crudo (sin ORM en h360), `mssql` para
el ERP, Jest. Frontend Vue 3 + Pinia + Tailwind.

**Especificación:** `docs/posexequiales/R-56-acompanamiento-duelo-diseno.md`

## Restricciones globales

Aplican a todas las tareas:

- **Prefijo `h360_` obligatorio** en toda tabla nueva. La base `serfuweb` es
  compartida con el core de Mantix; una tabla sin prefijo contamina datos ajenos.
- **H360 nunca escribe en Karingsoft.** Solo `SELECT`.
- **No se copian datos del ERP.** El contrato se lee en vivo al mostrar la ficha.
- **El campo `notas` solo viaja en `GET /duelo/gestion/:id/atenciones`.** Ninguna
  otra respuesta lo incluye, ni para quien puede leerlo.
- **Rol único `psicologia`** (dos psicólogas + auxiliar), más `admin`.
- **Las fechas y horas que vienen de un input no pasan por `Date`.** Usar
  `normalizarFechaHora` de `src/h360/utils/fecha_hora.js`: convertir a UTC
  movería una atención de las 14:30 a las 19:30.
- **La migración se aplica a mano ANTES de desplegar el código.**
  `deploy-mantix` no corre migraciones. Si el código sale primero, todo
  `INSERT` falla — ya pasó el 2026-11-04.
- Pruebas: `npx jest <ruta>` desde `mantix-backend/`.
- Comentarios y mensajes de usuario en español, como el resto de h360.

## Dependencia externa que bloquea la entrega

Antes de la Tarea 2 alguien de TI tiene que crear el grupo en el directorio
activo y agregar al `.env` del servidor:

```
LDAP_GROUP_PSICOLOGIA=Psicologia_360
```

Sin eso el rol existe en el código y nadie puede entrar. **Pedirlo el día uno.**

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/scripts/h360_duelo_tablas.sql` | Las 4 tablas |
| `src/h360/utils/duelo.catalogos.js` | Vocabulario del módulo: servicios, estados, canales, helpers puros |
| `src/h360/services/karingsoft.service.js` *(modificar)* | Dos consultas nuevas al ERP: rango y búsqueda |
| `src/h360/services/duelo.service.js` | Acceso a MySQL: gestión, intentos, servicios |
| `src/h360/services/duelo_atenciones.service.js` | Acceso a MySQL de las atenciones. Aparte **a propósito** |
| `src/h360/controllers/duelo.controller.js` | HTTP: bandeja, búsqueda, gestión, intentos, servicios |
| `src/h360/controllers/duelo_atenciones.controller.js` | HTTP de las atenciones |
| `src/h360/routes/duelo.routes.js` | Rutas con `requireRol` |
| `src/h360/routes/index.js` *(modificar)* | Montar `/duelo` |
| `src/h360/services/ldap.service.js` *(modificar)* | Rol `psicologia` |
| `homenajes360-frontend/src/stores/duelo.js` | Store Pinia |
| `homenajes360-frontend/src/views/duelo/BandejaDueloView.vue` | Bandeja del día |
| `homenajes360-frontend/src/views/duelo/GestionDueloView.vue` | Ficha de gestión |
| `homenajes360-frontend/src/router/index.js` *(modificar)* | Rutas `/duelo` |
| `homenajes360-frontend/src/utils/roles.js` *(modificar)* | Etiqueta del rol |

---

### Tarea 1: Tablas y vocabulario del módulo

**Archivos:**
- Crear: `src/scripts/h360_duelo_tablas.sql`
- Crear: `src/h360/utils/duelo.catalogos.js`
- Prueba: `src/h360/utils/__tests__/duelo.catalogos.test.js`

**Interfaces:**
- Produce: `SERVICIOS`, `ESTADOS_SERVICIO`, `MODALIDADES`, `RELIGIONES_MISA`,
  `TIPIFICACIONES`, `ESTADOS_GESTION`, `CANALES_INTENTO`, `RESULTADOS_INTENTO`,
  `UBICACIONES` (arreglos de cadenas) y `esMascota({ orden_servicio, sede })`
  → `boolean`.

- [ ] **Paso 1: Escribir la prueba que falla**

```js
// src/h360/utils/__tests__/duelo.catalogos.test.js
const cat = require('../duelo.catalogos')

describe('catálogos del módulo de duelo', () => {
  test('los seis servicios del R-56, sin repetidos', () => {
    expect(cat.SERVICIOS).toEqual([
      'CARTILLA_RENACER', 'CONFERENCIA_RENACER', 'MISA_DE_MES',
      'TALLER_NINOS', 'GRUPO_APOYO_HIJOS', 'TALLER_JOVENES',
    ])
    expect(new Set(cat.SERVICIOS).size).toBe(cat.SERVICIOS.length)
  })

  // FUERA_DE_CIUDAD es un estado y no un valor que compita con ACEPTA:
  // en el Excel aparecía 1004 veces dentro de la misma celda del "SI".
  test('fuera de ciudad es un estado del servicio', () => {
    expect(cat.ESTADOS_SERVICIO).toContain('FUERA_DE_CIUDAD')
    expect(cat.ESTADOS_SERVICIO).toContain('ACEPTA')
  })

  test('la modalidad separa presencial de virtual', () => {
    expect(cat.MODALIDADES).toEqual(['PRESENCIAL', 'VIRTUAL', 'MENSAJE'])
  })
})

describe('esMascota', () => {
  test('la reconoce por el prefijo de la orden', () => {
    expect(cat.esMascota({ orden_servicio: 'MAS-0596' })).toBe(true)
  })

  test('la reconoce por el centro de costo', () => {
    expect(cat.esMascota({ orden_servicio: '03233', sede: 'Mascotas' })).toBe(true)
  })

  test('un servicio de persona no es mascota', () => {
    expect(cat.esMascota({ orden_servicio: 'A-20538', sede: 'Sede Gran Colombia' })).toBe(false)
  })

  test('sin datos no la da por mascota', () => {
    expect(cat.esMascota({})).toBe(false)
    expect(cat.esMascota(undefined)).toBe(false)
  })
})
```

- [ ] **Paso 2: Correr la prueba y verificar que falla**

Correr: `npx jest src/h360/utils/__tests__/duelo.catalogos.test.js`
Esperado: FAIL — `Cannot find module '../duelo.catalogos'`

- [ ] **Paso 3: Escribir el catálogo**

```js
// src/h360/utils/duelo.catalogos.js
/**
 * duelo.catalogos.js
 * Vocabulario del R-56. Va en código y no en tabla de catálogo: los seis
 * servicios no han cambiado en un año y agregar uno es una línea. Si empiezan
 * a cambiar seguido, conviene la tabla.
 *
 * Los valores salen de medir el Excel que llevan hoy, no de inventarlos.
 */
const SERVICIOS = [
  'CARTILLA_RENACER', 'CONFERENCIA_RENACER', 'MISA_DE_MES',
  'TALLER_NINOS', 'GRUPO_APOYO_HIJOS', 'TALLER_JOVENES',
]

/**
 * El Excel metía tres cosas distintas en una celda: si la familia acepta, por
 * qué medio se le ofreció, y por qué no le aplica. Acá son columnas separadas.
 */
const ESTADOS_SERVICIO = [
  'ACEPTA', 'NO_DESEA', 'NO_APLICA',
  'OFRECIDO_SIN_RESPUESTA', 'FUERA_DE_CIUDAD', 'DESISTE',
]

const MODALIDADES = ['PRESENCIAL', 'VIRTUAL', 'MENSAJE']

/** Solo aplica a la misa de mes. */
const RELIGIONES_MISA = ['CRISTIANA', 'CATOLICA', 'MIXTA', 'MUSULMANA', 'TESTIGOS_JEHOVA']

/** La palabra que el R-56 exige en su columna de tipificación. */
const TIPIFICACIONES = [
  'OFRECIDO_EN_HOMENAJE', 'ATENCION_EN_HOMENAJE',
  'OFRECIDO_POR_LLAMADA', 'ATENCION_POR_LLAMADA',
  'OFRECIDO_POR_MENSAJE', 'COORDINA_ASISTENCIA',
  'NO_CONTESTO', 'REPETIDO',
]

/** Lo que mueve la bandeja. No es lo mismo que la tipificación. */
const ESTADOS_GESTION = [
  'PENDIENTE', 'EN_GESTION', 'GESTIONADA', 'NO_LOGRADA', 'NO_APLICA', 'REPETIDA',
]

const CANALES_INTENTO = [
  'VISITA_SALA', 'VISITA_RESIDENCIA', 'LLAMADA', 'MENSAJE', 'WHATSAPP',
]

const RESULTADOS_INTENTO = [
  'CONTACTADO', 'NO_CONTESTO', 'NUMERO_ERRADO', 'NO_DISPONIBLE', 'RECHAZA',
]

const UBICACIONES = ['SALA', 'RESIDENCIA', 'OTRA_CIUDAD', 'EXTERNA', 'OTRO']

/**
 * El ERP mezcla servicios de mascotas con los de personas: 41 al mes. Se
 * reconocen por el prefijo de la orden o por su centro de costo propio.
 * Entran a la bandeja marcadas, no se esconden.
 */
function esMascota(orden) {
  const num  = String(orden?.orden_servicio ?? '').trim().toUpperCase()
  const sede = String(orden?.sede ?? '').trim().toUpperCase()
  return num.startsWith('MAS-') || sede === 'MASCOTAS'
}

module.exports = {
  SERVICIOS, ESTADOS_SERVICIO, MODALIDADES, RELIGIONES_MISA,
  TIPIFICACIONES, ESTADOS_GESTION, CANALES_INTENTO, RESULTADOS_INTENTO,
  UBICACIONES, esMascota,
}
```

- [ ] **Paso 4: Correr la prueba y verificar que pasa**

Correr: `npx jest src/h360/utils/__tests__/duelo.catalogos.test.js`
Esperado: PASS, 7 pruebas

- [ ] **Paso 5: Escribir la migración**

```sql
-- src/scripts/h360_duelo_tablas.sql
-- R-56 Acompañamiento y apoyo al duelo. Diseño en
-- docs/posexequiales/R-56-acompanamiento-duelo-diseno.md
--
-- Prefijo h360_ obligatorio: serfuweb es compartida con el core de Mantix.
-- Nada del ERP se copia acá; el contrato se lee en vivo de Karingsoft.

CREATE TABLE h360_duelo_gestion (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  orden_servicio        VARCHAR(20)  NOT NULL
                          COMMENT 'Contrato en Karingsoft. Es el vínculo entre los dos sistemas',
  asistencia_id         INT UNSIGNED NULL
                          COMMENT 'Caso en H360 cuando existe: nulo en el 46% de las órdenes',
  ubicacion_tipo        ENUM('SALA','RESIDENCIA','OTRA_CIUDAD','EXTERNA','OTRO') NOT NULL,
  ubicacion_detalle     VARCHAR(120) NULL
                          COMMENT 'Sala y sede desde H360; texto libre solo cuando no hay forma',
  es_mascota            TINYINT(1)   NOT NULL DEFAULT 0,
  titular_nombre        VARCHAR(160) NULL COMMENT 'Con quién se habló',
  titular_parentesco    VARCHAR(40)  NULL,
  telefonos             VARCHAR(120) NULL COMMENT 'El o los que realmente sirvieron',
  tipificacion          ENUM('OFRECIDO_EN_HOMENAJE','ATENCION_EN_HOMENAJE',
                             'OFRECIDO_POR_LLAMADA','ATENCION_POR_LLAMADA',
                             'OFRECIDO_POR_MENSAJE','COORDINA_ASISTENCIA',
                             'NO_CONTESTO','REPETIDO') NULL
                          COMMENT 'Vocabulario del R-56, para el informe',
  estado                ENUM('PENDIENTE','EN_GESTION','GESTIONADA','NO_LOGRADA',
                             'NO_APLICA','REPETIDA') NOT NULL DEFAULT 'PENDIENTE'
                          COMMENT 'Lo que mueve la bandeja. No es la tipificación',
  observaciones         TEXT         NULL,
  psicologa             VARCHAR(50)  NOT NULL COMMENT 'sAMAccountName, sale del login',
  psicologa_acompanante VARCHAR(50)  NULL COMMENT 'Cuando atienden las dos',
  cerrada_at            DATETIME     NULL,
  created_by            VARCHAR(50)  NOT NULL,
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_orden (orden_servicio),
  KEY idx_estado (estado),
  KEY idx_asistencia (asistencia_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Los intentos llegan a 17 en el Excel, con mediana 1 y 469 casos por encima
-- de 3. Un contador y un campo de texto no alcanzan.
CREATE TABLE h360_duelo_intentos (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  gestion_id  INT UNSIGNED NOT NULL,
  momento     DATETIME     NOT NULL COMMENT 'Reemplaza la hora escrita dentro de la observación',
  canal       ENUM('VISITA_SALA','VISITA_RESIDENCIA','LLAMADA','MENSAJE','WHATSAPP') NOT NULL,
  resultado   ENUM('CONTACTADO','NO_CONTESTO','NUMERO_ERRADO','NO_DISPONIBLE','RECHAZA') NOT NULL,
  observacion TEXT         NULL,
  usuario     VARCHAR(50)  NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_gestion (gestion_id, momento),
  CONSTRAINT fk_intento_gestion FOREIGN KEY (gestion_id)
    REFERENCES h360_duelo_gestion (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE h360_duelo_servicios (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  gestion_id  INT UNSIGNED NOT NULL,
  servicio    ENUM('CARTILLA_RENACER','CONFERENCIA_RENACER','MISA_DE_MES',
                   'TALLER_NINOS','GRUPO_APOYO_HIJOS','TALLER_JOVENES') NOT NULL,
  estado      ENUM('ACEPTA','NO_DESEA','NO_APLICA',
                   'OFRECIDO_SIN_RESPUESTA','FUERA_DE_CIUDAD','DESISTE') NOT NULL,
  modalidad   ENUM('PRESENCIAL','VIRTUAL','MENSAJE') NULL COMMENT 'El SI / SIV del Excel',
  detalle     VARCHAR(60)  NULL COMMENT 'Religión, solo en misa de mes',
  observacion VARCHAR(255) NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_gestion_servicio (gestion_id, servicio),
  CONSTRAINT fk_servicio_gestion FOREIGN KEY (gestion_id)
    REFERENCES h360_duelo_gestion (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Dato de salud de un tercero. Tabla aparte para que el permiso sea a nivel de
-- tabla y para poder excluirla de consultas generales sin acordarse de filtrar
-- columnas. Ley 1581 de 2012: dato sensible.
CREATE TABLE h360_duelo_atenciones (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  gestion_id          INT UNSIGNED NOT NULL,
  momento             DATETIME     NOT NULL,
  modalidad           ENUM('PRESENCIAL','TELEFONICA','VIRTUAL') NOT NULL,
  psicologa           VARCHAR(50)  NOT NULL,
  acompanante         VARCHAR(50)  NULL,
  atendido_nombre     VARCHAR(160) NULL,
  atendido_parentesco VARCHAR(40)  NULL,
  motivo              VARCHAR(200) NULL COMMENT 'Una línea',
  notas               TEXT         NULL COMMENT 'CONTENIDO CLINICO. Acceso restringido a rol psicologia',
  created_by          VARCHAR(50)  NOT NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_gestion (gestion_id, momento),
  CONSTRAINT fk_atencion_gestion FOREIGN KEY (gestion_id)
    REFERENCES h360_duelo_gestion (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Paso 6: Commit**

```bash
git add src/scripts/h360_duelo_tablas.sql src/h360/utils/duelo.catalogos.js \
        src/h360/utils/__tests__/duelo.catalogos.test.js
git commit -m "feat(h360): tablas y vocabulario del R-56 de duelo"
```

---

### Tarea 2: Rol `psicologia`

**Archivos:**
- Modificar: `src/h360/services/ldap.service.js` (arreglo `ROLES_POR_GRUPO`)
- Modificar: `homenajes360-frontend/src/utils/roles.js`
- Prueba: `src/h360/services/__tests__/ldap.validarCredenciales.test.js` (agregar caso)

**Interfaces:**
- Consume: nada de tareas anteriores.
- Produce: el rol `'psicologia'` en el token JWT, usable por `requireRol`.

- [ ] **Paso 1: Escribir la prueba que falla**

Agregar al final de `src/h360/services/__tests__/ldap.validarCredenciales.test.js`:

```js
describe('el rol de psicología sale de su grupo del directorio', () => {
  const DN_PSICOLOGIA = ['CN=Psicologia_360,OU=Grupos,DC=olivos,DC=local']

  test('quien está en el grupo de psicología entra con ese rol', () => {
    process.env.LDAP_GROUP_PSICOLOGIA = 'Psicologia_360'
    expect(detectarRoles(DN_PSICOLOGIA)).toContain('psicologia')
  })

  // Sin la variable de entorno el grupo no entra al mapa y detectarRoles
  // devuelve []. Es el modo de falla que dejó a recepción sin poder entrar: el
  // rol existía en el código y nadie avisaba de que faltaba la variable.
  test('sin la variable de entorno el rol no existe', () => {
    delete process.env.LDAP_GROUP_PSICOLOGIA
    expect(detectarRoles(DN_PSICOLOGIA)).not.toContain('psicologia')
  })

  // El tramitador va último a propósito en ROLES_POR_GRUPO. Psicología se
  // agrega antes que él, así que quien esté en los dos grupos entra con el rol
  // de más alcance y no con el de tramitador.
  test('no desplaza al tramitador del último lugar', () => {
    process.env.LDAP_GROUP_PSICOLOGIA = 'Psicologia_360'
    process.env.LDAP_GROUP_TRAMITADOR = 'Tramitador_360'
    const roles = detectarRoles([...DN_PSICOLOGIA, 'CN=Tramitador_360,OU=Grupos,DC=olivos,DC=local'])
    expect(roles.indexOf('psicologia')).toBeLessThan(roles.indexOf('tramitador'))
  })
})
```

> `detectarRoles(memberOf)` ya existe y ya está exportada en `ldap.service.js`
> (devuelve todos los roles que le dan sus grupos, en orden de prioridad, o
> `[]`). Asegurarse de que el `require` del archivo de prueba la incluya; no
> hay que extraer ni renombrar nada.

- [ ] **Paso 2: Correr la prueba y verificar que falla**

Correr: `npx jest src/h360/services/__tests__/ldap.validarCredenciales.test.js -t "psicología"`
Esperado: FAIL — `detectarRoles` no devuelve `'psicologia'` porque el par
`['LDAP_GROUP_PSICOLOGIA', 'psicologia']` todavía no está en `ROLES_POR_GRUPO`

- [ ] **Paso 3: Agregar el rol al mapa**

En `src/h360/services/ldap.service.js`, dentro de `ROLES_POR_GRUPO`, antes de
la entrada de `LDAP_GROUP_TRAMITADOR` (que va última a propósito):

```js
  ['LDAP_GROUP_RECEPCION',        'recepcion'],             // atiende exequias/ceremonias
  ['LDAP_GROUP_PSICOLOGIA',       'psicologia'],            // R-56: duelo y posexequiales
```

- [ ] **Paso 4: Correr la prueba y verificar que pasa**

Correr: `npx jest src/h360/services/__tests__/ldap.validarCredenciales.test.js`
Esperado: PASS — las 3 nuevas más las 20 que ya existían

- [ ] **Paso 5: Etiqueta en el frontend**

En `homenajes360-frontend/src/utils/roles.js`, agregar a `ROLES` y a `QUE_HACE`:

```js
  psicologia:           { label: 'Psicología',              icon: '🫂' },
```

```js
  psicologia:           'Acompañamiento al duelo y servicios posexequiales',
```

- [ ] **Paso 6: Commit**

```bash
git add src/h360/services/ldap.service.js src/h360/services/__tests__/ldap.validarCredenciales.test.js
git commit -m "feat(h360): rol psicologia para el modulo de duelo"
```

Y en el frontend:

```bash
git add src/utils/roles.js
git commit -m "feat(h360): etiqueta del rol psicologia"
```

---

### Tarea 3: Consultas al ERP — rango y búsqueda

**Archivos:**
- Modificar: `src/h360/services/karingsoft.service.js` (agregar al final, antes de `module.exports`)
- Prueba: `src/h360/services/__tests__/karingsoft.duelo.test.js`

**Interfaces:**
- Consume: `obtenerPool()` y `driver()`, internos del servicio.
- Produce:
  - `ordenesDelRango(desde, hasta)` → `Promise<Orden[]>`
  - `buscarOrdenes({ contrato, nombre, fechaDesde, fechaHasta })` → `Promise<Orden[]>`
  - `Orden` = `{ orden_servicio, fecha_orden, fecha_fallecimiento, nombre_ser_querido,
    edad, telefono, direccion, barrio, municipio, convenio, entidad, sede, tipo_servicio }`
    — `fecha_orden` y `fecha_fallecimiento` son cadenas `'YYYY-MM-DD'`.

- [ ] **Paso 1: Escribir la prueba que falla**

```js
// src/h360/services/__tests__/karingsoft.duelo.test.js
// Las consultas al ERP se prueban por lo que arman y por lo que atan, no
// conectando: la base es de producción y es de otro sistema.

const consultas = []
const requestDoble = () => {
  const r = { params: {} }
  r.input = (nombre, _tipo, valor) => { r.params[nombre] = valor; return r }
  r.query = sql => { consultas.push({ sql, params: r.params }); return { recordset: [] } }
  return r
}

jest.mock('mssql', () => ({
  connect: jest.fn(async () => ({ request: requestDoble })),
  VarChar: () => 'VarChar', Date: 'Date', NVarChar: () => 'NVarChar',
}))

const ks = require('../karingsoft.service')

beforeEach(() => {
  consultas.length = 0
  process.env.KS_HOST = 'x'; process.env.KS_DATABASE = 'y'; process.env.KS_USER = 'z'
})

describe('ordenesDelRango', () => {
  test('filtra por tipo_documento 50 y por el rango de fechas', async () => {
    await ks.ordenesDelRango('2026-11-04', '2026-11-05')
    const { sql, params } = consultas[0]
    expect(sql).toMatch(/tipo_documento\s*=\s*50/)
    expect(sql).toContain('salas_ordenes_view')
    expect(params.p_desde).toBe('2026-11-04')
    expect(params.p_hasta).toBe('2026-11-05')
  })

  // La fecha y la hora salen formateadas desde SQL: mysql2 y mssql devolverían
  // un Date que Express serializa en UTC, y una fecha pelada se reparsea como
  // medianoche UTC, que en Bogotá es el día anterior.
  test('devuelve las fechas ya formateadas como texto', async () => {
    await ks.ordenesDelRango('2026-11-04', '2026-11-05')
    expect(consultas[0].sql).toMatch(/CONVERT\(varchar\(10\),\s*fecha_fallecimiento,\s*23\)/)
  })

  test('nunca escribe en el ERP', async () => {
    await ks.ordenesDelRango('2026-11-04', '2026-11-05')
    expect(consultas[0].sql).not.toMatch(/INSERT|UPDATE|DELETE|MERGE/i)
  })
})

describe('buscarOrdenes', () => {
  test('por contrato, exacto', async () => {
    await ks.buscarOrdenes({ contrato: 'A-20538' })
    expect(consultas[0].params.p_contrato).toBe('A-20538')
    expect(consultas[0].sql).toMatch(/orden_servicio\s*=\s*@p_contrato/)
  })

  test('por nombre, parcial y sobre los tres campos del fallecido', async () => {
    await ks.buscarOrdenes({ nombre: 'prada gomez' })
    expect(consultas[0].sql).toContain('primer_apellido_fallecido')
    expect(consultas[0].sql).toContain('nombres_fallecido')
    expect(consultas[0].params.p_nombre).toBe('%PRADA GOMEZ%')
  })

  test('por fecha de fallecimiento, con rango opcional', async () => {
    await ks.buscarOrdenes({ fechaDesde: '2026-11-01', fechaHasta: '2026-11-05' })
    expect(consultas[0].params.p_f_desde).toBe('2026-11-01')
    expect(consultas[0].params.p_f_hasta).toBe('2026-11-05')
  })

  test('sin ningún criterio no consulta nada', async () => {
    const r = await ks.buscarOrdenes({})
    expect(r).toEqual([])
    expect(consultas).toHaveLength(0)
  })
})
```

- [ ] **Paso 2: Correr la prueba y verificar que falla**

Correr: `npx jest src/h360/services/__tests__/karingsoft.duelo.test.js`
Esperado: FAIL — `ks.ordenesDelRango is not a function`

- [ ] **Paso 3: Implementar las dos consultas**

Agregar en `src/h360/services/karingsoft.service.js`, justo antes de
`module.exports`:

```js
/* ── R-56: bandeja y búsqueda para acompañamiento al duelo ──────────────────
   Las fechas salen formateadas desde SQL a propósito. Un datetime vuelve como
   objeto Date, Express lo serializa en UTC y una fecha pelada se reparsea como
   medianoche UTC: en Bogotá eso es el día anterior. Texto desde el origen
   evita toda la aritmética de zonas. */
const CAMPOS_DUELO = `
         o.orden_servicio,
         CONVERT(varchar(10), o.fecha, 23)                  AS fecha_orden,
         CONVERT(varchar(10), o.fecha_fallecimiento, 23)    AS fecha_fallecimiento,
         LTRIM(RTRIM(
           LTRIM(RTRIM(ISNULL(o.primer_apellido_fallecido,''))) + ' ' +
           LTRIM(RTRIM(ISNULL(o.segundo_apellido_fallecido,''))) + ' ' +
           LTRIM(RTRIM(ISNULL(o.nombres_fallecido,'')))))    AS nombre_ser_querido,
         CAST(o.edad_fallecimiento AS int)                  AS edad,
         LTRIM(RTRIM(ISNULL(o.telefono_fallecido,'')))      AS telefono,
         LTRIM(RTRIM(ISNULL(o.direccion_fallecido,'')))     AS direccion,
         LTRIM(RTRIM(ISNULL(o.barrio_fallecido,'')))        AS barrio,
         LTRIM(RTRIM(ISNULL(o.descripcion_municipio_fallecido,''))) AS municipio,
         LTRIM(RTRIM(ISNULL(o.descripcion_convenio,'')))    AS convenio,
         LTRIM(RTRIM(ISNULL(o.descripcion_entidad,'')))     AS entidad,
         LTRIM(RTRIM(ISNULL(o.descripcion_centro_costo,''))) AS sede,
         LTRIM(RTRIM(ISNULL(o.descripcion_tipos_servicio,''))) AS tipo_servicio`

/**
 * Órdenes creadas entre dos fechas. El defecto del módulo es ayer y hoy, que
 * es como las psicólogas trabajan hoy sobre el ERP.
 */
async function ordenesDelRango(desde, hasta) {
  const pool = await obtenerPool()
  const r = await pool.request()
    .input('p_desde', driver().VarChar(10), String(desde))
    .input('p_hasta', driver().VarChar(10), String(hasta))
    .query(`
      SELECT ${CAMPOS_DUELO}
        FROM salas_ordenes_view o
       WHERE o.tipo_documento = 50
         AND CONVERT(varchar(10), o.fecha, 23) BETWEEN @p_desde AND @p_hasta
       ORDER BY o.fecha DESC, o.orden_servicio DESC`)
  return r.recordset
}

/**
 * Búsqueda por los tres criterios del R-56: contrato, nombre del ser querido o
 * fecha de fallecimiento. Se combinan si llegan varios.
 *
 * Sin criterios devuelve vacío y no consulta: un SELECT sin WHERE sobre una
 * tabla de producción de otro sistema no es algo que se dispare por descuido.
 */
async function buscarOrdenes({ contrato, nombre, fechaDesde, fechaHasta } = {}) {
  const cond = []
  const req = []

  if (String(contrato ?? '').trim()) {
    cond.push('o.orden_servicio = @p_contrato')
    req.push(['p_contrato', driver().VarChar(20), String(contrato).trim()])
  }
  if (String(nombre ?? '').trim()) {
    cond.push(`LTRIM(RTRIM(
        LTRIM(RTRIM(ISNULL(o.primer_apellido_fallecido,''))) + ' ' +
        LTRIM(RTRIM(ISNULL(o.segundo_apellido_fallecido,''))) + ' ' +
        LTRIM(RTRIM(ISNULL(o.nombres_fallecido,''))))) LIKE @p_nombre`)
    const limpio = String(nombre).trim().toUpperCase().replace(/\s+/g, ' ')
    req.push(['p_nombre', driver().VarChar(200), `%${limpio}%`])
  }
  if (String(fechaDesde ?? '').trim()) {
    cond.push('CONVERT(varchar(10), o.fecha_fallecimiento, 23) >= @p_f_desde')
    req.push(['p_f_desde', driver().VarChar(10), String(fechaDesde).trim()])
  }
  if (String(fechaHasta ?? '').trim()) {
    cond.push('CONVERT(varchar(10), o.fecha_fallecimiento, 23) <= @p_f_hasta')
    req.push(['p_f_hasta', driver().VarChar(10), String(fechaHasta).trim()])
  }

  if (!cond.length) return []

  const pool = await obtenerPool()
  let peticion = pool.request()
  for (const [n, t, v] of req) peticion = peticion.input(n, t, v)

  const r = await peticion.query(`
    SELECT TOP 200 ${CAMPOS_DUELO}
      FROM salas_ordenes_view o
     WHERE o.tipo_documento = 50
       AND ${cond.join(' AND ')}
     ORDER BY o.fecha DESC`)
  return r.recordset
}
```

Y agregar los dos nombres a `module.exports`:

```js
module.exports = { formatoR13, itemsR34, licenciaInhumacion, ordenServicio,
  ordenesDelRango, buscarOrdenes, normalizarHora, configurado, ETIQUETA_GRUPO }
```

- [ ] **Paso 4: Correr la prueba y verificar que pasa**

Correr: `npx jest src/h360/services/__tests__/karingsoft.duelo.test.js`
Esperado: PASS, 7 pruebas

- [ ] **Paso 5: Comprobar contra el ERP real, una sola vez**

Escribir un script desechable en `logs/` (está en `.gitignore`) y correrlo en
el servidor, **solo lectura**:

```bash
ssh bortega@192.9.17.30 'cd ~/apps/mantix/mantix-backend && cat > logs/p.js' <<'EOF'
require('dotenv').config()
const ks = require('../src/h360/services/karingsoft.service')
;(async () => {
  const hoy = new Date().toISOString().slice(0, 10)
  const r = await ks.ordenesDelRango(hoy, hoy)
  console.log('órdenes de hoy:', r.length)
  console.log(r.slice(0, 3))
  const b = await ks.buscarOrdenes({ nombre: 'prada' })
  console.log('búsqueda por nombre:', b.length)
})().catch(e => { console.error(e.message); process.exit(1) })
EOF
ssh bortega@192.9.17.30 'cd ~/apps/mantix/mantix-backend && node logs/p.js; rm -f logs/p.js'
```

Esperado: un conteo de órdenes del día y filas con `fecha_fallecimiento` en
formato `'YYYY-MM-DD'`, no objetos `Date`.

- [ ] **Paso 6: Commit**

```bash
git add src/h360/services/karingsoft.service.js src/h360/services/__tests__/karingsoft.duelo.test.js
git commit -m "feat(h360): consultas al ERP para la bandeja de duelo"
```

---

### Tarea 4: Servicio de datos de la gestión

**Archivos:**
- Crear: `src/h360/services/duelo.service.js`
- Prueba: `src/h360/services/__tests__/duelo.service.test.js`

**Interfaces:**
- Consume: `src/h360/config/db` (pool `mysql2`), `duelo.catalogos.js`,
  `normalizarFechaHora` de `src/h360/utils/fecha_hora.js`, y `malUso` de
  `src/h360/utils/errores.js` — **ya existe, no lo redeclares**: arma el error
  con `status = 400` para que el controlador responda 400 y no 500.
- Produce:
  - `gestionPorOrden(orden)` → `Promise<fila|null>`
  - `gestionesPorOrdenes(ordenes: string[])` → `Promise<Map<string, fila>>`
  - `crearGestion(datos)` → `Promise<number>` (id)
  - `actualizarGestion(id, cambios)` → `Promise<boolean>`
  - `agregarIntento(gestionId, { momento, canal, resultado, observacion, usuario })` → `Promise<number>`
  - `intentosDeGestion(gestionId)` → `Promise<fila[]>`
  - `guardarServicios(gestionId, lista)` → `Promise<void>`
  - `serviciosDeGestion(gestionId)` → `Promise<fila[]>`

- [ ] **Paso 1: Escribir la prueba que falla**

```js
// src/h360/services/__tests__/duelo.service.test.js
jest.mock('../../config/db')
const db = require('../../config/db')
const svc = require('../duelo.service')

beforeEach(() => {
  jest.clearAllMocks()
  db.query = jest.fn(async () => [[]])
})

describe('gestionesPorOrdenes', () => {
  test('devuelve un mapa por número de orden', async () => {
    db.query = jest.fn(async () => [[
      { id: 1, orden_servicio: 'A-1', estado: 'GESTIONADA' },
      { id: 2, orden_servicio: 'A-2', estado: 'PENDIENTE' },
    ]])
    const m = await svc.gestionesPorOrdenes(['A-1', 'A-2'])
    expect(m.get('A-1').estado).toBe('GESTIONADA')
    expect(m.get('A-2').id).toBe(2)
  })

  // Con la lista vacía no se consulta: un IN () es un error de sintaxis y
  // además no hay nada que buscar.
  test('con lista vacía no consulta', async () => {
    const m = await svc.gestionesPorOrdenes([])
    expect(m.size).toBe(0)
    expect(db.query).not.toHaveBeenCalled()
  })
})

describe('agregarIntento', () => {
  test('guarda la hora tal como se escribió, sin pasarla por Date', async () => {
    db.query = jest.fn(async () => [{ insertId: 9 }])
    await svc.agregarIntento(5, {
      momento: '2026-11-05T14:30', canal: 'LLAMADA',
      resultado: 'NO_CONTESTO', observacion: 'no contesta', usuario: 'JAZMIN',
    })
    const params = db.query.mock.calls[0][1]
    expect(params).toContain('2026-11-05 14:30:00')
    expect(params.join(' ')).not.toContain('19:30')
  })

  test('rechaza un canal que no está en el catálogo', async () => {
    await expect(svc.agregarIntento(5, {
      momento: '2026-11-05T14:30', canal: 'PALOMA', resultado: 'CONTACTADO', usuario: 'X',
    })).rejects.toThrow(/canal/i)
  })

  test('rechaza una hora imposible', async () => {
    await expect(svc.agregarIntento(5, {
      momento: '2026-02-31T14:30', canal: 'LLAMADA', resultado: 'CONTACTADO', usuario: 'X',
    })).rejects.toThrow(/fecha/i)
  })
})

describe('guardarServicios', () => {
  test('rechaza un servicio que no es de los seis', async () => {
    await expect(svc.guardarServicios(5, [{ servicio: 'MASAJES', estado: 'ACEPTA' }]))
      .rejects.toThrow(/servicio/i)
  })

  test('rechaza un estado que no está en el catálogo', async () => {
    await expect(svc.guardarServicios(5, [{ servicio: 'MISA_DE_MES', estado: 'QUIZAS' }]))
      .rejects.toThrow(/estado/i)
  })
})
```

- [ ] **Paso 2: Correr la prueba y verificar que falla**

Correr: `npx jest src/h360/services/__tests__/duelo.service.test.js`
Esperado: FAIL — `Cannot find module '../duelo.service'`

- [ ] **Paso 3: Implementar el servicio**

```js
// src/h360/services/duelo.service.js
/**
 * duelo.service.js
 * Acceso a MySQL de la gestión del R-56: gestión, intentos y servicios
 * ofrecidos. Las atenciones NO están acá: viven en duelo_atenciones.service.js
 * porque son dato de salud con permiso propio.
 */
const db = require('../config/db')
const { normalizarFechaHora } = require('../utils/fecha_hora')
const { malUso } = require('../utils/errores')
const cat = require('../utils/duelo.catalogos')

async function gestionPorOrden(orden) {
  const [f] = await db.query(
    'SELECT * FROM h360_duelo_gestion WHERE orden_servicio = ?', [String(orden ?? '').trim()])
  return f[0] || null
}

async function gestionesPorOrdenes(ordenes) {
  const lista = (ordenes || []).map(o => String(o).trim()).filter(Boolean)
  if (!lista.length) return new Map()
  const [filas] = await db.query(
    `SELECT * FROM h360_duelo_gestion WHERE orden_servicio IN (${lista.map(() => '?').join(',')})`,
    lista)
  return new Map(filas.map(f => [f.orden_servicio, f]))
}

async function crearGestion(datos) {
  if (!cat.UBICACIONES.includes(datos.ubicacion_tipo))
    throw malUso('La ubicación del homenaje no es válida')
  const [r] = await db.query(
    `INSERT INTO h360_duelo_gestion
       (orden_servicio, asistencia_id, ubicacion_tipo, ubicacion_detalle, es_mascota,
        titular_nombre, titular_parentesco, telefonos, estado, psicologa, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [datos.orden_servicio, datos.asistencia_id ?? null, datos.ubicacion_tipo,
     datos.ubicacion_detalle ?? null, datos.es_mascota ? 1 : 0,
     datos.titular_nombre ?? null, datos.titular_parentesco ?? null,
     datos.telefonos ?? null, datos.estado ?? 'EN_GESTION',
     datos.psicologa, datos.created_by])
  return r.insertId
}

/**
 * Lo que un cliente puede cambiar. `cerrada_at` NO está: la pone el servidor
 * con el reloj de la base cuando el estado cierra la gestión. Una gestión se
 * cierra *ahora*; si la hora viniera de un input, una gestión cerrada a las
 * 14:30 se guardaría a las 19:30 al convertirse a UTC.
 */
const CAMPOS_EDITABLES = [
  'asistencia_id', 'ubicacion_tipo', 'ubicacion_detalle', 'titular_nombre',
  'titular_parentesco', 'telefonos', 'tipificacion', 'estado', 'observaciones',
  'psicologa', 'psicologa_acompanante',
]

async function actualizarGestion(id, cambios) {
  const set = {}
  for (const k of CAMPOS_EDITABLES) if (cambios[k] !== undefined) set[k] = cambios[k]

  if (set.ubicacion_tipo !== undefined && !cat.UBICACIONES.includes(set.ubicacion_tipo))
    throw malUso('La ubicación del homenaje no es válida')
  if (set.tipificacion != null && !cat.TIPIFICACIONES.includes(set.tipificacion))
    throw malUso('La tipificación no es válida')
  if (set.estado !== undefined && !cat.ESTADOS_GESTION.includes(set.estado))
    throw malUso('El estado de la gestión no es válido')

  if (!Object.keys(set).length) return false

  /* La hora de cierre la pone el servidor con el reloj de la base, nunca el
     cliente: una gestión se cierra *ahora*, y si la hora viniera de un input
     se correría a UTC.

     Va como fragmento del SQL y no dentro del objeto del `SET ?`, porque
     `NOW()` metido como valor se escaparía como texto.

     Y se conserva con COALESCE en vez de sobrescribirse: es dato de
     auditoría. Si el frontend manda el estado en cada guardado, un `NOW()`
     pelado correría la hora de cierre con cada corrección de una observación,
     y el campo pasaría a decir "cuándo se editó" en vez de "cuándo se cerró"
     —para eso ya está `updated_at`—. La reapertura sí la borra, así que un
     cierre posterior toma su propia hora nueva. */
  const CIERRAN  = ['GESTIONADA', 'NO_LOGRADA', 'NO_APLICA', 'REPETIDA']
  const REABREN  = ['PENDIENTE', 'EN_GESTION']
  const cierre = set.estado === undefined ? ''
    : CIERRAN.includes(set.estado) ? ', cerrada_at = COALESCE(cerrada_at, NOW())'
    : REABREN.includes(set.estado) ? ', cerrada_at = NULL'
    : ''

  const [r] = await db.query(
    `UPDATE h360_duelo_gestion SET ?${cierre} WHERE id = ?`, [set, id])
  return r.affectedRows > 0
}

async function agregarIntento(gestionId, { momento, canal, resultado, observacion, usuario }) {
  if (!cat.CANALES_INTENTO.includes(canal))
    throw malUso('El canal del intento no es válido')
  if (!cat.RESULTADOS_INTENTO.includes(resultado))
    throw malUso('El resultado del intento no es válido')
  const cuando = normalizarFechaHora(momento)
  if (!cuando) throw malUso('La fecha y hora del intento no es válida')

  const [r] = await db.query(
    `INSERT INTO h360_duelo_intentos (gestion_id, momento, canal, resultado, observacion, usuario)
     VALUES (?,?,?,?,?,?)`,
    [gestionId, cuando, canal, resultado, observacion ?? null, usuario])
  return r.insertId
}

async function intentosDeGestion(gestionId) {
  const [f] = await db.query(
    'SELECT * FROM h360_duelo_intentos WHERE gestion_id = ? ORDER BY momento ASC, id ASC',
    [gestionId])
  return f
}

/**
 * Guarda los seis servicios de una vez. Es un reemplazo completo del estado de
 * la gestión: así la pantalla manda lo que tiene y no hay que llevar la cuenta
 * de qué cambió.
 */
async function guardarServicios(gestionId, lista) {
  for (const s of lista || []) {
    if (!cat.SERVICIOS.includes(s.servicio))
      throw malUso(`El servicio ${s.servicio} no es uno de los del R-56`)
    if (!cat.ESTADOS_SERVICIO.includes(s.estado))
      throw malUso(`El estado ${s.estado} no es válido para un servicio`)
    if (s.modalidad != null && !cat.MODALIDADES.includes(s.modalidad))
      throw malUso(`La modalidad ${s.modalidad} no es válida`)
  }
  if (!lista?.length) return

  const valores = lista.map(s => [
    gestionId, s.servicio, s.estado, s.modalidad ?? null,
    s.detalle ?? null, s.observacion ?? null,
  ])
  await db.query(
    `INSERT INTO h360_duelo_servicios
       (gestion_id, servicio, estado, modalidad, detalle, observacion)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       estado = VALUES(estado), modalidad = VALUES(modalidad),
       detalle = VALUES(detalle), observacion = VALUES(observacion)`,
    [valores])
}

async function serviciosDeGestion(gestionId) {
  const [f] = await db.query(
    'SELECT * FROM h360_duelo_servicios WHERE gestion_id = ?', [gestionId])
  return f
}

module.exports = {
  gestionPorOrden, gestionesPorOrdenes, crearGestion, actualizarGestion,
  agregarIntento, intentosDeGestion, guardarServicios, serviciosDeGestion,
}
```

- [ ] **Paso 4: Correr la prueba y verificar que pasa**

Correr: `npx jest src/h360/services/__tests__/duelo.service.test.js`
Esperado: PASS, 7 pruebas

- [ ] **Paso 5: Commit**

```bash
git add src/h360/services/duelo.service.js src/h360/services/__tests__/duelo.service.test.js
git commit -m "feat(h360): servicio de datos de la gestion de duelo"
```

---

### Tarea 5: Bandeja y búsqueda

**Archivos:**
- Crear: `src/h360/controllers/duelo.controller.js`
- Prueba: `src/h360/controllers/__tests__/duelo.bandeja.test.js`

**Interfaces:**
- Consume: `karingsoft.service` (`ordenesDelRango`, `buscarOrdenes`, `configurado`),
  `duelo.service` (`gestionesPorOrdenes`), `duelo.catalogos` (`esMascota`),
  `src/h360/config/db` para el cruce con `asistencias`.
- Produce: `bandeja(req, res, next)`, `buscar(req, res, next)`. Cada fila de la
  respuesta es la orden del ERP más
  `{ es_mascota, asistencia: {id, codigo, estado, ubicacion_tipo, ubicacion_detalle}|null,
     gestion: {id, estado, tipificacion}|null, rama }`,
  donde `rama` ∈ `'SALA' | 'RESIDENCIA' | 'OTRA_CIUDAD'`.

- [ ] **Paso 1: Escribir la prueba que falla**

```js
// src/h360/controllers/__tests__/duelo.bandeja.test.js
// La bandeja es el corazón del módulo: si pierde una orden, una familia se
// queda sin que nadie la llame.

jest.mock('../../config/db')
jest.mock('../../services/karingsoft.service')
jest.mock('../../services/duelo.service')

const db  = require('../../config/db')
const ks  = require('../../services/karingsoft.service')
const svc = require('../../services/duelo.service')
const ctrl = require('../duelo.controller')

const resDoble = () => {
  const r = { codigo: 200, cuerpo: null }
  r.status = c => { r.codigo = c; return r }
  r.json = b => { r.cuerpo = b; return r }
  return r
}

const ORDENES = [
  { orden_servicio: 'A-1', nombre_ser_querido: 'JUAN PEREZ', sede: 'Sede Gran Colombia',
    convenio: 'Planes TRADICIONAL', fecha_fallecimiento: '2026-11-04' },
  { orden_servicio: 'MAS-9', nombre_ser_querido: 'MASCOTA MAX', sede: 'Mascotas',
    convenio: 'Otros Servicios', fecha_fallecimiento: '2026-11-04' },
  { orden_servicio: 'A-3', nombre_ser_querido: 'ANA RUIZ', sede: 'Sede Pamplona',
    convenio: 'Olivos Bucaramanga', fecha_fallecimiento: '2026-11-04' },
]

beforeEach(() => {
  jest.clearAllMocks()
  ks.configurado = jest.fn(() => true)
  ks.ordenesDelRango = jest.fn(async () => ORDENES)
  svc.gestionesPorOrdenes = jest.fn(async () => new Map())
  db.query = jest.fn(async () => [[]])
})

describe('bandeja', () => {
  test('no pierde ninguna orden del ERP', async () => {
    const res = resDoble()
    await ctrl.bandeja({ query: {}, user: { rol: 'psicologia' } }, res, jest.fn())
    expect(res.cuerpo.data).toHaveLength(3)
  })

  // Las mascotas entran marcadas: es decisión del negocio que se trabajen.
  test('marca las mascotas en lugar de esconderlas', async () => {
    const res = resDoble()
    await ctrl.bandeja({ query: {}, user: { rol: 'psicologia' } }, res, jest.fn())
    const mascota = res.cuerpo.data.find(f => f.orden_servicio === 'MAS-9')
    expect(mascota.es_mascota).toBe(true)
    expect(res.cuerpo.data.filter(f => !f.es_mascota)).toHaveLength(2)
  })

  // Lo que el ERP no sabe y H360 sí: dónde es el homenaje.
  test('enriquece con la asistencia de H360 cuando el contrato coincide', async () => {
    db.query = jest.fn(async () => [[
      { id: 77, codigo: 'H360-2026-0315', contrato: 'A-1', estado: 'SALA',
        viene_otra_ciudad: 0, sala_codigo: 'SALGC06', sede_nombre: 'Gran Colombia' },
    ]])
    const res = resDoble()
    await ctrl.bandeja({ query: {}, user: { rol: 'psicologia' } }, res, jest.fn())
    const fila = res.cuerpo.data.find(f => f.orden_servicio === 'A-1')
    expect(fila.asistencia.codigo).toBe('H360-2026-0315')
    expect(fila.rama).toBe('SALA')
  })

  // El 46% de las órdenes no tiene caso en 360 y aun así hay que gestionarlas.
  test('una orden sin asistencia en H360 sigue en la bandeja', async () => {
    const res = resDoble()
    await ctrl.bandeja({ query: {}, user: { rol: 'psicologia' } }, res, jest.fn())
    const fila = res.cuerpo.data.find(f => f.orden_servicio === 'A-3')
    expect(fila.asistencia).toBeNull()
    expect(fila).toHaveProperty('rama')
  })

  test('la sede de otra ciudad cae en la rama telefónica', async () => {
    const res = resDoble()
    await ctrl.bandeja({ query: {}, user: { rol: 'psicologia' } }, res, jest.fn())
    expect(res.cuerpo.data.find(f => f.orden_servicio === 'A-3').rama).toBe('OTRA_CIUDAD')
  })

  test('dice qué ya se gestionó', async () => {
    svc.gestionesPorOrdenes = jest.fn(async () => new Map([
      ['A-1', { id: 5, estado: 'GESTIONADA', tipificacion: 'OFRECIDO_EN_HOMENAJE' }],
    ]))
    const res = resDoble()
    await ctrl.bandeja({ query: {}, user: { rol: 'psicologia' } }, res, jest.fn())
    expect(res.cuerpo.data.find(f => f.orden_servicio === 'A-1').gestion.estado).toBe('GESTIONADA')
    expect(res.cuerpo.data.find(f => f.orden_servicio === 'A-3').gestion).toBeNull()
  })

  test('el defecto es ayer y hoy', async () => {
    await ctrl.bandeja({ query: {}, user: { rol: 'psicologia' } }, resDoble(), jest.fn())
    const [desde, hasta] = ks.ordenesDelRango.mock.calls[0]
    expect(desde).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(hasta).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(new Date(hasta) - new Date(desde)).toBe(86400000)
  })

  // Ninguna respuesta del módulo fuera de las atenciones lleva notas.
  test('la bandeja nunca trae el campo notas', async () => {
    const res = resDoble()
    await ctrl.bandeja({ query: {}, user: { rol: 'psicologia' } }, res, jest.fn())
    expect(JSON.stringify(res.cuerpo)).not.toContain('notas')
  })

  test('si el ERP no está configurado responde 503 y lo dice', async () => {
    ks.configurado = jest.fn(() => false)
    const res = resDoble()
    await ctrl.bandeja({ query: {}, user: { rol: 'psicologia' } }, res, jest.fn())
    expect(res.codigo).toBe(503)
    expect(res.cuerpo.mensaje).toMatch(/ERP|Karing/i)
  })

  test('si el ERP falla responde 503 en vez de reventar', async () => {
    ks.ordenesDelRango = jest.fn(async () => { throw new Error('ECONNREFUSED') })
    const res = resDoble()
    await ctrl.bandeja({ query: {}, user: { rol: 'psicologia' } }, res, jest.fn())
    expect(res.codigo).toBe(503)
  })
})

describe('buscar', () => {
  test('exige al menos un criterio', async () => {
    const res = resDoble()
    await ctrl.buscar({ query: {}, user: { rol: 'psicologia' } }, res, jest.fn())
    expect(res.codigo).toBe(400)
  })

  test('pasa los tres criterios al ERP', async () => {
    ks.buscarOrdenes = jest.fn(async () => [])
    await ctrl.buscar({
      query: { contrato: 'A-1', nombre: 'perez', fecha_fallecimiento: '2026-11-04' },
      user: { rol: 'psicologia' },
    }, resDoble(), jest.fn())
    expect(ks.buscarOrdenes).toHaveBeenCalledWith(expect.objectContaining({
      contrato: 'A-1', nombre: 'perez', fechaDesde: '2026-11-04',
    }))
  })
})
```

- [ ] **Paso 2: Correr la prueba y verificar que falla**

Correr: `npx jest src/h360/controllers/__tests__/duelo.bandeja.test.js`
Esperado: FAIL — `Cannot find module '../duelo.controller'`

- [ ] **Paso 3: Implementar el controlador**

```js
// src/h360/controllers/duelo.controller.js
/**
 * duelo.controller.js
 * R-56: bandeja del día, búsqueda y gestión del acompañamiento al duelo.
 *
 * La bandeja sale del ERP y no de H360. Se midió: de 336 órdenes en 30 días
 * solo 180 tienen asistencia en 360, así que una bandeja alimentada por 360
 * habría dejado fuera al 46% de las familias. H360 enriquece, no manda.
 *
 * Las atenciones psicológicas NO están acá: duelo_atenciones.controller.js.
 */
const db  = require('../config/db')
const ks  = require('../services/karingsoft.service')
const svc = require('../services/duelo.service')
const { esMascota } = require('../utils/duelo.catalogos')

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  + `-${String(d.getDate()).padStart(2, '0')}`

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/

/** Ayer y hoy: es como trabajan hoy sobre el ERP. */
function rangoPorDefecto() {
  const hoy = new Date()
  const ayer = new Date(hoy.getTime() - 86400000)
  return { desde: iso(ayer), hasta: iso(hoy) }
}

/**
 * Las sedes de otras ciudades se reconocen por el centro de costo o porque el
 * convenio es otra sucursal de Olivos. No se adivina por el municipio: el
 * municipio es donde falleció, no donde es el homenaje.
 */
const SEDES_LOCALES = ['GRAN COLOMBIA', 'SAN JOSE', 'SAN JOSÉ', 'CRISTO REY CUCUTA', 'MASCOTAS']

function esOtraCiudad(orden) {
  const sede = String(orden.sede ?? '').toUpperCase().replace(/\s+/g, ' ').trim()
  if (sede && !SEDES_LOCALES.some(s => sede.includes(s))) return true
  const conv = String(orden.convenio ?? '').toUpperCase()
  return /^OLIVOS (?!CUCUTA)/.test(conv.trim())
}

function ramaDe(orden, asistencia) {
  if (asistencia?.ubicacion_tipo) return asistencia.ubicacion_tipo
  if (esOtraCiudad(orden)) return 'OTRA_CIUDAD'
  return 'RESIDENCIA'
}

/** Asistencias de H360 para un grupo de contratos, con su sala y sede. */
async function asistenciasPorContrato(contratos) {
  const lista = contratos.map(c => String(c).trim()).filter(Boolean)
  if (!lista.length) return new Map()
  const [filas] = await db.query(
    `SELECT a.id, a.codigo, a.contrato, a.estado, a.viene_otra_ciudad,
            sv.codigo AS sala_codigo, sd.nombre AS sede_nombre,
            hr.id AS residencia_id
       FROM asistencias a
       LEFT JOIN homenajes_sala hs  ON hs.asistencia_id = a.id
       LEFT JOIN salas_velacion sv  ON sv.id = hs.sala_id
       LEFT JOIN sedes sd           ON sd.id = sv.sede_id
       LEFT JOIN homenajes_residencia hr ON hr.asistencia_id = a.id
      WHERE a.contrato IN (${lista.map(() => '?').join(',')})`,
    lista)

  const m = new Map()
  for (const f of filas) {
    const ubicacion_tipo = f.sala_codigo ? 'SALA' : (f.residencia_id ? 'RESIDENCIA' : null)
    m.set(String(f.contrato).trim(), {
      id: f.id, codigo: f.codigo, estado: f.estado,
      ubicacion_tipo,
      ubicacion_detalle: f.sala_codigo ? `${f.sede_nombre} · ${f.sala_codigo}` : null,
    })
  }
  return m
}

/** Arma las filas de la bandeja a partir de las órdenes del ERP. */
async function armarFilas(ordenes) {
  const contratos = ordenes.map(o => o.orden_servicio)
  const [asistencias, gestiones] = await Promise.all([
    asistenciasPorContrato(contratos),
    svc.gestionesPorOrdenes(contratos),
  ])

  return ordenes.map(o => {
    const asistencia = asistencias.get(String(o.orden_servicio).trim()) || null
    const g = gestiones.get(String(o.orden_servicio).trim()) || null
    return {
      ...o,
      es_mascota: esMascota(o),
      asistencia,
      rama: ramaDe(o, asistencia),
      // Solo lo que la bandeja necesita: nunca el contenido de una atención.
      gestion: g ? { id: g.id, estado: g.estado, tipificacion: g.tipificacion } : null,
    }
  })
}

/**
 * Un 400 que viene del servicio se responde como 400, no como 500.
 *
 * Las consultas al ERP validan la forma de las fechas y el largo del nombre y
 * lanzan con `status = 400`: sin este mapeo, una fecha mal escrita por una
 * psicóloga saldría como error del servidor y en el log quedaría un error de
 * protocolo TDS que no le dice nada a nadie.
 */
function responderError(res, next, err) {
  if (err?.status === 400) return res.status(400).json({ mensaje: err.message })
  return next(err)
}

function sinErp(res) {
  return res.status(503).json({
    mensaje: 'No se pudo consultar Karingsoft (el ERP). La bandeja del día '
           + 'necesita esa conexión; una gestión ya abierta sigue funcionando.',
  })
}

// GET /api/h360/duelo/bandeja?desde=&hasta=&rama=&estado=&incluir_mascotas=
async function bandeja(req, res, next) {
  try {
    if (!ks.configurado()) return sinErp(res)

    const def = rangoPorDefecto()
    const desde = ES_FECHA.test(req.query.desde || '') ? req.query.desde : def.desde
    const hasta = ES_FECHA.test(req.query.hasta || '') ? req.query.hasta : def.hasta

    let ordenes
    try { ordenes = await ks.ordenesDelRango(desde, hasta) }
    catch (err) {
      // Un 400 del servicio es entrada inválida, no un ERP caído: tiene que
      // subir. Si se tragara acá, una fecha mal escrita por una psicóloga le
      // diría "el ERP no responde" y nadie encontraría el error real.
      if (err?.status === 400) throw err
      console.warn('[duelo] bandeja, ERP no disponible:', err.message)
      return sinErp(res)
    }

    let filas = await armarFilas(ordenes)
    if (req.query.rama)   filas = filas.filter(f => f.rama === req.query.rama)
    if (req.query.estado) filas = filas.filter(f => (f.gestion?.estado ?? 'PENDIENTE') === req.query.estado)
    if (req.query.incluir_mascotas === 'false') filas = filas.filter(f => !f.es_mascota)

    res.json({ desde, hasta, total: filas.length, data: filas })
  } catch (err) { responderError(res, next, err) }
}

// GET /api/h360/duelo/buscar?contrato=&nombre=&fecha_fallecimiento=&fecha_hasta=
async function buscar(req, res, next) {
  try {
    if (!ks.configurado()) return sinErp(res)

    const criterios = {
      contrato:   req.query.contrato,
      nombre:     req.query.nombre,
      fechaDesde: req.query.fecha_fallecimiento,
      fechaHasta: req.query.fecha_hasta,
    }
    // Se mira el contenido y no la presencia: un criterio de solo espacios
    // pasaba este chequeo, el servicio devolvía vacío, y la pantalla decía
    // "sin resultados" en vez de pedir un criterio de verdad.
    const conContenido = v => !!String(v ?? '').trim()
    if (!conContenido(criterios.contrato) && !conContenido(criterios.nombre)
        && !conContenido(criterios.fechaDesde))
      return res.status(400).json({
        mensaje: 'Indica al menos un criterio: contrato, nombre del ser querido o fecha de fallecimiento.',
      })

    let ordenes
    try { ordenes = await ks.buscarOrdenes(criterios) }
    catch (err) {
      if (err?.status === 400) throw err      // entrada inválida, no ERP caído
      console.warn('[duelo] búsqueda, ERP no disponible:', err.message)
      return sinErp(res)
    }

    const filas = await armarFilas(ordenes)
    res.json({ total: filas.length, data: filas })
  } catch (err) { responderError(res, next, err) }
}

module.exports = { bandeja, buscar, esOtraCiudad, ramaDe }
```

- [ ] **Paso 4: Correr la prueba y verificar que pasa**

Correr: `npx jest src/h360/controllers/__tests__/duelo.bandeja.test.js`
Esperado: PASS, 12 pruebas

- [ ] **Paso 5: Commit**

```bash
git add src/h360/controllers/duelo.controller.js \
        src/h360/controllers/__tests__/duelo.bandeja.test.js
git commit -m "feat(h360): bandeja del dia y busqueda del R-56"
```

---

### Tarea 6: Ficha de gestión, intentos y servicios

**Archivos:**
- Modificar: `src/h360/controllers/duelo.controller.js`
- Prueba: `src/h360/controllers/__tests__/duelo.gestion.test.js`

**Interfaces:**
- Consume: todo lo de la Tarea 4, `ks.buscarOrdenes` de la Tarea 3 y
  `asistenciasPorContrato` de la Tarea 5.
- **Por qué `buscarOrdenes` y no `ordenServicio`:** la consulta de
  `ordenServicio` no devuelve nombre del ser querido, fecha de fallecimiento,
  teléfono ni dirección — justo los campos que la ficha pinta. `buscarOrdenes`
  con el contrato devuelve exactamente la forma que necesita la pantalla.
- Produce, agregados a `module.exports`: `ficha`, `crear`, `actualizar`,
  `agregarIntento`, `guardarServicios`.

- [ ] **Paso 1: Escribir la prueba que falla**

```js
// src/h360/controllers/__tests__/duelo.gestion.test.js
jest.mock('../../config/db')
jest.mock('../../services/karingsoft.service')
jest.mock('../../services/duelo.service')

const ks   = require('../../services/karingsoft.service')
const svc  = require('../../services/duelo.service')
const db   = require('../../config/db')
const ctrl = require('../duelo.controller')

const resDoble = () => {
  const r = { codigo: 200, cuerpo: null }
  r.status = c => { r.codigo = c; return r }
  r.json = b => { r.cuerpo = b; return r }
  return r
}
const usuario = { usuario: 'JAZMIN', nombre: 'Jazmín', rol: 'psicologia' }

beforeEach(() => {
  jest.clearAllMocks()
  ks.configurado = jest.fn(() => true)
  ks.buscarOrdenes = jest.fn(async () => [{
    orden_servicio: 'A-1', sede: 'Sede Gran Colombia',
    nombre_ser_querido: 'JUAN PEREZ', fecha_fallecimiento: '2026-11-04',
    telefono: '3001234567', direccion: 'CLL 7 46 30',
  }])
  svc.gestionPorOrden = jest.fn(async () => ({ id: 5, orden_servicio: 'A-1', estado: 'EN_GESTION' }))
  svc.intentosDeGestion = jest.fn(async () => [])
  svc.serviciosDeGestion = jest.fn(async () => [])
  db.query = jest.fn(async () => [[]])
})

describe('ficha', () => {
  test('junta el contrato del ERP con la gestión, los intentos y los servicios', async () => {
    const res = resDoble()
    await ctrl.ficha({ params: { orden: 'A-1' }, user: usuario }, res, jest.fn())
    expect(res.cuerpo.contrato.orden_servicio).toBe('A-1')
    expect(res.cuerpo.contrato.nombre_ser_querido).toBe('JUAN PEREZ')
    expect(res.cuerpo.gestion.id).toBe(5)
    expect(res.cuerpo).toHaveProperty('intentos')
    expect(res.cuerpo).toHaveProperty('servicios')
    // La pantalla la usa para precargar la ubicación al abrir la gestión.
    expect(res.cuerpo).toHaveProperty('asistencia')
  })

  // El ERP caído no debe tumbar una gestión ya abierta: el trabajo del día
  // sigue, solo falta el bloque del contrato.
  test('con el ERP caído devuelve la gestión y avisa del contrato', async () => {
    ks.buscarOrdenes = jest.fn(async () => { throw new Error('ECONNREFUSED') })
    const res = resDoble()
    await ctrl.ficha({ params: { orden: 'A-1' }, user: usuario }, res, jest.fn())
    expect(res.codigo).toBe(200)
    expect(res.cuerpo.gestion.id).toBe(5)
    expect(res.cuerpo.contrato).toBeNull()
    expect(res.cuerpo.erp_error).toMatch(/ERP|Karing/i)
  })

  test('nunca trae notas', async () => {
    const res = resDoble()
    await ctrl.ficha({ params: { orden: 'A-1' }, user: usuario }, res, jest.fn())
    expect(JSON.stringify(res.cuerpo)).not.toContain('notas')
  })
})

describe('crear', () => {
  test('abre la gestión con la psicóloga del login, no de la petición', async () => {
    svc.gestionPorOrden = jest.fn(async () => null)
    svc.crearGestion = jest.fn(async () => 11)
    const res = resDoble()
    await ctrl.crear({
      body: { orden_servicio: 'A-9', ubicacion_tipo: 'SALA', psicologa: 'OTRA_PERSONA' },
      user: usuario,
    }, res, jest.fn())
    expect(res.codigo).toBe(201)
    expect(svc.crearGestion.mock.calls[0][0].psicologa).toBe('JAZMIN')
  })

  test('una orden ya gestionada responde 409 y dice cuál', async () => {
    const res = resDoble()
    await ctrl.crear({
      body: { orden_servicio: 'A-1', ubicacion_tipo: 'SALA' }, user: usuario,
    }, res, jest.fn())
    expect(res.codigo).toBe(409)
    expect(res.cuerpo.gestion_id).toBe(5)
  })

  test('exige el número de orden', async () => {
    const res = resDoble()
    await ctrl.crear({ body: { ubicacion_tipo: 'SALA' }, user: usuario }, res, jest.fn())
    expect(res.codigo).toBe(400)
  })
})

describe('agregarIntento', () => {
  test('registra el intento con el usuario del login', async () => {
    svc.agregarIntento = jest.fn(async () => 3)
    const res = resDoble()
    await ctrl.agregarIntento({
      params: { id: '5' },
      body: { momento: '2026-11-05T14:30', canal: 'LLAMADA', resultado: 'NO_CONTESTO' },
      user: usuario,
    }, res, jest.fn())
    expect(res.codigo).toBe(201)
    expect(svc.agregarIntento.mock.calls[0][1].usuario).toBe('JAZMIN')
  })

  test('un error de validación del servicio sale como 400', async () => {
    svc.agregarIntento = jest.fn(async () => {
      const e = new Error('El canal del intento no es válido'); e.status = 400; throw e
    })
    const res = resDoble()
    await ctrl.agregarIntento({
      params: { id: '5' }, body: { canal: 'PALOMA' }, user: usuario,
    }, res, jest.fn())
    expect(res.codigo).toBe(400)
    expect(res.cuerpo.mensaje).toMatch(/canal/i)
  })
})

describe('guardarServicios', () => {
  test('guarda la lista y devuelve lo que quedó', async () => {
    svc.guardarServicios = jest.fn(async () => {})
    svc.serviciosDeGestion = jest.fn(async () => [{ servicio: 'MISA_DE_MES', estado: 'ACEPTA' }])
    const res = resDoble()
    await ctrl.guardarServicios({
      params: { id: '5' },
      body: { servicios: [{ servicio: 'MISA_DE_MES', estado: 'ACEPTA', modalidad: 'PRESENCIAL' }] },
      user: usuario,
    }, res, jest.fn())
    expect(res.codigo).toBe(200)
    expect(res.cuerpo.data[0].servicio).toBe('MISA_DE_MES')
  })

  test('exige que servicios sea una lista', async () => {
    const res = resDoble()
    await ctrl.guardarServicios({
      params: { id: '5' }, body: { servicios: 'MISA' }, user: usuario,
    }, res, jest.fn())
    expect(res.codigo).toBe(400)
  })
})
```

- [ ] **Paso 2: Correr la prueba y verificar que falla**

Correr: `npx jest src/h360/controllers/__tests__/duelo.gestion.test.js`
Esperado: FAIL — `ctrl.ficha is not a function`

- [ ] **Paso 3: Agregar los manejadores al controlador**

Agregar en `src/h360/controllers/duelo.controller.js`, antes de `module.exports`:

> `responderError` ya quedó definido en la Tarea 5, en este mismo archivo. No lo
> vuelvas a declarar: reúsalo.

```js
// GET /api/h360/duelo/gestion/:orden
async function ficha(req, res, next) {
  try {
    const orden = String(req.params.orden ?? '').trim()
    if (!orden) return res.status(400).json({ mensaje: 'Falta el número de orden' })

    const gestion = await svc.gestionPorOrden(orden)

    // El contrato se lee en vivo; si el ERP está caído la gestión sigue
    // sirviendo y se avisa, igual que hace el bloque del ERP en el detalle
    // de asistencia.
    //
    // Se usa buscarOrdenes y no ordenServicio porque la consulta de
    // ordenServicio no trae nombre, fecha de fallecimiento, teléfono ni
    // dirección, que es lo que la psicóloga necesita ver.
    let contrato = null, erp_error = null
    try {
      const filas = await ks.buscarOrdenes({ contrato: orden })
      contrato = filas[0] || null
    } catch (err) {
      console.warn('[duelo] ficha, ERP no disponible:', err.message)
      erp_error = 'No se pudo leer el contrato en Karingsoft (el ERP).'
    }

    // La asistencia de H360 va en la ficha para poder precargar la ubicación
    // al abrir la gestión: es el dato que el ERP no tiene.
    const asistencia = (await asistenciasPorContrato([orden])).get(orden) || null

    const [intentos, servicios] = gestion
      ? await Promise.all([svc.intentosDeGestion(gestion.id), svc.serviciosDeGestion(gestion.id)])
      : [[], []]

    res.json({ orden_servicio: orden, contrato, erp_error, asistencia,
      gestion, intentos, servicios })
  } catch (err) { next(err) }
}

// POST /api/h360/duelo/gestion
async function crear(req, res, next) {
  try {
    const orden = String(req.body?.orden_servicio ?? '').trim()
    if (!orden) return res.status(400).json({ mensaje: 'Falta el número de orden' })

    const ya = await svc.gestionPorOrden(orden)
    if (ya) return res.status(409).json({
      mensaje: 'Esta orden ya tiene una gestión abierta.', gestion_id: ya.id,
    })

    // Son dos psicólogas trabajando la misma lista del día, así que las dos
    // pueden abrir la misma orden en el mismo segundo: el chequeo de arriba
    // pasa en las dos y el índice único rechaza a la segunda. Sin esto, a una
    // de ellas le saldría un 500 por ER_DUP_ENTRY en vez del 409 que le dice
    // que su compañera ya la abrió.

    // La psicóloga sale del login y no del cuerpo: en el Excel se escribía a
    // mano 1850 veces y no hay forma de auditar quién atendió de verdad.
    const datos = {
      orden_servicio:     orden,
      asistencia_id:      req.body.asistencia_id ?? null,
      ubicacion_tipo:     req.body.ubicacion_tipo ?? 'OTRO',
      ubicacion_detalle:  req.body.ubicacion_detalle ?? null,
      es_mascota:         !!req.body.es_mascota,
      titular_nombre:     req.body.titular_nombre ?? null,
      titular_parentesco: req.body.titular_parentesco ?? null,
      telefonos:          req.body.telefonos ?? null,
      estado:             'EN_GESTION',
      psicologa:          req.user.usuario,
      created_by:         req.user.usuario,
    }
    let id
    try {
      id = await svc.crearGestion(datos)
    } catch (err) {
      if (err?.code === 'ER_DUP_ENTRY') {
        const existente = await svc.gestionPorOrden(orden)
        return res.status(409).json({
          mensaje: 'Esta orden ya tiene una gestión abierta.',
          gestion_id: existente?.id ?? null,
        })
      }
      throw err
    }
    res.status(201).json({ id, orden_servicio: orden })
  } catch (err) { responderError(res, next, err) }
}

// PATCH /api/h360/duelo/gestion/:id
async function actualizar(req, res, next) {
  try {
    const cambiado = await svc.actualizarGestion(req.params.id, req.body || {})
    if (!cambiado) return res.status(400).json({ mensaje: 'No hay cambios que guardar' })
    res.json({ ok: true })
  } catch (err) { responderError(res, next, err) }
}

// POST /api/h360/duelo/gestion/:id/intentos
async function agregarIntento(req, res, next) {
  try {
    const id = await svc.agregarIntento(req.params.id, {
      momento:     req.body?.momento,
      canal:       req.body?.canal,
      resultado:   req.body?.resultado,
      observacion: req.body?.observacion ?? null,
      usuario:     req.user.usuario,
    })
    res.status(201).json({ id })
  } catch (err) { responderError(res, next, err) }
}

// PUT /api/h360/duelo/gestion/:id/servicios
async function guardarServicios(req, res, next) {
  try {
    if (!Array.isArray(req.body?.servicios))
      return res.status(400).json({ mensaje: 'Se espera una lista en "servicios"' })
    await svc.guardarServicios(req.params.id, req.body.servicios)
    const data = await svc.serviciosDeGestion(req.params.id)
    res.json({ data })
  } catch (err) { responderError(res, next, err) }
}
```

Y reemplazar la última línea por:

```js
module.exports = { bandeja, buscar, ficha, crear, actualizar, agregarIntento,
  guardarServicios, esOtraCiudad, ramaDe }
```

- [ ] **Paso 4: Correr la prueba y verificar que pasa**

Correr: `npx jest src/h360/controllers/__tests__/duelo.gestion.test.js`
Esperado: PASS, 10 pruebas

- [ ] **Paso 5: Commit**

```bash
git add src/h360/controllers/duelo.controller.js \
        src/h360/controllers/__tests__/duelo.gestion.test.js
git commit -m "feat(h360): ficha de gestion, intentos y servicios del R-56"
```

---

### Tarea 7: Atenciones psicológicas y su permiso

Esta tarea es la que protege dato de salud. El permiso se prueba, no se asume.

**Archivos:**
- Crear: `src/h360/services/duelo_atenciones.service.js`
- Crear: `src/h360/controllers/duelo_atenciones.controller.js`
- Prueba: `src/h360/controllers/__tests__/duelo.atenciones.test.js`

**Interfaces:**
- Consume: `src/h360/config/db`, `normalizarFechaHora`.
- Produce:
  - servicio: `atencionesDeGestion(gestionId)` → `Promise<fila[]>`,
    `crearAtencion(gestionId, datos)` → `Promise<number>`
  - controlador: `listar(req, res, next)`, `crear(req, res, next)`

- [ ] **Paso 1: Escribir la prueba que falla**

```js
// src/h360/controllers/__tests__/duelo.atenciones.test.js
// Las notas de una atención son dato de salud de un tercero. La Ley 1581 de
// 2012 las trata como sensibles. Acá se prueba que solo salen por su propia
// ruta y solo para quien puede leerlas.

jest.mock('../../config/db')
const db = require('../../config/db')
const ctrl = require('../duelo_atenciones.controller')

const resDoble = () => {
  const r = { codigo: 200, cuerpo: null }
  r.status = c => { r.codigo = c; return r }
  r.json = b => { r.cuerpo = b; return r }
  return r
}

beforeEach(() => {
  jest.clearAllMocks()
  db.query = jest.fn(async () => [[{
    id: 1, gestion_id: 5, momento: '2026-11-05 14:30:00', modalidad: 'PRESENCIAL',
    psicologa: 'JAZMIN', motivo: 'crisis de la hija', notas: 'contenido clínico',
  }]])
})

describe('listar', () => {
  test('psicología ve las atenciones con sus notas', async () => {
    const res = resDoble()
    await ctrl.listar({ params: { id: '5' }, user: { rol: 'psicologia', usuario: 'JAZMIN' } },
      res, jest.fn())
    expect(res.codigo).toBe(200)
    expect(res.cuerpo.data[0].notas).toBe('contenido clínico')
  })

  test('admin también', async () => {
    const res = resDoble()
    await ctrl.listar({ params: { id: '5' }, user: { rol: 'admin', usuario: 'A' } }, res, jest.fn())
    expect(res.codigo).toBe(200)
  })

  // Lo importante: ningún otro rol, por más alto que sea en la operación.
  test.each(['coordinador', 'supervisora', 'contabilidad', 'asesor', 'recepcion', 'asistente'])(
    'el rol %s recibe 403 y no consulta la base', async rol => {
      const res = resDoble()
      await ctrl.listar({ params: { id: '5' }, user: { rol, usuario: 'X' } }, res, jest.fn())
      expect(res.codigo).toBe(403)
      expect(JSON.stringify(res.cuerpo)).not.toContain('notas')
      expect(db.query).not.toHaveBeenCalled()
    })

  test('sin usuario, 403', async () => {
    const res = resDoble()
    await ctrl.listar({ params: { id: '5' }, user: undefined }, res, jest.fn())
    expect(res.codigo).toBe(403)
  })
})

describe('crear', () => {
  test('guarda la hora tal como se escribió', async () => {
    db.query = jest.fn(async () => [{ insertId: 7 }])
    const res = resDoble()
    await ctrl.crear({
      params: { id: '5' },
      body: { momento: '2026-11-05T14:30', modalidad: 'PRESENCIAL',
              motivo: 'crisis', notas: 'algo' },
      user: { rol: 'psicologia', usuario: 'JAZMIN' },
    }, res, jest.fn())
    expect(res.codigo).toBe(201)
    const params = db.query.mock.calls[0][1]
    expect(params).toContain('2026-11-05 14:30:00')
  })

  test('la psicóloga sale del login', async () => {
    db.query = jest.fn(async () => [{ insertId: 7 }])
    await ctrl.crear({
      params: { id: '5' },
      body: { momento: '2026-11-05T14:30', modalidad: 'PRESENCIAL', psicologa: 'OTRA' },
      user: { rol: 'psicologia', usuario: 'JAZMIN' },
    }, resDoble(), jest.fn())
    expect(db.query.mock.calls[0][1]).toContain('JAZMIN')
    expect(db.query.mock.calls[0][1]).not.toContain('OTRA')
  })

  test('un rol que no es psicología no puede crear', async () => {
    const res = resDoble()
    await ctrl.crear({
      params: { id: '5' }, body: { momento: '2026-11-05T14:30', modalidad: 'PRESENCIAL' },
      user: { rol: 'coordinador', usuario: 'X' },
    }, res, jest.fn())
    expect(res.codigo).toBe(403)
    expect(db.query).not.toHaveBeenCalled()
  })

  test('exige modalidad y una hora válida', async () => {
    const res = resDoble()
    await ctrl.crear({
      params: { id: '5' }, body: { momento: '2026-02-31T14:30', modalidad: 'PRESENCIAL' },
      user: { rol: 'psicologia', usuario: 'JAZMIN' },
    }, res, jest.fn())
    expect(res.codigo).toBe(400)
  })

  // Las notas no van a ningún log: un log se lee sin permiso alguno.
  test('las notas no se escriben en el log', async () => {
    db.query = jest.fn(async () => [{ insertId: 7 }])
    const log = jest.spyOn(console, 'log').mockImplementation(() => {})
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    await ctrl.crear({
      params: { id: '5' },
      body: { momento: '2026-11-05T14:30', modalidad: 'PRESENCIAL', notas: 'SECRETO_CLINICO' },
      user: { rol: 'psicologia', usuario: 'JAZMIN' },
    }, resDoble(), jest.fn())
    const todo = [...log.mock.calls, ...warn.mock.calls].flat().join(' ')
    expect(todo).not.toContain('SECRETO_CLINICO')
    log.mockRestore(); warn.mockRestore()
  })
})
```

- [ ] **Paso 2: Correr la prueba y verificar que falla**

Correr: `npx jest src/h360/controllers/__tests__/duelo.atenciones.test.js`
Esperado: FAIL — `Cannot find module '../duelo_atenciones.controller'`

- [ ] **Paso 3: Implementar el servicio**

```js
// src/h360/services/duelo_atenciones.service.js
/**
 * duelo_atenciones.service.js
 * Atenciones psicológicas del R-56.
 *
 * Está separado de duelo.service.js a propósito: `notas` es contenido clínico
 * y dato sensible según la Ley 1581 de 2012. Tenerlo en su propio archivo hace
 * que el permiso sea una frontera visible y que nadie lo arrastre por descuido
 * a una consulta general.
 */
const db = require('../config/db')
const { normalizarFechaHora } = require('../utils/fecha_hora')
const { malUso } = require('../utils/errores')

const MODALIDADES_ATENCION = ['PRESENCIAL', 'TELEFONICA', 'VIRTUAL']

async function atencionesDeGestion(gestionId) {
  const [f] = await db.query(
    'SELECT * FROM h360_duelo_atenciones WHERE gestion_id = ? ORDER BY momento ASC, id ASC',
    [gestionId])
  return f
}

async function crearAtencion(gestionId, datos) {
  if (!MODALIDADES_ATENCION.includes(datos.modalidad))
    throw malUso('La modalidad de la atención no es válida')
  const cuando = normalizarFechaHora(datos.momento)
  if (!cuando) throw malUso('La fecha y hora de la atención no es válida')

  const [r] = await db.query(
    `INSERT INTO h360_duelo_atenciones
       (gestion_id, momento, modalidad, psicologa, acompanante,
        atendido_nombre, atendido_parentesco, motivo, notas, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [gestionId, cuando, datos.modalidad, datos.psicologa, datos.acompanante ?? null,
     datos.atendido_nombre ?? null, datos.atendido_parentesco ?? null,
     datos.motivo ?? null, datos.notas ?? null, datos.created_by])
  return r.insertId
}

module.exports = { atencionesDeGestion, crearAtencion, MODALIDADES_ATENCION }
```

- [ ] **Paso 4: Implementar el controlador**

```js
// src/h360/controllers/duelo_atenciones.controller.js
/**
 * duelo_atenciones.controller.js
 * Registro de atención psicológica del R-56.
 *
 * El permiso se verifica acá además de en la ruta. Es redundante a propósito:
 * si algún día alguien monta estas funciones en otra ruta y se le olvida el
 * requireRol, el dato sigue protegido. Son 941 atenciones al año sobre
 * familias en duelo; el costo de un `if` de más es nada.
 *
 * Nada de lo que hay en `notas` se escribe a un log.
 */
const svc = require('../services/duelo_atenciones.service')

const ROLES_PERMITIDOS = ['psicologia', 'admin']

function puede(req) {
  return !!req.user && ROLES_PERMITIDOS.includes(req.user.rol)
}

function denegar(res) {
  return res.status(403).json({
    mensaje: 'El registro de atención psicológica solo lo consulta el equipo de psicología.',
  })
}

// GET /api/h360/duelo/gestion/:id/atenciones
async function listar(req, res, next) {
  if (!puede(req)) return denegar(res)
  try {
    const data = await svc.atencionesDeGestion(req.params.id)
    res.json({ data })
  } catch (err) { next(err) }
}

// POST /api/h360/duelo/gestion/:id/atenciones
async function crear(req, res, next) {
  if (!puede(req)) return denegar(res)
  try {
    const id = await svc.crearAtencion(req.params.id, {
      momento:             req.body?.momento,
      modalidad:           req.body?.modalidad,
      // Del login, no del cuerpo.
      psicologa:           req.user.usuario,
      acompanante:         req.body?.acompanante ?? null,
      atendido_nombre:     req.body?.atendido_nombre ?? null,
      atendido_parentesco: req.body?.atendido_parentesco ?? null,
      motivo:              req.body?.motivo ?? null,
      notas:               req.body?.notas ?? null,
      created_by:          req.user.usuario,
    })
    res.status(201).json({ id })
  } catch (err) {
    if (err?.status === 400) return res.status(400).json({ mensaje: err.message })
    // El mensaje de error no incluye el cuerpo: ahí van las notas.
    next(err)
  }
}

module.exports = { listar, crear }
```

- [ ] **Paso 5: Correr la prueba y verificar que pasa**

Correr: `npx jest src/h360/controllers/__tests__/duelo.atenciones.test.js`
Esperado: PASS, 12 pruebas (incluidas las 6 del `test.each` de roles)

- [ ] **Paso 6: Commit**

```bash
git add src/h360/services/duelo_atenciones.service.js \
        src/h360/controllers/duelo_atenciones.controller.js \
        src/h360/controllers/__tests__/duelo.atenciones.test.js
git commit -m "feat(h360): registro de atencion psicologica con acceso restringido"
```

---

### Tarea 8: Rutas

**Archivos:**
- Crear: `src/h360/routes/duelo.routes.js`
- Modificar: `src/h360/routes/index.js`

**Interfaces:**
- Consume: los dos controladores y `requireRol` de `../middleware/auth`.
- Produce: el módulo montado en `/api/h360/duelo`.

- [ ] **Paso 1: Escribir las rutas**

```js
// src/h360/routes/duelo.routes.js
const router = require('express').Router()
const { requireRol } = require('../middleware/auth')
const ctrl = require('../controllers/duelo.controller')
const atenciones = require('../controllers/duelo_atenciones.controller')

const EQUIPO = ['psicologia', 'admin']

router.get('/bandeja',                    requireRol(...EQUIPO), ctrl.bandeja)
router.get('/buscar',                     requireRol(...EQUIPO), ctrl.buscar)
router.get('/gestion/:orden',             requireRol(...EQUIPO), ctrl.ficha)
router.post('/gestion',                   requireRol(...EQUIPO), ctrl.crear)
router.patch('/gestion/:id',              requireRol(...EQUIPO), ctrl.actualizar)
router.post('/gestion/:id/intentos',      requireRol(...EQUIPO), ctrl.agregarIntento)
router.put('/gestion/:id/servicios',      requireRol(...EQUIPO), ctrl.guardarServicios)

// Dato de salud. El controlador vuelve a verificar el rol por si estas
// funciones terminan montadas en otra ruta sin el requireRol.
router.get('/gestion/:id/atenciones',     requireRol(...EQUIPO), atenciones.listar)
router.post('/gestion/:id/atenciones',    requireRol(...EQUIPO), atenciones.crear)

module.exports = router
```

- [ ] **Paso 2: Montar el módulo**

En `src/h360/routes/index.js`, agregar el `require` junto a los demás:

```js
const dueloRoutes               = require('./duelo.routes')
```

y la línea de montaje después de la de `reportes`:

```js
router.use('/duelo',                 verifyToken, dueloRoutes)
```

- [ ] **Paso 3: Verificar que el backend arranca y la ruta exige token**

Correr: `node --check src/h360/routes/duelo.routes.js && node --check src/h360/routes/index.js`
Esperado: sin salida (sintaxis correcta)

Correr: `npx jest src/h360`
Esperado: PASS en todas las suites del módulo

- [ ] **Paso 4: Commit**

```bash
git add src/h360/routes/duelo.routes.js src/h360/routes/index.js
git commit -m "feat(h360): montar las rutas del modulo de duelo"
```

---

### Tarea 9: Frontend — store y bandeja

**Archivos:**
- Crear: `homenajes360-frontend/src/stores/duelo.js`
- Crear: `homenajes360-frontend/src/views/duelo/BandejaDueloView.vue`
- Crear: `homenajes360-frontend/src/views/duelo/BuscarDueloView.vue`
- Modificar: `homenajes360-frontend/src/router/index.js`

**Interfaces:**
- Consume: `src/services/api` (su `baseURL` ya incluye `/api/h360`, así que las
  rutas van como `/duelo/...`).
- Produce: `useDueloStore` con `bandeja`, `cargando`, `error`,
  `fetchBandeja(filtros)`, `buscar(criterios)`, `fetchFicha(orden)`,
  `crearGestion(datos)`, `actualizarGestion(id, cambios)`,
  `agregarIntento(id, datos)`, `guardarServicios(id, lista)`,
  `fetchAtenciones(id)`, `crearAtencion(id, datos)`.

- [ ] **Paso 1: Escribir el store**

```js
// homenajes360-frontend/src/stores/duelo.js
import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../services/api'

export const useDueloStore = defineStore('duelo', () => {
  const bandeja  = ref([])
  const ficha    = ref(null)
  const cargando = ref(false)
  const error    = ref(null)

  // El 503 del ERP se distingue del resto: no es un fallo nuestro y el mensaje
  // que manda el backend ya explica qué hacer.
  function mensajeDe(e, porDefecto) {
    if (e.response?.status === 503) return e.response.data?.mensaje || 'El ERP no responde'
    return e.response?.data?.mensaje || porDefecto
  }

  async function fetchBandeja(filtros = {}) {
    error.value = null; cargando.value = true
    try {
      const { data } = await api.get('/duelo/bandeja', { params: filtros })
      bandeja.value = data.data ?? []
      return data
    } catch (e) { error.value = mensajeDe(e, 'Error al cargar la bandeja del día') }
    finally { cargando.value = false }
  }

  async function buscar(criterios = {}) {
    error.value = null; cargando.value = true
    try {
      const { data } = await api.get('/duelo/buscar', { params: criterios })
      bandeja.value = data.data ?? []
      return data
    } catch (e) { error.value = mensajeDe(e, 'Error en la búsqueda') }
    finally { cargando.value = false }
  }

  async function fetchFicha(orden) {
    error.value = null; cargando.value = true
    try {
      const { data } = await api.get(`/duelo/gestion/${encodeURIComponent(orden)}`)
      ficha.value = data
      return data
    } catch (e) { error.value = mensajeDe(e, 'Error al cargar la gestión') }
    finally { cargando.value = false }
  }

  const crearGestion      = datos        => api.post('/duelo/gestion', datos).then(r => r.data)
  const actualizarGestion = (id, camb)   => api.patch(`/duelo/gestion/${id}`, camb).then(r => r.data)
  const agregarIntento    = (id, datos)  => api.post(`/duelo/gestion/${id}/intentos`, datos).then(r => r.data)
  const guardarServicios  = (id, lista)  => api.put(`/duelo/gestion/${id}/servicios`, { servicios: lista }).then(r => r.data)
  const fetchAtenciones   = id           => api.get(`/duelo/gestion/${id}/atenciones`).then(r => r.data.data)
  const crearAtencion     = (id, datos)  => api.post(`/duelo/gestion/${id}/atenciones`, datos).then(r => r.data)

  return { bandeja, ficha, cargando, error, fetchBandeja, buscar, fetchFicha,
    crearGestion, actualizarGestion, agregarIntento, guardarServicios,
    fetchAtenciones, crearAtencion }
})
```

- [ ] **Paso 2: Escribir la bandeja**

```vue
<!-- homenajes360-frontend/src/views/duelo/BandejaDueloView.vue -->
<template>
  <div class="p-4 md:p-6 max-w-7xl mx-auto">
    <h1 class="text-xl font-semibold text-gray-800 mb-1">Acompañamiento al duelo</h1>
    <p class="text-sm text-gray-500 mb-4">
      Órdenes de ayer y hoy en el ERP. Cada fila dice por dónde se gestiona y qué falta.
    </p>

    <!-- FILTROS -->
    <div class="bg-white rounded-xl border border-gray-200 p-4 mb-4 grid gap-3 sm:grid-cols-5">
      <div><label class="label">Desde</label>
        <input v-model="filtros.desde" type="date" class="input" /></div>
      <div><label class="label">Hasta</label>
        <input v-model="filtros.hasta" type="date" class="input" /></div>
      <div><label class="label">Rama</label>
        <select v-model="filtros.rama" class="input">
          <option value="">Todas</option>
          <option value="SALA">Sala de velación</option>
          <option value="RESIDENCIA">Residencia</option>
          <option value="OTRA_CIUDAD">Otra ciudad</option>
        </select></div>
      <div><label class="label">Estado</label>
        <select v-model="filtros.estado" class="input">
          <option value="">Todos</option>
          <option value="PENDIENTE">Pendientes</option>
          <option value="EN_GESTION">En gestión</option>
          <option value="GESTIONADA">Gestionadas</option>
          <option value="NO_LOGRADA">No logradas</option>
        </select></div>
      <div class="flex items-end">
        <label class="flex items-center gap-2 text-sm text-gray-600">
          <input v-model="incluirMascotas" type="checkbox" class="rounded" />
          Incluir mascotas
        </label>
      </div>
    </div>

    <p v-if="store.error" class="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-4 py-3 mb-4">
      ⚠️ {{ store.error }}
    </p>

    <p v-if="store.cargando" class="text-sm text-gray-400">Consultando el ERP…</p>

    <p v-else-if="!store.bandeja.length"
      class="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded p-4">
      No hay órdenes en el rango seleccionado.
    </p>

    <!-- LISTA -->
    <div v-else class="space-y-2">
      <router-link v-for="f in store.bandeja" :key="f.orden_servicio"
        :to="`/duelo/${encodeURIComponent(f.orden_servicio)}`"
        class="block bg-white rounded-xl border border-gray-200 hover:border-gray-400 transition px-4 py-3">
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span class="font-semibold text-sm text-gray-800">{{ f.orden_servicio }}</span>
          <span class="text-sm text-gray-600">{{ f.nombre_ser_querido || '—' }}</span>
          <span class="text-xs text-gray-400">{{ f.sede }}</span>

          <span class="text-xs px-2 py-0.5 rounded-full" :class="claseRama(f.rama)">
            {{ etiquetaRama(f.rama) }}
          </span>

          <span v-if="f.es_mascota"
            class="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
            Mascota
          </span>

          <span v-if="f.asistencia"
            class="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700"
            :title="`Caso en H360: ${f.asistencia.codigo}`">
            {{ f.asistencia.ubicacion_detalle || f.asistencia.codigo }}
          </span>

          <span class="text-xs px-2 py-0.5 rounded-full ml-auto"
            :class="claseEstado(f.gestion?.estado)">
            {{ etiquetaEstado(f.gestion?.estado) }}
          </span>
        </div>
        <p class="text-xs text-gray-400 mt-1">
          Fallecimiento {{ f.fecha_fallecimiento || '—' }}
          <template v-if="f.telefono"> · tel {{ f.telefono }}</template>
          <template v-else> · <span class="text-amber-700">sin teléfono en el ERP</span></template>
        </p>
      </router-link>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, computed } from 'vue'
import { useDueloStore } from '../../stores/duelo'

const store = useDueloStore()
const filtros = ref({ desde: '', hasta: '', rama: '', estado: '' })
const incluirMascotas = ref(true)

const RAMAS = {
  SALA:        { label: 'Sala',        clase: 'bg-indigo-100 text-indigo-700' },
  RESIDENCIA:  { label: 'Residencia',  clase: 'bg-sky-100 text-sky-700' },
  OTRA_CIUDAD: { label: 'Otra ciudad', clase: 'bg-violet-100 text-violet-700' },
}
const etiquetaRama = r => RAMAS[r]?.label || r || '—'
const claseRama    = r => RAMAS[r]?.clase || 'bg-gray-100 text-gray-600'

const ESTADOS = {
  PENDIENTE:  { label: 'Pendiente',  clase: 'bg-amber-100 text-amber-700' },
  EN_GESTION: { label: 'En gestión', clase: 'bg-blue-100 text-blue-700' },
  GESTIONADA: { label: 'Gestionada', clase: 'bg-gray-200 text-gray-600' },
  NO_LOGRADA: { label: 'No lograda', clase: 'bg-red-100 text-red-700' },
  NO_APLICA:  { label: 'No aplica',  clase: 'bg-gray-100 text-gray-500' },
  REPETIDA:   { label: 'Repetida',   clase: 'bg-gray-100 text-gray-500' },
}
const etiquetaEstado = e => ESTADOS[e || 'PENDIENTE']?.label || e
const claseEstado    = e => ESTADOS[e || 'PENDIENTE']?.clase || 'bg-gray-100 text-gray-600'

const params = computed(() => {
  const p = { ...filtros.value }
  for (const k of Object.keys(p)) if (!p[k]) delete p[k]
  if (!incluirMascotas.value) p.incluir_mascotas = 'false'
  return p
})

let tiempo = null
watch([filtros, incluirMascotas], () => {
  clearTimeout(tiempo)
  tiempo = setTimeout(() => store.fetchBandeja(params.value), 250)
}, { deep: true })

onMounted(() => store.fetchBandeja())
</script>
```

- [ ] **Paso 3: Escribir la pantalla de búsqueda**

```vue
<!-- homenajes360-frontend/src/views/duelo/BuscarDueloView.vue -->
<template>
  <div class="p-4 md:p-6 max-w-5xl mx-auto">
    <router-link to="/duelo" class="text-sm text-gray-500 hover:text-gray-800">← Volver a la bandeja</router-link>

    <h1 class="text-xl font-semibold text-gray-800 mt-2 mb-1">Buscar un caso</h1>
    <p class="text-sm text-gray-500 mb-4">
      Por número de contrato, nombre del ser querido o fecha de fallecimiento.
      Se pueden combinar.
    </p>

    <form @submit.prevent="ejecutar"
      class="bg-white rounded-xl border border-gray-200 p-4 mb-4 grid gap-3 sm:grid-cols-4 items-end">
      <div><label class="label">Contrato</label>
        <input v-model="criterios.contrato" class="input" placeholder="A-20538" /></div>
      <div><label class="label">Nombre del ser querido</label>
        <input v-model="criterios.nombre" class="input" placeholder="prada gomez" /></div>
      <div><label class="label">Fecha de fallecimiento</label>
        <input v-model="criterios.fecha_fallecimiento" type="date" class="input" /></div>
      <button type="submit" :disabled="!hayCriterio || store.cargando" class="btn-primary">
        {{ store.cargando ? 'Buscando…' : 'Buscar' }}
      </button>
    </form>

    <p v-if="store.error" class="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-4 py-3 mb-4">
      ⚠️ {{ store.error }}
    </p>

    <p v-if="buscado && !store.bandeja.length && !store.cargando"
      class="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded p-4">
      Ningún caso coincide con esos criterios.
    </p>

    <div v-else-if="store.bandeja.length" class="space-y-2">
      <router-link v-for="f in store.bandeja" :key="f.orden_servicio"
        :to="`/duelo/${encodeURIComponent(f.orden_servicio)}`"
        class="block bg-white rounded-xl border border-gray-200 hover:border-gray-400 transition px-4 py-3">
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span class="font-semibold text-sm text-gray-800">{{ f.orden_servicio }}</span>
          <span class="text-sm text-gray-600">{{ f.nombre_ser_querido || '—' }}</span>
          <span class="text-xs text-gray-400">{{ f.sede }}</span>
          <span v-if="f.es_mascota"
            class="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">Mascota</span>
          <span class="text-xs text-gray-400 ml-auto">
            {{ f.gestion ? 'Ya gestionada' : 'Sin gestionar' }}
          </span>
        </div>
        <p class="text-xs text-gray-400 mt-1">Fallecimiento {{ f.fecha_fallecimiento || '—' }}</p>
      </router-link>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useDueloStore } from '../../stores/duelo'

const store = useDueloStore()
const criterios = ref({ contrato: '', nombre: '', fecha_fallecimiento: '' })
const buscado = ref(false)

const hayCriterio = computed(() =>
  !!(criterios.value.contrato.trim() || criterios.value.nombre.trim()
     || criterios.value.fecha_fallecimiento))

async function ejecutar() {
  if (!hayCriterio.value) return
  const p = {}
  for (const [k, v] of Object.entries(criterios.value)) if (String(v).trim()) p[k] = v
  await store.buscar(p)
  buscado.value = true
}
</script>
```

- [ ] **Paso 4: Registrar las rutas**

En `homenajes360-frontend/src/router/index.js`, junto a las demás rutas hijas.

> **El orden de estas tres importa.** `duelo/buscar` tiene que ir ANTES de
> `duelo/:orden`: vue-router resuelve por orden de declaración, y si la ruta con
> parámetro va primero se queda con «buscar» como si fuera un número de
> contrato. La pantalla de búsqueda no abriría nunca y en su lugar saldría una
> ficha vacía de una orden llamada «buscar».

```js
      // POSEXEQUIALES — R-56 acompañamiento al duelo
      {
        path: 'duelo',
        name: 'BandejaDuelo',
        component: () => import('../views/duelo/BandejaDueloView.vue'),
        meta: { roles: ['psicologia', 'admin'] },
      },
      // Antes que duelo/:orden, o el parámetro se come esta ruta.
      {
        path: 'duelo/buscar',
        name: 'BuscarDuelo',
        component: () => import('../views/duelo/BuscarDueloView.vue'),
        meta: { roles: ['psicologia', 'admin'] },
      },
      {
        path: 'duelo/:orden',
        name: 'GestionDuelo',
        component: () => import('../views/duelo/GestionDueloView.vue'),
        meta: { roles: ['psicologia', 'admin'] },
      },
```

Y en la bandeja, un enlace a la búsqueda. En `BandejaDueloView.vue`, debajo del
párrafo de introducción:

```html
    <router-link to="/duelo/buscar"
      class="inline-block text-sm text-slate-700 underline mb-4">
      Buscar un caso por contrato, nombre o fecha
    </router-link>
```

- [ ] **Paso 5: Compilar**

Correr, desde `homenajes360-frontend/`: `npm run build`
Esperado: `✓ built in …`, sin errores

> La Tarea 10 crea `GestionDueloView.vue`. Si se compila antes de tenerla, el
> build falla por el import dinámico; hacer las dos tareas seguidas o crear el
> archivo con un `<template><div/></template>` mínimo en este paso.

- [ ] **Paso 6: Verificar que el orden de rutas quedó bien**

Con el servidor de desarrollo arriba, abrir `/duelo/buscar` y confirmar que sale
el formulario de búsqueda y no una ficha vacía. Es la comprobación de la trampa
del Paso 4.

- [ ] **Paso 7: Commit**

```bash
git add src/stores/duelo.js src/views/duelo/BandejaDueloView.vue \
        src/views/duelo/BuscarDueloView.vue src/router/index.js
git commit -m "feat(h360): bandeja y busqueda de acompanamiento al duelo"
```

---

### Tarea 10: Frontend — ficha de gestión

**Archivos:**
- Crear: `homenajes360-frontend/src/views/duelo/GestionDueloView.vue`

**Interfaces:**
- Consume: `useDueloStore` de la Tarea 9, con todos sus métodos.
- Produce: la pantalla de trabajo. No exporta nada.

- [ ] **Paso 1: Escribir la ficha**

```vue
<!-- homenajes360-frontend/src/views/duelo/GestionDueloView.vue -->
<template>
  <div class="p-4 md:p-6 max-w-5xl mx-auto">
    <router-link to="/duelo" class="text-sm text-gray-500 hover:text-gray-800">← Volver a la bandeja</router-link>

    <h1 class="text-xl font-semibold text-gray-800 mt-2 mb-1">
      {{ f?.contrato?.orden_servicio || orden }}
    </h1>

    <p v-if="f?.erp_error" class="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4">
      ⚠️ {{ f.erp_error }} La gestión sigue funcionando sin esos datos.
    </p>

    <!-- CONTRATO EN EL ERP, en vivo -->
    <section v-if="f?.contrato" class="bg-white rounded-xl border border-gray-200 p-4 mb-4">
      <h2 class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Contrato en el ERP</h2>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
        <div v-for="c in camposErp" :key="c.label">
          <p class="text-xs text-gray-400 mb-0.5">{{ c.label }}</p>
          <p class="font-medium text-gray-800">{{ c.valor }}</p>
        </div>
      </div>
    </section>

    <!-- ABRIR LA GESTIÓN -->
    <section v-if="!f?.gestion" class="bg-white rounded-xl border border-gray-200 p-4 mb-4">
      <p class="text-sm text-gray-600 mb-3">Esta orden todavía no tiene gestión abierta.</p>
      <button @click="abrir" :disabled="abriendo" class="btn-primary">
        {{ abriendo ? 'Abriendo…' : 'Abrir gestión' }}
      </button>
    </section>

    <template v-else>
      <!-- INTENTOS -->
      <section class="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
          Intentos ({{ f.intentos.length }})
        </h2>

        <ol v-if="f.intentos.length" class="space-y-1 mb-4 text-sm">
          <li v-for="i in f.intentos" :key="i.id" class="flex gap-3 border-b border-gray-50 pb-1">
            <span class="text-gray-400 text-xs w-36 shrink-0">{{ i.momento }}</span>
            <span class="font-medium">{{ i.canal }}</span>
            <span class="text-gray-600">{{ i.resultado }}</span>
            <span class="text-gray-400 text-xs">{{ i.observacion }}</span>
          </li>
        </ol>
        <p v-else class="text-sm text-gray-400 mb-4">Todavía no hay intentos registrados.</p>

        <div class="grid gap-3 sm:grid-cols-4 items-end">
          <div><label class="label">Cuándo *</label>
            <input v-model="nuevoIntento.momento" type="datetime-local" class="input" /></div>
          <div><label class="label">Canal *</label>
            <select v-model="nuevoIntento.canal" class="input">
              <option value="VISITA_SALA">Visita a sala</option>
              <option value="VISITA_RESIDENCIA">Visita a residencia</option>
              <option value="LLAMADA">Llamada</option>
              <option value="MENSAJE">Mensaje</option>
              <option value="WHATSAPP">WhatsApp</option>
            </select></div>
          <div><label class="label">Resultado *</label>
            <select v-model="nuevoIntento.resultado" class="input">
              <option value="CONTACTADO">Contactado</option>
              <option value="NO_CONTESTO">No contestó</option>
              <option value="NUMERO_ERRADO">Número errado</option>
              <option value="NO_DISPONIBLE">No disponible</option>
              <option value="RECHAZA">Rechaza</option>
            </select></div>
          <button @click="registrarIntento"
            :disabled="!nuevoIntento.momento || guardando" class="btn-primary">
            Registrar intento
          </button>
          <div class="sm:col-span-4"><label class="label">Observación</label>
            <input v-model="nuevoIntento.observacion" class="input" /></div>
        </div>
      </section>

      <!-- SERVICIOS OFRECIDOS -->
      <section class="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <h2 class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Servicios ofrecidos</h2>
        <div class="space-y-2">
          <div v-for="s in servicios" :key="s.servicio"
            class="grid gap-2 sm:grid-cols-4 items-end border-b border-gray-50 pb-2">
            <p class="text-sm font-medium text-gray-700">{{ ETIQUETA_SERVICIO[s.servicio] }}</p>
            <select v-model="s.estado" class="input">
              <option value="">— sin registrar —</option>
              <option value="ACEPTA">Acepta</option>
              <option value="NO_DESEA">No desea</option>
              <option value="OFRECIDO_SIN_RESPUESTA">Ofrecido, sin respuesta</option>
              <option value="FUERA_DE_CIUDAD">Fuera de la ciudad</option>
              <option value="NO_APLICA">No aplica</option>
              <option value="DESISTE">Desiste</option>
            </select>
            <select v-model="s.modalidad" class="input">
              <option value="">— modalidad —</option>
              <option value="PRESENCIAL">Presencial</option>
              <option value="VIRTUAL">Virtual</option>
              <option value="MENSAJE">Por mensaje</option>
            </select>
            <select v-if="s.servicio === 'MISA_DE_MES'" v-model="s.detalle" class="input">
              <option value="">— religión —</option>
              <option value="CATOLICA">Católica</option>
              <option value="CRISTIANA">Cristiana</option>
              <option value="MIXTA">Mixta</option>
              <option value="MUSULMANA">Musulmana</option>
              <option value="TESTIGOS_JEHOVA">Testigos de Jehová</option>
            </select>
            <input v-else v-model="s.observacion" class="input" placeholder="Observación" />
          </div>
        </div>
        <button @click="guardarServicios" :disabled="guardando" class="btn-primary mt-3">
          {{ guardando ? 'Guardando…' : 'Guardar servicios' }}
        </button>
      </section>

      <!-- ATENCIÓN PSICOLÓGICA -->
      <section class="bg-white rounded-xl border border-gray-200 p-4">
        <h2 class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
          Atención psicológica
        </h2>
        <p class="text-xs text-gray-400 mb-3">
          Historia clínica. Solo la consulta el equipo de psicología.
        </p>

        <div v-if="atenciones.length" class="space-y-2 mb-4 text-sm">
          <article v-for="a in atenciones" :key="a.id" class="border border-gray-100 rounded p-3">
            <p class="text-xs text-gray-400">{{ a.momento }} · {{ a.modalidad }} · {{ a.psicologa }}</p>
            <p v-if="a.motivo" class="font-medium text-gray-800 mt-1">{{ a.motivo }}</p>
            <p v-if="a.notas" class="text-gray-700 whitespace-pre-line mt-1">{{ a.notas }}</p>
          </article>
        </div>
        <p v-else class="text-sm text-gray-400 mb-4">No hay atenciones registradas.</p>

        <div class="grid gap-3 sm:grid-cols-3">
          <div><label class="label">Cuándo *</label>
            <input v-model="nuevaAtencion.momento" type="datetime-local" class="input" /></div>
          <div><label class="label">Modalidad *</label>
            <select v-model="nuevaAtencion.modalidad" class="input">
              <option value="PRESENCIAL">Presencial</option>
              <option value="TELEFONICA">Telefónica</option>
              <option value="VIRTUAL">Virtual</option>
            </select></div>
          <div><label class="label">A quién</label>
            <input v-model="nuevaAtencion.atendido_nombre" class="input" /></div>
          <div class="sm:col-span-3"><label class="label">Motivo</label>
            <input v-model="nuevaAtencion.motivo" class="input" /></div>
          <div class="sm:col-span-3"><label class="label">Notas</label>
            <textarea v-model="nuevaAtencion.notas" rows="4" class="input resize-none" /></div>
        </div>
        <button @click="registrarAtencion"
          :disabled="!nuevaAtencion.momento || guardando" class="btn-primary mt-3">
          Registrar atención
        </button>
      </section>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useDueloStore } from '../../stores/duelo'

const route = useRoute()
const store = useDueloStore()
const orden = route.params.orden

const f = computed(() => store.ficha)
const abriendo  = ref(false)
const guardando = ref(false)
const atenciones = ref([])

const ETIQUETA_SERVICIO = {
  CARTILLA_RENACER:    'Cartilla Renacer',
  CONFERENCIA_RENACER: 'Conferencia Renacer',
  MISA_DE_MES:         'Misa de mes',
  TALLER_NINOS:        'Taller de niños (5 a 11)',
  GRUPO_APOYO_HIJOS:   'Grupo de apoyo por pérdida de hijos',
  TALLER_JOVENES:      'Taller de jóvenes (12 a 18)',
}
const ORDEN_SERVICIOS = Object.keys(ETIQUETA_SERVICIO)

const servicios = ref([])
const nuevoIntento  = ref({ momento: '', canal: 'LLAMADA', resultado: 'NO_CONTESTO', observacion: '' })
const nuevaAtencion = ref({ momento: '', modalidad: 'PRESENCIAL', atendido_nombre: '', motivo: '', notas: '' })

const camposErp = computed(() => {
  const c = f.value?.contrato
  if (!c) return []
  return [
    { label: 'Ser querido',          valor: c.nombre_ser_querido },
    { label: 'Fecha fallecimiento',  valor: c.fecha_fallecimiento },
    { label: 'Sede',                 valor: c.sede },
    { label: 'Convenio',             valor: c.convenio },
    { label: 'Entidad',              valor: c.entidad },
    { label: 'Teléfono',             valor: c.telefono },
    { label: 'Dirección',            valor: c.direccion },
    { label: 'Barrio',               valor: c.barrio },
  ].filter(x => x.valor !== null && x.valor !== undefined && String(x.valor).trim() !== '')
})

/** Los seis servicios siempre en pantalla, con lo guardado encima. */
function sembrarServicios() {
  const guardados = new Map((f.value?.servicios || []).map(s => [s.servicio, s]))
  servicios.value = ORDEN_SERVICIOS.map(k => ({
    servicio:    k,
    estado:      guardados.get(k)?.estado      || '',
    modalidad:   guardados.get(k)?.modalidad   || '',
    detalle:     guardados.get(k)?.detalle     || '',
    observacion: guardados.get(k)?.observacion || '',
  }))
}

async function cargar() {
  await store.fetchFicha(orden)
  sembrarServicios()
  if (f.value?.gestion) {
    try { atenciones.value = await store.fetchAtenciones(f.value.gestion.id) }
    catch { atenciones.value = [] }
  }
}

async function abrir() {
  abriendo.value = true
  try {
    await store.crearGestion({
      orden_servicio:    orden,
      asistencia_id:     f.value?.asistencia?.id ?? null,
      ubicacion_tipo:    f.value?.asistencia?.ubicacion_tipo || 'OTRO',
      ubicacion_detalle: f.value?.asistencia?.ubicacion_detalle || null,
      telefonos:         f.value?.contrato?.telefono || null,
    })
    await cargar()
  } finally { abriendo.value = false }
}

async function registrarIntento() {
  guardando.value = true
  try {
    await store.agregarIntento(f.value.gestion.id, nuevoIntento.value)
    nuevoIntento.value = { momento: '', canal: 'LLAMADA', resultado: 'NO_CONTESTO', observacion: '' }
    await cargar()
  } finally { guardando.value = false }
}

async function guardarServicios() {
  guardando.value = true
  try {
    // Solo los que tienen estado: un servicio sin registrar no se guarda vacío.
    await store.guardarServicios(f.value.gestion.id, servicios.value.filter(s => s.estado))
    await cargar()
  } finally { guardando.value = false }
}

async function registrarAtencion() {
  guardando.value = true
  try {
    await store.crearAtencion(f.value.gestion.id, nuevaAtencion.value)
    nuevaAtencion.value = { momento: '', modalidad: 'PRESENCIAL', atendido_nombre: '', motivo: '', notas: '' }
    await cargar()
  } finally { guardando.value = false }
}

onMounted(cargar)
</script>
```

- [ ] **Paso 2: Compilar**

Correr, desde `homenajes360-frontend/`: `npm run build`
Esperado: `✓ built in …`, sin errores

- [ ] **Paso 3: Commit**

```bash
git add src/views/duelo/GestionDueloView.vue
git commit -m "feat(h360): ficha de gestion del acompanamiento al duelo"
```

---

### Tarea 11: Puesta en producción

**El orden importa.** Si el código sale antes que las tablas, todo `INSERT`
falla. Pasó el 2026-11-04 con `viene_otra_ciudad` y dejó cinco respuestas 500
en la cara de una supervisora.

- [ ] **Paso 1: Confirmar que el grupo del AD existe**

```bash
ssh bortega@192.9.17.30 'grep -c LDAP_GROUP_PSICOLOGIA ~/apps/mantix/mantix-backend/.env'
```

Esperado: `1`. Si devuelve `0`, **parar**: pedirlo a TI antes de seguir.

- [ ] **Paso 2: Aplicar la migración**

Primero comprobar que ninguna de las cuatro tablas exista ya. Las sentencias
llevan `IF NOT EXISTS`, así que si una existe con la definición anterior MySQL
**solo emite un aviso y la deja como está**: el script termina sin error y el
esquema queda viejo — por ejemplo con el `ON DELETE CASCADE` en las notas
clínicas en vez del `RESTRICT`. Un éxito silencioso es peor que un fallo.

```bash
ssh bortega@192.9.17.30 'cd ~/apps/mantix/mantix-backend && set -a && . ./.env 2>/dev/null && set +a && MYSQL_PWD="$DB_PASSWORD" mysql -h "$DB_HOST" -u "$DB_USER" -N -B -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE \"h360_duelo%\"" "$DB_NAME"'
```

Esperado: `0`. Si devuelve otra cosa, **parar** y mirar con
`SHOW CREATE TABLE` cuál existe y con qué definición, antes de decidir si se
borra o se altera. Al 2026-11-05 la consulta daba `0`.

Con `0` confirmado, aplicar:

```bash
ssh -t bortega@192.9.17.30 'cd ~/apps/mantix/mantix-backend && mysql -u root -p serfuweb < src/scripts/h360_duelo_tablas.sql'
```

- [ ] **Paso 3: Verificar que las cuatro tablas existen**

```bash
ssh bortega@192.9.17.30 'cd ~/apps/mantix/mantix-backend && set -a && . ./.env 2>/dev/null && set +a && MYSQL_PWD="$DB_PASSWORD" mysql -h "$DB_HOST" -u "$DB_USER" -N -B -e "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE \"h360_duelo%\"" "$DB_NAME"'
```

Esperado: las cuatro — `h360_duelo_atenciones`, `h360_duelo_gestion`,
`h360_duelo_intentos`, `h360_duelo_servicios`.

- [ ] **Paso 4: Correr la suite completa antes de desplegar**

Correr: `npx jest`
Esperado: las suites del módulo en verde. Hay 3 suites que ya fallaban antes
(`grupoIndivII`, `afiliadoEmpresaAccess`, `invitacion.service`); no son de este
trabajo.

- [ ] **Paso 5: Desplegar el backend**

```bash
ssh -t bortega@192.9.17.30 'bash -lic deploy-mantix'
```

- [ ] **Paso 6: Verificar que arrancó limpio**

```bash
ssh bortega@192.9.17.30 'L=~/.pm2/logs/mantix-backend-out.log; N=$(grep -n "Servidor Mantix corriendo" $L | tail -1 | cut -d: -f1); echo "500: $(sed -n "$((N)),\$p" $L | grep -c "m500")"; echo "tabla desconocida: $(sed -n "$((N)),\$p" $L | grep -ci "doesn.t exist")"'
```

Esperado: `0` en los dos.

- [ ] **Paso 7: Desplegar el frontend**

```bash
cd homenajes360-frontend && ./deploy.sh
```

Esperado: `✓ Share SMB` y `✓ https://360.losolivoscucuta.com`, con el mismo hash.

- [ ] **Paso 8: Probar con una psicóloga real**

Entrar con una cuenta del grupo de psicología, abrir `/duelo`, confirmar que la
bandeja trae las órdenes del día, abrir una gestión, registrar un intento y
verificar que la hora guardada es la que se escribió.

Y la prueba que importa de verdad: **entrar con una cuenta de coordinación y
confirmar que `/duelo` no aparece en el menú y que la ruta responde 403.**
