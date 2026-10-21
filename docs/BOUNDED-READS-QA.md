# Lecturas cubiertas por aldea: aceptación de QA

El control previo inmutable está identificado en `work/bounded-reads-before-freeze.json`. Conserva 402 fuentes y 17 informes, incluidos los 100 jugadores de la fase anterior. Esos resultados prueban conservación en el escenario local, pero registran latencias y tiempos de espera que impiden aprobar la fluidez. No se despliega durante esta fase.

## Prueba del recorrido real

La capacidad `villageReads` por sí sola no prueba una lectura acotada. Se verifica el recorrido público del motor: vista fría, cotización, validación, confirmación, liquidación y repetición de recibo. En los recorridos soportados, `store.read()` debe fallar si se invoca. `readVillage` y `commitVillage` tampoco pueden reconstruir internamente un mundo completo.

Se compara un mundo pequeño con el mismo propietario y sus dependencias en otro mundo que incorpora perfiles y trabajos ajenos de varios megabytes, fragmentados en las mismas tablas reales. Un marcador privado ajeno permite detectar si SQL devuelve sus cuerpos. El resultado debe conservar las cantidades, el parentesco de los objetos y la idempotencia. Las identidades públicas se contabilizan por separado de las cargas privadas.

El auditor registra SQL ejecutado, filas realmente devueltas y bytes UTF-8 de sus celdas. Estas medidas no equivalen a filas visitadas por SQLite ni a filas facturadas por D1. Se examinan además los planes `EXPLAIN QUERY PLAN` de las consultas reales: la carga privada debe buscar claves concretas y la pertenencia debe usar un índice por propietario o perfil. Un filtro JSON que devuelva pocas filas tras recorrer toda la tabla no cumple este objetivo.

## Autoridad y concurrencia

- Cambiar una aldea ajena sin dependencias compartidas no invalida una cotización privada.
- Cambiar la aldea propia, una cuenta compartida o un recurso realmente leído invalida la autorización antigua.
- Crear o eliminar una relación, un trabajo entrante o una oferta debe actualizar su versión de pertenencia; se cubren fantasmas y ABA.
- Una cobertura incompleta, una revisión de índice antigua, una lectura que falla o un escritor heredado no pueden producir un contexto autorizado.
- El fallback devuelve `null` de forma explícita y se contabiliza. La ruta heredada conserva sus pruebas; una operación no auditada no obtiene un contexto parcial con autoridad global.
- El commit devuelve el recibo confirmado dentro de su estado cubierto. El journal no hace una lectura global por cada confirmación.

## Carga y preservación

La repetición final conserva 100 jugadores, 60 segundos, semilla, calendario, reloj, revisión, límites y timeout de 30 segundos. Los contadores separan lectura global, lectura cubierta, fallback, proyección y las tres clases de escritura. Los resultados conservan rechazos y timeouts. La conciliación fuera de ventana se identifica y no cuenta como rendimiento de juego.

Se conservan los 83 archivos originales y sus 698 casos. Las dos comparaciones de referencias independientes mantienen el contrato revisado `village-ids-v1` explícito: 696 casos sin cambios y dos adaptaciones verificadas, sin omisiones ni cambios económicos. Además se ejecutan controles nuevos de cobertura, planes SQL, integridad y respaldo. La selección de backend activo y los archivos gráficos deben coincidir con la copia previa; no se realizan cambios remotos.

Estos controles locales no certifican la capacidad de Cloudflare, su runtime de producción, el coste, la red, la GPU del navegador ni una población de aldeas maduras.

## Evidencia preliminar, antes de la carga final

`work/bounded-sql-footprint-proof-20261017-2032.json` registra seis etapas del motor público en dos bases reales. Aumentar de 16 bytes a 2,2 MB el relleno privado del vecino y de su trabajo no cambió las filas ni los bytes devueltos: la cotización fría devolvió 780 filas y 132.664 bytes en ambos casos; la confirmación, 884 filas y 136.263 bytes. El test prohíbe `store.read()`, verifica la procedencia del tablón y confirma que el trabajo vecino sigue sin liquidarse. También registra los planes de búsqueda por clave completa y los hashes de 128 fuentes que permanecieron iguales durante la prueba.

Estas cantidades incluyen recursos, directorios e índices compartidos; no representan una selección mínima de dependencias. Las consultas de cobertura y los datos públicos aún pueden crecer con el mundo. La prueba demuestra que no se cargan los cuerpos privados grandes del vecino para filtrarlos después en JavaScript.

El ensayo `work/bounded-preservation-rehearsal-1792269052335.json` restauró exactamente cuatro perfiles, 28 trabajos y 143 recibos del respaldo histórico en una base temporal. La escritura cubierta, el rechazo de una autoridad antigua, la reversión del cambio local y el rollback preservaron el mismo JSON. El chequeo `work/bounded-source-preservation-1792269085432.json` confirmó los 51 archivos gráficos, los 83 originales y sus fuentes auxiliares, los informes anteriores y la selección del backend activo sin cambios. Ninguna de estas verificaciones se conectó a la base remota.

La prueba breve de 10 jugadores y cinco segundos en `work/scalability-load-bounded-smoke-1792268915591.json` cerró con conservación e idempotencia correctas. Su finalidad es detectar integración; no sustituye la repetición pendiente de 100 jugadores durante 60 segundos.

## Cierre de controles con el sello contable final R2

Tras añadir el manifiesto de participantes del registro contable se repitieron los controles. La evidencia final de huella está en `work/bounded-sql-footprint-proof-r2-20261017-2037.json`; el ensayo exacto del respaldo, en `work/bounded-preservation-rehearsal-1792269381926.json`; y la conservación de fuentes, gráficos y mediciones anteriores, en `work/bounded-source-preservation-1792269382577.json`. Las verificaciones de fuentes congeladas aprobaron. Los informes anteriores permanecen como mediciones intermedias y no se han reetiquetado.

El resumen `work/scalability-review-sql-run-1792269388244/summary.json` cerró con 698 casos aprobados, sin omisiones y 129 fuentes sin cambios durante el recorrido SQL. Conserva el contrato explícito de 696 casos originales y dos comparaciones de referencias revisadas. Hubo 3.488 llamadas a `readVillage`, de las cuales 3.470 devolvieron fallback: la mayoría de las pruebas históricas utilizan al creador del mundo como administrador. Las 18 lecturas cubiertas y los 14 commits cubiertos se reportan aparte; no se presenta esta batería como 698 operaciones acotadas. Las pruebas nuevas del motor y de producción autónoma utilizan propietarios no administradores y prohíben la lectura global en el recorrido soportado.

El puente contó por separado 2.514 lecturas completas que sirven únicamente para reflejar decisiones SQL ya confirmadas en las aserciones históricas de `.record`. Ese espejo posterior no existe en el adaptador de carga ni en el journal de commits del juego.

La repetición final de 100 jugadores cerró en `work/scalability-load-bounded-1792269603463.json` con conservación, identidades y cinco carreras correctas, sin manejadores pendientes. Frente a la fase anterior, los timeouts aumentaron de 14/464 a 34/650 solicitudes; el pico RSS muestreado bajó de 2.182,85 a 1.620,48 MB. La ventana mixta obtuvo 626 lecturas cubiertas y 176 fallbacks sobre 802 intentos, con 100 commits cubiertos y 83 escrituras por aldea de entrada completa. Los resultados detallados y límites están en [Lecturas autoritativas por aldea](BOUNDED-VILLAGE-READS.md). No se aprueba la fluidez ni se despliega.
