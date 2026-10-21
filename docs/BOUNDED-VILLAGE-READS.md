# Lecturas autoritativas por aldea

La fase posterior de reutilización de proyecciones y liquidación acotada de vencimientos se documenta en [Proyecciones reutilizables y vencimientos compartidos](PROJECTION-AND-SHARED-EXPIRY.md). Las cifras de este documento corresponden al candidato anterior y se conservan como referencia.

Candidato local posterior a las escrituras por aldea, preparado el 17 de octubre de 2026. El selector `getMvpStore()` y la base del dominio de pruebas permanecen sin cambios. No se ejecutan migraciones ni escrituras remotas para validar este diseño.

La selección experimental es explícita: `createPartitionedMvpStore(..., { playerReads: true, villageWrites: true, villageReads: true })`, con los cuatro esquemas de `db/` preparados en una base separada. Esta opción no se activa en el dominio existente.

## Qué cambia

La ruta acotada usa un contrato `VillageSnapshot` distinto del registro del mundo completo. Incluye todos los perfiles de la cuenta, sus trabajos e historial necesarios, inventarios, carteras, actividad, el recibo exacto solicitado y un manifiesto de cobertura. El motor selecciona explícitamente esa aldea para liquidar y ejecutar las reglas; no presenta los registros privados ausentes como aldeas o inventarios vacíos.

Los índices de pertenencia, reservas y vencimientos se publican en la misma transacción que los registros económicos. Una búsqueda por propietario o jugador identifica las claves concretas que se deben cargar, incluso cuando el JSON original está dividido en varias partes. No se filtra mediante `json_extract()` sobre un fragmento de JSON incompleto. Una marca de índices obsoleta o una operación cuyo cierre no esté auditado conserva la ruta global explícita.

La primera versión mantiene las 81 casillas económicas y las nueve regiones completas. Son recursos de tamaño fijo que usan el mapa, los viajes, la agricultura y el selector de fuentes forestales. La reducción principal consiste en excluir los inventarios, edificios privados, trabajos históricos, carteras y recibos de las otras cuentas. Los competidores de extracción y las rutas comerciales se representan mediante hechos específicos de sus recursos, sin fabricar jugadores o trabajos privados ajenos. El historial propio y ciertos datos compartidos todavía pueden crecer; este cambio no introduce archivos históricos ni paginación del mercado.

## Integridad de la operación

Cada lectura distingue sus registros originales, cobertura de conjuntos y versiones. La confirmación permite modificar únicamente registros cargados o altas nuevas verificadas. Los registros ajenos ausentes no se interpretan como eliminaciones. El recibo, los inventarios, reservas, cuentas, índices y proyecciones se confirman juntos. Después de confirmar se devuelve el contexto de la aldea con la revisión SQL efectiva; no se relee el mundo completo para construir esa respuesta.

Esa respuesta conserva la instantánea leída más su delta confirmado. Si otra aldea publicó una noticia al mismo tiempo, la respuesta local no promete una crónica global ya fusionada: SQL conserva ambas publicaciones y su tope de 150 eventos, y una lectura posterior obtiene la vista actual. Las cachés rechazan versiones incompatibles.

La semántica por cuenta mantiene los límites compartidos entre perfiles: pases ganados, ahorro diario y cuotas. Las claves completas de recursos e inventarios conservan su comparación de versiones. Los índices globales que reciben una invalidación conservan una huella explícita de cambio; no se les atribuye el hash de un agregado reconstruido a partir de un subconjunto.

El libro contable conserva los ordinales reales. Quitar una entrada ajena entre un débito y un pago no puede convertirlos en una pareja válida para ganar un premio. Los clones de cotización, guía y encargado conservan esa evidencia y el asignador de IDs por operación.

El sello del índice conserva también `participant_count`, la cardinalidad esperada de las relaciones entre entradas contables y jugadores. Se publica en la misma transacción y se comprueba tanto al leer como antes de conceder autoridad de escritura. Una relación borrada no puede convertir un historial incompleto en `ownLedger: true`, aunque la revisión y el sello principal sigan intactos. Estos `COUNT` recorren metadatos compartidos; su coste crece con el índice y no constituye una operación constante por jugador. No leen inventarios privados ni reconstruyen el índice durante una petición. Si un escritor antiguo o un daño deja el índice incompleto, se mantiene la ruta global hasta una reconstrucción completa y explícita; un delta posterior no lo declara reparado.

## Vista pública y caché

La vista privada se combina con el directorio público ya confirmado en SQL. Los vecinos se muestran con sus construcciones y animaciones publicadas; no se cargan sus partidas privadas para dibujarlos. El ordinal público de cada jugador se conserva aunque su contexto privado solo contenga uno o dos perfiles. Los datos públicos pueden representar el último estado confirmado mientras el propietario está desconectado; no se inventa una liquidación económica completada.

Las cachés privadas verifican las versiones de sus dependencias. La publicación de una caché no necesita ganar contra toda revisión global ajena, pero un cambio de cuenta o recurso pertinente impide publicarla como vigente. Los vencimientos compartidos provienen del índice correspondiente, además de los plazos propios y del clima. Las vistas administrativas globales y las operaciones sin cobertura suficiente siguen requiriendo una lectura global.

La ruta global también se conserva para miembros de clanes, batallas entrantes o históricas que necesitan trabajos de un defensor ajeno y acciones multilaterales todavía no auditadas. Los vencimientos compartidos atrasados deben liberarse de forma segura antes de reusar un contexto acotado; un segundo perfil de la misma cuenta puede ocupar uno de esos recursos. Los índices dañados, incompletos o escritos por una versión antigua provocan un retorno explícito a la ruta completa. Los contadores de la prueba distinguen esas situaciones de los casos realmente acotados.

El directorio público, los hechos de flota y ciertos datos sociales siguen siendo compartidos y crecen con el mundo. Los conteos de integridad y algunas selecciones de metadatos aún recorren ese índice. Excluir cuerpos privados ajenos no equivale a tener un coste constante por jugador ni resuelve por sí solo las concentraciones de población.

## Cómo se valida

La fuente anterior queda congelada en `work/bounded-reads-before-freeze.json`. Se conserva la corrida anterior de 100 jugadores, su resumen y sus comparaciones. Los archivos gráficos y el respaldo disponible se comparan por hash; el ensayo del respaldo se realiza en una base local de memoria y no certifica que ese respaldo antiguo contenga el progreso más reciente del dominio.

Las pruebas acotadas deben usar SQLite real y observar las filas, bytes y claves devueltas. Un inventario privado ajeno de gran tamaño contiene un marcador que no puede aparecer en la lectura, cotización o confirmación de otra cuenta. Se prohíbe llamar al lector global en los casos que deban usar la ruta acotada. Las comprobaciones de `EXPLAIN QUERY PLAN` distinguen búsquedas por claves e índices de un barrido de cuerpos del mundo. La documentación de [índices de D1](https://developers.cloudflare.com/d1/best-practices/use-indexes/) explica esa diferencia; las filas devueltas por el shim local no equivalen a las filas leídas ni al coste facturado por D1.

También se verifican equivalencia con las reglas existentes, adyacencia contable, cuotas entre perfiles, replay, cancelaciones, extracción competida, caducidades, guardias de conjuntos, respuesta perdida y rollback. Las pruebas históricas no se sustituyen por una medición de rendimiento.

## Resultados y decisión

La corrida final local es `work/scalability-load-bounded-1792269603463.json`. Se compara con `work/scalability-load-village-1792266767695.json` mediante `work/bounded-load-vs-village-final.json`; también se conserva una comparación con el motor originalmente desplegado en `work/bounded-load-vs-original.json`. Se mantuvieron 100 cuentas, 60 segundos de actividad, semilla, calendario, reloj, timeout del generador de 30 segundos y el estado inicial de 686.503 bytes. Cambió el código del motor; la comparación está identificada como `candidate-engine`, no como una sustitución de almacenamiento con motor idéntico.

| Medición local | Escrituras por aldea, fase anterior | Lecturas acotadas, esta fase |
| --- | ---: | ---: |
| Ráfaga inicial: respuestas correctas | 100/100 | 100/100 |
| Ráfaga inicial: p95 de respuesta correcta | 25,98 s | 22,47 s |
| Actividad: lecturas correctas / timeout | 178 / 9 | 252 / 5 |
| Actividad: comandos correctos / rechazo 409 / timeout | 82 / 34 / 5 | 117 / 36 / 29 |
| Actividad: timeouts totales | 14 de 464 solicitudes | 34 de 650 solicitudes |
| Actividad: p95 de lecturas correctas | 27,54 s | 25,70 s |
| Actividad: p95 de comandos correctos | 28,14 s | 27,05 s |
| Actividad y drenaje: duración real | 79,52 s | 96,18 s |
| Solicitudes por segundo, incluidos todos los estados | 5,83 | 6,76 |
| CPU de generador, motor e instrumentación | 83,05 s | 97,33 s |
| Pico de memoria RSS muestreado | 2.182,85 MB | 1.620,48 MB |
| Llamadas a lectura del mundo completo | 560 | 176 |
| Tiempo dentro de SQLite local | 1,94 s | 4,59 s |

La tasa de timeouts aumentó de 3,02 % a 5,23 %. Las peticiones emitidas dependen de cuándo cada actor termina su acción; el calendario y sus límites son los mismos, pero la cantidad final de acciones y trabajo confirmado es distinta. No se atribuyen todos los cambios de CPU o latencia únicamente al lector SQL. Las 146 respuestas correctas del servidor a comandos incluyen 29 que llegaron después del timeout del cliente; no se cuentan como 146 respuestas recibidas por el jugador.

Durante la ventana mixta hubo 802 intentos de lectura cubierta: 626 devolvieron contexto de aldea y 176 hicieron fallback explícito. Se confirmaron 100 deltas por el contrato `commitVillage` y 83 por el escritor de aldea con entrada completa, sin CAS global. Los 38 conflictos del escritor cubierto se mantuvieron como conflictos, no como comandos exitosos. Los casos administrativos y el mantenimiento de vencimientos compartidos siguen presentes en la carga.

Las ocho comprobaciones de conservación, las tres de identidades y las cinco carreras controladas pasaron. No quedaron manejadores HTTP activos al cerrar la base. La carga básica no ejecutó un ciclo completo de extracción y fabricación dentro de su ventana medida; esas comprobaciones de carreras quedan fuera de rendimiento. Dos pruebas SQL adicionales del encargado sí completan ciclos agrícolas e industriales, con dos productores, transportista, reservas, cuotas y potenciadores, sin llamar al lector global.

Pasaron 844 pruebas generales, comprobación de tipos, compilación y lint con cero errores y tres advertencias existentes. La batería SQL conserva 698 casos: 696 originales y dos comparaciones de referencias adaptadas bajo el contrato revisado `village-ids-v1`. Sus 83 archivos físicos no se modificaron. Esa batería histórica usa mayormente cuentas administradoras: 18 lecturas y 14 commits fueron realmente cubiertos; las pruebas nuevas no administradoras verifican aparte la ruta acotada con el lector global prohibido.

La evidencia R2 de `work/bounded-sql-footprint-proof-r2-20261017-2037.json` conserva el mismo número de filas y bytes devueltos al añadir 2,2 MB a un perfil ajeno y otros 2,2 MB a su trabajo. El ensayo del respaldo `work/bounded-preservation-rehearsal-1792269381926.json` conserva exactamente cuatro perfiles, 28 trabajos y 143 recibos de la revisión histórica 282. Se verificaron también 51 archivos gráficos, los 83 originales, las 17 mediciones previas y el selector activo sin cambios. No se leyó ni modificó la partida remota.

**Decisión: candidato local sin desplegar.** La separación de datos privados funciona, pero la cola de respuestas todavía supera los límites de la interfaz: 8 segundos para lectura y 12 para mutaciones. Hay menos memoria y más trabajo aceptado, junto con más timeouts. Esto no aprueba fluidez ni capacidad de beta.

El siguiente cuello de botella medido comprende proyecciones repetidas, respuestas grandes y mantenimiento compartido: una lectura llegó a 114 sentencias SQL en una petición, aunque el lote individual máximo durante la ventana fue de 22. El tope por lote no certifica el presupuesto por invocación. Antes de migrar hacen falta reducir esas repeticiones, desacoplar los vencimientos mediante un planificador acotado y paginar datos públicos e históricos crecientes; después debe repetirse la carga.

La comprobación local workerd R2 pasó con el binario instalado y compatibilidad de mayo de 2026. No califica el runtime configurado de octubre de 2026. El manifiesto final liga por hash las 121 fuentes de biblioteca y los cuatro esquemas usados por SQL, workerd, el ensayo, la prueba de huella y la carga.

La carga usa generador y servidor HTTP Node en el mismo proceso, SQLite local y aldeas iniciales. No prueba la red de Cloudflare, su cuota por invocación, ciudades avanzadas, GPU o móviles, ni certifica 500, 3.000 o millones de usuarios simultáneos. La calidad gráfica no se reduce para mejorar los números del servidor.
