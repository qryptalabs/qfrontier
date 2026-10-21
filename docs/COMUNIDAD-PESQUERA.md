# Comunidades pesqueras

La red reúne **cinco comunidades**, cada una con puerto, muelle y ciudad de destino: costa, bosque, desierto, trópico y hielo. Hay **diez barcos, diez carretas con animal y conductor y treinta trabajadores de muelle o ciudad**, además de las tripulaciones. Los planes reúnen 220 estructuras. Estos valores describen la ambientación, no cuentas registradas ni actividad económica de jugadores.

## Directorio de la red

Todas las coordenadas son X / Y del juego. Se obtienen de los lugares fijos definidos en `fishing-network-data.ts`.

| Entorno | Puerto | Coordenadas del puerto | Muelle | Ciudad de destino | Coordenadas de la ciudad |
| --- | --- | --- | --- | --- | --- |
| Costa | Bahía del Viento | 1080 / 6740 | 1152 / 6723 | Ciudad del Estuario | 900 / 6784 |
| Bosque | Puerto de los Cedros | −14328 / 11503 | −14400 / 11520 | Ciudad del Sauce | −14148 / 11459 |
| Desierto | Bahía del Ámbar | −16544 / 4625 | −16472 / 4608 | Ciudad de las Salinas | −16724 / 4669 |
| Trópico | Puerto del Mangle | 28625 / −1464 | 28608 / −1536 | Ciudad de las Mareas | 28669 / −1284 |
| Hielo | Puerto de la Aurora | −25937 / −12552 | −25920 / −12480 | Ciudad del Deshielo | −25981 / −12732 |

Cada ubicación se apoya en la geografía existente del planeta. Las casas están sobre terreno y los amarres y caladeros sobre agua. En la comunidad glacial, las embarcaciones utilizan agua abierta cercana. Las rutas y los espacios de maniobra se trasladan y giran como una unidad, sin cambiar la escala de barcos, trabajadores o edificios.

La costa mantiene el diseño original de Bahía del Viento. El bosque utiliza carpintería y edificios detallados de madera; el desierto, adobe, arcos y sombra; el trópico, construcciones elevadas y cultivos adaptados; el hielo, refugios de nieve, edificios protegidos e invernaderos. Ropa, colores de cascos y velas y objetos del puerto cambian según el entorno. Las carretas del bosque y del hielo utilizan **bueyes**; las de costa, desierto y trópico, **caballos**.

| Puerto | Barcos | Desfase de su jornada |
| --- | --- | ---: |
| Bahía del Viento | La Aurora · Brisa del Alba | 0 s |
| Puerto de los Cedros | La Alondra · Viento del Sur | 73 s |
| Bahía del Ámbar | Duna Dorada · Estrella de Sal | 147 s |
| Puerto del Mangle | Flor de Coral · La Esmeralda | 211 s |
| Puerto de la Aurora | Luz Boreal · La Gaviota Blanca | 319 s |

Los cinco puertos comparten el ciclo de 540 segundos descrito abajo; cada jornada tiene su propio desfase. Dentro de cada comunidad, el segundo barco se separa otros 270 segundos del primero. Así no realizan todos la misma tarea al mismo tiempo. Cada puerto conserva sus propios identificadores de entidades, lotes y cajas.

En **Mundo**, el directorio **Puertos de Frontera** permite elegir una comunidad por nombre, bioma y coordenadas del muelle. La sección activa presenta su ciudad, su flota y los accesos para recorrer el puerto o seguir un transporte. Las mismas localidades aparecen en el directorio general del planeta.

## Guía de la comunidad original

Una cadena ambiental une **Bahía del Viento** con **Ciudad del Estuario**: los barcos salen al caladero, pescan, regresan a sus amarres y descargan cajas que los estibadores llevan hasta las carretas. Caballos y conductores trasladan esa carga al almacén de la ciudad.

La comunidad original conserva sus dos lugares, nombres y coordenadas. Las cuatro incorporaciones añaden otros ocho lugares. Las aldeas existentes y las partidas conservan sus coordenadas y datos.

## Lugares y flota

| Destino | Coordenadas X / Y | Contenido |
| --- | --- | --- |
| Bahía del Viento | 1080 / 6740 | Comunidad costera, viviendas, taller, almacén, puesto de pescado y redes |
| Muelles | 1152 / 6723 | Plataforma, amarres separados, pasarelas y áreas de descarga |
| Ciudad del Estuario | 900 / 6784 | Barrios, mercado, almacén de entrega, ayuntamiento, torres, cultivos y molino |

La costa procede de `sampleWorld`: el poblado y la ciudad se sitúan en terreno costero, mientras los muelles avanzan sobre agua existente. Las rutas de los barcos usan posiciones de agua de esa misma geografía. Los edificios adaptan sus bases al terreno y las pasarelas dan soporte al recorrido de los estibadores.

Hay **dos barcos**, **La Aurora** y **Brisa del Alba**, con amarres y rutas propios. Cada uno tiene casco de tablones, mástil, vela, aparejos, red articulada, cabrestante y dos tripulantes. La flota se complementa con **Carro de Lucía** y **Carro de Mateo**, ambos tirados por un caballo y conducidos por un personaje sentado. La biblioteca gráfica también permite representar un buey, aunque las rutas de esta comunidad utilizan caballos.

## Seis etapas visibles

1. **Preparar:** el barco permanece en su amarre antes de salir.
2. **Zarpar:** navega hacia su caladero con la red recogida.
3. **Pescar:** despliega y mueve la red; la captura aumenta hasta seis cajas.
4. **Regresar:** vuelve al muelle con su carga.
5. **Descargar:** los estibadores recogen cajas del barco y las llevan al área de descarga y a la carreta.
6. **Entregar:** la carreta viaja por el camino costero a Ciudad del Estuario, descarga y regresa.

El ciclo de cada barco dura **540 segundos** y el segundo empieza con un desfase de 270 segundos. El estado observado depende del momento del mundo; entrar a la vista no reinicia toda la jornada. Los desplazamientos, las esperas y las entregas se calculan con rutas y tiempos definidos.

Cada lote mantiene seis identificadores de caja. La instantánea ambiental registra si cada caja está en el barco, en manos de un trabajador, en el área de descarga, en la carreta o entregada en la ciudad. La cantidad visible sobre barcos y carretas corresponde al conteo de su instantánea; los estibadores muestran una caja de pescado sólo cuando transportan una.

Los caballos mueven las patas y arrastran un carro con yugo, arnés, tirantes y riendas. Las ruedas y la marcha del animal usan la distancia recorrida por el modelo; al detenerse, las ruedas conservan su giro. El conductor mantiene su posición dentro de la misma entidad de transporte.

## Recorrer y seguir la actividad

En **Mundo**, la sección **DE LA BAHÍA AL MERCADO** ofrece «Ver los muelles», «Recorrer la comunidad» y la ciudad del puerto elegido. Para Bahía del Viento, el destino es «Ciudad del Estuario». La flota muestra el estado y las cajas de cada barco o carreta de esa comunidad.

«Seguir» centra la cámara sobre la entidad y la acompaña durante su ruta. También se puede seleccionar un barco o una carreta en la escena. El indicador de seguimiento muestra el nombre, la actividad y la carga; **«Explorar libremente»** termina el seguimiento. Las vistas 2D y 3D siguen observando las mismas coordenadas del mundo.

## Tiempo, mar y ambiente

El tiempo de la comunidad se ancla a `view.now`, recibido del servidor, y avanza localmente con `performance.now()`. Las actualizaciones de la partida vuelven a sincronizar ese ancla. La representación no necesita guardar una orden ni consultar una IA por cada barco o habitante. Al pausar animaciones se congela el instante observado; al reanudarlas se vuelve al ciclo temporal del mundo.

La textura del agua es un recurso independiente del suelo. El campo de oleaje mueve la superficie marina y calcula el balanceo y la inclinación de los barcos con las mismas coordenadas y el mismo tiempo. Las embarcaciones en movimiento producen estelas; gaviotas animadas recorren el puerto. Estos efectos no cambian la meteorología ni las reglas económicas.

## Archivos y contratos

- `lib/graphics/fishing-community-data.ts`: lugares, rutas, amarres, horarios, cajas e instantáneas de la cadena.
- `lib/graphics/fishing-network-data.ts`: catálogo de cinco comunidades, transformaciones fijas, nombres, desfases e instantáneas con identificadores separados.
- `lib/graphics/fishing-network.ts`: selección de la comunidad cercana o seguida y carga y liberación de sus gráficos.
- `lib/graphics/fishing-community-models.ts`: barcos, tripulantes, carretas con animal y conductor, edificios y objetos portuarios.
- `lib/graphics/fishing-community.ts`: composición, actualización visual, selección y seguimiento de entidades.
- `lib/graphics/maritime-water.ts`: textura independiente, oleaje y posición de las embarcaciones.

`createFishingModelLibrary(biome = 'coast')` —también disponible como `createFishingCommunityLibrary()`— conserva las plantillas y sus recursos compartidos de cada entorno. Omitir el bioma mantiene el diseño costero original. `boat(seed)` y `haulage(kind, seed)` devuelven una entidad con `group`, `animate` y `dispose`; el renderer controla su posición y orientación global. La animación admite un objeto de estado o sus argumentos posicionales. La carga numérica representa **cajas, de 0 a 6**, y no un porcentaje. `worker` crea tripulantes o estibadores articulados; `get` y su alias `structure` proporcionan los modelos estáticos. Las casas y almacenes regionales mantienen las dimensiones normalizadas del plan para conservar calles y recorridos.

Las comprobaciones de los modelos cubren geometría finita, dimensiones, articulaciones, carga visible, congelación del tiempo y eliminación de recursos compartidos. La biblioteca no libera materiales globales prestados de otras escenas.

## Relación con las partidas

La pesca, las cajas y los almacenes de esta comunidad son ambientación del mundo. Sus identidades permiten representar una cadena coherente, pero no generan objetos, créditos, reservas ni recompensas en las cuentas reales. No modifican inventarios ni las 81 casillas económicas existentes.

La propiedad de las parcelas, los escudos y Cloudflare Access mantienen sus reglas. Convertir esta cadena en una economía jugable requeriría reglas, balance y validaciones del servidor en una etapa posterior.

Consulta [MUNDO-CONTINUO.md](MUNDO-CONTINUO.md) para la navegación y [POBLADOS-POR-BIOMA.md](POBLADOS-POR-BIOMA.md) para el resto de los asentamientos ambientales.
