> Documento histórico redactado de la instalación original. Identificadores de ejemplo; no describe recursos ya creados en tu cuenta. Guía vigente: [Operación](docs/architecture/OPERATIONS.md).

# QFrontier: exportación privada en Cloudflare

Esta carpeta es una copia independiente del juego web. Conserva el mundo, las reglas, D1, los objetos y los gráficos 3D del código exportado. La compilación usa las versiones fijadas de vinext `1.0.0-beta.5`, Cloudflare Vite Plugin `1.37.1` y Wrangler `4.92.0`; no necesita la plataforma Sites ni su sesión de ChatGPT.

## Recursos de esta copia

- Cuenta: `00000000000000000000000000000000`.
- Worker: `qfrontier-pruebas`.
- URL desplegada: `https://qfrontier-preview.example.invalid`.
- D1 activa: `qfrontier-development`, ID `00000000-0000-4000-8000-000000000000`, binding `DB`.
- D1 anterior conservada: `qfrontier-pruebas-db`, ID `00000000-0000-4000-8000-000000000000`. No está conectada al Worker actual.
- Assets: binding `ASSETS`, generados en `dist/client`.
- Aplicación Access: `QFrontier pruebas`, ID `00000000-0000-4000-8000-000000000000`.
- Política reutilizable: `QFrontier testers`, ID `00000000-0000-4000-8000-000000000000`.
- Dominio de Access: `example.cloudflareaccess.com`.

La base es independiente de la versión anterior. No se incluyen cuentas, partidas, tokens ni datos locales de prueba en el despliegue.

La migración inicial ya se aplicó a esta D1 y la aplicación de Access ya está configurada con One-time PIN y sesión de 24 horas. Los comandos de instalación y configuración siguientes permiten reproducir el entorno o actualizarlo; no es necesario crear nuevamente estos recursos para cada corrección.

El 15 de octubre de 2026 se preparó la D1 de recuperación en ENAM tras errores internos de la instancia anterior. Se restauró y verificó la revisión 28 del respaldo de las 11:05 de Costa Rica. Antes del cambio, la base anterior volvió a responder y su exportación coincidió byte por byte con ese mismo respaldo. El usuario autorizó activar la copia; la base anterior se conservó y el acceso privado mantuvo su configuración.

## Acceso restringido

El Worker verifica un JWT RS256 de Cloudflare Access antes de servir cualquier página, API o archivo. Usa la cabecera de Access y, únicamente si falta, la cookie `CF_Authorization`; ambos caminos requieren exactamente las mismas comprobaciones criptográficas. `assets.run_worker_first: true` evita que los archivos estáticos salten esa verificación. Se comprueban firma, emisor, audiencia, expiración y sujeto; los encabezados de identidad enviados por el cliente se sustituyen por la identidad verificada.

La lista de correos se comprueba también dentro del Worker, aunque una política de Access se amplíe accidentalmente. Actualmente permite únicamente:

- `tester-1@example.invalid`
- `tester-2@example.invalid`

En Cloudflare Zero Trust, habilita **One-time PIN** como proveedor de identidad y selecciónalo para esta aplicación. Cada usuario autorizado recibe un código en su propio correo; no hay una contraseña compartida. La activación inicial del plan debe revisarla el titular de la cuenta, incluidos sus términos y cualquier autorización de cargos.

Configura una aplicación **Self-hosted** con destino al Worker `qfrontier-pruebas` (ID `fef6948b6a2c4e279f03451c86ab442a`). El destino de tipo Worker protege sus dominios asociados. Si se configura por hostname, usa exactamente `qfrontier-preview.example.invalid`, sin limitar el path, y conserva `preview_urls: false` para no crear una URL alternativa. Añade una política reutilizable **Allow** que incluya exclusivamente los dos correos anteriores, con una sesión de 24 horas.

Copia su dominio de equipo y su audiencia en las variables `ACCESS_TEAM_DOMAIN` y `ACCESS_AUD` de `wrangler.jsonc`. Estos identificadores no son secretos. La lista `ACCESS_ALLOWED_EMAILS` debe conservar los mismos usuarios autorizados. No habilites una política Bypass ni Everyone.

Una configuración de Access o lista de correos vacía o inválida devuelve **503 en todas las rutas**. Un JWT ausente o inválido devuelve **401**; un JWT válido de un correo ajeno a la lista devuelve **403**. No existe ruta pública de salud ni identidad simulada de desarrollo. El inicio de sesión lo realiza Cloudflare Access delante del Worker.

## Compilación y despliegue

Instala desde el lockfile, sin actualizar dependencias:

```sh
npm ci
npm run cf:types
npm run typecheck
npm test
npm run build
npm run deploy:check
```

En una instalación desde cero, aplica las migraciones a la D1 nueva antes de permitir el uso del juego. La base de recuperación actual ya contiene el esquema y las partidas. Este comando modifica la base remota indicada en `wrangler.jsonc`:

```sh
npm run db:migrate:remote
```

Después despliega el resultado ya compilado:

```sh
npm run deploy
```

Los comandos de despliegue usan **`dist/server/wrangler.json`**, generado por el plugin, para incluir todos los módulos RSC/SSR y archivos del cliente. Edita la configuración fuente y vuelve a compilar cuando cambies los bindings o variables; no edites `dist` a mano.

Las credenciales de Cloudflare pertenecen al entorno de Wrangler o a secretos de CI. No deben guardarse en el código, en `wrangler.jsonc` ni en el ZIP de esta copia.

## Verificación privada

Comprueba que una sesión sin autorización no obtiene HTML del juego, JavaScript ni respuestas de `/api/mvp`. Después entra con cada correo permitido y verifica persistencia al recargar y una orden con confirmación. Una instalación desde cero empieza sin jugadores; la recuperación actual conserva los tres perfiles del respaldo.

`npm run dev` y `npm start` mantienen la verificación estricta. La experiencia de inicio de sesión debe verificarse en la URL protegida por Access; ejecutar el servidor local no crea un usuario ficticio ni desactiva el control de acceso.

Las pruebas `cloudflare-access.test.ts` verifican firmas reales y fallos de autenticación. `cloudflare-worker.test.ts` comprueba además el límite exterior del Worker: páginas, assets, API, lista de correos, limpieza de encabezados y preservación de cuerpos POST. Un build o dry-run correcto valida el paquete; el login real y las políticas remotas requieren comprobación en Cloudflare.

## Interrupciones del guardado

El inicio maneja los errores transitorios de D1 con una pantalla de espera, reintentos de lectura acotados y una comprobación manual. La API responde con `503`, `Retry-After: 5` y `MVP_STORAGE_UNAVAILABLE`, sin incluir consultas ni datos de la partida. La interfaz no sustituye una lectura fallida por un mundo nuevo. Los fallos de autenticación conservan su tratamiento independiente.

Durante una incidencia, verifica primero una consulta independiente como `SELECT 1 AS ok` y el estado oficial del proveedor. Conserva la base original. Si se prepara una recuperación, valida una copia aislada, su fecha y su contenido antes de cambiar el binding; confirma con el titular cualquier posible pérdida de avances posteriores. El identificador del mundo y los permisos deben conservarse. Una pantalla de recuperación accesible no confirma que D1 se haya recuperado: comprueba también la API autenticada y la persistencia.

## Referencias

- [Worker antes de cada solicitud a assets](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/).
- [Binding ASSETS y fetch](https://developers.cloudflare.com/workers/static-assets/binding/).
- [Validación de JWT de Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).
