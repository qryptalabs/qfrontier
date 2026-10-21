# Poblados por bioma

La actividad ambiental de QFrontier se extiende a las **30 aldeas y cinco ciudades** del catálogo existente. Costa Ámbar y Las Brumas conservan su composición de [La Ruta del Ámbar](RUTA-DEL-AMBAR.md); las otras 33 localidades reciben arquitectura, calles y habitantes adaptados al bioma. Se mantienen nombres, identificadores y coordenadas.

## Desarrollo de las localidades

Las cuatro ciudades de esta ampliación —Puerto Aurora, Ciudad del Sol, Reino del Hielo y Ciudad de los Areneros— tienen 70 estructuras definidas cada una. Las 29 aldeas restantes tienen entre 12 y 18 según su desarrollo y etapa de construcción. Los conteos incluyen viviendas, talleres, mercados, fortificaciones, molinos y cultivos.

En conjunto, los nuevos planes contienen **723 estructuras y 514 rutinas de habitantes**. La Ruta del Ámbar conserva sus 102 estructuras y 52 rutinas. Son planes ambientales, no cuentas ni personas conectadas. La cantidad visible simultáneamente depende de los fragmentos cargados, del acercamiento y de la calidad gráfica.

Las ciudades se extienden por varios fragmentos y se diferencian de las aldeas por escala y distribución. Los trazados incluyen calles radiales y anillos, ejes con calles laterales o composiciones alargadas según el lugar. Algunas localidades permanecen abiertas; otras tienen cercas o muros con accesos conectados a sus calles. Las obras muestran estructuras en construcción y trabajadores.

## Arquitectura y actividad climáticas

| Entorno | Construcciones y cultivos | Habitantes y transporte |
| --- | --- | --- |
| Hielo | Refugios de nieve, iglús, edificios de piedra y hielo, cubiertas nevadas e invernaderos | Ropa de invierno, trabajo protegido y trineos |
| Desierto | Adobe, arcos, pretiles, bazares, macetas y bancales bajo sombra | Ropa ligera, artesanía, mercados y camellos con carga |
| Bosque | Viviendas de madera y piedra, talleres, almacenes y huertos | Carpinteros, leñadores, agricultores y carretas |
| Llanuras | Viviendas y edificios agrícolas, cultivos, mercados y molinos | Trabajo de campo y transporte con carretas |
| Montaña | Piedra, cubiertas alpinas, muros y cultivos en terrazas | Cantería, construcción y carretas |
| Trópicos | Viviendas elevadas, cubiertas amplias, jardines y arrozales | Cultivos, talleres y carretas en las calles |
| Costa | Viviendas marítimas, cubiertas y carpintería costeras, mercados y almacenes | Oficios locales y carretas sobre terreno |

Los modelos usan variantes y niveles de desarrollo. La arquitectura forestal reutiliza el detalle de los edificios originales, agrupado por material. Los demás estilos incorporan detalles propios: juntas de piedra, puertas, ventanas, aleros, macetas, toldos, escaleras o apoyos elevados. Los cultivos glaciales se representan bajo invernadero y los desérticos con sombra; no se repite el mismo campo abierto en todos los climas.

Las aspas de los molinos giran alrededor de su eje sin mover la torre. Los habitantes tienen miembros articulados y herramientas según su oficio. Las rutinas alternan caminar, llevar cargas, patrullar y trabajar en los frentes de edificios o cultivos. Los transportes terrestres siguen recorridos locales y se detienen. Las localidades costeras no colocan barcos sobre sus calles.

## Calles y conexiones regionales

Las calles se definen antes de las rutas de habitantes. Los accesos y espacios de trabajo conservan separación respecto de las construcciones y su mobiliario. Los edificios mantienen sus fachadas orientadas hacia las aproximaciones previstas.

Hay **29 conexiones regionales terrestres** entre localidades de las nuevas zonas, además del camino de La Ruta del Ámbar y las redes de calles interiores. Las rutas respetan la geografía del planeta; las islas aisladas no se unen mediante carreteras rectas sobre océanos. Estas conexiones son paisaje navegable con la cámara, sin activar viajes económicos.

En **Mundo**, la sección **LOS PUEBLOS DE FRONTERA** ofrece accesos directos a las cinco ciudades y a Las Brumas. El directorio permite buscar las demás localidades por nombre, alias o bioma. Al seleccionar una se muestran sus construcciones, habitantes del plan, transporte y actividad ambiental. Los controles **2D / 3D**, la inclinación de 30° a 75°, las diez escalas y «Mi posición» siguen utilizando las mismas coordenadas globales.

## Carga, animación y comprobaciones

- `inhabited-world-data.ts`: planes por localidad, rutas, límites, perfiles y conexiones regionales.
- `inhabited-world.ts`: composición visual y actividad de cada fragmento.
- `biome-settlement-models.ts`: modelos por bioma, nivel y variante, con plantillas compartidas.
- `living-actors.ts`: vestimenta climática, herramientas y transportes.

Los fragmentos miden 64 × 64 unidades y se cargan alrededor de la cámara. Los edificios comparten geometrías y materiales; los miembros, las ruedas y los rotores conservan movimiento independiente. Los habitantes tienen un fragmento propietario para evitar copias al cargar zonas vecinas. El modo Rendimiento reduce su número y las escalas lejanas muestran menos detalle.

Las animaciones usan el tiempo visual del renderer. Pausar conserva la posición y la pose; reanudar continúa la actividad. No se consulta una IA por habitante. Las comprobaciones de geometría cubren modelos rotados y escalados, el barrido completo de las aspas y la separación de los recorridos de habitantes respecto de los edificios reales del plan.

## Partidas y economía

Los poblados siguen siendo ambientación separada de las aldeas de jugadores. No crean cuentas, inventario, créditos, premios, producción ni comercio. Sus habitantes no aumentan los conteos de jugadores reales.

Las 81 casillas económicas, las partidas, los inventarios, los escudos y Cloudflare Access conservan sus datos y reglas. La gestión sigue correspondiendo a la parcela del perfil propio. La economía por continentes, los recursos exclusivos y los viajes para conseguirlos pertenecen a una versión posterior.

Consulta [MUNDO-CONTINUO.md](MUNDO-CONTINUO.md) para la navegación y [MUNDO-PLANETARIO.md](MUNDO-PLANETARIO.md) para la proyección del planeta.

El relieve natural se conserva dentro de las localidades. Solo los cimientos de cada estructura se aplanan, con transiciones suaves; las calles siguen las pendientes y los puentes dejan pasar el agua. La selección de una ciudad también contempla las alturas reales de sus barrios y cubiertas.
