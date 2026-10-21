# Plan de escalabilidad y conservación de partidas

La entrega local más reciente añade confirmaciones y liquidación por aldea, con excepciones compartidas y medición independiente. Véase [Escrituras y liquidación por aldea](VILLAGE-WRITES-AND-SETTLEMENT.md). Las fases y resultados anteriores que siguen aquí conservan su carácter de referencia histórica; el selector del backend activo continúa sin cambios.

Estado: adaptador de la fase 1 implementado para uso local opcional, sin seleccionar como backend del Worker. Las fases regionales, el protocolo entre DO y los WebSockets son diseño pendiente. Revisado el 17 de octubre de 2026. Este documento no declara una migración de producción ni capacidad de concurrencia ya medida.

La entrega posterior añade lecturas por cuenta/perfil y cotizaciones con versiones por aldea y recurso, conservando un CAS económico global. Su diseño, activación explícita, verificación y medición separada están en [Lecturas por jugador y versiones](PLAYER-READS-AND-VERSIONS.md). Los resultados de la fase 1 que aparecen abajo siguen siendo la referencia anterior; no describen automáticamente el candidato nuevo.

## Objetivos y límites de esta entrega

El primer objetivo es medir una carga de **100 jugadores simultáneos** con un patrón de acciones definido. **500 simultáneos** es la meta de beta; **3.000** es una etapa posterior que necesita partición de la autoridad del juego y nuevas pruebas. Las cuentas registradas, las conexiones abiertas y los jugadores que están enviando órdenes son medidas diferentes. Ninguna cifra de usuarios por servidor se deduce del número de pruebas unitarias.

Hoy `MvpStore` lee un `MvpWorld` completo y confirma cambios con una revisión global. Inventarios, reservas, trabajos, pagos y recibos comparten ese límite de consistencia. Separar el JSON en filas pequeñas conserva ese contrato durante la primera transición. **No elimina el CAS global ni hace que dos economías regionales se actualicen de forma independiente.**

La documentación de D1 establece un máximo de **2.000.000 bytes por cadena, BLOB o fila**, y describe cada base individual como un ejecutor de consultas de un solo hilo. Son límites de plataforma, no una estimación de jugadores. Fragmentar el estado evita que una sola fila crezca hasta ese techo; todavía hay que medir serialización, memoria, lectura del mundo y conflictos. [Límites de D1](https://developers.cloudflare.com/d1/platform/limits/).

## Fase 1: quitar el techo de una fila, conservar una transacción

El adaptador `createPartitionedMvpStore` mantiene la interfaz `read / insert / compareAndSwap`. `world_partition_heads` identifica la revisión vigente y `world_partition_parts` contiene registros por entidad y fragmentos limitados por bytes. La lectura obtiene cabecera, hijos y fallback antiguo en el mismo `db.batch()`; no combina una cabecera consultada antes con hijos consultados después. Reconstruye un único snapshot consistente y verifica cantidades, orden y hashes.

La confirmación compara tanto la revisión leída como su token de commit. Solo el ganador instala un token nuevo único; cada eliminación e inserción de partes exige que la cabecera tenga ese token ganador. Comprobar solamente `revision + 1` permitiría que un competidor confundiera el commit de otro con el suyo. Un CAS perdedor devuelve conflicto sin alterar hijos ni publicar una parte de la orden.

La unidad de publicación es un solo `db.batch()` transaccional. Un error debe revertir el lote completo: cabecera, partes y revisión. No se publican fragmentos a través de varios lotes y después se anuncia una revisión completa. El presupuesto predeterminado es 40 sentencias por commit y los fragmentos son de 65.536 bytes. Si un cambio supera ese límite de sentencias, la operación falla de forma explícita y conserva el estado anterior. El límite de bytes es por fragmento; todavía no existe un presupuesto independiente para el total de bytes del batch. Tampoco sustituye el límite total de consultas por invocación: lecturas y reintentos también cuentan y requieren seguimiento. D1 documenta la ejecución secuencial y el rollback del batch ante errores. [API de D1 Database](https://developers.cloudflare.com/d1/worker-api/d1-database/).

El adaptador lee el formato anterior sin reescribirlo. Leer una partida no la migra, no crea otro mundo y no altera su revisión. La conversión del formato antiguo es una operación administrativa separada, con respaldo, verificación y reversión de datos definida antes de activarla. El Worker, los bindings y Cloudflare Access actuales no cambian por la existencia de este módulo.

Esta fase todavía paga el trabajo de reconstruir el mundo y compite por una revisión global. Puede aumentar el coste por orden si reescribe muchos fragmentos. No se presenta como la solución final para 500 o 3.000 jugadores.

El fallo conservador del presupuesto protege los datos, pero no garantiza disponibilidad: una consulta que intente liquidar muchas órdenes vencidas a la vez puede volver a superar el mismo límite en su siguiente intento. Antes de una beta amplia hay que medir ese peor caso y acotar las liquidaciones por petición, junto con el total de consultas y reintentos de la invocación. Pasar la suite existente no equivale a haber probado cientos de vencimientos simultáneos.

## Verificación antes de tocar datos compartidos

La suite base contiene 698 casos en 83 archivos: reglas económicas y de juego, gráficos, navegación, notificaciones, autenticación y disponibilidad. No son 698 pruebas de conservación económica. Hay 29 clases de almacenamiento locales y fixtures que modifican `.record`; un cambio en `getMvpStore()` no las hace usar SQL automáticamente.

Se ejecutan dos pasadas:

1. La suite original completa, sin transformación, contra la fuente congelada y contra el árbol nuevo. Debe conservar sus 698 nombres y resultados.
2. La misma suite con un preload temporal que envuelve las cuatro entradas del motor que reciben un Store. El bridge devuelve las lecturas del adaptador SQL real y confirma por su CAS real. Las mutaciones directas de fixtures se importan únicamente a bases SQLite locales aisladas y se cuentan aparte. Los contadores por archivo deben demostrar qué casos alcanzaron el adaptador. Los controles puros de gráficos, cliente y autenticación siguen ejecutándose; no se les atribuye cobertura SQL que no tienen. Los fallos simulados del almacén anterior conservan su suite específica.

Se añaden pruebas propias del almacenamiento: estado que supera el techo de una fila, caracteres multibyte, snapshots parciales o corruptos, conflictos concurrentes, reinicio entre lectura y escritura, error antes y después del commit y repetición del mismo identificador de orden. Las invariantes son conservación de lotes y procedencia, cuotas finitas, créditos y escrow, recibos, fechas, XP y órdenes autorizadas. Un fallo ambiguo no autoriza volver a emitir una escritura con otro identificador.

SQLite local valida SQL, atomicidad y reglas. No mide la latencia ni los límites operativos de D1 remoto. El despliegue requiere además una prueba de integración aislada en el runtime de Workers y una comparación verificable del respaldo, sin restaurar ni migrar la base activa durante la preparación.

La pasada SQL final del 17 de octubre, sobre el adaptador corregido con `VALUES`, terminó con **698/698 aprobados**, sin omisiones ni cambios de hashes durante la corrida. **30 archivos** ejecutaron operaciones mediante el adaptador SQL real y **53** quedaron como controles; esta es atribución por archivo, no una afirmación de que cada caso de esos archivos pruebe conservación. Se registraron 3.820 lecturas, 206 inserciones y 2.545 CAS de producción, con 2.513 confirmaciones y 32 conflictos. Los 160 imports explícitos de fixtures se contabilizaron aparte. El detalle por archivo y los hashes están en `work/scalability-review-sql-run-1792259362744/summary.json`; el SHA-256 del adaptador probado es `1d0788ce2847ecf281808eba1c11daf05819d0ad7bc05020f4d9ea78ea6dc28a`.

La comprobación posterior en Miniflare/workerd encontró un límite que ese Node SQLite no había reproducido: el `INSERT` con doce ramas `UNION ALL` fue rechazado por exceso de términos de consulta compuesta. La primera pasada de 698 casos no bastaba para declarar compatibilidad con el runtime de D1. La corrección experimental cambia esa inserción a una tabla `VALUES` y mantiene los guards y el presupuesto de parámetros. Ya pasó un ensayo de D1 local en workerd con un estado de 2.295.753 bytes, 127 partes, máximo de 65.536 bytes por parte, UTF-8 y CAS ganador/obsoleto; el informe es `work/scalability-runtime-verification.json`, sin escrituras remotas.

Ese ensayo también tiene un límite explícito: el Miniflare instalado usa compatibilidad `2026-05-22`. El proyecto conserva `2026-10-14`; no se cambió su configuración para hacer pasar la prueba. La verificación de la combinación exacta del runtime de despliegue queda pendiente. La suite SQL sí se repitió completa sobre el adaptador corregido, con el resultado descrito arriba; los intentos interrumpidos no se tomaron como aprobados.

El ensayo del respaldo existente también conservó el JSON completo, su orden y la revisión 282: cuatro jugadores, 28 trabajos y 143 recibos. Sus 195.060 bytes se reconstruyeron con el mismo SHA-256 `1d62f93189563add2173287442aa89b1789db4ca75171669eaaff98e1c771032`, distribuidos en 327 registros/partes; la parte mayor tuvo 21.455 bytes. Pasaron las cinco comprobaciones de revisión, contenido, CAS obsoleto, rollback y fuente sin cambios. Es una importación y restauración en memoria descrita en `work/scalability-preservation-rehearsal.json`; la base compartida no se convirtió ni se restauró.

## Medir la carga de 100 antes de abrir la beta

Cada ensayo debe publicar su mezcla: consultas por jugador, órdenes por minuto, cantidad de regiones, tamaño del inventario y del historial, ventanas de comida y producción, clientes móviles y proporción de reconexiones. Se comparan un mapa repartido y un punto caliente donde todos comercian en la misma ciudad. Un generador que consulta siempre una respuesta en caché no representa esa carga.

Registrar latencia p50/p95/p99 de lectura y confirmación, conflictos y reintentos del CAS, errores, CPU, bytes y sentencias por operación, memoria, duración de reconstrucción y backlog de trabajos. Verificar conservación al terminar y después de reiniciar el proceso. Las metas de latencia y error son criterios del ensayo que deben fijarse antes de medir; no resultados ya obtenidos.

El aumento hacia 500 se autoriza cuando la mezcla prevista pasa de forma sostenida, con margen y sin crecimiento del backlog. El salto a 3.000 necesita probar la arquitectura regional siguiente. No se extrapola multiplicando una medición de 100 ni se promete una escala de millones.

### Primera medición local: 100 clientes sintéticos

El informe `work/scalability-load-baseline.json` usa la fuente congelada `ae6a8054`, HTTP y SQLite en un proceso Node de Windows. La ventana mixta solicitada fue de 60 segundos; por cola y trabajo pendiente, su tramo observado duró 70,50 segundos. Es un circuito cerrado: cada actor espera su respuesta, de modo que la lentitud reduce la tasa de solicitudes alcanzada.

| Medida local | Resultado |
| --- | --- |
| Ráfaga de consultas | 100 respuestas 200; 22,60 s para completar la ráfaga |
| p95 de esa consulta, visto por el cliente | 20,23 s |
| Confirmaciones HTTP del tramo mixto | 3 respuestas 200 y 157 respuestas 409, de 160; 98,1 % con conflicto |
| CAS del almacenamiento en ese tramo | 3 confirmados y 19 conflictos, de 22 intentos |
| CPU del proceso compartido en el tramo mixto | 70,92 s; SQL local acumulado aproximadamente 249,6 ms |
| Estado final | 699.414 bytes; no se alcanzó el techo de 2 MB |
| Integridad del escenario | 8 comprobaciones aprobadas |

Los 157 errores HTTP 409 no equivalen a 157 colisiones de SQLite: la API también puede rechazar una cotización obsoleta o una validación antes de intentar el CAS. La revisión del mundo compartida exige medir este efecto entre jugadores independientes.

La CPU contabiliza juntos generador, cliente, servidor, motor, JSON y GC. La diferencia con SQL indica trabajo dominante fuera de SQLite; no atribuye todo ese tiempo al motor sin un perfil separado. El p95 incluye cola, transporte y procesamiento local del cliente. No mide latencia de D1 alojado ni rendimiento de Cloudflare Workers. Tampoco hubo finalizaciones observadas en la ventana mixta para estimar su demora; las carreras de conservación se probaron por separado con reloj adelantado. Esta medición no aprueba la capacidad objetivo de 100 y no permite prometer 500.

El generador admite respuestas de hasta 30 segundos. La interfaz actual cancela las consultas GET a los 8 segundos y las mutaciones a los 12 segundos (`app/mvp-client.tsx` y `app/game-availability.tsx`). Una respuesta 200 que llegue a los 20 segundos en este ensayo no demuestra una experiencia válida para ese cliente. La siguiente medición debe evaluar también esos límites de la aplicación, conservando la distinción entre tiempos locales y tiempos alojados.

La comparación final del adaptador `VALUES` mantuvo el mismo motor congelado, configuración y tamaño inicial del estado: el p95 de la ráfaga pasó de 20,23 a 21,44 segundos; las confirmaciones HTTP 409 fueron 157/160 y 150/152, respectivamente, y la tasa alcanzada pasó de 6,64 a 6,63 solicitudes/s. Ambas corridas aprobaron sus ocho comprobaciones de integridad. **No se demostró una mejora de capacidad ni de latencia**: hay una corrida por formato, el circuito cerrado produjo secuencias efectivas distintas y cambió parte de la instrumentación. El nuevo formato resuelve el techo por fila probado aparte, pero conserva la revisión global y la reconstrucción del mundo. El resumen final de verificación (artefacto privado excluido) registra 14 comprobaciones aprobadas, la suite completa de 717 casos y la pasada SQL de 698; deja explícitamente `betaCapacityCertified: false`, sin cambio del backend activo ni migración de partidas. DO regionales y WebSockets siguen como diseño pendiente. El detalle comparativo se conserva en `work/scalability-load-comparison.json`.

### Comandos reproducibles

Ejecutar desde la raíz del proyecto, con el Node y dependencias fijados en `package-lock.json`. Las mediciones se hacen una por vez, sin compilar ni ejecutar la suite en paralelo. El snapshot de código y su metadata deben existir en `../qa-baselines/scalability-source` y `work/scalability-baseline.json`.

```powershell
npm test
node scripts/test-partitioned-store.mjs
node scripts/test-partitioned-store.mjs --file tests/mvp-engine.test.ts
node --experimental-strip-types scripts/load-test.mjs --users 100 --seconds 60 --out work/scalability-load-baseline.json
node --experimental-strip-types scripts/load-test.mjs --users 100 --seconds 60 --adapter scripts/load-test-partitioned.mjs --out work/scalability-load-partitioned.json
node --experimental-strip-types scripts/rehearse-partitioned-store.mjs --input-sql work/before-production-operator-deploy.sql --out work/scalability-preservation-rehearsal.json
```

`npm test` incluye los casos nuevos añadidos al adaptador; el runner SQL selecciona explícitamente los 83 archivos de la suite congelada de 698 casos y compara sus hashes antes de arrancar. Sus informes bajo `work/scalability-review-sql-run-*` separan casos con llamadas SQL, controles puros, imports de fixtures y escrituras del motor. El ensayo del respaldo usa únicamente SQLite en memoria y requiere un archivo local previamente verificado. Los comandos anteriores no seleccionan un backend de producción ni ejecutan una migración remota.

## Fase 2: autoridad por entidad y región

Separar la autoridad del inventario y de las órdenes de cada aldea de la presencia visual, la crónica y el mercado. Una entidad tiene un único propietario de escritura y una versión de ubicación; cambiar de región requiere una transferencia explícita y una cerca de versión que impida escribir al propietario anterior.

Un Durable Object regional puede coordinar rutas y actividad local; un mercado regional puede coordinar su libro de órdenes. Esto necesita nuevos comandos acotados: el motor actual que recibe y devuelve el mundo entero no se convierte en regional solo por colocarlo dentro de un DO. La fase 1 no crea estos objetos.

El almacenamiento de un DO es transaccional y privado de esa instancia. No se presupone una transacción ACID común a varios DO ni un `Promise.all()` que confirme dos inventarios como si fueran una sola base. [Almacenamiento SQLite de Durable Objects](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/).

La crónica y el mapa general consumen proyecciones públicas con número de secuencia. Una proyección puede actualizarse después del recibo económico; no decide si existen recursos o si una venta se pagó. Una orden confirmada no espera a que todas las conexiones reciban su animación.

## Comercio entre regiones: reservas y decisión durable

Este protocolo es una propuesta para la fase regional; el adaptador de la fase 1 conserva la transacción global existente.

Cada operación usa un `operationId` estable, vinculado al propietario autenticado y al identificador de solicitud. Sus participantes, lotes, cantidades, precio, comisiones, caducidades y versión de reglas forman un digest inmutable. El mismo identificador con otro digest se rechaza. Un timeout de red no genera una operación nueva.

| Etapa | Efecto persistente | Recuperación |
| --- | --- | --- |
| Crear intención | El coordinador guarda participantes, digest y estado pendiente. | Reintentar consulta el mismo registro. |
| Preparar | Cada autoridad reserva sus lotes o fondos y guarda el recibo de preparación, en una transacción local. | Una repetición devuelve la misma reserva; no descuenta otra vez. |
| Decidir | El coordinador persiste `COMMIT` solo si todas las reservas siguen válidas; en otro caso persiste `ABORT`. | La decisión es única e irreversible. |
| Liquidar débitos | Con `COMMIT`, cada participante mueve los activos reservados a la operación y registra su efecto único. | El coordinador reenvía hasta tener todos los acuses. |
| Liquidar créditos | Tras los débitos confirmados, los destinos reciben lotes o fondos con efectos únicos. | Los mensajes duplicados no crean otra entrega. |
| Cerrar | Se conserva el resultado y se publica la notificación mediante outbox. | La interfaz puede consultar el resultado sin repetir la venta. |

Los efectos locales y su marca de idempotencia se guardan en la misma transacción. El transporte de mensajes puede repetir entregas: la garantía buscada es **un solo efecto económico**, no un mensaje entregado exactamente una vez. Durante la liquidación hay activos en escrow y estados pendientes visibles; no se promete visibilidad atómica entre dos regiones.

Una reserva preparada no se libera unilateralmente porque expire un temporizador si podría existir un `COMMIT`. El vencimiento solicita una decisión al coordinador con versión de reserva y fencing. Si el coordinador no puede consultarse, se conserva la reserva y se muestra pendiente. Antes de decidir se puede abortar y liberar de forma idempotente. Después de `COMMIT` se completa la operación; una compensación comercial es otra operación registrada, no la eliminación de sus recibos.

Al reiniciar, coordinador y participantes reconstruyen las operaciones pendientes desde almacenamiento, reenvían mensajes y consultan decisiones. Las notificaciones salen de un outbox durable después del efecto. Los recibos o sus tombstones compactos sobreviven a todo el horizonte de reintentos y recuperación admitido; borrarlos prematuramente puede permitir un segundo cobro. La ruta del `operationId` al coordinador también debe permanecer estable durante un cambio de shards.

Se conserva el origen de los lotes, su vínculo, calidad y fecha de caducidad. Una transferencia no renueva comida ni convierte material de tutorial en transferible. La caducidad durante una operación se resuelve con una regla acordada en su intención; nunca se fabrica un lote sustituto para ocultarla.

Pruebas obligatorias: caída en cada transición; respuesta perdida tras cada commit; mensajes duplicados o desordenados; dos compradores del mismo lote; reserva que vence durante el prepare; coordinador inaccesible; reinicio de ambos participantes; partida movida de región; recuperación desde un respaldo compatible. La suma de fondos y recursos, incluyendo el escrow, debe seguir cuadrando.

## Una ciudad concurrida no puede ser un único cuello de botella

Dividir únicamente por continente no resuelve que cientos de jugadores usen la misma ciudad. Separar presencia por celdas e interés visual; inventarios por su autoridad; y libros de mercado por producto o grupo estable. El resumen de la ciudad es una proyección. Un libro del mismo producto que conserva prioridad de precio y tiempo mantiene un único orden de matching: repartirlo en varios libros independientes cambia sus reglas y requiere otro diseño.

El matching de un producto muy activo necesita trabajo acotado, admisión y límites de órdenes, y mediciones propias. No se toma el límite orientativo de peticiones de un DO como capacidad garantizada del juego. Cloudflare explica que su rendimiento varía con el trabajo y la serialización que hace cada objeto. [Límites de Durable Objects](https://developers.cloudflare.com/durable-objects/platform/limits/).

La simulación económica del servidor programa plazos de trabajos; no anima cada NPC ni transmite cada paso. Los clientes interpolan recorridos autorizados. El mapa envía snapshots y cambios de las celdas visibles, con resuscripción y recuperación por secuencia, sin descargar todos los inventarios del mundo.

## WebSockets e hibernación, solo cuando se cumplan sus condiciones

Una conexión futura usaría la API de hibernación en el lado servidor del DO, con adjuntos pequeños para reconstruir la suscripción y almacenamiento durable para el estado económico. Las conexiones pueden permanecer abiertas cuando el objeto duerme; los mensajes y eventos vuelven a despertarlo. Los temporizadores periódicos, alarmas o tráfico continuo impiden que una zona activa se comporte como una zona en reposo. Una conexión saliente no obtiene la misma hibernación. [WebSockets de Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/websockets/).

No se envían ticks o heartbeats de aplicación constantes a una región sin cambios. Se programa el próximo plazo económico necesario, con trabajo acotado al despertar. La hibernación no vuelve gratuitas las consultas, el almacenamiento ni la actividad real. Las conexiones se autentican, autorizan y limitan por tamaño y frecuencia; las suscripciones solo reciben campos públicos o propios.

## Puertas de salida

La entrega local concluye con la suite original y la pasada SQL, pruebas específicas del adaptador, hashes del respaldo y del código, y un informe de cobertura que distinga controles puros de operaciones SQL. La base de pruebas actual conserva sus partidas y su formato hasta una conversión revisable.

La fase regional requiere antes un protocolo de transferencia ejecutable con fallos inyectados, métricas de la carga de 100 y un ensayo de la ciudad más concurrida. Los objetivos de 500 y 3.000 permanecen como objetivos hasta contar con esa evidencia.
