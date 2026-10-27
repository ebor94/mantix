# Workflow n8n — Upload de evidencias a Drive

Workflow secundario que recibe archivos (base64) desde Mantix y los sube a la carpeta de jornada ya existente en Drive. Destinos:
- `00_INFORME_CONSOLIDADO` → **raíz de la jornada** (es un archivo, no subcarpeta). Informe principal del proveedor directo en la carpeta jornada.
- `02_Requisitos_Legales/` → certificados, RUT, ARL, requisitos legales del proveedor
- `03_Actas_Firmas/` → actas, firmas y fotos de respaldo

## Pasos para activarlo

1. **Importar el workflow**
   - n8n → Workflows → Import from File → `n8n-mantix-upload-evidencias.workflow.json`
2. **Asignar credencial de Google Drive**
   - Abrir los nodos `Buscar subcarpeta` y `Upload a Drive`
   - Seleccionar la credencial **Google Drive - coordticcucuta** (la misma del workflow `mantix-evidencias`)
3. **Activar el workflow** (toggle superior derecho)
4. **Copiar la URL del webhook de producción**
   - Nodo `Webhook Upload` → tab "Production URL"
   - Debe quedar algo como: `http://192.9.17.10:5678/webhook/mantix-upload-evidencias`
5. **Agregarla al `.env` del backend**:
   ```
   N8N_WEBHOOK_UPLOAD_EVIDENCIAS_URL=http://192.9.17.10:5678/webhook/mantix-upload-evidencias
   ```
6. **Reiniciar el backend** para que tome la variable.

## Payload esperado

```json
{
  "folderId": "1AbCdEf...",
  "archivos": [
    { "nombre": "informe.pdf", "base64": "JVBERi0...", "mime_type": "application/pdf", "subcarpeta": "00_INFORME_CONSOLIDADO" },
    { "nombre": "foto1.jpg", "base64": "/9j/4AAQ...", "mime_type": "image/jpeg" }
  ]
}
```

Si no se pasa `subcarpeta`, el nodo `Split archivos` la deduce por el nombre/mime del archivo:
- Contiene "acta" / "firma" → `04_Actas_Firmas`
- Contiene "checklist" / "check" / "lista" → `03_Checklists_Firmados`
- Contiene "informe" / "reporte" / `.pdf` → `00_INFORME_CONSOLIDADO`
- Imagen (`image/*` o `.jpg`/`.png`/`.heic`/...) → `02_Evidencias_Fotograficas`
- Fallback → `02_Evidencias_Fotograficas`

## Respuesta

```json
{
  "archivos": [
    { "nombre": "informe.pdf", "url": "https://drive.google.com/file/d/...", "file_id": "...", "subcarpeta": "00_INFORME" }
  ],
  "cantidad": 1
}
```

## Límites

- Backend: 20 archivos por request, 25 MB por archivo
- Express: body limit 60 MB (configurado en la ruta)
- Axios → n8n: timeout 120 s

Si subís paquetes muy pesados, hacelo en varios lotes (el panel del frontend lo hace automáticamente).
