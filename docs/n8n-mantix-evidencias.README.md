# Integración Mantix ↔ n8n ↔ Google Drive — Evidencias de mantenimientos

## Objetivo
Cada vez que se cierra un mantenimiento en mantix (individual o múltiple), un workflow en n8n crea automáticamente la carpeta de jornada en Google Drive con la estructura ICONTEC-friendly y devuelve la URL para guardarla en mantix.

```
mantix ──POST──▶ n8n (webhook) ──Drive API──▶ Google Drive
      ◀──URL───
```

## 1. Setup en el backend de mantix

### 1.1 Correr la migración
```sql
-- src/migrations/2026_10_26_drive_links_ejecutados.sql
```
Agrega 3 columnas a `mantenimientos_ejecutados`:
- `drive_jornada_url` VARCHAR(500) NULL
- `drive_jornada_folder_id` VARCHAR(100) NULL
- `drive_informe_url` VARCHAR(500) NULL

### 1.2 Variable de entorno
Agregar en `.env` del backend:
```
N8N_WEBHOOK_EVIDENCIAS_URL=http://192.9.17.10:5678/webhook/mantix-evidencias
```
Si está vacía o no existe, el cierre funciona igual pero sin crear carpeta — es seguro.

### 1.3 Reiniciar backend
```bash
deploy-mantix
```

## 2. Setup en n8n

### 2.1 Importar el workflow
1. Abrir n8n → **Workflows** → **Import from File**
2. Seleccionar `docs/n8n-mantix-evidencias.workflow.json`
3. Guardar.

### 2.2 Crear la credencial de Google Drive
1. En n8n → **Credentials** → **New** → **Google Drive OAuth2 API**
2. Autenticar con la cuenta `coordticcucuta@losolivos.co`.
3. Guardar la credencial con nombre `coordticcucuta Drive`.

### 2.3 Vincular la credencial en los nodos del workflow
En el workflow importado, cada nodo "Drive: ..." tiene marcado:
```
"id": "COMPLETAR_ID_CREDENCIAL"
```
Hay que abrir cada uno de esos 5 nodos (`Drive: Create/Get Month`, `Drive: Create Jornada`, `Drive: Subfolder 02`, `03`, `04`, `Drive: Upload README`) y seleccionar la credencial `coordticcucuta Drive` del dropdown.

### 2.4 Verificar el ID del folder del año
El nodo **Prepare names + README** tiene hard-coded el ID del folder `2026`:
```js
anioFolderId: '14L1NVkA6jC9kvvPSYH2pWKKg5bb3G8lv'
```
Para 2027 habrá que crearlo manualmente y actualizar este ID (o agregarle un nodo que lo busque/cree dinámicamente — mejora futura).

### 2.5 Activar el workflow
Toggle **Active** en la esquina superior derecha.

### 2.6 Probar
Desde una terminal:
```bash
curl -X POST http://192.9.17.10:5678/webhook/mantix-evidencias \
  -H "Content-Type: application/json" \
  -d '{
    "fecha_ejecucion": "2026-10-26",
    "hora_inicio": "08:00",
    "hora_fin": "10:30",
    "proveedor": "Ingenin Limitada",
    "tecnico": "Edwin Ortega",
    "categoria": "Aires Acondicionados",
    "sedes": ["CR"],
    "mantenimientos": [
      {
        "mnt_codigo": "MNT-2026-TEST",
        "equipo_codigo": "EQ-00123",
        "equipo_nombre": "AIRE AC CAPILLA",
        "sede": "CR"
      }
    ],
    "observaciones": "Prueba de integración"
  }'
```

Debería devolver:
```json
{
  "drive_jornada_url": "https://drive.google.com/drive/folders/...",
  "drive_jornada_folder_id": "...",
  "folder_name": "2026-10-26_IngeninLimitada_AiresAcondicionados_CR"
}
```

Y en Drive debería haberse creado:
```
Evidencias Mantenimientos/
  2026/
    2026-10 Octubre/
      2026-10-26_IngeninLimitada_AiresAcondicionados_CR/
        02_Evidencias_Fotograficas/
        03_Checklists_Firmados/
        04_Actas_Firmas/
        README.txt
```

## 3. Comportamiento en mantix después del setup

### Cierre individual (`POST /api/mantenimientos/:id/ejecucion`)
Después de guardar, llama al webhook y guarda la URL en `drive_jornada_url` del `MantenimientoEjecutado` recién creado.

### Cierre múltiple (`POST /api/mantenimientos/ejecucion-multiple`)
Después del commit de la transacción, llama al webhook una sola vez con el payload consolidado y guarda la **misma** URL en todos los `MantenimientoEjecutado` del lote.

### Si n8n no responde o devuelve error
- El cierre del mantenimiento no se rompe.
- El `MantenimientoEjecutado` queda con `drive_jornada_url = NULL`.
- Se puede regenerar manualmente (o con un endpoint de reproceso que agregaríamos después).

## 4. Mejoras futuras (fase 2.2 y siguientes)

- [ ] UI del frontend para visualizar y editar manualmente el link.
- [ ] Botón "Regenerar carpeta Drive" por si falló el webhook la primera vez.
- [ ] Script o nodo n8n que cree automáticamente la carpeta del año al pasar al 1 de enero.
- [ ] Subida de archivos desde el frontend → mantix → n8n → Drive (no solo la carpeta).
- [ ] Permisos: cuando se crea la carpeta, el workflow puede agregar a los auditores como viewers.
