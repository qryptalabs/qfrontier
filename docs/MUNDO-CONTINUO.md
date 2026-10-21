# Navegación del mundo continuo

El planeta es un mundo ficticio que puede observarse desde el espacio hasta el terreno. La cámara recorre cualquier continente, costa o zona oceánica dentro de la geografía visual. La posición observada utiliza las mismas coordenadas globales X/Y que las parcelas guardadas; la navegación no se restringe al atlas económico inicial ni redistribuye las aldeas cuando llegan jugadores.

## Coordenadas y superficie

`lib/graphics/world-navigation.ts` contiene funciones puras, sin navegador, renderer, reloj ni acceso a jugadores:

- `planetVectorToGeo({x,y,z})` convierte una dirección o punto de superficie en latitud y longitud ficticias, con la convención de esfera de `planet-data.ts`.
- `planetVectorToWorld(point)` convierte ese punto a las coordenadas globales existentes, conservando la proyección y las ubicaciones de las parcelas.
- `geographicWorldBounds` define límites visuales inmutables: X entre −27840 y 41280, Y entre −14880 y 19488. Corresponden a longitud −180…180 y latitud −89,5…89,5.
- `clampWorldPoint(x,y)` limita un destino de cámara a esos límites sin redondear ni seleccionar una casilla económica.

La inversa geométrica conserva los polos exactos ±90; la cámara usa un margen de medio grado para mantener estable la navegación terrestre. En un polo exacto la longitud carece de dirección única y se representa como cero. Los dos extremos de longitud se conservan como coordenadas distintas cuando el punto permite distinguirlos. Los vectores nulos y los valores no finitos o de tipo incorrecto se rechazan.

El origen X: 0, Y: 0 conserva su ancla ficticia de latitud 12, longitud −35 y su sector `t_4_4`. X aumenta hacia el este; Y hacia el sur. La convención es compatible con `THREE.SphereGeometry`: longitud cero apunta a +X y el este gira hacia −Z. No se utiliza GPS ni ubicación física de las personas.

## Cámara, aldea y explorador

Observar una ubicación y viajar con el explorador son acciones diferentes. Mover, acercar o alejar la cámara no ejecuta órdenes de viaje, no cambia la posición del explorador y no gasta recursos. «Mi aldea» usa la parcela permanente; «Mi explorador» usa su posición o ruta autorizada por el servidor. Los enlaces de ubicación representan destinos visuales.

La cámara libre no concede derechos de construcción. La gestión de edificios, inventario y unidades sigue limitada al perfil propio y a las validaciones del servidor. Visitar una aldea ajena permite consultar su representación pública; las localidades ambientales conservan sus alias ficticios y permanecen separadas de las cuentas y de los conteos de personas conectadas.

`planet-renderer.ts` mantiene una posición observada común entre órbita, vuelos y terreno. Al descender se incorpora `world-terrain-renderer.ts`; su foco inicial recibe el punto observado. Arrastrar sobre el terreno lo recorre, el botón derecho gira la cámara, y la rueda o las escalas cambian el acercamiento. Los controles direccionales también desplazan la vista. La búsqueda global X/Y y los enlaces conservan destinos visuales; un punto no se limita a los 81 sectores por estar fuera del área económica inicial.

El selector **2D / 3D** cambia la proyección de ese mismo terreno. 2D usa una cámara ortográfica cenital; 3D usa perspectiva e inclinación ajustable entre 30° y 75°. El cambio conserva el foco X/Y y una escala equivalente sobre el centro observado, con transición cuando el movimiento está activo. La inclinación es independiente de las diez escalas. El modo se conserva al visitar otro destino o actualizar los datos públicos de la partida.

La aldea detallada propia se carga en sus coordenadas permanentes cuando esa zona entra en el terreno visible. No se reproduce una copia de la aldea bajo cada destino. Cambiar de perfil devuelve el foco a la aldea correspondiente; sus construcciones se siguen administrando desde «Estación».

## Geografía y carga por zonas

`world-geography.ts` define un campo continental determinista y `sampleWorld(x,y)`. El globo y el suelo comparten esa geografía. Los ocho biomas visuales son región glacial, desierto, bosque templado, bosque tropical, cordillera, costa, océano y llanuras. Altura, humedad, drenajes, nivel de agua y caminos dependen de coordenadas, no del orden en que se cargan las zonas ni del número de usuarios.

El terreno se divide en fragmentos de 64 × 64 unidades. Se cargan zonas cercanas a la cámara y se liberan las lejanas, con un área ajustada al acercamiento, la inclinación y el formato de pantalla. El foco usa coordenadas globales mientras el renderer desplaza su origen local; así puede recorrer continentes distantes sin trasladar las parcelas guardadas. La vegetación, la arquitectura y la fauna ambiental varían según el bioma; los modelos repetidos usan instancias y recursos compartidos.

El catálogo fijo contiene **30 aldeas y cinco ciudades ambientales**, con alias ficticios y niveles visuales 1–3. Las cinco ciudades son Costa Ámbar, Puerto Aurora, Ciudad del Sol, Reino del Hielo y Ciudad de los Areneros. Ciudad del Sol está en bosque tropical; Reino del Hielo, en región glacial; Ciudad de los Areneros, en desierto. Se conservan los diez destinos originales y se añaden localidades distribuidas por la geografía global.

Hay además **ocho lugares naturales**: cuatro cuevas y cuatro hitos. El directorio permite buscar localidades por nombre, alias o coordenadas y filtrar por bioma; los lugares naturales tienen sus propios accesos de navegación. Esos destinos son ambientación: no simulan usuarios conectados ni conceden minerales, premios, propiedad o actividad económica. Las aldeas reales proceden de los resúmenes públicos de la partida y tienen prioridad visual si una localidad ambiental queda demasiado cerca de una parcela real.

## Primera zona habitada

**La Ruta del Ámbar** desarrolla Costa Ámbar y Las Brumas dentro del catálogo existente, sin cambiar sus anclas. Costa Ámbar, en X: −408, Y: −312, ocupa varios fragmentos de terreno; Las Brumas permanece en X: −216, Y: 168. Una red de avenidas, senderos y una ruta exterior conecta sus accesos. Ambas localidades mantienen acceso directo en la sección «LOS PUEBLOS DE FRONTERA».

La ciudad tiene barrios, edificios cívicos, mercado, murallas y campos exteriores; la aldea tiene cercas, talleres y cultivos. Sus habitantes siguen recorridos definidos sobre esos caminos y se detienen a trabajar. Los molinos mueven las aspas alrededor de su eje; las carretas mueven las ruedas. Los modelos y las rutas se cargan con sus fragmentos, comparten recursos y reducen el detalle a distancia o en modo Rendimiento.

Las animaciones usan el tiempo visual del renderer. Al pausar se conserva la pose actual de trabajadores, transporte y molinos; reanudar no reinicia las rutinas. No hay llamadas a una IA ni órdenes económicas por habitante. El contenido y los límites de esta zona se describen en [RUTA-DEL-AMBAR.md](RUTA-DEL-AMBAR.md).

## Localidades de todos los biomas

Las otras **33 localidades** reciben el mismo sistema de actividad ambiental con modelos y trazados adaptados a su entorno. Junto con La Ruta del Ámbar, completan las **30 aldeas y cinco ciudades** del catálogo. Sus anclas no se desplazan y los jugadores reales conservan sus propias parcelas.

`inhabited-world-data.ts` define construcciones, calles, recorridos, límites y perfiles climáticos. Las ciudades restantes tienen 70 estructuras definidas cada una y las aldeas entre 12 y 18, incluidas obras, mercados, molinos y cultivos. Las rutinas se representan al acercarse y se reducen en modo Rendimiento. La ficha del lugar muestra los valores de su plan, no un conteo de personas conectadas.

El hielo utiliza refugios de nieve e invernaderos; el desierto, adobe, arcos, sombra y caravanas; la montaña, piedra, cubiertas alpinas y terrazas; los trópicos, palafitos y arrozales; las costas, viviendas marítimas y almacenes; bosques y llanuras, carpintería, cultivos y molinos. Hay cercas o muros con pasos conectados a las calles. La red incorpora 29 conexiones regionales terrestres entre localidades de las nuevas zonas; las islas aisladas no reciben carreteras forzadas sobre océanos.

El renderer `inhabited-world.ts` integra estos elementos en los mismos fragmentos de 64 × 64 unidades. Los molinos conservan rotores independientes y los transportes siguen rutas locales: trineos sobre hielo, camellos en desierto y carretas en los demás entornos. Los detalles y los límites están en [POBLADOS-POR-BIOMA.md](POBLADOS-POR-BIOMA.md).

## Economía y protección conservadas

La extensión visual del planeta no agrega sectores económicos, depósitos, cuotas, recompensas ni oportunidades de extracción. Se mantienen las 81 casillas jugables y sus reglas actuales. Ver un bosque, una montaña o un océano lejano no crea recursos disponibles para el jugador ni habilita automáticamente un viaje económico hasta allí. Una economía continental con nuevos recursos y rutas es una posible etapa posterior y requeriría diseño, balance y validaciones propias del servidor.

Se conserva la protección inicial de 72 horas desde el primer perfil de la cuenta, compartida por sus demás perfiles. Su vencimiento no activa PvP. La aldea y el almacén permanecen protegidos; el PvP regional sigue siendo voluntario. La navegación de cámara no modifica estos permisos ni los relojes del servidor.
