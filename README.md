# Bolsillo

Tu propio Pocket: aprietas el botón del iPhone, grabas, y minutos después tienes un Google Doc con el resumen y la transcripción en Drive, listo para preguntarle a Claude.

```
iPhone (atajo)
  ├─ POST /api/start      → URL de subida
  ├─ PUT  audio           → directo a Drive: Bolsillo/_entrantes
  └─ POST /api/process    → Vercel pasa el audio a AssemblyAI
                              ↓ (webhook cuando termina)
                            /api/webhook → Claude resume → Google Doc en Bolsillo/
                                         → borra el audio y la transcripción de AssemblyAI
```

- **Solo queda texto.** El audio se borra cuando el documento ya existe. Si algo falla, el audio se conserva en `_entrantes` y aparece un documento `⚠️ Error` en la carpeta.
- **Permiso mínimo en Drive** (`drive.file`): la app solo ve los archivos que ella misma creó.
- **Costo estimado:** unos $0,30 por hora grabada. AssemblyAI cobra $0,23/h (con $50 de crédito inicial) y Claude Sonnet 5.5 el resto, según la longitud.

## Instalación

### 1. Variables

```bash
npm install
```

```bash
npm run setup
```

Esto crea `.env.local`. Completa ahí:

- `ASSEMBLYAI_API_KEY`: [assemblyai.com/dashboard/api-keys](https://www.assemblyai.com/dashboard/api-keys)
- `ANTHROPIC_API_KEY`: [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)

### 2. Google Drive

En [console.cloud.google.com](https://console.cloud.google.com), con `santiluengasg@gmail.com`:

1. Crea un proyecto llamado `Bolsillo`.
2. Busca **Google Drive API** y actívala.
3. Ve a **Google Auth Platform** y configúrala como **Externa**.
4. En **Público**, pulsa **Publicar app**. Si queda en modo de prueba, el permiso caduca a los 7 días y todo deja de funcionar.
5. En **Clientes**, crea uno de tipo **App de escritorio** y copia el ID y el secreto a `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.

Luego autoriza. Google mostrará "app no verificada": es tu propia app, entra por **Configuración avanzada → Ir a Bolsillo**.

```bash
npm run google-auth
```

### 3. Despliegue

```bash
vercel login
```

```bash
vercel --prod --yes
```

Copia la URL de producción a `PUBLIC_URL` en `.env.local` y publica con las variables:

```bash
npm run push-env
```

```bash
vercel --prod
```

### 4. Prueba

```bash
npm run e2e -- ruta/al/audio.m4a
```

Debe aparecer un documento en la carpeta `Bolsillo` de Drive en un par de minutos.

## El atajo del iPhone

En la app **Atajos**, crea uno llamado **Bolsillo** con estas acciones, en orden. `TU_URL` es tu `PUBLIC_URL` y `TU_CLAVE` es el `BOLSILLO_SECRET` de `.env.local`.

| # | Acción | Configuración |
|---|--------|---------------|
| 1 | **Grabar audio** | Empezar a grabar: *Inmediatamente*. Terminar: *Al tocar*. |
| 2 | **Guardar archivo** | Audio grabado → iCloud Drive/Bolsillo. "Preguntar dónde guardar": apagado. Es la copia de seguridad si no hay señal. |
| 3 | **Obtener contenido de URL** | `TU_URL/api/start`. Método POST. Encabezado `Authorization` = `Bearer TU_CLAVE`. |
| 4 | **Obtener valor del diccionario** | Clave `upload_url`, del resultado del paso 3. |
| 5 | **Obtener contenido de URL** | URL = valor del paso 4. Método PUT. Encabezado `Content-Type` = `audio/mp4`. Cuerpo: *Archivo* → Audio grabado. |
| 6 | **Obtener valor del diccionario** | Clave `id`, del resultado del paso 5. |
| 7 | **Obtener contenido de URL** | `TU_URL/api/process`. Método POST. Encabezado `Authorization` = `Bearer TU_CLAVE`. Cuerpo: *JSON*, campo `file_id` = valor del paso 6. |
| 8 | **Eliminar archivos** | Archivo guardado en el paso 2. "Confirmar antes de eliminar": apagado. |
| 9 | **Mostrar notificación** | "Grabación enviada". |

Asígnalo al botón: **Ajustes → Botón de acción → Atajo → Bolsillo**. Solo existe en iPhone 15 Pro y posteriores; en otros modelos usa **Ajustes → Accesibilidad → Tocar → Toque atrás**.

Antes de confiar en él, haz una grabación larga con la pantalla bloqueada y revisa que quede completa.

## Preguntarle a Claude

Con el conector de Google Drive activo, en Claude:

> Busca en mi carpeta Bolsillo: alguien me recomendó una empresa de parches adhesivos. ¿Quién fue y qué dijo?

> Revisa mis conversaciones recientes con asesores. ¿Dónde coinciden y dónde me han dado consejos opuestos?

> Mañana me reúno con él otra vez. Recuérdame qué acordamos, qué prometí enviar y qué sigue abierto.

## Si algo falla

Busca en Drive un documento `⚠️ Error`: indica en qué paso falló y el ID del audio. Para reintentar:

```bash
curl -X POST "$PUBLIC_URL/api/process" -H "Authorization: Bearer $BOLSILLO_SECRET" -H "Content-Type: application/json" -d '{"file_id":"ID_DEL_AUDIO"}'
```

## Desarrollo

```bash
npm test
```
