const ExcelJS   = require('exceljs');
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

const DIVIPOLA = `CASE
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND (UPPER(a.ciudad) LIKE '%CUCUTA%' OR UPPER(a.ciudad) LIKE '%CÚCUTA%') THEN '54001'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND (UPPER(a.ciudad) LIKE '%ABREGO%' OR UPPER(a.ciudad) LIKE '%ÁBREGO%') THEN '54003'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND UPPER(a.ciudad) LIKE '%ARBOLEDAS%' THEN '54051'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND UPPER(a.ciudad) LIKE '%BOCHALEMA%' THEN '54099'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND UPPER(a.ciudad) LIKE '%BUCARASICA%' THEN '54109'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND UPPER(a.ciudad) LIKE '%CACOTA%' THEN '54125'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND (UPPER(a.ciudad) LIKE '%CACHIRA%' OR UPPER(a.ciudad) LIKE '%CÁCHIRA%') THEN '54128'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND (UPPER(a.ciudad) LIKE '%CHINACOTA%' OR UPPER(a.ciudad) LIKE '%CHINÁCOTA%') THEN '54172'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND (UPPER(a.ciudad) LIKE '%CHITAGA%' OR UPPER(a.ciudad) LIKE '%CHITAGÁ%') THEN '54174'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND (UPPER(a.ciudad) LIKE '%CONVENCION%' OR UPPER(a.ciudad) LIKE '%CONVENCIÓN%') THEN '54206'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND UPPER(a.ciudad) LIKE '%CUCUTILLA%' THEN '54223'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND UPPER(a.ciudad) LIKE '%DURANIA%' THEN '54239'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND UPPER(a.ciudad) LIKE '%CARMEN%' THEN '54245'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND UPPER(a.ciudad) LIKE '%TARRA%' THEN '54250'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND UPPER(a.ciudad) LIKE '%ZULIA%' THEN '54261'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND UPPER(a.ciudad) LIKE '%GRAMALOTE%' THEN '54313'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND (UPPER(a.ciudad) LIKE '%HACARI%' OR UPPER(a.ciudad) LIKE '%HACARÍ%') THEN '54344'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND (UPPER(a.ciudad) LIKE '%HERRAN%' OR UPPER(a.ciudad) LIKE '%HERRÁN%') THEN '54347'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND UPPER(a.ciudad) LIKE '%LABATECA%' THEN '54377'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND UPPER(a.ciudad) LIKE '%ESPERANZA%' THEN '54385'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND UPPER(a.ciudad) LIKE '%PLAYA%' THEN '54398'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND UPPER(a.ciudad) LIKE '%PATIOS%' THEN '54405'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND UPPER(a.ciudad) LIKE '%LOURDES%' THEN '54418'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND UPPER(a.ciudad) LIKE '%MUTISCUA%' THEN '54480'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND (UPPER(a.ciudad) LIKE '%OCA%' OR UPPER(a.ciudad) LIKE '%OCAÑA%') THEN '54498'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND UPPER(a.ciudad) LIKE '%PAMPLONA%' THEN '54518'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND UPPER(a.ciudad) LIKE '%PAMPLONITA%' THEN '54520'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND UPPER(a.ciudad) LIKE '%PUERTO SANTANDER%' THEN '54553'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND UPPER(a.ciudad) LIKE '%RAGONVALIA%' THEN '54599'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND UPPER(a.ciudad) LIKE '%SALAZAR%' THEN '54660'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND UPPER(a.ciudad) LIKE '%SAN CALIXTO%' THEN '54670'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND UPPER(a.ciudad) LIKE '%SAN CAYETANO%' THEN '54673'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND UPPER(a.ciudad) LIKE '%SANTIAGO%' THEN '54680'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND UPPER(a.ciudad) LIKE '%SARDINATA%' THEN '54720'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND UPPER(a.ciudad) LIKE '%SILOS%' THEN '54743'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND UPPER(a.ciudad) LIKE '%TEORAMA%' THEN '54800'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND (UPPER(a.ciudad) LIKE '%TIBU%' OR UPPER(a.ciudad) LIKE '%TIBÚ%') THEN '54810'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND UPPER(a.ciudad) LIKE '%TOLEDO%' THEN '54820'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND UPPER(a.ciudad) LIKE '%VILLA CARO%' THEN '54871'
    WHEN UPPER(a.departamento) LIKE '%SANTANDER%' AND UPPER(a.ciudad) LIKE '%ROSARIO%' THEN '54874'
    ELSE '54001'
END`;

const PLAN_PAGO = `(
    SELECT CASE
        WHEN cv.periodicidad = 'MENSUAL'    AND cv.nCuotas = 1  THEN '163'
        WHEN cv.periodicidad = 'MENSUAL'    AND cv.nCuotas = 2  THEN '164'
        WHEN cv.periodicidad = 'MENSUAL'    AND cv.nCuotas = 3  THEN '165'
        WHEN cv.periodicidad = 'MENSUAL'    AND cv.nCuotas = 4  THEN '166'
        WHEN cv.periodicidad = 'MENSUAL'    AND cv.nCuotas = 5  THEN '167'
        WHEN cv.periodicidad = 'MENSUAL'    AND cv.nCuotas = 6  THEN '168'
        WHEN cv.periodicidad = 'MENSUAL'    AND cv.nCuotas = 7  THEN '169'
        WHEN cv.periodicidad = 'MENSUAL'    AND cv.nCuotas = 8  THEN '170'
        WHEN cv.periodicidad = 'MENSUAL'    AND cv.nCuotas = 9  THEN '171'
        WHEN cv.periodicidad = 'MENSUAL'    AND cv.nCuotas = 10 THEN '172'
        WHEN cv.periodicidad = 'MENSUAL'    AND cv.nCuotas = 11 THEN '173'
        WHEN cv.periodicidad = 'MENSUAL'    AND cv.nCuotas = 12 THEN '174'
        WHEN cv.periodicidad = 'ANUAL'      AND cv.nCuotas = 1  THEN '163'
        WHEN cv.periodicidad = 'SEMESTRAL'  AND cv.nCuotas = 2  THEN '335'
        WHEN cv.periodicidad = 'TRIMESTRAL' AND cv.nCuotas = 2  THEN '332'
        WHEN cv.periodicidad = 'TRIMESTRAL' AND cv.nCuotas = 3  THEN '333'
        WHEN cv.periodicidad = 'TRIMESTRAL' AND cv.nCuotas = 4  THEN '334'
        ELSE 'PENDIENTE'
    END
    FROM contratos_valor cv
    WHERE cv.afiliadoId = a.id
    ORDER BY cv.id DESC
    LIMIT 1
)`;

const TIPO_DOC = (campo) => `CASE ${campo}
    WHEN 'CC'  THEN '1'
    WHEN 'TI'  THEN '4'
    WHEN 'RC'  THEN '9'
    WHEN 'PPT' THEN '20'
    WHEN 'PA'  THEN '5'
    WHEN 'CE'  THEN '2'
    WHEN 'ADT' THEN '12'
    ELSE ${campo}
END`;

function buildSql() {
  return `
SELECT * FROM (

    -- ==========================================
    -- PARTE 1: REGISTRO DEL AFILIADO (TIPO 1)
    -- ==========================================
    SELECT
        1 AS orden_registro,
        '1'                                                       AS \`TIPO DE REGISTRO\`,
        a.primerApellido                                          AS \`PRIMER APELLIDO\`,
        a.segundoApellido                                         AS \`SEGUNDO APELLIDO\`,
        a.primerNombre                                            AS \`NOMBRE1\`,
        a.segundoNombre                                           AS \`NOMBRE2\`,
        DATE_FORMAT(a.fechaNacimiento, '%e/%c/%Y')                AS \`FECHA DE NACIMIENTO\`,
        a.sexo                                                    AS \`SEXO\`,
        ${TIPO_DOC('a.tipoDocumento')}                            AS \`TIPO DOCUMENTO\`,
        CASE WHEN a.tipoDocumento = 'ADT' THEN '' ELSE a.numeroDocumento END AS \`NUMERO DE DOCUMENTO\`,
        DATE_FORMAT(a.createdAt,    '%e/%c/%Y')                   AS \`FECHA VINCULACION\`,
        DATE_FORMAT(a.vigenciaDesde,'%e/%c/%Y')                   AS \`FECHA INGRESO POLIZA\`,
        0                                                         AS \`SALARIO REAL\`,
        0                                                         AS \`NUMERO SALARIOS\`,
        0                                                         AS \`EXTRAPRIMA\`,
        CASE
            WHEN a.grupo = 'UNIFAMILIAR' AND a.asistenciaFueraDeCasa = 'SI'
                 AND EXISTS (SELECT 1 FROM seguros s WHERE s.afiliadoId = a.id AND s.nombre LIKE '%SINERGIA OP 2%')
                THEN '8'
            WHEN a.grupo = 'UNIFAMILIAR'
                 AND EXISTS (SELECT 1 FROM seguros s WHERE s.afiliadoId = a.id AND s.nombre LIKE '%SINERGIA OP 2%')
                THEN '6'
            WHEN a.grupo = 'UNIFAMILIAR' AND a.asistenciaFueraDeCasa = 'SI'
                THEN '4'
            WHEN a.grupo = 'UNIFAMILIAR'
                THEN '1'
            WHEN a.grupo = 'UNIPERSONAL'
                THEN '10'
            WHEN a.grupo = 'BASICO' AND a.asistenciaFueraDeCasa = 'SI'
                 AND EXISTS (SELECT 1 FROM seguros s WHERE s.afiliadoId = a.id AND s.nombre LIKE '%SINERGIA OP 2%')
                THEN '17'
            WHEN a.grupo = 'BASICO'
                 AND EXISTS (SELECT 1 FROM seguros s WHERE s.afiliadoId = a.id AND s.nombre LIKE '%SINERGIA OP 2%')
                THEN '15'
            WHEN a.grupo = 'BASICO' AND a.asistenciaFueraDeCasa = 'SI'
                THEN '13'
            WHEN a.grupo = 'BASICO'
                THEN '11'
            ELSE 'PENDIENTE'
        END                                                       AS \`CATEGORIA\`,
        1                                                         AS \`CENTRO DE COSTO\`,
        a.email                                                   AS \`EMAIL\`,
        0                                                         AS \`S/N CONDICION PARTICULAR\`,
        -- Datos del Pagador (es el mismo afiliado)
        ${TIPO_DOC('a.tipoDocumento')}                            AS \`TIPO DOCUMENTO PAGADOR\`,
        a.numeroDocumento                                         AS \`NRO DOCUMENTO PAGADOR\`,
        a.primerApellido                                          AS \`PRIMER APELLIDO PAGADOR\`,
        a.segundoApellido                                         AS \`SEGUNDO APELLIDO PAGADOR\`,
        a.primerNombre                                            AS \`NOMBRE 1 PAGADOR\`,
        a.segundoNombre                                           AS \`NOMBRE 2 PAGADOR\`,
        DATE_FORMAT(a.fechaNacimiento, '%e/%c/%Y')                AS \`FECHA DE NACIMIENTO PAGADOR\`,
        a.sexo                                                    AS \`SEXO PAGADOR\`,
        (SELECT u.codigo FROM usuarios u WHERE u.id = a.asesorId LIMIT 1) AS \`CODIGO ASESOR\`,
        99999                                                     AS \`COD ZONA ASESOR\`,
        8                                                         AS \`CODIGO TELEFONO 1\`,
        a.celular                                                 AS \`TELEFONO 1\`,
        ''                                                        AS \`CODIGO TELEFONO 2\`,
        IFNULL(a.celular2, '')                                    AS \`TELEFONO 2\`,
        1                                                         AS \`TIPO DE DIRECCION 1\`,
        a.direccion                                               AS \`DIRECCION 1\`,
        ${DIVIPOLA}                                               AS \`DIVIPOLA 1\`,
        ''                                                        AS \`TIPO DE DIRECCION \`,
        ''                                                        AS \`DIRECCION \`,
        ''                                                        AS \`DIVIPOLA  \`,
        ${TIPO_DOC('a.tipoDocumento')}                            AS \`TIPO DOCUMENTO RELACIONADO\`,
        a.numeroDocumento                                         AS \`NUMERO DOCUMENTO RELACIONADO\`,
        ''                                                        AS \`COD. PARIENTE\`,
        ''                                                        AS \`CALIDAD DEL BENEFICIARIO\`,
        ''                                                        AS \`% PARTICIPACION\`,
        a.sucursal                                                AS \`AGENCIA\`,
        '135000450289'                                            AS \`POLIZA AGRUPADORA\`,
        0                                                         AS \`POLIZA\`,
        'PENDIENTE'                                               AS \`UNIDAD COMERCIAL\`,
        4                                                         AS \`TIPO ENDOSO\`,
        DATE_FORMAT(a.vigenciaHasta,'%e/%c/%Y')                   AS \`VIGENCIA HASTA\`,
        0                                                         AS \`S/N RIESGO COMPARTIDO\`,
        0                                                         AS \`S/N CONDONACION DEUDA\`,
        1                                                         AS \`CONDUCTO DE PAGO\`,
        ${PLAN_PAGO}                                              AS \`PLAN DE PAGO\`,
        0                                                         AS \`CODIGO BANCO\`,
        0                                                         AS \`NRO CUENTA/TARJETA\`,
        1                                                         AS \`PERIODO FACTURACION\`,
        1                                                         AS \`CANT PERIODOS FACTURAR\`,
        '-1'                                                      AS \`CANAL DE RECAUDO\`,
        0                                                         AS \`COBRADOR\`,
        0                                                         AS \`ZONA\`,
        -- AMPARO 1
        CASE
            WHEN EXISTS (SELECT 1 FROM seguros s WHERE s.afiliadoId=a.id AND s.nombre='SOLICANASTA')    THEN '25'
            WHEN EXISTS (SELECT 1 FROM seguros s WHERE s.afiliadoId=a.id AND s.nombre LIKE '%SINERGIA OP%') THEN '46'
            ELSE '' END                                           AS \`CODIGO AMPARO\`,
        CASE
            WHEN EXISTS (SELECT 1 FROM seguros s WHERE s.afiliadoId=a.id AND s.nombre='SOLICANASTA')    THEN '1'
            WHEN EXISTS (SELECT 1 FROM seguros s WHERE s.afiliadoId=a.id AND s.nombre LIKE '%SINERGIA OP%') THEN '0'
            ELSE '' END                                           AS \`FORMA LIQ 1\`,
        CASE
            WHEN EXISTS (SELECT 1 FROM seguros s WHERE s.afiliadoId=a.id AND s.nombre='SOLICANASTA')
                THEN (SELECT s.monto FROM seguros s WHERE s.afiliadoId=a.id AND s.nombre='SOLICANASTA' ORDER BY s.id DESC LIMIT 1)
            WHEN EXISTS (SELECT 1 FROM seguros s WHERE s.afiliadoId=a.id AND s.nombre LIKE '%SINERGIA OP%')
                THEN (SELECT s.monto FROM seguros s WHERE s.afiliadoId=a.id AND s.nombre LIKE '%SINERGIA OP%' ORDER BY s.id DESC LIMIT 1)
            ELSE '' END                                           AS \`VALOR  1\`,
        CASE
            WHEN EXISTS (SELECT 1 FROM seguros s WHERE s.afiliadoId=a.id AND s.nombre='SOLICANASTA')    THEN '1'
            ELSE '' END                                           AS \`FORMA LIQ 2\`,
        ''                                                        AS \`VALOR  2\`,
        -- AMPARO 2
        CASE
            WHEN EXISTS (SELECT 1 FROM seguros s WHERE s.afiliadoId=a.id AND s.nombre='SOLICANASTA')    THEN '26'
            WHEN EXISTS (SELECT 1 FROM seguros s WHERE s.afiliadoId=a.id AND s.nombre LIKE '%SINERGIA OP%') THEN '47'
            ELSE '' END                                           AS \`CODIGO AMPARO 2\`,
        CASE
            WHEN EXISTS (SELECT 1 FROM seguros s WHERE s.afiliadoId=a.id AND s.nombre='SOLICANASTA')    THEN '1'
            WHEN EXISTS (SELECT 1 FROM seguros s WHERE s.afiliadoId=a.id AND s.nombre LIKE '%SINERGIA OP%') THEN '0'
            ELSE '' END                                           AS \`FORMA LIQ 1 2\`,
        CASE
            WHEN EXISTS (SELECT 1 FROM seguros s WHERE s.afiliadoId=a.id AND s.nombre='SOLICANASTA')
                THEN (SELECT s.monto FROM seguros s WHERE s.afiliadoId=a.id AND s.nombre='SOLICANASTA' ORDER BY s.id DESC LIMIT 1)
            WHEN EXISTS (SELECT 1 FROM seguros s WHERE s.afiliadoId=a.id AND s.nombre LIKE '%SINERGIA OP 1%') THEN '610000'
            WHEN EXISTS (SELECT 1 FROM seguros s WHERE s.afiliadoId=a.id AND s.nombre LIKE '%SINERGIA OP 2%') THEN '1830000'
            ELSE '' END                                           AS \`VALOR 1 2\`,
        ''                                                        AS \`FORMA LIQ 2 2\`,
        ''                                                        AS \`VALOR 2 2\`,
        -- AMPARO 3 (solo SINERGIA)
        CASE
            WHEN EXISTS (SELECT 1 FROM seguros s WHERE s.afiliadoId=a.id AND s.nombre LIKE '%SINERGIA OP%') THEN '48'
            ELSE '' END                                           AS \`CODIGO AMPARO 3\`,
        CASE
            WHEN EXISTS (SELECT 1 FROM seguros s WHERE s.afiliadoId=a.id AND s.nombre LIKE '%SINERGIA OP%') THEN '0'
            ELSE '' END                                           AS \`FORMA LIQ 1 3\`,
        CASE
            WHEN EXISTS (SELECT 1 FROM seguros s WHERE s.afiliadoId=a.id AND s.nombre LIKE '%SINERGIA OP 1%') THEN '1000000'
            WHEN EXISTS (SELECT 1 FROM seguros s WHERE s.afiliadoId=a.id AND s.nombre LIKE '%SINERGIA OP 2%') THEN '3000000'
            ELSE '' END                                           AS \`VALOR 1 3\`,
        ''                                                        AS \`FORMA LIQ 2 3\`,
        ''                                                        AS \`VALOR 2 3\`
    FROM afiliados a
    WHERE a.id = :afiliadoId

    UNION ALL

    -- ==========================================
    -- PARTE 2: REGISTRO DE LOS BENEFICIARIOS (TIPO 2)
    -- ==========================================
    SELECT
        2 AS orden_registro,
        '2'                                                       AS \`TIPO DE REGISTRO\`,
        b.primerApellido                                          AS \`PRIMER APELLIDO\`,
        b.segundoApellido                                         AS \`SEGUNDO APELLIDO\`,
        b.primerNombre                                            AS \`NOMBRE1\`,
        b.segundoNombre                                           AS \`NOMBRE2\`,
        DATE_FORMAT(b.fechaNacimiento, '%e/%c/%Y')                AS \`FECHA DE NACIMIENTO\`,
        b.genero                                                  AS \`SEXO\`,
        ${TIPO_DOC('b.tipoDocumento')}                            AS \`TIPO DOCUMENTO\`,
        CASE WHEN b.tipoDocumento = 'ADT' THEN '' ELSE b.numeroDocumento END AS \`NUMERO DE DOCUMENTO\`,
        DATE_FORMAT(a.createdAt,    '%e/%c/%Y')                   AS \`FECHA VINCULACION\`,
        DATE_FORMAT(a.vigenciaDesde,'%e/%c/%Y')                   AS \`FECHA INGRESO POLIZA\`,
        0                                                         AS \`SALARIO REAL\`,
        0                                                         AS \`NUMERO SALARIOS\`,
        0                                                         AS \`EXTRAPRIMA\`,
        CASE
            WHEN a.grupo = 'UNIFAMILIAR' AND b.tipoBeneficiario = 'DE_LEY'
                 AND a.asistenciaFueraDeCasa = 'SI'
                 AND EXISTS (SELECT 1 FROM seguros s WHERE s.afiliadoId=a.id AND s.nombre LIKE '%SINERGIA OP 2%')
                THEN '8'
            WHEN a.grupo = 'UNIFAMILIAR' AND b.tipoBeneficiario = 'DE_LEY'
                 AND EXISTS (SELECT 1 FROM seguros s WHERE s.afiliadoId=a.id AND s.nombre LIKE '%SINERGIA OP 2%')
                THEN '6'
            WHEN a.grupo = 'UNIFAMILIAR' AND b.tipoBeneficiario = 'DE_LEY'
                 AND a.asistenciaFueraDeCasa = 'SI'
                THEN '4'
            WHEN a.grupo = 'UNIFAMILIAR' AND b.tipoBeneficiario = 'DE_LEY'
                THEN '1'
            WHEN a.grupo = 'UNIFAMILIAR' AND b.tipoBeneficiario = 'ADICIONAL'
                 AND a.asistenciaFueraDeCasa = 'SI'
                 AND EXISTS (SELECT 1 FROM seguros s WHERE s.afiliadoId=a.id AND s.nombre LIKE '%SINERGIA OP 2%')
                THEN '9'
            WHEN a.grupo = 'UNIFAMILIAR' AND b.tipoBeneficiario = 'ADICIONAL'
                 AND EXISTS (SELECT 1 FROM seguros s WHERE s.afiliadoId=a.id AND s.nombre LIKE '%SINERGIA OP 2%')
                THEN '7'
            WHEN a.grupo = 'UNIFAMILIAR' AND b.tipoBeneficiario = 'ADICIONAL'
                 AND a.asistenciaFueraDeCasa = 'SI'
                THEN '5'
            WHEN a.grupo = 'UNIFAMILIAR' AND b.tipoBeneficiario = 'ADICIONAL'
                THEN '3'
            WHEN a.grupo = 'UNIPERSONAL' AND b.tipoBeneficiario = 'DE_LEY'
                THEN '10'
            WHEN a.grupo = 'BASICO' AND b.tipoBeneficiario = 'DE_LEY'
                 AND a.asistenciaFueraDeCasa = 'SI'
                 AND EXISTS (SELECT 1 FROM seguros s WHERE s.afiliadoId=a.id AND s.nombre LIKE '%SINERGIA OP 2%')
                THEN '17'
            WHEN a.grupo = 'BASICO' AND b.tipoBeneficiario = 'DE_LEY'
                 AND EXISTS (SELECT 1 FROM seguros s WHERE s.afiliadoId=a.id AND s.nombre LIKE '%SINERGIA OP 2%')
                THEN '15'
            WHEN a.grupo = 'BASICO' AND b.tipoBeneficiario = 'DE_LEY'
                 AND a.asistenciaFueraDeCasa = 'SI'
                THEN '13'
            WHEN a.grupo = 'BASICO' AND b.tipoBeneficiario = 'DE_LEY'
                THEN '11'
            WHEN a.grupo = 'BASICO' AND b.tipoBeneficiario = 'ADICIONAL'
                 AND a.asistenciaFueraDeCasa = 'SI'
                 AND EXISTS (SELECT 1 FROM seguros s WHERE s.afiliadoId=a.id AND s.nombre LIKE '%SINERGIA OP 2%')
                THEN '18'
            WHEN a.grupo = 'BASICO' AND b.tipoBeneficiario = 'ADICIONAL'
                 AND EXISTS (SELECT 1 FROM seguros s WHERE s.afiliadoId=a.id AND s.nombre LIKE '%SINERGIA OP 2%')
                THEN '16'
            WHEN a.grupo = 'BASICO' AND b.tipoBeneficiario = 'ADICIONAL'
                 AND a.asistenciaFueraDeCasa = 'SI'
                THEN '14'
            WHEN a.grupo = 'BASICO' AND b.tipoBeneficiario = 'ADICIONAL'
                THEN '12'
            ELSE 'PENDIENTE'
        END                                                       AS \`CATEGORIA\`,
        1                                                         AS \`CENTRO DE COSTO\`,
        ''                                                        AS \`EMAIL\`,
        0                                                         AS \`S/N CONDICION PARTICULAR\`,
        -- Datos del Pagador (heredados del afiliado cuando diferenteAlContratante=1)
        CASE WHEN a.diferenteAlContratante = 1
            THEN ${TIPO_DOC('a.tipoDocumento')}
            ELSE '' END                                           AS \`TIPO DOCUMENTO PAGADOR\`,
        CASE WHEN a.diferenteAlContratante = 1 THEN a.numeroDocumento  ELSE '' END AS \`NRO DOCUMENTO PAGADOR\`,
        CASE WHEN a.diferenteAlContratante = 1 THEN a.primerApellido   ELSE '' END AS \`PRIMER APELLIDO PAGADOR\`,
        CASE WHEN a.diferenteAlContratante = 1 THEN a.segundoApellido  ELSE '' END AS \`SEGUNDO APELLIDO PAGADOR\`,
        CASE WHEN a.diferenteAlContratante = 1 THEN a.primerNombre     ELSE '' END AS \`NOMBRE 1 PAGADOR\`,
        CASE WHEN a.diferenteAlContratante = 1 THEN a.segundoNombre    ELSE '' END AS \`NOMBRE 2 PAGADOR\`,
        CASE WHEN a.diferenteAlContratante = 1
            THEN DATE_FORMAT(a.fechaNacimiento, '%e/%c/%Y')
            ELSE '' END                                           AS \`FECHA DE NACIMIENTO PAGADOR\`,
        CASE WHEN a.diferenteAlContratante = 1 THEN a.sexo             ELSE '' END AS \`SEXO PAGADOR\`,
        a.asesorId                                                AS \`CODIGO ASESOR\`,
        99999                                                     AS \`COD ZONA ASESOR\`,
        8                                                         AS \`CODIGO TELEFONO 1\`,
        a.celular                                                 AS \`TELEFONO 1\`,
        ''                                                        AS \`CODIGO TELEFONO 2\`,
        IFNULL(a.celular2, '')                                    AS \`TELEFONO 2\`,
        1                                                         AS \`TIPO DE DIRECCION 1\`,
        a.direccion                                               AS \`DIRECCION 1\`,
        ${DIVIPOLA}                                               AS \`DIVIPOLA 1\`,
        ''                                                        AS \`TIPO DE DIRECCION \`,
        ''                                                        AS \`DIRECCION \`,
        ''                                                        AS \`DIVIPOLA  \`,
        ${TIPO_DOC('a.tipoDocumento')}                            AS \`TIPO DOCUMENTO RELACIONADO\`,
        a.numeroDocumento                                         AS \`NUMERO DOCUMENTO RELACIONADO\`,
        CASE b.parentesco
            WHEN 'HIJO (A)'                  THEN '1'
            WHEN 'HIJO ADOPTIVO'             THEN '28'
            WHEN 'HIJO CON INCAPACIDAD'      THEN '14'
            WHEN 'HIJASTRO (A)'              THEN '16'
            WHEN 'PADRE'                     THEN '2'
            WHEN 'MADRE'                     THEN '4'
            WHEN 'PADRASTRO'                 THEN '17'
            WHEN 'MADRASTRA'                 THEN '18'
            WHEN 'CONYUGE'                   THEN '3'
            WHEN 'COMPAÑERO (A)'             THEN '5'
            WHEN 'EX-ESPOSO (A)'             THEN '22'
            WHEN 'HERMANO (A)'               THEN '6'
            WHEN 'HERMANASTRO (A)'           THEN '25'
            WHEN 'HERMANO CON INCAPACIDAD'   THEN '31'
            WHEN 'NIETO (A)'                 THEN '11'
            WHEN 'BISNIETO (A)'              THEN '30'
            WHEN 'ABUELO (A)'               THEN '15'
            WHEN 'ABUELASTRO (A)'            THEN '26'
            WHEN 'BISABUELO (A)'             THEN '27'
            WHEN 'YERNO/NUERA'               THEN '8'
            WHEN 'SUEGRO (A)'               THEN '7'
            WHEN 'SUEGRASTRO'               THEN '7'
            WHEN 'CUÑADO (A)'               THEN '10'
            WHEN 'TIO (A)'                  THEN '13'
            WHEN 'SOBRINO (A)'              THEN '9'
            WHEN 'PRIMO (A)'                THEN '12'
            WHEN 'AHIJADO (A)'              THEN '19'
            WHEN 'PADRINO'                  THEN '20'
            WHEN 'MADRINA'                  THEN '21'
            WHEN 'PROTEGIDO (A)'            THEN '24'
            WHEN 'SERVICIO DOMESTICO (A)'   THEN '23'
            WHEN 'ASEGURADO PRINCIPAL'      THEN '3'
            ELSE '29'
        END                                                       AS \`COD. PARIENTE\`,
        ''                                                        AS \`CALIDAD DEL BENEFICIARIO\`,
        ''                                                        AS \`% PARTICIPACION\`,
        a.sucursal                                                AS \`AGENCIA\`,
        '135000450289'                                            AS \`POLIZA AGRUPADORA\`,
        0                                                         AS \`POLIZA\`,
        'PENDIENTE'                                               AS \`UNIDAD COMERCIAL\`,
        4                                                         AS \`TIPO ENDOSO\`,
        DATE_FORMAT(a.vigenciaHasta,'%e/%c/%Y')                   AS \`VIGENCIA HASTA\`,
        0                                                         AS \`S/N RIESGO COMPARTIDO\`,
        0                                                         AS \`S/N CONDONACION DEUDA\`,
        1                                                         AS \`CONDUCTO DE PAGO\`,
        ${PLAN_PAGO}                                              AS \`PLAN DE PAGO\`,
        0                                                         AS \`CODIGO BANCO\`,
        0                                                         AS \`NRO CUENTA/TARJETA\`,
        1                                                         AS \`PERIODO FACTURACION\`,
        1                                                         AS \`CANT PERIODOS FACTURAR\`,
        '-1'                                                      AS \`CANAL DE RECAUDO\`,
        0                                                         AS \`COBRADOR\`,
        0                                                         AS \`ZONA\`,
        ''                                                        AS \`CODIGO AMPARO\`,
        ''                                                        AS \`FORMA LIQ 1\`,
        ''                                                        AS \`VALOR  1\`,
        ''                                                        AS \`FORMA LIQ 2\`,
        ''                                                        AS \`VALOR  2\`,
        ''                                                        AS \`CODIGO AMPARO 2\`,
        ''                                                        AS \`FORMA LIQ 1 2\`,
        ''                                                        AS \`VALOR 1 2\`,
        ''                                                        AS \`FORMA LIQ 2 2\`,
        ''                                                        AS \`VALOR 2 2\`,
        ''                                                        AS \`CODIGO AMPARO 3\`,
        ''                                                        AS \`FORMA LIQ 1 3\`,
        ''                                                        AS \`VALOR 1 3\`,
        ''                                                        AS \`FORMA LIQ 2 3\`,
        ''                                                        AS \`VALOR 2 3\`
    FROM beneficiarios b
    INNER JOIN afiliados a ON b.afiliadoId = a.id
    WHERE b.afiliadoId = :afiliadoId

) AS plano_estructurado
ORDER BY orden_registro ASC`;
}

async function generarPlanoExcel(afiliadoId, outStream) {
  const rows = await sequelize.query(buildSql(), {
    type:         QueryTypes.SELECT,
    replacements: { afiliadoId },
  });

  const workbook = new ExcelJS.Workbook();
  const sheet    = workbook.addWorksheet('Plano');

  if (rows.length > 0) {
    const cols = Object.keys(rows[0]).filter(k => k !== 'orden_registro');

    // Definir columnas sin header para controlar la posición manualmente
    sheet.columns = cols.map(k => ({ key: k, width: 22 }));

    // Fila 1: vacía (requerimiento del plano)
    sheet.addRow({});

    // Fila 2: cabecera con estilos
    const headerRow = sheet.addRow(cols.reduce((acc, k) => { acc[k] = k; return acc; }, {}));
    headerRow.font      = { bold: true };
    headerRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    headerRow.height    = 36;

    // Filas 3+: datos
    rows.forEach(r => {
      const row = {};
      cols.forEach(k => { row[k] = r[k] ?? ''; });
      sheet.addRow(row);
    });
  }

  await workbook.xlsx.write(outStream);
}

module.exports = { generarPlanoExcel };
