# La Ruta del Ámbar

Primera zona habitada del mundo continuo de QFrontier. Desarrolla una ciudad y una aldea que ya existían en el catálogo ambiental, conserva sus coordenadas y las conecta mediante un camino sobre el terreno. Las partidas y la gestión de las aldeas reales siguen utilizando sus datos guardados.

## Destinos

| Lugar | Coordenadas X / Y | Desarrollo |
| --- | --- | --- |
| Costa Ámbar | −408 / −312 | Núcleo de 168 × 160 unidades, barrios, fortificaciones, plaza, mercado y campos exteriores |
| Las Brumas | −216 / 168 | Aldea de 56 × 60 unidades, cercas, viviendas, talleres y cultivos |

La ciudad contiene 86 estructuras definidas y la aldea 16. Esos conteos incluyen viviendas, edificios de trabajo, mercados, torres, molinos y cultivos; no representan únicamente casas. Costa Ámbar ocupa varios fragmentos del mundo. Su tamaño y su silueta se distinguen de los de Las Brumas.

Las calles principales, los accesos a edificios y la ruta entre ambas localidades comparten datos de trazado. El terreno se nivela bajo las zonas habitadas y acompaña la pendiente del camino exterior. Cercas y murallas conservan entradas para esas conexiones. La parcela de un jugador real tiene prioridad si se cruza con la ambientación.

## Habitantes y movimiento

Hay 40 rutinas de habitantes definidas para Costa Ámbar y 12 para Las Brumas. Los roles son trabajadores, guardias, comerciantes, agricultores, leñadores y constructores. Los recorridos alternan desplazamiento y pausas; las tareas incluyen transportar cargas, patrullar, trabajar cultivos y usar herramientas. Los personajes tienen brazos y piernas articulados y conservan un estilo de bloques coherente con el juego.

Los molinos tienen una torre estática y un rotor independiente en el eje de las aspas. Las carretas de madera siguen calles locales y tienen cuatro ruedas animadas. Estos elementos usan rutinas deterministas en el navegador; no requieren consultas a una IA por personaje.

La cantidad visible depende del acercamiento y del modo gráfico. Desde lejos se priorizan edificios y siluetas; al acercarse aparecen más habitantes y detalle. El modo Rendimiento reduce la población representada. «Pausar animaciones» congela la posición y la pose actuales; al reanudar continúa el tiempo visual.

## Cómo recorrer la zona

En **Mundo**, la sección **LA RUTA DEL ÁMBAR** ofrece los botones «Costa Ámbar» y «Las Brumas». También se pueden encontrar ambos lugares en el directorio o mediante sus coordenadas.

- **2D:** vista cenital ortográfica para leer el trazado de calles y localizar edificios.
- **3D:** perspectiva con inclinación de 30° a 75°, giro y desplazamiento sobre el mismo terreno.
- **Diez escalas:** conservan la navegación del espacio a la aldea. La inclinación se ajusta por separado.
- **Mi posición:** vuelve mediante el vuelo de cámara a la parcela permanente del perfil seleccionado.

Al cambiar de 2D a 3D se conserva el centro observado y una escala equivalente en ese punto. Recorrer la ruta es una acción de cámara: no desplaza al explorador ni consume recursos.

## Datos y recursos gráficos

- `lib/graphics/living-zone-data.ts`: coordenadas, construcciones, calles, recorridos y nivelación del terreno.
- `lib/graphics/living-zone.ts`: composición visual por fragmento, fortificaciones, mobiliario y actividad local.
- `lib/graphics/living-actors.ts`: habitantes articulados, herramientas, cargas y carretas con recursos compartidos.
- `lib/graphics/world-models.ts`: biblioteca ambiental y rotores de molinos.
- `lib/graphics/world-camera.ts`: escalas, inclinación y selección de zonas visibles.
- `lib/graphics/world-terrain-renderer.ts`: terreno continuo, cámaras, carga, animaciones y capturas.

Los fragmentos miden 64 × 64 unidades y se cargan o liberan alrededor de la cámara. Cada habitante tiene un fragmento propietario estable para evitar copias simultáneas al cargar zonas vecinas. Los modelos estáticos se agrupan por material; los miembros articulados, las ruedas y los rotores conservan sus transformaciones independientes. Cada fragmento libera los recursos que le pertenecen, mientras las bibliotecas conservan los compartidos hasta cerrar la vista.

## Alcance de esta entrega

La zona muestra desarrollo urbano y actividad ambiental. Los habitantes no son cuentas humanas ni se suman a usuarios conectados. Los campos, mercados, cargas y carretas no generan bienes, premios, créditos ni nuevas órdenes de comercio.

Las economías continentales, los recursos exclusivos y los viajes de los jugadores para obtenerlos corresponden a una versión posterior. Las 81 casillas económicas actuales, las partidas, el inventario, los escudos y Cloudflare Access conservan sus reglas y datos.

Consulta [MUNDO-CONTINUO.md](MUNDO-CONTINUO.md) para la navegación y [MUNDO-PLANETARIO.md](MUNDO-PLANETARIO.md) para la proyección del planeta.
