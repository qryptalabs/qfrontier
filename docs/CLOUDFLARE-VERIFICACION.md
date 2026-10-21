> Informe histórico redactado. Dominios, correos y rutas son ejemplos; los artefactos privados de `work/` no se distribuyen. Para un despliegue nuevo usar [Operación](architecture/OPERATIONS.md).

# Verificación del entorno privado

Fecha: 15 de octubre de 2026, Costa Rica.

- URL: `https://qfrontier-preview.example.invalid/`.
- Worker: `qfrontier-pruebas`.
- Versión publicada: `473d03aa-c6df-4e55-909b-dc9ec563aad2`.
- D1 independiente: `qfrontier-pruebas-db`; migración inicial aplicada.
- Cloudflare Access con One-time PIN, sesión de 24 horas y política de dos correos exactos. La política se comprobó en el panel; el inicio de sesión real se probó con el primer correo autorizado.

## Resultado

- 271 pruebas automáticas aprobadas, sin fallos.
- TypeScript, build de producción y dry-run de Wrangler aprobados.
- Inicio de sesión real en el dominio de Workers verificado.
- Escena 3D cargada con paisaje continuo, controles, vegetación, agua y edificios conservados.
- Creado el perfil de prueba `Explorador de pruebas`, estación `Refugio del Alba`.
- Prospección cotizada por el servidor, confirmada y completada.
- Tras recargar, el perfil y la prospección registrada seguían disponibles desde D1.

La base comenzó sin las partidas de Sites. La actualización conserva los perfiles y el progreso de esta prueba; no se reinició la base. Antes del despliegue se exportó una copia de D1 a un archivo local excluido del paquete. Los créditos y pagos siguen siendo simulados.

## Parcelas, atlas y protección inicial

- Las aldeas existentes recibieron parcelas permanentes distintas: `Refugio del Alba`, X: 0, Y: 0; `killer_instinct`, X: 48, Y: 0. No se crearon jugadores ficticios para el atlas.
- La búsqueda de `KiLlEr` localizó la aldea real; su ficha muestra los siete niveles públicos de edificios y no ofrece gestión ajena.
- El localizador X/Y encontró la aldea de X: 48, Y: 0. La navegación visual ahora acepta los límites del planeta; las operaciones económicas conservan sus 81 sectores.
- «Copiar ubicación» produjo un enlace regional que abrió la misma aldea seleccionada en otra pestaña autenticada.
- El contador del escudo conserva el vencimiento del primer perfil de la cuenta. La activación PvP y la exposición de convoyes aparecen deshabilitadas durante el plazo; los convoyes protegidos siguen disponibles.
- Las pruebas automáticas cubren 800 parcelas sin superposición, asignación concurrente, normalización sin pérdida de progreso, privacidad del resumen público, límite exacto de 72 horas, segundo perfil y bloqueo de ataques en ambas direcciones.
- La anulación y devolución de disputas heredadas bajo protección se comprueba como operación idempotente. El entrenamiento NPC permanece permitido.

## Planeta 3D y diez escalas

- «Mundo» abre el planeta ficticio con continentes, océanos, nubes y atmósfera procedurales, estrellas, sol y planetas decorativos. No requiere servicios de mapas externos.
- Las diez escalas se seleccionaron en el navegador: cada botón activa su nivel de 1 a 10 sin errores de consola.
- «Mi posición» inició un vuelo desde órbita y llegó a `Refugio del Alba`, X: 0, Y: 0, en la escala 10. La escena detallada conserva edificios, vegetación, río y efectos.
- `killer_instinct`, X: 48, Y: 0, se consultó en la escala 10 con sus siete niveles públicos y sin gestión de bienes ajenos.
- `Puente del Alba`, con alias ficticio `MateoRuta`, mantiene X: 312, Y: −168 y muestra una aldea ambiental en construcción. Los alias están separados de las cuentas y no se muestran etiquetas técnicas NPC en el atlas.
- El localizador conserva las coordenadas observadas. Los puntos vacíos ahora descienden a su propio terreno geográfico, sin fabricar una aldea de jugador.
- Se verificó el cambio de calidad a Full HD. La descarga real `QFrontier-world-3840x2160` produjo un PNG de 3840 × 2160, comprobado en su cabecera.
- «Estación» mantiene el perfil y el vencimiento del escudo tras salir del planeta. La actualización no modifica archivos del motor económico, parcelas, esquemas, migraciones ni autenticación.
- Ocho pruebas nuevas cubren la proyección y alias; cinco cubren geografía, alineación de textura, geometría, animación y liberación de recursos. No se afirma una tasa de cuadros en equipos físicos.

## Mundo continuo y catálogo ampliado

- Globo y suelo comparten el campo geográfico. Se renderizan ocho biomas y zonas continuas de 64 × 64 unidades con carga cercana, liberación de zonas lejanas y origen local de cámara.
- El catálogo contiene 30 aldeas y cinco ciudades de ambientación, además de cuatro cuevas y cuatro hitos naturales. No se crean cuentas ficticias ni actividad económica simulada para poblar el directorio.
- Reino del Hielo se verificó en X: 10176, Y: −13248, con suelo nevado, iglús, pinos nevados, fauna y sombras. Al desplazarse hacia el este apareció terreno glacial en X: 10240, Y: −13248, sin repetir la aldea propia.
- Ciudad de los Areneros se verificó en X: 29184, Y: 5184, con edificios de adobe, arena, murallas y mercado. Ciudad del Sol se verificó en X: 25152, Y: 4032, con vegetación tropical y arquitectura diferente.
- La niebla empieza detrás del foco de cámara; las nubes se desvanecen antes de las vistas cercanas para dejar visibles los edificios.
- La descarga real de la nueva escena tropical produjo un PNG de 3840 × 2160; dimensiones verificadas en la cabecera del archivo.
- «Mi posición» volvió desde Ciudad del Sol a Refugio del Alba, X: 0, Y: 0, en escala 10 con su escena detallada. «Estación» conservó 114 unidades, 16 lotes, 14 tipos, los tres hitos y el vencimiento del escudo del 18-oct a las 00:11 de Costa Rica.
- En las vistas comprobadas no aparecieron errores de consola. Las capturas del Reino del Hielo y Ciudad del Sol se guardaron como evidencia local; no se afirma una tasa de cuadros para dispositivos físicos.
- Veinte pruebas adicionales cubren inversión geográfica, límites planetarios, continuidad, biomas, catálogo, geometría finita, modelos y liberación de recursos. Esta ampliación llevó la suite a 179 pruebas; la entrega de la Ruta del Ámbar añade las verificaciones descritas abajo.
- Los 16 archivos del motor, persistencia, autenticación y configuración de Workers conservan exactamente sus hashes respecto al paquete previo. No se aplicaron migraciones ni se reinició D1.
- Una economía continental, recursos exclusivos y viajes económicos entre continentes quedan para una versión posterior; recorrer la cámara no concede recursos ni altera el explorador.

## La Ruta del Ámbar y cámaras aéreas

- Costa Ámbar mantiene X: −408, Y: −312 y contiene 86 estructuras en varios fragmentos del terreno; Las Brumas mantiene X: −216, Y: 168 y contiene 16. No se modificó el catálogo de 30 aldeas y cinco ciudades.
- La zona define 40 habitantes urbanos y 12 aldeanos, seis roles, tres molinos con rotor independiente y dos carretas con ruedas animadas. Su cantidad visible depende del acercamiento y la calidad.
- Siete pruebas de zona cubren las coordenadas, tamaños, carretera, ausencia de intersecciones de habitantes con estructuras, actividad, exclusión de parcelas reales y liberación de recursos. Cinco pruebas comprueban personajes, herramientas, molinos y carretas.
- Cinco pruebas de cámara cubren la escala equivalente de 2D/3D, los límites, la cobertura de terreno visible con niebla, la retención de habitantes cuando cambian de barrio y la eliminación de inercia al cambiar de proyección. La suite completa tiene 196 pruebas aprobadas.
- En navegador se verificó Costa Ámbar en vista cenital 2D y perspectiva 3D. Cambiar entre ambas y ajustar la inclinación a 30° y 75° conservó exactamente X: −408, Y: −312.
- La llegada a la ciudad utiliza una vista amplia y la llegada a la aldea una vista cercana. Seleccionar un destino muestra el mapa para acompañar el vuelo.
- Las Brumas se comprobó en escalas 8 y 9, con cercas, cultivos, habitantes articulados, cargas y carreta. «Pausar animaciones» produjo dos capturas idénticas separadas en el tiempo, sin reiniciar las posiciones; la reanudación y el vuelo a la aldea propia siguieron funcionando.
- La descarga de Costa Ámbar en perspectiva produjo un PNG real de 3840 × 2160. Se inspeccionó la imagen y se comprobó su cabecera; no quedaron bordes de carga visibles en esa captura.
- «Mi posición» regresó desde la zona nueva a Refugio del Alba, X: 0, Y: 0. «Estación» mantuvo 114 unidades, 16 lotes, 14 tipos y el vencimiento original del escudo. No se observaron errores de consola en estas vistas.
- La copia previa de D1 de esta entrega permanece en un archivo local excluido del paquete. Los 16 archivos del motor, persistencia, autenticación y configuración conservan los hashes del paquete anterior.

## Poblados habitados en todos los biomas

Esta ampliación extiende la ambientación a las otras 33 localidades del catálogo: 29 aldeas y cuatro ciudades. Costa Ámbar y Las Brumas conservan La Ruta del Ámbar. Se mantienen las 30 aldeas y cinco ciudades, sus identificadores, nombres, alias, coordenadas, biomas, niveles y etapas de construcción.

- Los nuevos planes contienen 723 estructuras, 514 rutinas de habitantes y 33 transportes locales. Cada ciudad nueva define 70 estructuras y 42 habitantes; las aldeas definen entre 12 y 18 estructuras según su desarrollo. Son presupuestos ambientales, no cantidades de jugadores conectados ni de modelos visibles simultáneamente.
- `inhabited-world-data.ts` define las localidades, perfiles climáticos, calles, accesos, trabajos y transportes. Un índice por fragmentos de 64 × 64 limita las consultas de terreno y ocupación a los elementos cercanos. Las 29 conexiones regionales se calcularon previamente; el navegador no ejecuta búsqueda de caminos al importar el módulo.
- Las conexiones regionales se comprobaron contra la geografía fija cada 16 unidades, después de ajustar sus extremos a las entradas. Evitan océanos y permiten cruces fluviales. Una conexión costera contiene un desvío terrestre. No se trazan carreteras artificiales hasta las comunidades polares o islas aisladas.
- La comprobación de puentes separa el lecho del río de la altura de la plataforma: conserva el fondo fluvial y exige una plataforma al menos 0,45 unidades por encima del agua, incluso tras cuantizar el terreno. La protección de costas conserva el agua fuera de los cimientos. El relieve natural sigue atravesando las localidades: cada estructura dispone de una base plana con transición suave, sin aplanar toda la ciudad. Las conexiones terrestres limitan la corrección de altura para evitar terraplenes artificiales.
- `biome-settlement-models.ts` aporta arquitectura para los siete biomas con asentamientos, plantillas compartidas, niveles, variantes y aspas independientes. `living-actors.ts` añade vestimenta climática, trineos glaciales y camellos con carga; los transportes de las calles costeras siguen siendo terrestres.
- `inhabited-world.ts` compone edificios, obras, cercas, muros, calles, trabajadores y transportes por fragmento. Los habitantes conservan un único fragmento propietario; el sistema retiene los fragmentos cercanos de su localidad para evitar copias o desapariciones al cambiar de barrio. El detalle visible se reduce según calidad y acercamiento.
- Las rutinas de los habitantes utilizan las calles y terminan junto a cultivos, mercados o frentes de trabajo. Los recorridos se comprueban frente a las huellas del plan y a la geometría real rotada y escalada, incluido el barrido completo de las aspas. La pausa utiliza el mismo tiempo visual y conserva posiciones y poses.
- Se añadieron 29 pruebas en tres archivos: diez de datos y rutas, siete de arquitectura y actividad climática, y doce de composición e integración. Las 225 pruebas de la suite completa, TypeScript, la compilación de producción y el dry-run de Wrangler se aprobaron. Las regresiones finales miden la geometría real de mesas y puentes, además de los pies de un habitante al cruzar el agua.
- Las pruebas de prioridad cubren la exclusión de elementos ambientales dentro de una parcela real y la conservación de los cimientos detallados del jugador, incluso si una ciudad ambiental ocupa las mismas coordenadas. También verifican la liberación de recursos locales sin destruir plantillas compartidas y la ausencia de trabajo visual en fragmentos ajenos a los poblados.

El alcance de esta ampliación es gráfico. No incorpora cuentas ficticias, producción, inventarios, recompensas, comercio ni viajes económicos. Los 16 archivos de economía, persistencia, autenticación y configuración de Workers conservan sus hashes respecto al paquete anterior. La copia de respaldo previa permanece local y excluida del paquete; no se aplicaron migraciones ni se reinició D1.

Comprobaciones de navegador de esta ampliación:

- Se visitaron Puerto Aurora, Ciudad del Sol, Reino del Hielo y Ciudad de los Areneros, además de Refugio de las Águilas, Puerto del Sauce y Pradera Serena. Las fichas conservaron coordenadas, etapas y actividad climática. Pradera Serena mostró sus obras y las ciudades nuevas sus 70 estructuras planificadas.
- La revisión en 4K detectó y corrigió cortes del terreno junto a ríos y límites urbanos. La versión final conserva laderas y valles, cimientos planos por estructura y plataformas sobre el agua. Se volvió a inspeccionar Ciudad de los Areneros y Reino del Hielo después de publicarla.
- El cambio entre 2D y 3D en el Reino del Hielo conservó X: 10176, Y: −13248. La pausa estable en Pradera Serena produjo dos capturas idénticas; se reanudaron las animaciones sin reiniciar las poses.
- La descarga final del desierto produjo un PNG de 3840 × 2160, comprobado por cabecera e inspección visual. Se guardaron capturas de la interfaz publicada como evidencia local.
- «Mi posición» regresó a Refugio del Alba, X: 0, Y: 0, escala 10. La estación conservó 114 unidades, 16 lotes, 14 tipos y el vencimiento original del escudo del 18-oct a las 00:11 de Costa Rica.
- No se observaron errores de consola en las vistas revisadas. Las medidas del navegador remoto no se presentan como rendimiento garantizado de equipos físicos.

La versión final de esta entrega es la indicada al principio del documento. Las versiones y comprobaciones de las secciones previas describen el historial del entorno.

## Comunidad pesquera y transporte de pescado

La ampliación incorpora Bahía del Viento (X: 1080, Y: 6740), sus muelles (X: 1152, Y: 6723) y Ciudad del Estuario (X: 900, Y: 6784). El catálogo previo conserva sus 35 localidades; las dos nuevas llevan el directorio a 31 aldeas y seis ciudades de ambientación.

- La comunidad tiene diez edificios y la ciudad receptora 34. Dos barcos con dos tripulantes cada uno conectan amarres y caladeros sobre agua real. Seis trabajadores y dos carretas tiradas por caballos conectan descarga, área de espera y almacén urbano.
- Cada ciclo dura 540 segundos, con un desfase de 270 segundos entre barcos. Cada captura mantiene seis identificadores de caja que pasan por barco, manos, muelle, carreta y depósito. La composición muestra las cajas correspondientes a cada etapa; las reservas ambientales no escriben en inventarios reales.
- Las pasarelas articuladas siguen la cubierta y el oleaje, y se pliegan antes de zarpar. El camino de tierra termina en la costa; los tablones continúan sobre el agua. La revisión visual detectó y corrigió losas de arena que tapaban parte del muelle. Una regresión con rayos contra las superficies verifica que la madera queda expuesta.
- Barcos, trabajadores y transportes usan posiciones y tiempos del mundo, independientemente de la duración de los fragmentos del terreno. El agua tiene datos y transformaciones de textura propios. Un campo pequeño de oleaje compartido mueve superficie y barcos; se añaden estelas y gaviotas. No se incorporan cambios meteorológicos regionales.
- La sección «De la bahía al mercado» permite visitar los tres destinos y seguir cualquiera de los dos barcos o carretas. El indicador muestra actividad y carga. «Explorar libremente», desplazar el mapa o volar a otro destino termina el seguimiento.
- Se añadieron 28 pruebas de datos, geometría real, rutas, modelos, carga, pasarelas, agua y recursos compartidos. La suite completa de 253 pruebas, TypeScript, compilación de producción y dry-run de Wrangler pasan.
- Se guardó una copia previa de D1 en un archivo local excluido del paquete. Los 16 archivos de economía, persistencia, autenticación y configuración conservan sus hashes. No se ejecutaron migraciones ni se reinició la base.

La guía [COMUNIDAD-PESQUERA.md](COMUNIDAD-PESQUERA.md) describe los recorridos, modelos y límites de esta cadena ambiental.

Comprobaciones de navegador de esta entrega:

- Se verificaron el muelle, la comunidad y Ciudad del Estuario. La versión final muestra tablones completos, entrada de madera y mar con textura fina independiente del suelo.
- Se siguió Brisa del Alba en el caladero, pescando, y durante su regreso con seis cajas. El seguimiento de Carro de Lucía mostró la carga y el regreso vacío por el camino; el indicador deja de seguir al elegir otro destino.
- Alternar entre 2D y 3D durante la pausa conservó X: 1105, Y: 6727. Dos capturas de la escena pausada tienen píxeles RGB idénticos; se reanudó sin reiniciar el ciclo del mundo.
- La descarga real de la escena de navegación produjo un PNG de 3840 × 2160, comprobado por dimensiones e inspección visual. No se observaron errores de consola en las vistas revisadas.
- «Mi posición» regresó a Refugio del Alba, X: 0, Y: 0, escala 10. Tras la publicación y recarga seguían presentes las 114 unidades, 16 lotes, 14 tipos y el vencimiento del escudo del 18-oct a las 00:11 de Costa Rica.

## Red pesquera en varios biomas

Cuatro comunidades nuevas amplían la red a cinco puertos y cinco ciudades receptoras. Bahía del Viento conserva sus coordenadas, nombres, identificadores, turnos y cargas originales. Las 35 localidades anteriores también permanecen. El directorio general contiene ahora 35 aldeas y diez ciudades ambientales.

| Puerto nuevo | Bioma | Muelle X / Y | Ciudad receptora |
| --- | --- | --- | --- |
| Puerto de los Cedros | Bosque templado | −14400 / 11520 | Ciudad del Sauce |
| Bahía del Ámbar | Desierto | −16472 / 4608 | Ciudad de las Salinas |
| Puerto del Mangle | Bosque tropical | 28608 / −1536 | Ciudad de las Mareas |
| Puerto de la Aurora | Región glacial | −25920 / −12480 | Ciudad del Deshielo |

- Los planes reúnen 220 estructuras, diez barcos, diez transportes con animal y conductor, treinta trabajadores de muelle o almacén y veinte tripulantes. Son cantidades del paisaje; no representan jugadores ni producción económica de sus cuentas.
- La selección de costas se realizó fuera del navegador. Los sitios se conservan como coordenadas fijas. Las pruebas muestrean las huellas de edificios y calles sobre terreno seco, el casco completo sobre agua navegable y el barrido de la red. Exigen al menos 0,7 unidades de profundidad; los barcos glaciales utilizan mar abierto por debajo del casquete permanente de 77°.
- Una revisión de alturas movió el puerto del desierto 40 unidades hacia la costa. Las rutas de carretas y los accesos se muestrean cada 0,5 unidades y mantienen pendientes inferiores al 15 %. No se modificó el campo geográfico ni se pavimentó sobre el océano.
- Cada comunidad gira como una unidad: edificios, muelle, pasarelas, staging, rutas y almacén comparten la misma transformación, sin cambiar escala. Nombres de flotas, carreteros, trabajadores y cajas son propios de cada comunidad. Sus jornadas usan desfases distintos sobre el tiempo del mundo.
- La biblioteca gráfica conserva la costa y aporta viviendas, almacenes, ropa y accesorios específicos para bosque, desierto, trópico y hielo. Las carretas del bosque y del hielo utilizan bueyes. Las demás utilizan caballos. Las huellas reales de los 220 edificios y las aspas se revisaron sin encontrar solapamientos; se ajustó un accesorio de la cocina del desierto al espacio declarado.
- «Puertos de Frontera» permite volar a cada muelle por nombre, bioma y coordenadas. El detalle activo muestra su propia flota y ciudad receptora; las diez localidades están integradas en marcadores, directorio, selección y enlaces del atlas. El seguimiento admite cualquier actividad de la red.
- El gestor crea la geometría del puerto cercano o seguido y libera completamente los puertos lejanos. Las pruebas cubren cambio de origen, rotación, seguimiento, pausa, carga, prioridad de parcelas reales y liberación de recursos. Se añadieron 18 pruebas; pasan las 271 de la suite completa, TypeScript, compilación y dry-run de Wrangler.
- La copia de D1 anterior a esta actualización conserva la revisión 16 y el avance reciente de Explorador de pruebas: 123 unidades, 19 lotes y 14 tipos. El respaldo permanece fuera del paquete. Los 16 archivos protegidos de economía, persistencia, autenticación y configuración conservan sus hashes; no hay migraciones ni reinicio de datos.

La pesca sigue siendo actividad ambiental separada de los inventarios del jugador. La guía [COMUNIDAD-PESQUERA.md](COMUNIDAD-PESQUERA.md) contiene los destinos y el funcionamiento de la red.

Comprobaciones de navegador de la red:

- Puerto de la Aurora muestra viviendas y almacenes nevados, muelle, trabajadores y su propia flota. Ciudad del Deshielo conserva su posición y sus 34 construcciones. Se siguió una carreta con buey por su camino glacial; elegir otro puerto canceló ese seguimiento.
- Bahía del Ámbar muestra la costa desértica y viviendas de adobe; su flota conserva nombres y carga propios. Puerto del Mangle muestra costa tropical, palmeras y su directorio activo, con distintas tareas simultáneas entre barcos y carretas.
- En Puerto del Mangle, las vistas 2D y 3D conservaron X: 28625, Y: −1464 durante la pausa.
- La descarga de la escena tropical produjo un PNG real de 3840 × 2160, verificado por dimensiones e inspección visual.
- Puerto de los Cedros mostró su muelle girado, dos barcos y transportes propios. Se comprobó la descarga de La Alondra y una entrega urbana de Carro de Bruno en el directorio; al reanudar las animaciones, la jornada se actualizó al tiempo del mundo.
- Se siguió La Alondra desde su amarre hasta mar abierto, con coordenadas que avanzaron por su ruta y sin reiniciar su identidad. No se observaron errores de consola en las regiones revisadas.
- «Mi posición» volvió a Refugio del Alba en X: 0, Y: 0, escala 10, y terminó el seguimiento. «Estación» mostró 123 unidades, 19 lotes y 14 tipos, iguales al respaldo anterior a esta entrega. El escudo mantiene su vencimiento del 18-oct a las 00:11 de Costa Rica.

## Compatibilidad del verificador

El runtime de Workers rechaza `redirect: "error"` al consultar JWKS. La consulta usa `redirect: "manual"` y rechaza respuestas no exitosas, incluidas redirecciones. Esto conserva el origen fijo de las claves y evita seguir destinos externos. La prueba de regresión cubre las respuestas 301, 302, 307 y 308. No se conservan mensajes temporales del diagnóstico ni datos de sesión en el código exportado.

El paquete incluye código fuente y compilación. No incluye credenciales, cookies, base de datos, `node_modules` ni registros locales.
