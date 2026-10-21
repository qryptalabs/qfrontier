# Lecturas por jugador y versiones por aldea y recurso

La fase posterior de [Escrituras y liquidación por aldea](VILLAGE-WRITES-AND-SETTLEMENT.md) incorpora una opción adicional `villageWrites: true`. Este documento conserva el diseño y los resultados de la fase de lecturas anterior, que mantenía un CAS económico global.

Implementación local del 17 de octubre de 2026. No selecciona el nuevo backend en el dominio de pruebas ni ejecuta migraciones remotas. `getMvpStore()` conserva el formato activo anterior. La activación del candidato requiere el adaptador particionado y las dos opciones explícitas `playerReads: true` y `metadataVersioning: true`, además de la SQL de `db/player-read-model.sql` sobre un destino preparado y verificado.

## Comportamiento

- Una consulta vigente de la cuenta y el perfil se obtiene desde filas indexadas. No carga `world_partition_parts`, inventarios ajenos ni el estado económico global. Se adjunta un directorio público que conserva la geometría y los habitantes reales de las otras aldeas. El directorio todavía es global: no hay suscripciones por proximidad en esta fase.
- Las cachés tienen hash, fragmentos UTF-8, dependencias y próxima frontera temporal. Una caché ausente, incompleta, obsoleta o vencida vuelve al motor autoritativo; nunca se simulan las reglas con un mundo parcial. Las vistas administrativas y ciertas previsiones activas requieren lecturas completas.
- Cada aldea, cartera, conjunto de trabajos y recurso compartido tiene una versión monotónica persistida. La eliminación conserva una versión de ausencia, de modo que borrar y recrear no restaura una autorización anterior.
- Las cotizaciones v2 firman propietario, comando, solicitud, caducidad, políticas y versiones consultadas. Todos los perfiles de una cuenta comparten su versión de cuenta: los pases y el máximo de nivel son compartidos y deben coincidir con la recompensa que se revisó. Dos acciones independientes pueden confirmar aunque cambie la revisión global. Un cambio en la propia aldea, un yacimiento, presupuesto NPC, oferta o contraparte pertinente exige revisar la cotización. Los comandos aún no auditados conservan el control estricto de revisión global.
- La validación devuelve una autorización interna verificada, que debe reenviarse como séptimo argumento de `executeMvp`. Sin esa autorización, el motor conserva el comportamiento anterior. Los tokens anteriores siguen siendo válidos con revisión global estricta.
- Los recursos, recibos, versiones y cambios de actores se confirman en el mismo CAS económico SQL, protegidos por el mismo token. Una revisión y un token coherentes, junto con `entity_count`, permiten leer las versiones ya confirmadas sin volver a derivar ni hashear todos sus valores. La reconstrucción de metadatos queda para una reparación; las verificaciones criptográficas se limitan a ocho simultáneas por petición. Un CAS con metadatos coherentes conserva las huellas sin cambios y sólo calcula las de las versiones modificadas, incluidas las ausencias; una reparación reconstruye todas. La regresión de un cambio de inventario mide tres hashes en total: el registro, la aldea y su cuenta. El CAS global de escritura se mantiene: esta fase no reparte la autoridad económica entre Durable Objects.
- Una repetición confirmada consulta su recibo antes de comprobar la cotización. No fabrica, paga ni reserva dos veces. Un escritor antiguo que no actualice los metadatos invalida las lecturas y las autorizaciones por entidad; reparar también eleva las versiones ante posibles cambios A→B→A.

## Conservación y comprobaciones

El ensayo usa únicamente el respaldo SQL local en SQLite de memoria. Conserva exactamente el JSON y la revisión 282 del respaldo: cuatro perfiles, 28 trabajos y 143 recibos. El hash del JSON restaurado es `1d62f93189563add2173287442aa89b1789db4ca75171669eaaff98e1c771032`. No prueba que ese respaldo contenga los avances posteriores del dominio; el dominio no se ha leído ni modificado en esta tarea.

Los 51 archivos gráficos de la referencia permanecen idénticos. No se redujeron resolución, iluminación, geometría ni animaciones para producir una mejora de servidor. Las proyecciones se contrastan con la vista anterior y prueban que una mejora del vecino aparece sin publicar su almacén.

Pruebas reproducibles desde la raíz del proyecto:

```powershell
node work/run-player-versions-check.mjs control
node work/run-player-versions-check.mjs typecheck
node work/run-player-versions-check.mjs lint
node work/run-player-versions-check.mjs sql
node work/run-player-versions-check.mjs build
node --experimental-strip-types work/rehearse-player-versions.mjs
node work/check-player-versions-preservation.mjs
node work/verify-player-reads-runtime.mjs --out work/player-reads-runtime-new.json
```

El runner SQL selecciona las 698 pruebas originales sin modificarlas y activa metadatos mediante `QFRONTIER_TEST_ENTITY_VERSIONS=1`; mantiene `playerReads: false` para comprobar la conservación económica por separado de las pruebas focalizadas de lectura. Su presupuesto de fixture es 900 sentencias/batch, declarado en el informe, y no equivale a una configuración aprobada para D1 Free. La comprobación workerd separada mantiene 40 y ha medido hasta 38 sentencias/batch, 98 parámetros y una lectura caliente de seis sentencias sin reconstrucción del mundo. La SQL divide los cuerpos en fragmentos de hasta 65.536 bytes.

El workerd instalado sólo admite la compatibilidad local de mayo; la comprobación declara `2026-05-22`. La configuración del proyecto conserva `2026-10-14`. La integración exacta con ese runtime desplegado sigue pendiente y no se oculta con un cambio de fecha del proyecto.

## Lo que sigue limitando la capacidad

La escritura y la liquidación de trabajos siguen leyendo y avanzando el mundo completo bajo un CAS global. La crónica y varias vistas sociales invalidan de forma conservadora; las previsiones de encargados activos pueden exigir refresco de un segundo. El atlas adjunta todos los actores públicos. No hay partición de zonas saturadas, Durable Objects regionales ni WebSockets con hibernación implementados por este cambio.

Los límites por invocación deben presupuestarse sumando lecturas, reintentos, CAS y proyecciones; el máximo de una sola llamada batch no es ese total. La inicialización de una base poblada necesita importación acotada y verificada, no elevar silenciosamente el presupuesto o cambiar el selector activo.

La prueba de 100 usa autenticación sintética, un proceso Node para cliente y servidor, SQLite local y aldeas básicas. No renderiza WebGL ni mide la red de Cloudflare, los móviles o ciudades con múltiples encargados. Ningún resultado por sí solo certifica 500, 3.000 o millones de jugadores simultáneos.

## Resultado de la carga final: no aprobada

El candidato final mantiene la misma configuración de referencia: 100 cuentas, 60 segundos de actividad y 30 segundos de timeout HTTP. El estado inicial fue de 685.763 bytes. No se ha desplegado ni seleccionado este backend en el dominio de pruebas.

| Medida local | Resultado final |
| --- | --- |
| Ráfaga de 100 consultas | 96 respuestas HTTP 200; 4 timeouts |
| p95 de respuestas exitosas de la ráfaga | 30,19 s |
| Ventana mixta y cierre de clientes | 60 s + 28,78 s |
| Solicitudes de clientes en la fase mixta | 396; 194 timeouts |
| Confirmaciones recibidas por el cliente | 7 exitosas, 4 rechazos HTTP 409, 116 timeouts |
| RSS máxima muestreada | 2,92 GB |
| CPU del proceso completo / ejecución SQLite local | 100,80 s / 3,66 s |
| Comprobación posterior | El primer GET de liquidación agotó 30 s |
| Solicitudes de servidor pendientes tras drenar 60 s | 166 |
| Integridad económica de esta corrida | No alcanzó el reconciliador final; no se declara aprobada |

El p95 es de respuestas exitosas; los timeouts se cuentan por separado y no se convierten en éxitos. Los timers pueden vencer tarde cuando el hilo está ocupado. Las solicitudes que agotaron su espera pueden seguir procesándose en el servidor; los contadores de CAS al corte no son un resultado definitivo de todas ellas. Las finalizaciones tardías de una fase también pueden solaparse con la siguiente. No se infiere de esta corrida la capacidad de Cloudflare alojado.

La reducción de rechazos HTTP 409 respecto de la referencia no demuestra por sí sola una mejora: en este candidato hay numerosas esperas agotadas. La optimización de las huellas está verificada por regresiones concretas, pero el conjunto sigue pagando lecturas, clones y liquidaciones del mundo completo, invalidaciones compartidas y reintentos de un CAS global. El ensayo no aprueba cien jugadores fluidos y no justifica activar el candidato.

La cobertura final se completó en dos particiones sin casos repetidos: **698 casos originales contra SQL real y 70 casos nuevos**, todos aprobados. La pasada SQL registra 30 archivos con motor y SQL efectivos, 3.694 lecturas, 2.545 intentos CAS y 2.513 confirmaciones. El último proceso que intentó ejecutar toda la suite en memoria terminó sin resumen; su registro se conserva y no se cuenta como aprobado. Las dos particiones completadas cubren los 768 casos únicos. TypeScript, lint, compilación final, restauración exacta y workerd local de mayo también aprobaron. Eso demuestra las comprobaciones realizadas; no sustituye la prueba de carga fallida.

Evidencia conservada:

- Resumen final y hashes de las fuentes verificadas (artefacto privado excluido).
- Carga final completa, incluyendo fallo, fase y endpoint (artefacto privado excluido).
- Primer intento fallido, antes de corregir la cuenta y los metadatos (artefacto privado excluido).
- Segundo intento fallido, antes de optimizar el CAS (artefacto privado excluido).
- Restauración exacta del respaldo local (artefacto privado excluido).
- Comprobación de gráficos y respaldo (artefacto privado excluido).

No se generó una comparación marcada como aprobada, porque faltó la reconciliación final del candidato. El resumen conserva también la pasada SQL descartada que había precargado el motor antes de instalar el interceptor; la verificación posterior exige cobertura SQL real y ya pasó con el instrumento corregido.

El siguiente cambio debe reducir el trabajo autoritativo: liquidar un conjunto acotado de órdenes por jugador, leer y confirmar las entidades que cada comando utiliza, y separar las proyecciones públicas de las consultas privadas. Las reservas compartidas y el comercio deben conservar la misma atomicidad económica; trasladar el motor global a un Durable Object no elimina ese trabajo. Esa migración sigue pendiente.
