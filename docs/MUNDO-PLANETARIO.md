# Mundo planetario de Frontera Cero

El planeta representa un mundo ficticio del juego. Su navegación es un viaje de cámara: no utiliza GPS físico y no ejecuta órdenes de movimiento del explorador. La geografía base, el origen y la proyección permanecen fijos al incorporar o desconectar jugadores.

## Coordenadas conservadas

`lib/graphics/planet-data.ts` define el radio visual de 100 unidades, el ancla ficticia de latitud 12 y longitud −35, y una escala de 192 unidades globales por grado. X aumenta hacia el este; Y aumenta hacia el sur, como las columnas y filas del atlas de recursos.

Las conversiones son:

```text
latitud = 12 − Y / 192
longitud = −35 + X / 192
X = (longitud + 35) × 192
Y = (12 − latitud) × 192
```

El origen X: 0, Y: 0 sigue correspondiendo al sector `t_4_4`. Las nueve casillas por eje del atlas abarcan nueve grados. La proyección conserva las coordenadas de las parcelas existentes; el número de jugadores no modifica la escala ni redistribuye las aldeas.

Las funciones rechazan valores no finitos y coordenadas fuera de latitud −90…90 o longitud −180…180. No envuelven coordenadas inválidas sobre otra parcela. Estas coordenadas son ficticias: no representan una ubicación real del jugador.

## Textura, marcadores y esfera

La conversión a tres dimensiones usa la convención UV por defecto de `THREE.SphereGeometry`:

```text
u = (longitud + 180) / 360
v = (latitud + 90) / 180
phi = (longitud + 180) en radianes
x = −radio × cos(phi) × cos(latitud)
y =  radio × sin(latitud)
z =  radio × sin(phi) × cos(latitud)
```

La longitud 0 y latitud 0 apuntan hacia +X; el este gira hacia −Z. Textura, geografía y marcadores deben compartir esta convención para evitar un desplazamiento de 180 grados. Las pruebas comparan la conversión con vértices UV reales de Three.js.

## Diez escalas de navegación

Las altitudes son distancias visuales sobre la superficie, no kilómetros físicos. Los diez anclajes tienen una altitud positiva y descendente:

| Nivel | Escala | Altitud visual |
| --- | --- | ---: |
| 1 | Espacio | 2600 |
| 2 | Planeta | 420 |
| 3 | Hemisferio | 160 |
| 4 | Continente | 55 |
| 5 | Región | 14 |
| 6 | Sector | 4,2 |
| 7 | Valle | 2,2 |
| 8 | Aldeas | 1,1 |
| 9 | Parcelas | 0,35 |
| 10 | Aldea | 0,12 |

`clampPlanetZoomLevel` limita la selección a los niveles 1–10. La tabla define anclajes visuales del planeta; al descender, `planet-renderer.ts` transiciona al terreno de `world-terrain-renderer.ts`. El terreno puede verse con cámara ortográfica cenital en 2D o con perspectiva en 3D. No se carga una aldea aislada distinta para cada destino: una sola posición observada enlaza la órbita y el terreno continuo. Las funciones de interpolación de `planet-data.ts` permanecen disponibles como ayudantes puros; el renderer integrado anima sus vuelos de cámara y respeta el movimiento reducido.

«Mi posición» vuela a la aldea del perfil seleccionado. El directorio, la búsqueda X/Y y la selección de la superficie permiten visitar otros puntos del planeta. Arrastrar sobre el globo gira la órbita; sobre el terreno desplaza la cámara, y el botón derecho la gira. La rueda y las diez escalas ajustan el acercamiento. Al cambiar de perfil, el destino vuelve a la ubicación de su aldea.

El selector **2D / 3D** conserva el foco global y una escala equivalente en el centro de la vista. La inclinación 3D se ajusta entre 30° y 75° para observar el horizonte o mirar desde mayor altura. Las dos proyecciones muestran la misma geografía y los mismos edificios; no representan mapas alternativos. La carga del terreno se adapta a la cámara. [MUNDO-CONTINUO.md](MUNDO-CONTINUO.md) detalla este funcionamiento.

## Aldeas reales y asentamientos ambientales

Las aldeas de jugadores proceden de `MvpView.settlements` y conservan sus identificadores y coordenadas permanentes. La aldea fija y el explorador móvil son destinos distintos: la primera usa `plot.x/y`; el segundo conserva su sector o ruta del juego. Observar una ubicación no implica viajar hasta ella ni concede gestión de una aldea ajena.

El catálogo integrado se exporta desde `world-geography.ts`: `WORLD_SETTLEMENTS` contiene **30 aldeas y cinco ciudades**; `WORLD_LANDMARKS` añade **ocho lugares naturales**, para un total de 43 destinos ambientales. Se conservan los identificadores, coordenadas y alias de las diez localidades originales de `planet-data.ts`. Las localidades añadidas usan posiciones deterministas cuyo bioma se obtiene de la geografía real del juego, con niveles visuales 1–3 y algunas obras en construcción.

Las cinco ciudades son Costa Ámbar, Puerto Aurora, Ciudad del Sol, Reino del Hielo y Ciudad de los Areneros. Las tres últimas están situadas, respectivamente, en bosque tropical, región glacial y desierto. Hay cuatro cuevas identificadas —Gruta de Basalto, Caverna de los Cedros, Bóveda de Sal y Gruta del Deshielo— y cuatro hitos —Las Agujas Blancas, Acantilado del Viento, Cascadas de Jade y Abismo de Zafiro—. Sus nombres identifican destinos de ambientación; no representan misiones, minas o recompensas económicas.

La interfaz muestra nombres de aldeas y alias naturales inventados, sin usar la etiqueta técnica «NPC». Esos alias son parte del paisaje y no corresponden a cuentas humanas. Las localidades permanecen separadas de `MvpView.settlements`: no contienen `playerId`, `ownerName`, propietario humano, inventario, tropas, créditos ni premios. No se suman al conteo de aldeas de jugadores, usuarios registrados o personas conectadas ni generan actividad o estados «en línea». Las etapas `village`, `construction` y `city` describen apariencia; no afirman que exista producción o comercio económico en esas localidades.

Costa Ámbar y Las Brumas forman la primera zona habitada, [La Ruta del Ámbar](RUTA-DEL-AMBAR.md). Conservan sus posiciones originales y reciben construcciones más desarrolladas, caminos conectados, habitantes con rutinas, molinos animados y carretas. Esta mejora no aumenta el número de localidades del catálogo ni crea cuentas. Su actividad es ambiental; la futura economía continental permanece pendiente de reglas y servicios propios.

La ampliación de [Poblados por bioma](POBLADOS-POR-BIOMA.md) aplica esa actividad a las otras 33 localidades. Así, las 30 aldeas y cinco ciudades muestran desarrollo coherente con su entorno: arquitectura glacial, desértica, forestal, agrícola, tropical, alpina o costera. Los asentamientos conservan sus coordenadas del catálogo. Las cinco ciudades tienen accesos destacados en «LOS PUEBLOS DE FRONTERA» y una ficha presenta las construcciones, rutinas de habitantes y transporte local de cada lugar.

Los trazados y las conexiones terrestres pertenecen al mismo mundo continuo. La cámara 2D o 3D observa las mismas calles, muros, molinos y habitantes; acercarse aumenta el detalle visible. Las rutinas y los transportes no representan producción económica, cuentas registradas ni comercio entre jugadores.

## Geografía y carga del terreno

`sampleWorld(x,y)` y el muestreo continental de `world-geography.ts` mantienen la geografía independiente de la población y del orden de carga. Los ocho biomas visuales son hielo, desierto, bosque templado, bosque tropical, cordillera, costa, océano y llanuras. El terreno conserva alturas, agua, drenajes y caminos calculados por coordenadas globales; textura del globo y terreno comparten el mismo campo continental.

El renderer terrestre carga fragmentos de 64 × 64 unidades alrededor de la cámara y libera los lejanos. Usa instancias y un origen local desplazable para recorrer coordenadas distantes. La aldea detallada del perfil se incorpora solo cuando está cargada la zona de su parcela permanente; no se traslada a los continentes visitados. Los resúmenes públicos representan las aldeas vecinas. Si un asentamiento ambiental queda demasiado cerca de una parcela real, el renderer da prioridad a la parcela real.

## Economía y protección

La representación del planeta y sus localidades decorativas no amplía las 81 casillas económicas existentes ni crea reservas de recursos. Los continentes ambientales no equivalen automáticamente a sectores jugables. Las órdenes, viajes y disputas siguen sujetos a las reglas y validaciones del servidor. Una economía continental, sus concesiones, recursos y rutas comerciales requerirían una implementación posterior; no forman parte de esta navegación visual.

Se conserva el escudo inicial de 72 horas desde el primer perfil de la cuenta, compartido por sus exploradores. Expirar no activa PvP. La aldea y su almacén mantienen la protección permanente, el PvP regional continúa siendo voluntario y la cámara de gestión propia conserva sus límites. Las aldeas de otras personas siguen siendo de consulta pública.
