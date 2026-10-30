-- ═══════════════════════════════════════════════════════════════════════════
-- H360 — R-34: el valor acordado con el proveedor
--
-- El formato impreso es la orden que firma el proveedor, así que el valor
-- pertenece ahí: es lo que queda pactado por escrito, con número de
-- consecutivo y la firma de quien autoriza.
--
-- Se guarda, no se consulta al ERP en el momento de imprimir, por lo mismo que
-- el resto de la tabla: si mañana allá cambian el costo de esa línea, el R-34
-- que ya se envió tiene que seguir diciendo lo que decía cuando se firmó.
--
-- Queda NULL cuando no hay valor: el ERP trae costo 0 en buena parte de las
-- líneas (la carroza y el transporte de acompañantes, por ejemplo), y en esos
-- casos el formato imprime el renglón en blanco para escribirlo a mano, que es
-- la convención del documento. Un "$ 0" impreso en una orden sería peor que un
-- espacio vacío.
--
-- DECIMAL y no FLOAT: son pesos, y un redondeo binario en un valor que firma
-- un proveedor no tiene ninguna gracia.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE h360_r34
  ADD COLUMN costo DECIMAL(14,2) NULL COMMENT 'Valor acordado con el proveedor, en pesos' AFTER cantidad;
