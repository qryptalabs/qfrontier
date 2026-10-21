> Informe histórico redactado. Dominios, correos y rutas son ejemplos; los artefactos privados de `work/` no se distribuyen. Para un despliegue nuevo usar [Operación](architecture/OPERATIONS.md).

# Servidor privado de pruebas en la PC

Preparación del 17 de octubre de 2026, hora de Costa Rica. Este entorno aloja una copia independiente del juego en la PC de desarrollo. El dominio anterior sigue alojado en Cloudflare y conserva su base y configuración.

## Entrar al juego

Utilizar **https://qfrontier.example.invalid/**. Cloudflare Access solicita el correo y un código de acceso. Los integrantes autorizados son `tester-1@example.invalid` y `tester-2@example.invalid`. El código se introduce directamente en la página de Access.

El alias `qfrontier.example.invalid` tiene resolución DNS inconsistente y se retiró de la aplicación nueva de Access. Incluirlo en la aplicación provocaba que el inicio de sesión intentara abrir ese alias. La aplicación privada ahora incluye exclusivamente `qfrontier.example.invalid`. La ruta del alias en el túnel queda cerrada con `http_status:404`; sus registros DNS preexistentes se conservaron. Utilizar únicamente la dirección operativa indicada arriba.

La aplicación nueva de Access es `7bbfde68-a014-4895-bdcd-dc809cfea3cf`, del equipo `example.cloudflareaccess.com`. Su audiencia es `REPLACE_WITH_PRIVATE_ACCESS_AUDIENCE`. Estos identificadores describen el control de acceso; no son el token secreto del túnel.

El dominio anterior permanece en **https://qfrontier-preview.example.invalid/**. Sus avances y los de la PC son independientes a partir de la copia inicial. Jugar en un entorno no actualiza automáticamente el otro.

## Verificación de la instalación inicial

Se prepararon la copia local de partidas, el runtime y el túnel nuevo. El origen sólo escucha en `127.0.0.1:5180`; las métricas del túnel están en `127.0.0.1:5181`. Ninguno de esos puertos debe exponerse mediante el router. El supervisor comprueba que el origen rechace las solicitudes anónimas antes de arrancar el túnel.

Se comprobó un reinicio real del supervisor con respaldos verificados antes y después: misma revisión 282, 4 perfiles, 28 trabajos y 143 recibos. Coincidieron el hash del JSON y el hash del archivo completo de la base respaldada, incluidas todas sus tablas. El informe está en `work/private-pc/restart-preservation-proof.json`.

Se completó el inicio de sesión con un correo autorizado y el código introducido en Access. Se observó la partida correcta, con la aldea **Refugio del Alba** cargada en 3D en la dirección operativa. La evidencia visual está en `work/private-pc/village-running-proof.png`. No se guardaron códigos OTP ni cabeceras de autenticación como evidencia.

También se comprobó una escritura autenticada y su persistencia: se cambió temporalmente la apariencia de Ámbar a Pino desde Recorrer → Personaje, se guardó con cotización y confirmación válidas, se reinició el supervisor y se recargó la página. Pino seguía seleccionado. Después se restituyó Ámbar y se confirmó el guardado. Las dos acciones fueron cosméticas; no se realizaron operaciones económicas para esta prueba.

Los respaldos anterior y posterior al reinicio conservan revisión 284, 4 perfiles, 28 trabajos, 144 recibos y exactamente el mismo JSON. Coinciden `world_state`, migraciones y secuencia. La tabla interna `_cf_METADATA` y los bytes físicos de SQLite cambiaron; la comprobación acredita conservación de las partidas y tablas de juego, sin afirmar igualdad de toda la metadata del runtime. La evidencia está en `work/private-pc/authenticated-persistence-proof.json`.

El respaldo final, con Ámbar restaurado, tiene revisión 285, 4 perfiles, 28 trabajos y 145 recibos. Los dos recibos adicionales frente a la copia inicial corresponden a los guardados cosméticos de prueba. Las ocho comprobaciones finales de acceso, túnel y conservación de la configuración original pasaron; están en `work/private-pc/final-probes.json`. Ver la aldea 3D no equivale a medir sus FPS ni el rendimiento en móviles.

La identidad de una partida se guarda como `cf-access:<sub>`. El correo se utiliza para la autorización, pero no basta para asociar una partida. Si un integrante accede y no ve sus exploradores, detener esa verificación y revisar el sujeto de Access; conservar los propietarios originales y el respaldo antes de realizar cualquier cambio de identidad.

## Versión privada actual

El servidor fue actualizado después con las tres cámaras, los controles y la exploración exterior de **Recorrer**. El runtime activo es `work/private-pc/runtime/2026-10-18T01-48-28-933Z-95170249`, con 107 archivos y build SHA-256 `1efa74c8c51f76b8af1bd51039f6b2f039f58651bbfb9b8576764bb138a8afb3`. `work/private-pc/active-runtime.json` sigue siendo la referencia operativa; las copias anteriores permanecen conservadas.

La primera zona permite trazar rutas a **Costa Ámbar** y **Las Brumas**. Hay **45 destinos catalogados**, de los que 43 no tienen viaje habilitado en esta fase; el directorio explica sus motivos de bloqueo. Se puede caminar por terreno exterior transitable con el mismo personaje y las mismas cámaras, sin mover la aldea de su parcela. No se habilitan rutas marítimas, economía en las ciudades visitadas ni viajes automáticos por todo el planeta.

La activación privada y el circuito principal de QA están completados. Se observó casa → Costa Ámbar → Las Brumas → casa, parada y persistencia al recargar, las tres cámaras y controles móviles emulados. `work/private-pc/exploration-20261017/final-checkpoint.json` verificó el regreso al punto doméstico exacto y la conservación de cuatro perfiles, 66 lotes, siete construcciones habitables, 28 trabajos, recursos, identidad y progresión; los otros tres perfiles conservaron su navegación. El respaldo final `work/private-pc/backups/local-auto-2026-10-18T01-57-40.858Z-db364603.json` tiene revisión 428 y 218 comprobantes, siete más que antes de QA. `work/private-pc/final-probes.json` registra ocho comprobaciones de aislamiento aprobadas después de la activación.

Las pruebas y limitaciones históricas de cámaras se conservan en [PRIVATE-PC-CAMERAS.md](PRIVATE-PC-CAMERAS.md); el alcance, la evidencia integrada y los escenarios todavía pendientes se registran en [PRIVATE-PC-EXPLORATION.md](PRIVATE-PC-EXPLORATION.md). La comparación de partidas distingue igualdad exacta al instalar de los cambios de navegación permitidos durante QA, según [PRIVATE-PC-EXPLORATION-RELEASE.md](PRIVATE-PC-EXPLORATION-RELEASE.md). No se presenta una aprobación de teléfono físico ni una medición de FPS o concurrencia de la exploración.

## Iniciar, consultar, detener y reiniciar

Abrir PowerShell en la PC y situarse en el proyecto:

```powershell
Set-Location -LiteralPath 'D:\Projects\qfrontier'
node scripts/private-pc-supervisor.mjs status
```

Utilizar una sola de estas acciones según lo que se necesite:

```powershell
node scripts/private-pc-supervisor.mjs start
node scripts/private-pc-supervisor.mjs stop
node scripts/private-pc-supervisor.mjs restart
```

`start` inicia el runtime y después el túnel en segundo plano, con ventanas ocultas. `stop` detiene primero el túnel y después el runtime. `restart` conserva la misma carpeta de datos; no reimporta la partida. Las órdenes verifican las identidades y argumentos de sus procesos para evitar detener otros proyectos.

En `status`, `running: true` significa que el supervisor y sus dos procesos siguen activos. La disponibilidad externa debe verificarse además desde la URL operativa. El `hostname` del perfil está configurado como `qfrontier.example.invalid` y participa en la configuración real del origen; conservar ese nombre canónico y volver a preparar/verificar el runtime si se modifica.

El supervisor intenta recuperar un proceso que termina, con un máximo de cinco reinicios en diez minutos y esperas crecientes. Si alcanza el límite, deja un estado de error. Después de corregir la causa, consultar `status` y reiniciar de forma controlada.

La PC debe permanecer encendida, con Windows y la sesión de este usuario disponibles, sin suspensión y con conexión estable a Internet. Apagarla, suspenderla o perder conexión interrumpe el acceso del equipo. La GPU de esta PC sólo dibuja la sesión que se juega en ella; cada teléfono o PC remoto dibuja el juego con su propia GPU.

La consulta de energía de Windows confirmó que, en corriente, los temporizadores de suspensión e hibernación por inactividad están desactivados. En batería, la suspensión figura a los diez minutos. No se cambiaron esas políticas; apagados, suspensión manual o cortes siguen siendo posibles. La lectura y la comprobación de respaldos recientes están en `work/private-pc/os-readiness.json`.

## Datos y primera copia

La configuración aislada está en `work/private-pc/wrangler.local.json`. Su única base es `qfrontier-private-pc-local`, binding `DB`, identificador local `8b7617dc-1530-4fc4-91d7-56ac105106bc`, con `remote: false`. La persistencia se conserva en `work/private-pc/state`.

La copia inicial proviene del export remoto de sólo lectura `work/private-pc/backups/source-current-1792280740917.sql`, obtenido el 17 de octubre aproximadamente a las 23:45 UTC, 17:45 de Costa Rica. Se verificaron **revisión 282, 4 perfiles, 28 trabajos y 143 recibos**. Esos son los valores de la copia inicial; el servidor local podrá avanzar al jugar.

Antes de arrancar se compararon el JSON completo, revisión, propietarios, tablas, trabajos y recibos. El informe es `work/private-pc/backups/local-preservation-ready-1792281139352.json`. La revisión y el JSON se conservaron exactamente. El primer import mediante un literal SQL superó el límite de longitud de la sentencia; la restauración correcta utilizó valores parametrizados y conservó íntegro el JSON de 195.060 bytes.

| Evidencia inicial | SHA-256 |
| --- | --- |
| Export SQL actual | `d2405735a3b11dabbcdddcd90164a639aeae1165734b385e09253cc94734f229` |
| JSON del mundo copiado | `1d62f93189563add2173287442aa89b1789db4ca75171669eaaff98e1c771032` |
| `wrangler.jsonc` original, conservado | `f662e631efb14b698d23731f870d109c466f8e3b81010bad9fe5ce0093cac4ff` |
| Configuración local canónica, después de corregir el origen | `482d3e1434919d13e0d46718bf5a23a5fb93615995910f7dfdd2dc6d94be32b5` |

El dominio anterior conserva su D1 `qfrontier-development`. El perfil privado de PC utiliza exclusivamente la persistencia local nueva. Una recuperación futura debe partir de un respaldo verificado y preparar un destino local controlado; la importación inicial no es una operación de arranque ni de actualización.

## Crear un respaldo local

Desde la carpeta del proyecto:

```powershell
node scripts/private-pc-backup.mjs
```

La orden utiliza la API de backup de SQLite con una conexión de sólo lectura y una instantánea fijada. Incluye los datos confirmados del WAL y puede ejecutarse mientras el servidor está activo. Cada ejecución crea archivos nuevos en `work/private-pc/backups`:

- `local-auto-<fecha>-<identificador>.sqlite`: copia completa de la base local.
- `local-auto-<fecha>-<identificador>.json`: manifiesto de revisión, perfiles, trabajos, recibos, hashes y verificaciones de todas las tablas.

El resultado debe indicar `allPassed: true`. Si falla, conservar el diagnóstico y revisar la causa antes de considerar válido ese respaldo. No se eliminan respaldos anteriores. La orden no contacta D1 remoto ni altera los datos de origen. No sustituirla por una copia directa del archivo SQLite mientras el servidor está activo: esa copia podría omitir datos del WAL.

El mecanismo pasó pruebas con una base aislada: datos confirmados en WAL, una tabla adicional con BLOB, dos revisiones y conservación del primer respaldo. La evidencia está en `work/private-pc/backups/backup-fixture-verification-1792281419873.json`. Las dos primeras copias del juego real, durante el reinicio de revisión 282, coincidieron byte por byte. La prueba posterior con escritura autenticada conservó los datos de juego a través del reinicio, con diferencias de metadata interna registradas explícitamente. La tarea de copia cada hora está instalada y su ejecución de prueba terminó correctamente; observar las repeticiones posteriores mediante sus manifiestos.

El respaldo de cierre de la instalación inicial es `work/private-pc/backups/local-auto-2026-10-18T00-21-06.806Z-6afa5c05.json`, revisión 285, con SHA-256 del JSON `4628bbbdd470b386a0f58b48e328636c0a58f3114248c008068496d6ce128f50`. Ese manifiesto corresponde a su archivo `.sqlite` del mismo nombre. Es una referencia histórica; para conservar el estado actual hay que crear y comprobar una copia reciente. Cada copia individual se compara contra su instantánea de origen; las copias de momentos diferentes pueden tener bytes físicos o metadata interna distintos.

Los respaldos contienen partidas completas. Mantener esta carpeta y los secretos del túnel en almacenamiento privado. Conservar también una copia comprobada fuera del mismo disco para poder recuperar el entorno si falla la PC.

## Actualizar el juego local

El runtime activo es una copia compilada independiente, referenciada desde `work/private-pc/active-runtime.json`. Sus archivos tienen un manifiesto de hashes bajo `work/private-pc/runtime`. El ejecutable portable de `cloudflared` también tiene una versión fijada y un checksum comprobado.

Antes de cambiar código, realizar y verificar un respaldo local. Completar las pruebas del cambio y generar la nueva compilación. Con el supervisor detenido, preparar una nueva copia de esa compilación y verificarla:

```powershell
node scripts/private-pc-runtime.mjs prepare
node scripts/private-pc-runtime.mjs check
```

Una vez que `check` pase, iniciar el supervisor y validar el acceso externo, las partidas y el cambio realizado. `prepare` conserva las copias compiladas anteriores y la carpeta de datos. Si una actualización cambia el esquema de datos, requiere su propio procedimiento de migración y reversión; cambiar el código no revierte automáticamente las partidas.

Este servidor utiliza el almacenamiento original del juego, sin activar el candidato de optimización de proyecciones ni convertir las partidas al modelo particionado. Las tres cámaras, los controles y la primera zona de exploración están activados en el perfil privado. Las referencias de alcance y QA vigentes son [PRIVATE-PC-CAMERAS.md](PRIVATE-PC-CAMERAS.md) y [PRIVATE-PC-EXPLORATION.md](PRIVATE-PC-EXPLORATION.md).

## Compatibilidad del entorno

El perfil local utiliza explícitamente `2026-05-22`, soportada por el workerd instalado. El proyecto y dominio anteriores mantienen `2026-10-14`. El override está aislado en el perfil privado y se registra como una diferencia de compatibilidad; una prueba local satisfactoria no certifica equivalencia con el runtime de producción.

El listener permanece en HTTP sobre loopback, mientras `dev.host` y el host de upstream son el nombre público canónico y `upstream_protocol` es HTTPS. Esta configuración hace que el origen de las solicitudes corresponda al navegador y conserva la validación CSRF de las escrituras. Se corrigió el perfil local tras detectar un 403 provocado por la discrepancia entre el HTTPS público y la URL HTTP interna. Se mantuvieron las comprobaciones de JWT, audiencia, correo y CSRF; no se alteraron las reglas de seguridad ni el código del juego para omitirlas. Pasaron once pruebas del runtime y ocho casos de origen/CSRF en Miniflare, además de TypeScript y lint. En aquella preparación inicial, los 105 archivos de la compilación conservaron sus hashes; las actualizaciones posteriores tienen sus propios manifiestos y gates.

Las bibliotecas, activos gráficos y el Worker compilado se conservaron en la copia del runtime. Esta preparación no demuestra todavía rendimiento en móviles, calidad visual a distintas cámaras ni capacidad para una cantidad determinada de jugadores. Esas comprobaciones se realizan con dispositivos y cargas medidos.

## Registros y problemas frecuentes

Los registros sanitizados están en `work/private-pc/logs`: supervisor, runtime y túnel. El archivo activo de cada proceso rota aproximadamente a los 5 MiB y conserva tres rotaciones. Revisar esos archivos antes de repetir arranques.

| Síntoma | Comprobación |
| --- | --- |
| La URL no conecta | PC encendida, conexión a Internet, `status`, registros del túnel y uso de la URL de Provident Quantum. |
| Access solicita iniciar sesión | Introducir el código con uno de los dos correos autorizados. |
| Un usuario entra pero no ve su partida | Verificar el `sub` autorizado y la asociación original antes de crear o reasignar perfiles. |
| El origen responde 401 sin sesión | Es el rechazo privado esperado; la URL pública debe conducir al inicio de sesión de Access. |
| El supervisor informa `failed` | Revisar su causa registrada, resolverla y usar `restart`; conservar los datos locales. |
| La sesión del juego funciona lenta | Separar tiempo del backend, red y renderizado del dispositivo; la GPU de la PC servidor no acelera los teléfonos. |

El token del túnel permanece en un archivo privado de `work/private-pc/secrets` con permisos restringidos. Su contenido no se imprime, no se pasa directamente en la línea de órdenes y no se añade al runbook ni a incidencias. Tampoco se comparten cookies de Access, códigos OTP o dumps de partidas en registros públicos.

## Tareas de Windows instaladas

El usuario autorizó completar la instalación y ambas tareas quedaron registradas. Una ejecución real de cada tarea terminó con `LastResult: 0`. La comprobación está en `work/private-pc/windows-tasks-verification.json`. El funcionamiento manual descrito arriba sigue disponible.

Las acciones utilizadas para registrarlas son:

```powershell
.\scripts\private-pc-control.ps1 -Action install-login-task
.\scripts\private-pc-control.ps1 -Action install-backup-task
```

`QfrontierPrivatePC` inicia el supervisor cuando este usuario inicia sesión. `QfrontierPrivatePCBackup` crea una copia local cada hora, con intervalo `PT1H`. Ambas utilizan `LogonType: Interactive` y `RunLevel: Limited`, sin contraseña almacenada ni elevación. No son servicios que garanticen disponibilidad después de cerrar sesión. La ejecución manual de prueba comprueba las acciones registradas; la continuidad del horario y de futuros inicios de sesión debe seguir observándose.

Para retirar solamente las tareas correspondientes:

```powershell
.\scripts\private-pc-control.ps1 -Action uninstall-login-task
.\scripts\private-pc-control.ps1 -Action uninstall-backup-task
```

Retirar una tarea no detiene una sesión ya iniciada. Utilizar el supervisor para detener el servidor. La política actual de backups conserva todas las copias; revisar el espacio de disco periódicamente y definir una retención antes de prolongar la prueba.

Referencias: [SQLite online backup](https://sqlite.org/backup.html), [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/) y [validación del JWT de Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).
