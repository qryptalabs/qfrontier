# QFrontier · MVP web

Implementación web privada de la propuesta QRYPTA Frontier del 14/10/2026 y su paquete técnico. El catálogo de referencia se conserva en `lib/mvp/reference-config.json`.

## Experiencia implementada

- Economía de 81 casillas y nueve regiones: cinco biomas, seis terrenos, clima actual y previsión por ventanas de seis horas.
- Planeta visual con diez escalas de zoom, terreno continuo y ocho biomas por coordenadas; catálogo ambiental de 30 aldeas, cinco ciudades y ocho lugares naturales.
- Parcelas permanentes con coordenadas globales X/Y, paisaje continuo y atlas de aldeas reales con búsqueda y enlaces a ubicaciones.
- Tres facciones, estación protegida, herramienta básica permanente y suministros de tutorial vinculados.
- Escudo inicial de 72 horas por cuenta, compartido entre sus perfiles, con protección tanto frente a ataques recibidos como iniciados.
- Prospección, viajes, reservas de extracción, capas profundas finitas y cuota temporal del promotor.
- 40 tipos de objetos y las 24 recetas del catálogo: ingredientes, resultados, cantidades, edificios y tiempos originales.
- Producción asíncrona con colas, cancelaciones, durabilidad, reparaciones, reciclaje, procedencia y alimentos perecederos.
- Agricultura con insumos reales, diez ciclos por parcela y presupuesto regional.
- Siete edificios con niveles 1-3; unidades, expediciones, caravanas y encuentros NPC de tres rondas.
- Trueque, mercado en créditos, demanda NPC limitada y contratos de entrega/transporte.
- Clanes, permisos de tesorería, segunda aprobación por personas distintas, obras colectivas y alianzas.
- Puestos con concesión, mantenimiento, defensa y disputas voluntarias; los materiales de una mina agotada no reaparecen.
- Referidos con validación de hitos, mentorías, reparto de temporada y financiación de entregas respaldadas.
- Administración de reservas, conciliación y compensación de plazos por incidencias.

Las seis pantallas principales son Mundo, Estación, Comercio, Comunidad, Expediciones y Temporada. La aplicación ofrece hasta dos exploradores por cuenta para comprobar flujos entre estaciones en la prueba privada.

## Gráficos 3D

Three.js renderiza el planeta ficticio, el terreno continuo, la estación y las expediciones en WebGL 2. «Mundo» enlaza órbita y suelo mediante diez escalas: permite seleccionar la superficie, volar a un destino y recorrerlo con la cámara. «Mapa regional» acerca al terreno; el selector de sectores conserva las 81 casillas económicas. La vista de Estación integra la aldea en un paisaje de bosque denso, relieves y riscos por niveles, montaña nevada con mina, tejados de madera, cultivos cercados, río, puente y cascadas. Cada parcela mide 40 × 36 unidades y los siete edificios reflejan los niveles del jugador. Las expediciones conservan la animación ligada a los tiempos de sus órdenes. El servidor sigue decidiendo los resultados del juego.

La geografía visual fija distingue hielo, desierto, bosque templado, bosque tropical, cordillera, costa, océano y llanuras. Globo y terreno comparten el muestreo continental; alturas, agua y caminos dependen de coordenadas globales. El suelo se carga en fragmentos de 64 × 64 unidades alrededor de la cámara, libera zonas lejanas y desplaza un origen local para visitar coordenadas distantes. La vegetación, arquitectura y fauna ambiental varían con el bioma. Consulta [MUNDO-PLANETARIO.md](MUNDO-PLANETARIO.md) y [MUNDO-CONTINUO.md](MUNDO-CONTINUO.md) para la proyección y el renderer.

El catálogo ambiental contiene 30 aldeas, cinco ciudades y ocho lugares naturales —cuatro cuevas y cuatro hitos—. Las ciudades son Costa Ámbar, Puerto Aurora, Ciudad del Sol, Reino del Hielo y Ciudad de los Areneros; las tres últimas ocupan bosque tropical, región glacial y desierto, respectivamente. Sus alias ficticios, niveles visuales y obras en construcción no representan cuentas humanas, inventarios ni producción real. Las aldeas de jugadores se obtienen por separado de los resúmenes públicos de la partida.

Los modelos voxel del proyecto contienen 40 objetos, siete edificios con tres niveles y cuatro unidades en las tres facciones. Tejas, mampostería, vigas, hojas y equipo de personajes están modelados como pequeños volúmenes. Geometrías, materiales y texturas pixeladas se comparten; las miniaturas utilizan un atlas de 73 renders preparado con un único contexto temporal. El paisaje está agrupado por materiales e instancias. Los recursos visuales de la aldea y sus habitantes ambientales son decorativos: no añaden inventario, depósitos ni tropas a la partida.

Hay aves con alas articuladas, nubes, humo de chimeneas, aldeanos caminando y corrientes con espuma animada. La interfaz usa una paleta bosque, cobre y marfil, iconos pixel art propios y las fuentes Marcellus y DM Sans alojadas en el proyecto con sus licencias OFL. Tarjetas, paneles y controles respetan foco visible, contraste y movimiento reducido.

El render de Estación combina sol lateral cálido, relleno frío contenido, sombras direccionales de 4096 píxeles y oclusión de contacto para separar aleros, ramas y rocas. El modo Rendimiento omite el posprocesado. La fragua ilumina su entorno con un resplandor suave. El río tiene mosaicos pequeños, profundidad cromática, ondas y espuma localizada; cuatro cortinas continuas de agua incluyen un manantial alto en la orilla. Los riscos, las copas y la mampostería usan geometría más fina. El render lineal se convierte una sola vez al color de pantalla tanto en vivo como al exportar, para conservar la iluminación del PNG.

La cámara permite rotar, acercar, desplazar, centrar y usar pantalla completa cuando el navegador la admite. Las opciones Rendimiento, Adaptable, Full HD y Ultra 4K limitan el número de píxeles físicos; el indicador muestra la resolución efectiva. El botón de cámara exporta un PNG renderizado a **3840 × 2160**, independientemente del tamaño de la ventana. Full HD y 4K describen resolución, no una tasa de cuadros garantizada: el rendimiento depende del dispositivo. Se verificaron formato móvil, viewport 4K y exportación PNG real; queda pendiente medir en teléfonos físicos.

La animación respeta la preferencia de movimiento reducido y puede pausarse. La vista libera sus recursos al salir y permite reiniciarse tras un fallo gráfico. Si falta WebGL 2, el selector y las operaciones del juego siguen disponibles. La calidad elegida se guarda localmente como preferencia.

## Parcelas, coordenadas y atlas

Cada explorador recibe una parcela permanente e identificada. El servidor asigna posiciones únicas en una espiral cuadrada, empezando en X: 0, Y: 0 y separando sus centros por 48 unidades. Las coordenadas globales X/Y describen dónde está la aldea; `player.position` conserva el sector donde se encuentra el explorador. Viajar, cambiar de perfil o desconectarse no desplaza la parcela.

Las 81 casillas siguen siendo la economía compartida de recursos. Cada sector abarca 192 unidades globales por eje y el origen corresponde a `t_4_4`. `homeTileId` relaciona una parcela con el sector de recursos más cercano, limitado a los índices 0–8; no crea yacimientos ni repone sus reservas. La posición inicial y los viajes del explorador se mantienen separados de esta referencia territorial.

El atlas muestra asentamientos reales y persistentes, con nombre de aldea y explorador, facción, clan cuando existe y niveles públicos de edificios. El buscador acepta esos datos o coordenadas; también permite centrar una ubicación X/Y y copiar un enlace que abre ese lugar del mapa regional. El enlace conserva los requisitos de acceso privado. Consultar otra aldea no concede gestión de sus edificios ni de sus bienes; el inventario, las unidades privadas y la identidad interna de su cuenta quedan fuera del resumen público.

El directorio ambiental permite buscar por nombre, alias o coordenadas y filtrar por bioma; los hitos naturales tienen accesos propios. La ubicación observada se muestra en X/Y y latitud/longitud ficticias. «Mi posición» vuela a la parcela del perfil seleccionado; «Localizar mi explorador» usa el centro de su sector actual. Observar una ubicación, compartir un enlace o mover la cámara no ejecuta un viaje económico.

En la vista de Estación, la cámara se limita al área de gestión de la parcela propia. En «Mundo» recorre libremente la geografía visual dentro de sus límites. La aldea detallada propia se incorpora solo en su posición permanente cuando se carga esa zona; no se repite bajo cada destino. Las aldeas vecinas usan su información pública y la parcela real tiene prioridad sobre ambientación cercana. Cambiar la selección o mover la cámara no transfiere propiedad ni modifica el estado económico.

## Escudo inicial y PvP voluntario

La protección inicial dura **72 horas desde `createdAt` del primer perfil de la cuenta**. Se calcula en el servidor usando la fecha más antigua de sus perfiles. Un segundo explorador comparte la misma fecha de inicio y vencimiento; crearlo no amplía ni reinicia el plazo.

Mientras el escudo está activo, la cuenta no puede activar PvP, iniciar ataques, exponer convoyes ni recibir ataques contra sus cargas o formaciones territoriales. La comprobación alcanza tanto al atacante como al objetivo y al comandante de una defensa de clan. Se puede construir, producir, explorar, comerciar, enviar convoyes protegidos y entrenar contra NPC.

El vencimiento no activa PvP automáticamente. Después de las 72 horas siguen siendo necesarios el entrenamiento NPC y el consentimiento voluntario, además de los descansos y condiciones de cada disputa. La aldea y su almacén permanecen protegidos sin límite de tiempo; el PvP regional solo afecta las cargas expuestas y las concesiones territoriales previstas por las reglas.

Si una disputa pendiente de una versión anterior incluía participantes bajo protección inicial, se anula al resolverse: no causa daño, botín ni captura. Se liberan las formaciones comprometidas y se devuelven una sola vez los suministros reservados del atacante. No se reinicia ni se amplía una concesión existente.

## Separación económica

Los lotes, créditos transferibles, créditos vinculados y unidades SIM_QRYP se contabilizan por separado. Los productos que usan insumos del tutorial conservan su vinculación. Los créditos de tutorial usados para reparar equipo también lo vinculan.

La geografía continental es visual y no amplía la economía de 81 sectores. Los bosques, ciudades y cuevas ambientales no crean reservas, cuotas, premios ni nuevos permisos de extracción. Una economía continental con rutas, concesiones y recursos propios corresponde a una posible etapa futura; requiere reglas, balance y backend adicionales.

Toda financiación, liquidación y premio QRYP es **simulado**. No hay conexión a blockchain, wallet, cobro, retiro, emisión de tokens ni NFT. El adaptador conserva obligaciones pendientes ante un fallo simulado. Las etapas de dinero real y colecciones del documento requieren una implementación posterior propia.

## Reglas y configuración

Los 40 identificadores y las 24 recetas proceden directamente del JSON suministrado; las pruebas comprueban compatibilidad con ese catálogo. Los parámetros no fijados por el paquete son valores explícitos de piloto: durabilidad, costes de edificios, tiempos de viaje/extracción/cultivo, demanda NPC, concesiones y ventanas de disputa. No representan balance validado con jugadores.

Las órdenes se cotizan en el servidor antes de confirmarse. Una firma vincula la cotización con usuario, petición, orden, revisión y vencimiento. La cotización vence antes del cambio de clima; un cambio de estado exige revisarla. Cada orden conserva su previsión y versión de reglas.

## Persistencia y autorización

La [Ruta del Ámbar](RUTA-DEL-AMBAR.md) amplía visualmente Costa Ámbar y Las Brumas en sus coordenadas originales. Sus edificios, habitantes, molinos, carretas y caminos son ambientación. Las vistas aéreas 2D y 3D observan el mismo terreno; mover la cámara no mueve al explorador ni genera recursos. Esta entrega no agrega nuevas reglas económicas.

React/TypeScript y Vinext sobre Workers; Cloudflare Access aporta identidad y D1 conserva las partidas. El cliente no decide inventarios, resultados ni premios. Una revisión atómica del mundo confirma recursos, trabajos, reservas e identificadores de solicitudes juntos. Repetir una petición devuelve su resultado sin producir de nuevo; reutilizar su ID con otro contenido se rechaza.

El realm `frontier-pdf-mvp-v2` separa esta implementación de la primera prueba de cinco recursos. Nunca se reinterpretan automáticamente inventarios anteriores. Los propietarios de perfiles y la semilla privada de resultados no se envían al navegador.

Las partidas existentes reciben sus parcelas mediante una migración idempotente dentro de la misma confirmación atómica. Se conservan las parcelas válidas ya asignadas, las posiciones de los exploradores, los trabajos, inventarios, edificios, hitos y reservas agotadas. La protección inicial usa las fechas originales de creación de la cuenta y no empieza de nuevo al actualizar el juego.

Los trabajos vencidos se resuelven transaccionalmente cuando llega una lectura u orden. Su finalización lógica conserva la fecha prevista, incluso tras volver más tarde. No se implementaron notificaciones externas ni un worker de notificaciones fuera de sesión.

La región completa se guarda como una revisión. Esta implementación sirve para probar el juego en privado; no se ha demostrado capacidad para una beta masiva o una temporada comercial. Antes de ampliar acceso hacen falta pruebas de carga y restauración, particionar historial/recibos y preparar moderación y operaciones de producción. El esquema PostgreSQL del paquete es una referencia de diseño y no se ejecuta sobre D1.

