# Proyecciones y vencimientos: controles de QA

La fase parte de `work/projection-expiry-before-freeze.json`: 426 fuentes y 50 artefactos —47 informes crudos y tres copias históricas de herramientas— se copiaron a una carpeta nueva con hashes verificados y archivos de solo lectura. Incluye 121 archivos de biblioteca, los 51 gráficos, los 83 originales y su fixture, el resultado anterior de 100 jugadores, sus comparaciones y los informes históricos. Ningún informe anterior se sobrescribe.

## Observación por petición

Las proyecciones externas se cuentan mediante los métodos del adaptador real y el contexto asíncrono de cada petición. Se registran la distribución, el máximo y las peticiones con más de una llamada a `projectPlayerView` o `projectVillageView`. Son llamadas de proyección del almacén; no se presentan como un contador de todas las funciones visuales internas. Las observaciones ausentes son `null`, no cero.

Cada resultado `null` de `readVillage` debe tener un motivo de fallback explícito o quedar identificado como no instrumentado. El callback opcional comunica únicamente una categoría: no incluye perfiles, inventarios, tokens ni cuerpos, y no ejecuta consultas. La suma de motivos se compara con el número real de fallbacks. No se altera la ruta del motor ni se produce una lectura global para medirla.

## Controles de vencimientos y caché

- Un vencimiento ajeno cubierto se liquida sin exigir una lectura completa del mundo; los recursos, reembolsos, recibos y permisos afectados conservan sus pruebas.
- Si el cierre de participantes no está auditado, se mantiene el fallback explícito y su motivo. Los casos heredados no se fuerzan a aparentar una lectura cubierta.
- El lote de lectura mantiene su instantánea atómica. Un cambio entre lectura y confirmación no autoriza versiones antiguas ni omite participantes entrantes.
- Repetir una petición o una liquidación no duplica artículos, pagos, experiencia o reservas.
- La reutilización de proyecciones debe tener el mismo resultado y vencimiento que una construcción fría. Los cambios propios o de una dependencia real invalidan la versión anterior; un vecino ajeno no obliga a reconstruir datos privados.
- Se mantienen los presupuestos de consultas y bindings, el rechazo de autoridad tras un error y los sellos de cobertura, incluidas las participaciones del registro contable.

## Carga y preservación

El escenario final conserva 100 jugadores, 60 segundos, semilla `scalability-ae6a8054-v1`, reloj, cadencias, revisión de 750 ms, timeout de 30 segundos y presupuestos anteriores. No se cambia la carga para mejorar el resultado. Se comparan confirmaciones, rechazos, timeouts, CPU, datos SQL, fallback y proyecciones por petición; una respuesta que el cliente no recibió sigue siendo un fallo de transporte aunque el servidor termine después.

Se ejecutan los 698 casos con el contrato declarado de 696 aserciones originales y dos adaptaciones verificadas de referencias, más controles nuevos específicos. Se repite el ensayo local de respaldo y la comparación de fuentes gráficas y del backend activo. No se realizan migraciones ni escrituras remotas. Las pruebas locales no certifican por sí solas capacidad, coste o compatibilidad del entorno alojado.

## Evidencia previa a la corrección de la crónica

- `work/scalability-review-sql-run-1792278426791/summary.json`: 698/698 aprobadas, ninguna omitida, 696 casos sin adaptar y dos comparaciones de identidad revisadas. Los 129 hashes de ejecución permanecieron estables y los 83 archivos originales siguen intactos. El intento anterior terminado a las 23:06 UTC se conserva como intermedio: sus aserciones aprobaron, pero su hash cambió por el ajuste de tipo de TypeScript durante la ejecución.
- El corpus SQL heredado hizo 3.488 lecturas de aldea, de las cuales 18 estuvieron cubiertas y 14 confirmaron cambios. Sus 3.470 fallbacks tienen motivo: 3.178 de administrador, 276 de comando no cubierto, 14 de propietario, uno de batalla y uno de índice. Las 3.470 consultas de mantenimiento de ese corpus también rechazaron el cierre; sus cero commits no prueban el nuevo camino de mantenimiento. Los controles específicos y el runtime real cubren ese camino.
- `work/projection-expiry-sql-footprint-proof-r2-20261017.json`: las cuatro pruebas completas de lectura, cotización, validación, confirmación e invalidación aprobaron sobre la fuente de esa etapa, con el método de lectura global prohibido en el camino cubierto. El contenido privado ajeno de 2,2 MB no alteró los datos SQL devueltos; las limitaciones sobre filas visitadas y facturación siguen indicadas en el informe.
- `work/projection-expiry-runtime-verification-20261017-r2.json`: el runtime local workerd aprobó el ciclo de mantenimiento y la proyección en caché, sin lecturas globales en el camino cubierto. Su compatibilidad local no certifica la fecha de compatibilidad ni las cuotas del despliegue remoto.
- `work/projection-expiry-preservation-rehearsal-1792278275708.json` y `work/projection-expiry-source-preservation-1792278276247.json`: restauración y reversión locales exactas del respaldo histórico, 51 fuentes gráficas y 83 pruebas originales conservadas, backend activo sin cambios. Se verificaron las 476 copias congeladas; los 47 informes crudos actuales siguen intactos y las tres herramientas históricas se conservan en la copia congelada, aunque su versión actual evoluciona.

La comprobación corta de 10 jugadores y cinco segundos quedó en `work/scalability-load-projection-expiry-smoke-1792278615987.json`. Comprueba integración, no capacidad. El posterior informe `work/scalability-load-projection-expiry-1792278633741.json` se conserva como medición intermedia: conservó los bienes probados, pero tuvo 226 fallbacks de índice no disponible durante la ventana mixta. No se presenta como aprobación del nuevo índice ni se sobrescribe.

## Corrección de la cobertura al alcanzar 150 eventos

La reproducción `work/projection-expiry-index-repro-25-before-20261017.json` aisló la causa con 25 aldeas y 149 eventos históricos. Después de 25 prospecciones, la segunda liquidación concurrente dejó un evento huérfano en el índice: revisión 27 y sellos coincidentes, 366 registros autoritativos y 367 indexados. A partir de ahí el adaptador rechazó la lectura acotada. La corrección conserva el mismo permiso transaccional y limpia las entradas huérfanas cuando la escritura puede podar la crónica, aunque su instantánea inicial todavía no hubiera retirado un evento.

`work/projection-expiry-index-repro-25-final-1792279548746.json` aprobó la misma secuencia corregida con el arnés definitivo: prospección, viaje y cultivo con cotizaciones, validaciones, confirmaciones y liquidaciones públicas reales. Sus 126 intentos transaccionales alcanzaron 102 revisiones confirmadas; 24 cultivos contendientes rechazaron la reserva regional con 409. Las 324 lecturas por aldea quedaron cubiertas. Los sellos, conteos, participantes, hashes y límite de 150 eventos fueron coherentes en cada revisión observada; no hubo fallback ni lote con índice roto.

Los tres controles de reproducción y diagnóstico aprobaron con fuentes estables en `work/projection-expiry-index-qa-focal-1792279548746-status.json`: dos archivos, con argumentos y hashes explícitos. Los tipos finales aprobaron en `work/projection-expiry-index-qa-typecheck-1792279519610-status.json` y el lint en `work/projection-expiry-index-qa-lint-1792279520522-status.json`. Ambos procesos terminaron con código cero y sin cambios de fuentes durante su ejecución.

El control general final aprobó 869/869 en `work/projection-expiry-control-1792279300780-status.json`, ejecutado sin otros procesos pesados. El intento anterior que terminó sin pie de resultados se conserva como incompleto y no se cuenta como aprobación. La comprobación SQL R3 aprobó 698/698, ninguna omitida, con el contrato declarado de 696 casos sin adaptar y dos comparaciones de referencias revisadas: `work/scalability-review-sql-run-1792279069654/summary.json`. Sus 129 hashes permanecieron estables y los 83 archivos originales siguen intactos. Los controles focales que repiten casos del control general no se suman como casos únicos adicionales.

La prueba de cuatro llamadas completas se repitió en `work/projection-expiry-sql-footprint-proof-r3-20261017.json`; la restauración exacta quedó en `work/projection-expiry-preservation-rehearsal-1792279147085.json`, la comparación de fuentes en `work/projection-expiry-source-preservation-1792279143391.json` y el runtime real local en `work/projection-expiry-runtime-verification-20261017-r3.json`.

El formato 6 añade `storageShape.indexHealth`, observado únicamente cuando terminaron todas las fases y sus manejadores HTTP. Devuelve cardinalidades, revisiones y comparaciones de sellos y hashes, sin identidades, tokens ni cuerpos. No repara el índice ni modifica el tráfico. `indexIntegrity` es una comprobación independiente de la conservación económica; un índice no disponible hace fallar `benchmarkPassed`, aunque se hayan conservado todos los bienes. Los informes antiguos carecen de esta observación y no reciben un resultado inventado. La nueva medición de 100 jugadores y sus limitaciones deben consultarse en el resumen final del coordinador.

## Conciliación posterior a la ventana medida

El motor conserva su límite de ocho participantes liquidados por petición. El verificador posterior a la ventana puede volver a leer únicamente ante el mensaje 503 exacto de ese presupuesto, cuando una nueva instantánea autoritativa demuestra una reducción estricta del conjunto de reservas compartidas vencidas. Conserva el mismo instante fijado, registra cada respuesta original y comparte con los sondeos normales el límite total de `2 × jugadores + 10` lecturas HTTP. Un timeout, otro 503 o la ausencia de progreso falla sin reintento. No cambia el tráfico ni los estados de la ventana mixta.

Los tres casos de `tests/mvp-load-settlement-verification.test.ts` aprobaron en `work/projection-expiry-index-qa-protocol-1792279550039-status.json`. El caso SQL real confirmó ocho extracciones, conservó la primera respuesta 503 y terminó la novena con una segunda petición 200 al mismo instante, sin lectura global del motor. Los otros casos comprueban la ausencia de reintentos indebidos y el presupuesto total. Este archivo se ejecutó después del control general; sus tres casos se identifican por separado. El registro anterior con una lista genérica de archivos permanece como intermedio; el estado citado incluye el archivo realmente ejecutado.

La comprobación corta final de 10 jugadores y cinco segundos aprobó con formato 6 e índice saludable en `work/scalability-load-projection-expiry-smoke-1792279698649.json`. Demuestra integración; las métricas de 100 jugadores proceden de su medición independiente descrita debajo.

## Cierre de la carga final de 100 jugadores

El informe crudo final (artefacto privado excluido) cerró con `benchmarkPassed:true`, conservación económica e índice saludable en formato 6. Tras terminar todas las peticiones, las revisiones del guardado, los metadatos y el índice coincidían en 563; los 1.031 registros autoritativos e indexados coincidían, sin filas huérfanas, registros faltantes ni diferencias entre hashes del índice y los registros. El resumen final (artefacto privado excluido) reúne los hashes, controles, limitaciones y la decisión de despliegue.

La ventana mixta realizó 625 peticiones sin timeouts: 252 lecturas respondieron 200; las cotizaciones produjeron 157 respuestas 200 y 59 rechazos 409; las confirmaciones produjeron 123 respuestas 200 y 34 rechazos 409. Sus siete lecturas completas corresponden exclusivamente al administrador —cinco lecturas de vista y dos cotizaciones—, sin fallback por índice no disponible. Se observaron 284 proyecciones del almacén, 279 de aldea y cinco completas, sin repetición por petición. Esto no mide todas las funciones visuales internas.

La comparación R3 con la fase de lecturas acotadas (artefacto privado excluido) conserva exactamente la configuración del escenario:

| Medida local | Fase anterior | Candidato final |
| --- | ---: | ---: |
| Ráfaga: p95 de lecturas exitosas recibido por el cliente | 22,4664 s | 4,3198 s |
| CPU de todo el proceso en la ventana mixta | 97,328 s | 78,156 s |
| Tiempo SQL acumulado del shim | 4,5883 s | 10,0226 s |
| Máximo RSS muestreado | 1.620.480.000 bytes | 868.548.608 bytes |

El p95 de la ventana mixta recibido por el cliente fue de 13,1184 segundos para lecturas exitosas y 23,9524 segundos para confirmaciones exitosas. El tiempo SQL acumulado aumentó; la reducción de CPU y memoria no se presenta como una mejora de todas las métricas. Los tiempos todavía superan las referencias de la interfaz real de ocho segundos para lectura y doce para mutaciones. Un generador con timeout de treinta segundos y sin fallos de transporte no certifica fluidez del cliente. Cada escenario tiene una sola ejecución de bucle cerrado; no establece capacidad máxima ni causalidad aislada del motor o del almacenamiento.

La carga de 100 jugadores no confirmó ningún mantenimiento ajeno, ni en la ventana mixta ni en las comprobaciones posteriores. Esa rama se demuestra mediante los controles SQL no administrativos y workerd, incluido el caso de nueve participantes; no se le atribuyen los ahorros medidos en la carga. También están disponibles las comparaciones R3 con la fase de escrituras por aldea (artefacto privado excluido) y con la referencia original (artefacto privado excluido). Las mediciones intermedias anteriores permanecen intactas.

El lint general final aprobó con cero errores y tres advertencias previas en `work/projection-expiry-lint-1792279918699-status.json`. El candidato continúa sin desplegar y no modifica la fábrica activa `getMvpStore`, las partidas remotas ni las fuentes gráficas.

## Bloqueo previo de convoyes públicos ajenos

El resumen identifica un problema anterior a esta optimización dentro del candidato: la lectura acotada selecciona los convoyes propios, mientras la vista completa también incluye los convoyes expuestos de otros jugadores. La proyección pública no repone esos convoyes ajenos y abrir su sección no envía una indicación que fuerce la lectura completa. Los comandos `convoy.start` y `battle.raid` sí conservan su fallback completo explícito. Hace falta auditar una proyección pública mínima o un fallback de lectura coherente antes de activar el candidato.

Este bloqueo y las latencias pendientes mantienen `deploymentApproved:false`; las invariantes económicas y del índice aprobadas no equivalen a aprobación del despliegue. El backend activo conserva su fábrica y no está afectado por esta omisión del candidato. No se realizaron conexiones, migraciones ni cambios remotos, ni se certificaron red, D1 alojado, ciudades maduras, GPU o móviles.
