# Escrituras y liquidación por aldea

Este documento conserva las mediciones de esa fase. La evolución posterior de lecturas acotadas y su nueva carga de 100 cuentas se documenta en [Lecturas autoritativas por aldea](BOUNDED-VILLAGE-READS.md).

Candidato local del 17 de octubre de 2026. `getMvpStore()` y el dominio de pruebas conservan el backend activo. No se han ejecutado migraciones ni escrituras remotas. La selección experimental requiere `createPartitionedMvpStore(..., { villageWrites: true, playerReads: true })` y las tablas de `partitioned-world.sql`, `player-read-model.sql` y `village-writes.sql` en una base preparada por separado.

## Cambio de autoridad

Las órdenes auditadas de producción, fabricación, agricultura, exploración, construcción, logística y comercio confirman sus registros bajo versiones de aldea, cuenta y recursos consultados. Dos aldeas independientes pueden confirmar desde la misma revisión general. La revisión sigue identificando una instantánea, pero ya no decide el ganador de todas las escrituras locales.

Cada confirmación compara las versiones leídas y los hashes de todos los registros que modifica. Un permiso efímero protege cada sentencia del mismo lote SQL: inventarios, reservas, trabajos, pagos, recibo y proyecciones públicas se publican juntos. Una condición fallida no publica nada; un error posterior revierte el lote. Las transferencias entre dos aldeas siguen siendo una transacción de la misma D1; no se introdujo un intercambio entre bases o Durable Objects. La garantía y los límites de `batch()` están documentados por [Cloudflare](https://developers.cloudflare.com/d1/worker-api/d1-database/).

Las identidades nuevas de trabajos, eventos, unidades y asientos usan un espacio de operación; no necesitan reservar un contador mundial. Los identificadores y contadores existentes siguen válidos. Los ensayos del encargado conservan este asignador. La crónica fusiona nuevos eventos y mantiene 150; el libro contable añade cada bloque de asientos sin intercalarlo con otro, conservando las pruebas de pagos y pases ganados. Los recibos impiden duplicar una orden aunque se pierda su respuesta.

## Liquidación y frescura

Consultar una aldea avanza su historial del encargado, trabajos, construcción, suministros, habitantes, transporte, almacenamiento, industria y actividad. El trabajo privado pendiente del vecino permanece intacto. No se construye un mundo parcial para ejecutar reglas: siguen disponibles los recursos y participantes autoritativos.

La inicialización de carteras y actividad abarca juntos los perfiles de una misma cuenta. Esto evita que abrir un segundo perfil invalide de forma artificial la primera cotización; no liquida los trabajos privados de ese segundo perfil. Los pases, recompensas y los 30 minutos de ahorro diario siguen protegidos por la versión compartida de cuenta. Una cuenta ajena no se inicializa como efecto de consultar la aldea.

La frontera es explícita y conservadora. Combates, política, financiación y comandos aún no auditados retienen la vía global. También se conserva la liquidación compartida cuando vencen pactos, puestos, ofertas, contratos, reservas forestales o encargos que pueden retener el presupuesto NPC, una carreta o ranuras de extracción. Así un usuario desconectado no bloquea esos bienes. Esta excepción todavía necesita un planificador de vencimientos acotado; no equivale a haber eliminado toda liquidación global.

Los trabajos de una aldea no invalidan por su sola antigüedad la lectura pública de todo el planeta. Las aldeas ajenas muestran su último estado confirmado y sus animaciones programadas; no se inventan productos ni niveles terminados. Las lecturas privadas conservan los vencimientos propios y los de recursos y compromisos compartidos, incluidos los alimentos guardados en el escrow de un vendedor. La caducidad de una oferta se vuelve a comprobar en la compra.

## Conservación y validación

El ensayo del respaldo se realiza en SQLite de memoria. Conserva el JSON, su orden y la revisión 282: cuatro perfiles, 28 trabajos y 143 recibos, SHA-256 `1d62f93189563add2173287442aa89b1789db4ca75171669eaaff98e1c771032`. Una modificación de prueba por aldea, su repetición obsoleta, la reversión y un fallo SQL inyectado se verifican sin tocar la base activa. Los 51 archivos gráficos de referencia permanecen idénticos.

Ese ensayo usa el respaldo local disponible; no afirma que contenga los avances más recientes del dominio. La base activa no se ha leído ni modificado durante esta fase. Cualquier migración posterior deberá partir de una exportación vigente verificada, conservando también el original.

Las pruebas focalizadas cubren dos confirmaciones concurrentes desde la misma revisión, repetición de recibos, devolución de reservas, ventas NPC, compra con escrow, extracción compartida, vencimientos de vecinos desconectados, orden contable, corrupción, rollback y frescura. Los 83 archivos de la suite original de 698 casos se conservan byte por byte. Su puente SQL cuenta por separado las confirmaciones globales y por aldea, y verifica los hashes de todas las fuentes del motor durante cada corrida.

Dos aserciones antiguas comparaban IDs de trabajos de dos mundos clonados como si debieran ser idénticos. Con los nuevos IDs únicos por operación esa igualdad dejó de ser el contrato correcto. El modo explícito `village-ids-v1` revisa únicamente esas dos aserciones en memoria: primero exige que cada producto o suministro remita a su propio trabajo real y después compara todos los demás datos económicos y de transporte. Los otros 696 casos conservan sus aserciones originales. El manifiesto `scripts/reviewed-village-id-contract.json`, el parche de dos bloques `work/test-boost-id-adaptation.patch` y los informes distinguen ese modo del control original sin adaptaciones. Las corridas literales anteriores y sus fallos permanecen guardados; no se presentan como aprobadas.

El workerd local aprobó el SQL nuevo, una partida sintética UTF-8 de 2.295.622 bytes, confirmaciones independientes, conflicto de recursos, rollback y una lectura caliente de seis consultas con un vecino atrasado. Midió hasta 38 sentencias por lote y 98 parámetros. La corrida r4 atesta los 116 archivos de `lib/`, estables antes y después, incluida la corrección de cuenta. El binario instalado usa compatibilidad de mayo; el proyecto conserva octubre y esa combinación exacta de despliegue todavía no está acreditada. Informe: `work/village-writes-runtime-verification-20261017-r4.json`.

## Medición de 100 jugadores

La carga final mantiene 100 cuentas, 60 segundos de actividad y timeout HTTP de 30 segundos, con el mismo calendario y mezcla de la referencia. Usa HTTP y SQLite locales en un solo proceso Node con el generador. La liquidación explícita de cada cuenta después de adelantar el reloj se hace fuera de la ventana medida. Se conservan los fallos y resultados desconocidos; un cierre tardío no convierte un timeout en una respuesta exitosa.

La corrida final terminó el 17 de octubre a las 13:55 de Costa Rica, después de corregir la inicialización entre perfiles de una cuenta. Informe inmutable: `work/scalability-load-village-1792266767695.json`. Se conservó también la primera corrida, anterior a esa corrección, en `work/scalability-load-village-1792265914712.json`.

| Medida de la corrida final local | Resultado |
| --- | --- |
| Población y estado inicial | 100 cuentas; 686.503 bytes |
| Ráfaga de consultas | 100 respuestas HTTP 200; p95 de cliente 25,98 s |
| Ventana mixta y cierre de clientes | 60 s de actividad; 79,52 s incluyendo cierre |
| Solicitudes mixtas | 464; circuito cerrado de 5,83 solicitudes/s |
| Confirmaciones recibidas por el cliente | 82 HTTP 200; 34 HTTP 409; 5 timeouts |
| Consultas recibidas por el cliente | 178 HTTP 200; 9 timeouts |
| Cotizaciones recibidas por el cliente | 116 HTTP 200; 40 HTTP 409 |
| p95 de respuestas exitosas de consulta / confirmación | 27,54 s / 28,14 s |
| Confirmaciones completadas en el servidor | 87; cinco llegaron después del timeout del cliente |
| CAS globales / CAS por aldea en el tramo mixto | 0 / 143 intentos; 118 confirmaciones y 25 conflictos por aldea |
| CPU del proceso compartido / ejecución SQLite | 83,05 s / 1,94 s |
| RSS máxima muestreada | 2,18 GB; incluye generador y servidor Node |
| Lecturas autoritativas / proyecciones de jugador | 560 / 224 en el tramo mixto |
| SQL máximo por petición HTTP completada | 74 sentencias en consultas; 73 en confirmaciones |
| Integridad al terminar | 8 comprobaciones económicas, 3 de identidad y 5 carreras aprobadas |
| Peticiones pendientes al cerrar | 0 |

Los CAS por aldea incluyen liquidaciones automáticas, además de acciones del jugador; no son 118 ventas o fabricaciones del cliente. Los HTTP 409 incluyen validaciones y cotizaciones que dejaron de ser válidas; tampoco son lo mismo que los 25 conflictos SQL. Los 14 timeouts se mantienen como fallos del cliente aun cuando el servidor termine después. Los percentiles exitosos excluyen esos timeouts. La demora observada al descubrir trabajos completados tuvo p95 de 36 s; no hubo muestras de todos los tipos de trabajo durante esa ventana.

La comparación verificable con la referencia original está en `work/village-load-vs-baseline-final.json`: ambas corridas conservaron los bienes comprobados; las confirmaciones de cliente pasaron de 3 a 82 y los HTTP 409 de confirmación de 157 a 34. **No mejoró la latencia de la ráfaga:** su p95 pasó de 20,23 s a 25,98 s. Cambiaron el motor y el formato, hay una sola corrida por candidato y el circuito cerrado produce secuencias efectivas distintas. No se atribuye la diferencia a un único cambio ni se presenta como capacidad máxima. `work/village-load-vs-first-final.json` conserva la comparación con la primera corrida por aldea. La conciliación final consulta solo los propietarios con trabajos realmente pendientes y falla si no alcanza reposo; esa comprobación está fuera de la ventana mixta comparable.

La suite final completa aprobó **816/816**, sin omisiones. El control SQL por aldea aprobó **698/698 bajo el contrato explícito de 696 casos intactos y dos comparaciones de identidad revisadas**, con 2.281 confirmaciones por aldea sobre SQL real; véase `work/scalability-review-sql-run-1792266513196/summary.json`. Tipos, lint y compilación aprobaron; lint mantiene tres advertencias anteriores. El resumen verificable está en `work/village-final-summary.json`.

**Decisión: integridad local aprobada; fluidez y despliegue pendientes.** La interfaz actual cancela GET a los 8 s y mutaciones a los 12 s. Esperas de 26–28 s y 14 timeouts no cumplen esa experiencia; permitir 30 s en el generador no la corrige. Las 74 consultas SQL acumuladas por petición tampoco acreditan los límites de un plan de Cloudflare a partir del máximo de un solo lote. El siguiente trabajo es acotar las lecturas autoritativas y las entradas de liquidación por aldea y recurso, evitando reconstruir y serializar el mundo completo; también requiere un índice de vencimientos y reducir invalidaciones compartidas. El dominio conserva su versión y sus partidas.

## Límites que permanecen

- Las lecturas autoritativas y la respuesta de una escritura todavía reconstruyen el mundo completo. Las huellas ya verificadas solo se reutilizan cuando los bytes y el hash coinciden.
- El conjunto de recursos compartidos es conservador: puede causar reintentos entre operaciones que podrían separarse con índices más estrechos. Si supera 2.048 dependencias se usa la vía global; nunca se descartan guardias para encajar.
- Los perfiles de una cuenta comparten límites y recompensas. Un perfil alternativo atrasado todavía puede impedir que su caché privada sea válida.
- El directorio público sigue siendo global. No hay suscripciones por proximidad, partición física de regiones, WebSockets con hibernación ni reasignación de zonas saturadas.
- El presupuesto de 40 sentencias por lote no es el total por invocación. Lecturas, reintentos, proyecciones y liquidaciones compartidas necesitan un presupuesto acumulado. Un solo D1 mantiene su capacidad física compartida; sus [límites](https://developers.cloudflare.com/d1/platform/limits/) no se convierten automáticamente en una cifra de jugadores.

Ni la suite ni esta medición local certifican 500, 3.000 o millones de usuarios, ciudades avanzadas, móviles o latencia de Cloudflare. El candidato no reduce resolución, geometría, sombras ni animaciones.
