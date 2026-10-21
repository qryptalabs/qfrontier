# Proyecciones reutilizables y vencimientos compartidos

Candidato local del 17 de octubre de 2026, posterior a [lecturas por aldea](BOUNDED-VILLAGE-READS.md). El dominio de pruebas conserva su backend y las partidas actuales. No se han realizado consultas, escrituras, migraciones ni despliegues remotos.

## Cambio de lectura

La crónica deja de formar parte de la caché privada de una cuenta. La versión `lectura:social` conserva las dependencias sociales y económicas compartidas; `lectura:compartida` sigue existiendo para las demás garantías. Una noticia nueva se adjunta desde los registros públicos confirmados en la misma instantánea SQL que la vista y el directorio. Sus partes, hash, identidad, ordinales y cantidad se verifican antes de servirla. No se elimina la validación de versiones por una mejora de rendimiento.

El lector comprueba en SQL si la caché privada es utilizable antes de devolver las filas de todo el directorio público. Si la caché está invalidada, no se cargan ni se verifican cien avatares para después descartarlos y volver a leerlos durante la proyección. Las dependencias de la vista usan el manifiesto específico del proyector, en lugar de todas las versiones disponibles para ejecutar órdenes.

El cálculo de rutas, habitantes y representación de la aldea seleccionada se realiza una vez y se reutiliza en las distintas secciones de la respuesta. Cada sección mantiene sus propios objetos mutables. No se cambian los modelos, texturas, iluminación, animaciones ni calidad de renderizado.

Un trabajo privado vencido del segundo perfil permanece pendiente hasta consultar ese perfil. Después del primer refresco de la vista seleccionada, ese trabajo no mantiene su caché permanentemente caducada. Las reservas compartidas de ese mismo perfil sí requieren la conciliación descrita debajo.

## Liquidación de participantes

Una reserva compartida vencida ya no implica reconstruir automáticamente todo el mundo. El servidor identifica al participante real y carga el contexto completo de su cuenta, sus trabajos y los recursos necesarios. Utiliza el mismo orden de liquidación que una consulta ordinaria de ese participante y confirma el delta con sus versiones, inventarios, cuotas, carteras y procedencia.

Los permisos de mantenimiento son distintos de los de un jugador. No aceptan comandos ni recibos de acciones, no permiten proyectar la partida del vecino y se consumen al confirmar o fallar. Después, el servidor vuelve a leer la aldea del solicitante. La extracción entrega su producción real y consume las reservas correspondientes; no se libera capacidad simplemente borrando o restando una reserva.

El alcance revisado comprende extracción, vencimiento del encargo del distrito y comercio NPC. Administradores, clanes, batallas y operaciones multilaterales sin cierre auditado conservan su vía completa explícita. Esas exclusiones se aplican antes de emitir un permiso de mantenimiento.

Si otro lector ya liquidó la reserva, se devuelve una señal de reintento sin estado privado ni autoridad de escritura. La consulta normal se repite en lugar de caer al lector global. Cada petición permite hasta ocho participantes confirmados y un máximo de dieciséis conflictos/reintentos; superar el presupuesto devuelve un error temporal, sin pasar silenciosamente a una operación mundial. El mantenimiento ya confirmado se conserva y el siguiente intento continúa desde allí.

La caché despierta también al terminar las colas visuales de regreso o descarga de las carretas. Ese límite refresca la disponibilidad del comercio sin crear una nueva reserva económica ni volver a pagar al transportista.

## Verificación y alcance

La primera repetición de 100, `work/scalability-load-projection-expiry-1792278633741.json`, conservó la economía pero reveló un fallo adicional: 226 rechazos por índice no disponible, 232 lecturas completas y 44 timeouts de 631 solicitudes. La ráfaga inicial sí bajó de 22,47 a 4,36 segundos de p95. Este informe y sus comparaciones se conservan como medición intermedia; no se reutilizan como aprobación del candidato corregido.

La causa fue la poda concurrente de la crónica. Dos escritores podían leer 149 noticias y añadir una cada uno. El segundo commit eliminaba en SQL la noticia que excedía el límite de 150, aunque su instantánea local no tuviera ninguna eliminación. La limpieza del índice dependía de esa eliminación local y dejaba una fila huérfana. Los conteos detectaban la discrepancia y forzaban el fallback de forma segura. La limpieza ahora se ejecuta también al cambiar eventos, dentro de la misma transacción y antes de publicar el sello. No se relajan los conteos ni se reparan silenciosamente intervalos de escritores antiguos.

El ensayo `work/projection-expiry-index-repro-25-before-20261017.json` reprodujo el fallo con 25 aldeas. El ensayo corregido `work/projection-expiry-index-repro-25-after-r3-20261017.json` mantuvo sanos los sellos, filas, participantes y hashes durante todos los ciclos. La verificación workerd R3 confirmó el caso de 149 noticias y dos confirmaciones concurrentes, conservando 150 registros de crónica y la lectura acotada posterior. La carga definitiva añade un diagnóstico de salud del índice después de cerrar todas las peticiones; esas consultas de diagnóstico quedan fuera de la ventana de rendimiento.

La referencia anterior está congelada en `work/projection-expiry-before-freeze.json`: 426 fuentes y 50 artefactos históricos. Los 51 archivos gráficos, los 83 archivos originales de regresión, el respaldo histórico disponible y las mediciones previas se verifican por hash. El respaldo se ensaya únicamente en SQLite temporal y no se presenta como una copia reciente de la base remota.

Los controles nuevos comprueban reutilización de caché con noticias frescas, invalidación por cambios económicos, fragmentos corruptos, perfiles alternos, extracción finita, devoluciones y pagos únicos, cuota por cuenta, cotizaciones obsoletas, permisos internos, conflictos, admisión y el presupuesto de ocho participantes. El control general terminó con 869/869 aprobadas, sin omisiones. La comprobación SQL terminó con 698/698 bajo el contrato declarado: 696 casos sin adaptar y dos comparaciones de identidad revisadas; los 83 archivos originales permanecen intactos. Los tres casos del verificador posterior a la ventana se ejecutaron aparte. Tipos, lint y compilación aprobaron; el lint mantiene tres advertencias previas.

## Resultado final de 100 jugadores

La fuente corregida completó la carga en `work/scalability-load-projection-expiry-1792279719111.json` y la comprobación corta de 10 cuentas en `work/scalability-load-projection-expiry-smoke-1792279698649.json`. El resumen verificable (artefacto privado excluido) enlaza los resultados originales y sus hashes, las pruebas, el ensayo del respaldo y las tres comparaciones nuevas. Los informes intermedios permanecen intactos.

Comparación con la fase anterior de lecturas acotadas, `work/scalability-load-bounded-1792269603463.json`:

| Medida local | Fase anterior | Candidato final |
| --- | ---: | ---: |
| Ráfaga inicial: 100 lecturas correctas, p95 cliente | 22,47 s | 4,32 s |
| Solicitudes mixtas y timeouts del generador | 650 / 34 | 625 / 0 |
| Lecturas completas durante la fase mixta | 176 | 7, todas de administrador |
| Proyecciones de almacén durante la fase mixta | 335 | 284 |
| Peticiones con más de una proyección de almacén | No observado | 0 de 625 |
| Lecturas correctas durante actividad, p95 cliente | 25,70 s | 13,12 s |
| Acciones correctas durante actividad, p95 cliente | 27,05 s | 23,95 s |
| Acciones recibidas como 200 por el cliente | 117 | 123 |
| Acciones terminadas como 200 por el servidor | 146 | 123 |
| Acciones rechazadas con 409 | 36 | 34 |
| Tiempo SQL ejecutado en SQLite | 4,59 s | 10,02 s |
| CPU del proceso, generador y servidor juntos | 97,33 s | 78,16 s |
| Pico RSS muestreado del proceso | 1.620.480.000 B | 868.548.608 B |

La ventana programada fue de 60 segundos; con el drenaje final ocupó 76,13 segundos frente a 96,18 en la referencia. El escenario es de circuito cerrado: la latencia determina cuándo cada actor puede emitir su siguiente petición, por lo que 625 y 650 no son una reproducción de solicitudes idénticas. El escenario, semilla, reloj, cadencias y timeout sí son iguales. La reducción de lecturas completas no significa que el índice o el directorio se hayan vuelto de coste constante. El tiempo SQL aumentó y debe investigarse; la mejora de CPU o del tráfico devuelto no elimina ese coste.

En las 625 peticiones mixtas hubo 252 lecturas correctas, 157 cotizaciones correctas, 59 cotizaciones rechazadas, 123 acciones correctas y 34 acciones rechazadas. Las cotizaciones no ejecutan proyecciones. Las lecturas y acciones ejecutaron como máximo una proyección de almacén por petición, sin confundir ese contador con todas las funciones internas del motor. Las siete lecturas globales corresponden al administrador; las acciones cubiertas no realizaron ninguna. No aparecieron rechazos por índice no disponible.

La comprobación final independiente del índice, posterior al drenaje, conservó la revisión 563, 1.031 registros tanto en la autoridad como en el índice y 100 jugadores. Sellos, partes, participantes y hashes coincidieron; hubo cero registros huérfanos, faltantes o con hash distinto. Aprobaron las ocho invariantes económicas, los tres controles de identificadores y las cinco carreras de confirmación, reintento y conservación. Ningún manejador quedó abierto al terminar.

La carga original de 100 principiantes no confirmó ningún mantenimiento compartido ajeno, ni en la ventana mixta ni en sus carreras posteriores. Esa rama está probada mediante los controles SQL específicos y workerd, incluida la novena reserva tras el presupuesto de ocho; no se atribuye una mejora medida de la carga a una rama que no ejerció. La conciliación posterior conservó todos los estados HTTP originales, sin reintentar timeouts y sin alterar el minuto de actividad.

## Decisión y bloqueos antes de activar

El candidato queda local y desactivado. Las lecturas y acciones durante actividad siguen superando los límites de referencia de la interfaz, de 8 y 12 segundos. Cero timeouts con un generador de 30 segundos no equivale a una experiencia fluida con el cliente real. Hace falta reducir la proyección fría y las consultas/metadatos compartidos, verificar el aumento de tiempo SQL y medir con ciudades maduras y concentraciones regionales.

La revisión final identificó además una limitación previa de la lectura acotada: `village-read-index.ts` selecciona convoyes propios, mientras `buildMvpView` pretende mostrar propios y ajenos expuestos. `applyPublic` no repone estos últimos y abrir Convoyes no fuerza un fallback por sección. Sus comandos `convoy.start` y `battle.raid` sí conservan la vía completa. No se perdieron bienes y el backend activo no usa ese lector, pero hay que completar una proyección pública mínima coherente o un fallback explícito antes de migrar. Esta fase no se presenta como una validación completa de visibilidad de convoyes.

La prueba mantiene 100 jugadores, 60 segundos, la semilla y el calendario de referencia y el timeout de 30 segundos del generador. El cliente real conserva sus límites de 8 segundos para lectura y 12 para mutaciones. Se muestran por separado éxitos, rechazos, timeouts y trabajo que terminó después de perder su respuesta. Las filas devueltas por el shim SQLite no son filas facturadas por D1, y un lote de 40 sentencias no certifica el presupuesto completo de una invocación.

El directorio público, ciertos historiales, recursos y metadatos compartidos todavía crecen con el mundo. Esta fase no certifica capacidad de producción, ciudades maduras, concentraciones regionales, red, GPU ni móviles. El runtime local instalado tampoco sustituye la calificación del runtime de octubre configurado para el despliegue.
