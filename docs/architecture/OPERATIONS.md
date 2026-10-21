# Operación de una copia propia

Esta publicación contiene código, no un export de jugadores. No utiliza la cuenta Cloudflare del propietario. Los dominios `.invalid`, correos de ejemplo e identificadores cero son marcadores y no sirven para autenticarse o desplegar.

## Instalación y base aislada

1. Instalar Node 24 y ejecutar `npm ci`. No copiar un `node_modules` de otro sistema.
2. Crear una D1 nueva para desarrollo. Copiar su nombre/ID y el `account_id` propio a `wrangler.jsonc`. No apuntar a una base existente por comodidad.
3. Crear aplicación Access para el hostname elegido, proveedor OTP u otro permitido y política del equipo. Copiar issuer, audiencia y correos propios en las variables del Worker. Los valores no son una clave de bypass: se verifica firma JWT.
4. Ejecutar `npm run db:migrate:local`. Esto aplica sólo `drizzle/`; no activa el candidato de `db/*.sql`.
5. `npm run dev` arranca vinext en loopback, puerto 5174. Para navegador privado remoto, el hostname de Access/Tunnel debe llegar al origen; visitar localhost sin JWT no da acceso.

```bash
npm run typecheck
npm test
npm run build
npm run deploy:check
```

`deploy:check` no publica, pero requiere configuración y autenticación de operador válidas para algunos controles. Revisar siempre el Worker generado en `dist/server/wrangler.json` antes de usar `npm run deploy`. Las migraciones remotas se ejecutan explícitamente sólo sobre una base nueva o un cambio revisado y respaldado.

## PC privada con Tunnel

Las herramientas incluidas en `scripts/private-pc-runtime.mjs` y `private-pc-supervisor.mjs` preparan snapshots de runtime bajo `work/private-pc/`. Leer su `--help`/uso y configuración antes de operar; no ejecutarlas sobre un perfil ajeno.

El perfil usa `settings.json`, estado persistente local, runtime seleccionado y credencial de túnel separados. Todo `work/` está ignorado. Crear ajustes propios desde la plantilla del launcher; no inventar tokens ni copiar una sesión de un tercero. Tunnel publica un hostname privado protegido por Access hacia `127.0.0.1:5180`; no abrir ese puerto en el router. La PC debe estar encendida y conectada.

El supervisor comprueba identidad de procesos y autenticación del origen. Un reinicio no debe importar SQL ni crear una base sustituta. Antes y después comparar revisión, propietarios, jugadores, lotes, reservas, trabajos y recibos. Conservar backup independiente del disco de la PC.

Los documentos `docs/PRIVATE-PC-*.md` son informes **históricos redactados**, no la configuración operativa de un clon. Rutas, correos y dominios fueron anonimizados; sus artefactos privados de `work/` no se publican.

## Preservar partidas en un despliegue

- Separar nombres/bases de dev, staging y producción. Build de código y persistencia tienen ciclos distintos.
- Hacer respaldo verificado antes de cualquier migración; un archivo SQL que no se restauró en una base temporal no demuestra recuperación.
- Publicar activos/versiones juntos. No reutilizar JS antiguo con un contrato de API incompatible.
- Comprobar identidad, lectura, una operación reversible autorizada y persistencia tras reinicio en staging.
- Nunca sustituir un error de lectura por `createWorld()`. El estado sólo se crea si el store confirma ausencia real.
- Una base de PC y una D1 remota no se sincronizan por compartir código. Diseñar transferencia y corte explícitos si se cambia de autoridad.

## Pruebas de carga

`scripts/load-test.README.md` describe generador y métricas. Utilizar únicamente estado sintético, límites y entorno local aislado. Los comparadores históricos esperan artefactos de referencia de `work/` o baselines que no se distribuyen; generarlos para una nueva campaña y registrar hash de fuente, runtime, semilla y configuración.

La migración experimental sigue bloqueada por los hallazgos de [PRODUCTION.md](PRODUCTION.md). No habilitarla simplemente porque las pruebas de tipos pasan.
