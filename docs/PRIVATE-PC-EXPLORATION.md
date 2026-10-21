> Informe histórico redactado. Dominios, correos y rutas son ejemplos; los artefactos privados de `work/` no se distribuyen. Para un despliegue nuevo usar [Operación](architecture/OPERATIONS.md).

# Exploración del mundo en el servidor privado

La ampliación posterior de viajes y colisiones se documenta por separado en [PRIVATE-PC-WORLD-TRAVEL.md](PRIVATE-PC-WORLD-TRAVEL.md). Las evidencias y los límites siguientes corresponden a la primera entrega regional.

Actualización del 17 de octubre de 2026, hora de Costa Rica. La exploración y el ajuste de sus acciones rápidas están activados exclusivamente en el servidor privado de la PC. Este documento distingue la implementación y las pruebas aisladas de la revisión integrada. **El circuito principal de viajes, el regreso exacto a casa y la conservación de las partidas quedaron comprobados.** Siguen pendientes los escenarios específicos indicados más abajo, el teléfono físico y las mediciones de FPS. No acredita una publicación en el dominio anterior.

## Alcance de esta primera versión

Recorrer permite salir de la aldea con el mismo personaje, caminar por terreno transitable y seguir una ruta terrestre autorizada por el servidor. Las tres cámaras continúan disponibles: aérea, primera persona y tercera persona. La aldea, sus construcciones, sus recursos y los trabajos previamente autorizados permanecen en su lugar; no se traslada una copia de la aldea hasta cada destino.

Las rutas regionales habilitadas corresponden a **Costa Ámbar** (`npc-costa-ambar`) y **Las Brumas** (`npc-las-brumas`). El directorio reúne **45 destinos únicos** del catálogo visible existente: estos dos destinos y otros 43 que muestran la razón de su bloqueo. Que un lugar aparezca en el directorio no demuestra que exista un camino transitable hasta él. Incluso una ruta regional puede rechazarse si no se encuentra un recorrido seguro desde la posición actual dentro del presupuesto de búsqueda.

El movimiento manual puede explorar terreno transitable fuera de ese corredor; debe respetar el agua, los edificios, las pendientes y los límites geográficos del mundo. Esta versión no habilita rutas marítimas, viajes a otros continentes, teletransporte ni una nueva economía en los destinos. La interacción exterior muestra información del lugar cercano; no concede acceso remoto a los talleres, almacenes o construcciones de la aldea.

## Entrar, caminar y volver

El entorno privado utiliza [qfrontier.example.invalid](https://qfrontier.example.invalid/). Las condiciones de acceso y los controles del servidor están documentados en [PRIVATE-PC-SERVER.md](PRIVATE-PC-SERVER.md). Abrir **Recorrer** y utilizar **Salir de la aldea**. El panel presenta las coordenadas globales del personaje y los destinos disponibles.

| Control | Comportamiento |
| --- | --- |
| Flechas o WASD | Solicitan pasos cortos respecto de la orientación de la cámara. La diagonal conserva el límite de velocidad. |
| Joystick | Solicita el mismo desplazamiento desde móvil. Soltarlo cancela la intención de seguir caminando. |
| Mouse arrastrado o control táctil Mirar | Gira primera o tercera persona sin cambiar la posición del personaje. |
| Suelo en cámara aérea | Solicita un paso hasta las coordenadas seleccionadas; el servidor comprueba distancia y acceso. |
| Trazar ruta y caminar | Solicita un camino terrestre regional hasta el destino. La línea y el movimiento sólo aparecen tras su confirmación. |
| Detenerme | Guarda la posición alcanzada de la ruta confirmada y permite volver al control manual. |
| Volver a casa | Solicita un camino hasta la posición doméstica guardada al salir. La aldea no se recupera mediante un salto instantáneo. |
| E o Interactuar | Abre información de un destino a un máximo de 12 unidades, sin operación económica. |
| Centrar a mi personaje | Recupera el encuadre del avatar sin cambiar sus coordenadas. |
| Ampliar / Salir | Usa pantalla completa nativa o la alternativa inmersiva existente. |

Hay que terminar o detener una ruta antes de iniciar pasos manuales o trazar otra. El regreso también puede rechazarse si no existe un recorrido terrestre seguro dentro del alcance admitido. La edición y las nuevas acciones domésticas requieren regresar a la aldea. Los habitantes con turnos ya aprobados mantienen sus propios horarios; salir no autoriza turnos nuevos ni modifica su economía.

La escena conserva los modos 2D/3D de la cámara aérea y las tres cámaras al recibir actualizaciones de estado; no necesita crear otro visor para cambiar de cámara o ampliar la pantalla. Los detalles de foco, cancelación de controles y compatibilidad de pantalla completa se mantienen en [PRIVATE-PC-CAMERAS.md](PRIVATE-PC-CAMERAS.md).

## Distancias y tiempo

Las distancias se expresan en **unidades del juego**. La velocidad de una ruta confirmada es **3,5 unidades por segundo**; no representa kilómetros ni kilómetros por hora. Cada solicitud manual admite hasta 8 unidades. Una ruta regional tiene un máximo de 1.800 unidades, 256 puntos y una búsqueda limitada a 18.000 nodos por intento, con hasta dos intentos de llegada en la orden de viaje.

El tiempo del directorio es una estimación inicial a partir de la distancia directa. La ruta calculada puede rodear obstáculos y resultar más larga. Después de confirmarla, la cuenta atrás utiliza los tiempos de inicio y fin asignados por el servidor a ese recorrido real. La latencia, la sincronización y la espera entre solicitudes manuales no conceden movimiento adicional; la cámara nunca inventa una posición para compensarlos.

## Representación del mundo y calidad

El avatar utiliza coordenadas globales fuera de casa. La posición y los puntos de una ruta se convierten al origen gráfico vigente; los edificios, caminos y trabajadores domésticos siguen anclados a la parcela original. Los otros exploradores públicos se representan en sus posiciones globales confirmadas, sin exponer su posición doméstica privada guardada para el regreso.

La altura se obtiene del mismo renderer que dibuja el terreno, incluidas las parcelas y plataformas vecinas. Los puentes y las comprobaciones de suelo comparten los datos puros de navegación del servidor. Los edificios sólidos de las ciudades también limitan la cámara de tercera persona. Los árboles procedurales que dependen de la calidad siguen siendo decorativos: no se agregan barreras invisibles exclusivas del modo Rendimiento.

Primera y tercera persona rebajan el origen gráfico al superar **96 unidades** de distancia local, alineándolo a sectores gráficos de **64 unidades**. El umbral es una distancia, no 96 sectores. Esto mantiene pequeñas las coordenadas enviadas a la GPU durante el recorrido; no cambia las coordenadas persistentes ni teletransporta al personaje. El terreno se carga por sectores alrededor de la cámara y los detalles lejanos quedan detrás de la niebla.

Las tres cámaras y la ampliación de **Recorrer** comparten un solo renderer y contexto WebGL. Esta afirmación se limita a ese visor, no a todos los visores históricos del juego. Se conservan las calidades y la suspensión por visibilidad existentes. No se ha medido todavía una tasa de FPS para esta actualización.

La PC sirve el código y el estado del juego; **cada navegador dibuja los gráficos con su propio equipo**. La GPU del servidor de pruebas no renderiza ni transmite las imágenes de los teléfonos o de las otras PCs. Esta actualización no necesita convertir el servidor en un servicio de vídeo remoto.

## Autoridad, seguridad y partidas

- La salida añade un campo opcional de exploración a la partida. Las partidas que no lo tienen conservan su comportamiento doméstico anterior.
- El servidor valida identidad, permisos, puntos, distancias, pendientes, agua y obstáculos; asigna la ruta y sus tiempos. La cámara y el cliente presentan ese estado y envían intenciones.
- Las posiciones domésticas y globales tienen contextos distintos. Mientras el jugador está fuera, las órdenes domésticas nuevas quedan bloqueadas; no se fabrican recursos ni se construye a distancia mediante una coordenada global.
- La entrada privada conserva Cloudflare Access, la verificación de JWT y las comprobaciones de origen. No se introducen tokens en capturas, documentación o registros de prueba.
- Este cambio se prepara exclusivamente para el servidor privado de la PC. El dominio [qfrontier-preview.example.invalid](https://qfrontier-preview.example.invalid/) conserva su release, configuración y partidas independientes.
- La activación debe partir de un respaldo coherente y comparar otro respaldo posterior. El auditor de exploración permite únicamente los cambios de navegación observados y sus recibos; inventarios, lotes, materiales almacenados, edificios, trabajos, identidad y progresión deben conservarse.

## Evidencia aislada disponible

La copia activa, leída desde `work/private-pc/active-runtime.json`, es `work/private-pc/runtime/2026-10-18T01-48-28-933Z-95170249`: 107 archivos, build SHA-256 `1efa74c8c51f76b8af1bd51039f6b2f039f58651bbfb9b8576764bb138a8afb3`. El gate previo a esa activación, `work/private-pc/exploration-20261017/release-gate-1792287968156.json`, aprobó las doce comprobaciones de fuentes, compilación completa, autenticación, factoría original, perfil privado y conservación de las versiones anteriores. El ajuste habilita exactamente las órdenes rápidas documentadas de perfil, caminata y exploración; conserva el flujo de cotización firmada y comprobantes.

El informe `work/private-pc/exploration-20261017/release-save-preservation.json` acredita conservación exacta de la revisión 417 a través de la primera activación de exploración. Es evidencia de instalación; no sustituye el informe de cierre después de recorrer el mundo. El procedimiento para diferenciar instalación exacta de QA con navegación permitida está en [PRIVATE-PC-EXPLORATION-RELEASE.md](PRIVATE-PC-EXPLORATION-RELEASE.md).

La verificación focal de gráficos pasó **47 de 47 pruebas**, incluidas nueve nuevas de exploración. Comprueba, entre otros puntos, que existe un solo avatar, que la casa no sigue al viajero, que se utiliza la ruta confirmada, que el regreso recupera coordenadas locales, que la entrada exterior es global y que los exploradores públicos no aparecen en su aldea de origen. El lint de los cinco archivos gráficos y de interfaz revisados terminó sin errores ni advertencias. Estas comprobaciones no sustituyen la revisión visual en navegador.

El informe `work/exploration-route-benchmark-1792287441817.json` se ejecutó **fuera de la base viva**, sobre una copia en memoria del respaldo de revisión **417**, con cuatro perfiles originales. Registra cero escrituras a bases, cero conexiones remotas y conservación exacta de los campos originales del mundo en los cuatro casos. El respaldo fuente tiene SHA-256 del estado `1dfb921cf8a7b0e48f08e5cb9f4c56a44ed99362654f8bee4d363431f2fdffc7`.

| Origen de la simulación | Destino | Cálculo de ida / regreso | Duración programada de ida / regreso |
| --- | --- | --- | --- |
| Inicio limpio | Las Brumas | 400 / 406 ms | 81,341 / 79,315 s |
| Inicio limpio | Costa Ámbar | 1.052 / 1.353 ms | 151,725 / 150,277 s |
| Posición del respaldo actual | Las Brumas | 397 / 412 ms | 86,986 / 84,651 s |
| Posición del respaldo actual | Costa Ámbar | 1.052 / 1.420 ms | 157,370 / 155,613 s |

Todos los segmentos de ida y regreso pasaron la validación. El tiempo de cálculo es tiempo de pared medido por el script local; la duración programada deriva de la longitud de la ruta y de sus marcas de tiempo, no de haber esperado y observado el viaje en el navegador. No es una prueba de concurrencia ni demuestra capacidad para miles o millones de jugadores.

## QA integrada observada y pendientes

La suite completa de esta entrega pasó **936/936 pruebas**, registrada en `work/private-pc/exploration-20261017/test-1792288416013.json`. Las comprobaciones de navegador siguientes son un circuito completo observado: **casa → Costa Ámbar → Las Brumas → casa**. No se presentan como dos viajes de ida y vuelta independientes.

Se observó la llegada viva a Costa Ámbar en `(-408; -312)`, un paso manual de joystick hasta `(-408,5; -312,1)` y la llegada a Las Brumas en `(-216; 168)`. En otro tramo del mismo recorrido se utilizó Detenerme en `(-28,6; -12,1)` y la posición se conservó al recargar. El regreso terminó en el punto doméstico original exacto `(14.868110992582297; 1.2649084248202964)`, verificado en el respaldo final sin redondear sus valores.

- [x] Salir de la aldea y recorrer terreno real fuera de su perímetro.
- [x] Cambiar entre aérea, primera y tercera persona en la salida y durante el trayecto; utilizar mouse para mirar y pantalla completa de escritorio a 1920 px.
- [x] Llegar a Costa Ámbar, mover el personaje manualmente con joystick y continuar hasta Las Brumas mediante rutas confirmadas.
- [x] Detener una ruta, recargar y conservar la posición exterior alcanzada.
- [x] Usar el botón Interactuar en un destino: el aviso observado es informativo, sin una operación económica disponible. Se verificó ese botón, que comparte la acción con E; no se acredita una pulsación física de esa tecla en esta sesión.
- [x] Revisar escritorio, anchos móviles de 320 y 390 px y orientación 844 × 390, sin desbordamiento horizontal; realizar un paso real con el joystick móvil emulado. La revisión no registró errores de consola.
- [x] Cerrar la QA con respaldos coherentes e inspector de regreso: punto doméstico exacto, sin bloques opcionales de exploración ni movimiento local pendientes.
- [x] Repetir las comprobaciones de aislamiento después de activar esta entrega: ocho verificaciones aprobadas, incluidos rechazo anónimo, identidad inventada, JWT inválido, disponibilidad del túnel y conservación del dominio anterior.
- [ ] Revisar de forma dedicada el anclaje de la casa y sus trabajadores al cruzar varios sectores, así como el encuadre y el suelo en todos los límites de carga en primera y tercera persona.
- [ ] Completar una comprobación dirigida del puente propio, pasos de río, colisiones decorativas y de edificios, mar, pendientes y coordenadas rechazadas. Las pruebas aisladas no sustituyen esa revisión visual.
- [ ] Verificar plataformas y construcciones de un vecino y, con dos sesiones autorizadas, observar a otro explorador en su posición exterior.
- [ ] Probar de forma dirigida que un destino bloqueado muestra el motivo y no permite enviar un viaje.
- [x] Cerrar la comparación de inventarios, materiales almacenados, edificios, trabajos, identidades y entradas de progresión con el auditor; los otros tres perfiles conservan también su navegación exacta.
- [ ] Comprobar de forma dirigida en navegador que las nuevas órdenes domésticas se bloquean fuera y los turnos anteriores siguen sin duplicar cargas ni producción.
- [ ] Revisar específicamente pausa de pestaña, suspensión de controles y sincronizaciones durante el recorrido sin generar movimiento adicional.
- [ ] En teléfono físico: joystick y Mirar con dos dedos, cancelación del toque, orientación y pantalla completa nativa o inmersiva.
- [ ] Medir FPS, consumo y rendimiento sostenido en dispositivos reales. No se presenta una capacidad de concurrencia medida.

Capturas observadas en `work/private-pc/exploration-20261017/`: `qfrontier-exploration-costa-ambar-third.png`, `qfrontier-exploration-costa-ambar-first.png`, `qfrontier-exploration-mobile-city.png` y `qfrontier-exploration-las-brumas.png`. La prueba móvil usa el navegador integrado y entrada Pointer; no acredita multitáctil físico.

## Cierre de partidas y aislamiento

`work/private-pc/exploration-20261017/final-checkpoint.json` terminó con **`allPassed: true`**. Compara el respaldo anterior `local-auto-2026-10-18T01-48-21.728Z-fc038490.json` con el de cierre `local-auto-2026-10-18T01-57-40.858Z-db364603.json`, ambos dentro de `work/private-pc/backups`.

| Comprobación | Resultado |
| --- | --- |
| Revisión y comprobantes | Revisión 417 → 428; 211 → 218 comprobantes, siete añadidos. |
| Perfiles y recursos | Cuatro perfiles, 66 lotes, siete construcciones habitables y 28 trabajos conservados. |
| Economía y progresión | Inventarios, recursos, materiales, edificios, trabajos, identidad y entradas de XP exactos fuera de los campos de navegación permitidos. |
| Punto final | Mismos valores originales de X e Y, sin redondeo; `exploration` y `movement` ausentes. |
| Otros jugadores guardados | Los otros tres perfiles mantienen sus campos de navegación exactamente iguales. |
| Esquema y base | Mismo esquema y misma base local; auditoría sobre copias verificadas, sin base viva ni escrituras. |

El JSON final del mundo tiene SHA-256 `bbc55a69782b834108f8d19e2b0f2f0f704263978ac538647c53fa1ec26ab068`. El respaldo no es idéntico al anterior porque contiene las revisiones y comprobantes del circuito; el auditor acredita que esos cambios no alteraron la economía ni las partidas ajenas. Los hashes de los comprobantes no identifican por sí solos cada orden: `receiptAttributionVerified` continúa en `false` y la atribución se apoya en las acciones observadas en la interfaz y la red.

`work/private-pc/final-probes.json`, comprobado después de activar esta entrega, registra **ocho de ocho verificaciones aprobadas**. El dominio anterior mantiene su configuración original y sigue detrás de Access. Estos informes no convierten los escenarios todavía pendientes, la calidad en teléfonos físicos o la capacidad de concurrencia en resultados aprobados.
