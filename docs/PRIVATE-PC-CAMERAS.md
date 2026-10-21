> Informe histórico redactado. Dominios, correos y rutas son ejemplos; los artefactos privados de `work/` no se distribuyen. Para un despliegue nuevo usar [Operación](architecture/OPERATIONS.md).

# Cámaras y controles de Recorrer

**Recorrer** dispone de tres cámaras en la aldea y en la exploración exterior. Están instaladas en el servidor privado de la PC: [QFrontier privado](https://qfrontier.example.invalid/). Las comprobaciones históricas de cámaras dentro de la aldea se conservan más abajo; la QA integrada de viajes se registra en [PRIVATE-PC-EXPLORATION.md](PRIVATE-PC-EXPLORATION.md).

Los modos de cámara comparten la misma escena y las mismas construcciones. Cambiar de cámara no cambia el personaje, su inventario, los edificios ni las partidas. Al salir de casa se reutilizan esas cámaras sobre la posición global del personaje. El directorio reúne 45 destinos, pero las dos rutas regionales habilitadas en esta primera versión son Costa Ámbar y Las Brumas; los demás destinos explican su bloqueo. El movimiento manual exterior sigue sujeto al terreno transitable. Esto no habilita rutas marítimas, teletransporte ni viajes automáticos a todos los lugares del planeta.

## Cámaras

| Modo | Uso |
| --- | --- |
| Aérea | Observar la zona actual desde arriba, caminar con flechas o joystick y conservar el selector de vista 2D/3D. |
| Primera persona | Mirar desde la posición de los ojos del personaje y desplazarse en la dirección de la cámara. |
| Tercera persona | Ver al personaje desde una cámara que lo acompaña y desplazarse respecto de la dirección de la cámara. |

**Centrar a mi personaje** recupera el encuadre del personaje. La planificación de terrenos o la colocación de una construcción devuelve la vista a la cámara aérea y suspende el desplazamiento hasta terminar la edición.

## Controles en PC

- **Flechas o WASD:** caminar. La diagonal conserva el mismo límite de velocidad.
- **Mouse en primera y tercera persona:** mantener y arrastrar para mirar alrededor.
- **E o Interactuar:** interactuar con un lugar cercano cuando el personaje puede hacerlo.
- **Mouse en aérea:** arrastrar para mover la vista y usar la rueda para acercarla o alejarla; se conservan los botones de giro y 2D/3D.
- **Pantalla completa / Salir:** ampliar la escena o volver a la página. **Esc** permite abandonar la vista ampliada.

La escena debe tener el foco para recibir las teclas. Los controles no capturan las flechas al escribir en formularios. Los botones de cámara, centrado e interacción devuelven el foco a la escena.

## Controles táctiles

El **joystick izquierdo** mueve al personaje en las tres cámaras. Tiene una zona central sin movimiento y limita el desplazamiento del mando a su círculo.

En primera y tercera persona, el control **Mirar**, situado a la derecha, permite girar la cámara. Se puede caminar con un dedo y mirar con otro. **Interactuar** realiza la acción disponible cerca del personaje; el botón de centrado recupera su encuadre. Las herramientas se distribuyen para ocupar menos espacio en pantallas pequeñas y respetar las zonas seguras del dispositivo.

Soltar el mando, cancelar el toque, cambiar de cámara, perder el foco o esconder la escena detiene la intención de caminar. Una sincronización breve con el servidor pausa la ejecución sin exigir levantar un dedo que continúa presionando el joystick. Soltarlo durante esa sincronización cancela igualmente el movimiento.

## Pantalla completa

Se utiliza la API de pantalla completa del navegador cuando está disponible. Si el navegador la rechaza o no la admite, la escena ofrece una **vista inmersiva ampliada** dentro de la página y muestra la opción **Salir**. Esta alternativa no oculta necesariamente la interfaz del navegador o del sistema operativo.

El tamaño de la escena se adapta al espacio disponible y a los cambios de orientación. No se crea otro visor WebGL al ampliar o al cambiar de cámara.

## Movimiento, partidas y calidad

Las cámaras siguen la posición confirmada del personaje, local dentro de casa y global al explorar. El servidor comprueba colisiones, suelo, agua, pendientes y alcance. Durante una ruta confirmada, el personaje sigue sus marcas de tiempo; hay que terminarla o detenerla antes de volver al desplazamiento manual. La cámara no concede permisos para atravesar obstáculos, construir a distancia ni activar los talleres domésticos desde una ciudad visitada.

Se conserva la configuración gráfica y el ciclo de visibilidad existentes. La navegación y el render se pausan cuando la escena no está visible; los controles locales no requieren un ciclo adicional de animación. El servidor privado no modifica el dominio anterior y sus partidas continúan siendo independientes de las del entorno anterior.

## Validación de la entrega original de cámaras

Los resultados de esta sección pertenecen a la entrega de cámaras `f435…`, anterior a exploración. No se presentan automáticamente como una nueva aprobación de viajes, ciudades o controles exteriores. La comprobación integrada de la actualización de exploración y los pendientes de dispositivo físico se registran por separado.

En la QA posterior de exploración se observaron los tres modos durante la salida y el recorrido exterior, giro con mouse y pantalla completa de escritorio. También se revisó la disposición de controles a 320 y 390 px y 844 × 390, con un paso confirmado de joystick. Se completó el circuito casa → Costa Ámbar → Las Brumas → casa y el inspector comprobó el regreso al punto doméstico exacto sin alterar recursos, XP ni los otros perfiles. La evidencia está en [PRIVATE-PC-EXPLORATION.md](PRIVATE-PC-EXPLORATION.md); los controles simultáneos en teléfono físico, los FPS y los escenarios específicos aún pendientes conservan sus límites de comprobación.

- Suite completa del juego: **896/896 aprobadas**. Typecheck y lint de los once archivos de implementación y pruebas cambiados: aprobados. El auditor de conservación añadido después pasó cuatro pruebas adicionales, TypeScript y lint.
- El lint general encontró **29 errores de estilo previos y 15 advertencias**. Los seis tests con errores coinciden por hash con los archivos congelados anteriores; no se limpiaron como parte de esta actualización. El lint general no se presenta como aprobado.
- Pruebas del joystick: cuatro aprobadas, incluidas zona muerta, direcciones, límite diagonal y coordenadas no válidas.
- Escritorio en el servidor privado: las tres cámaras, el giro con mouse y la entrada/salida de pantalla completa están **aprobados**. Una pulsación sostenida de flecha desplazó al personaje de `(1; 3,5)` a `(1; 6,4)` y el movimiento se detuvo ante una colisión.
- La revisión a 320 × 740 detectó un solapamiento entre joystick y herramientas con un ancho útil de 271 px. Se corrigió y comprobó sobre la compilación final: joystick de 100 × 100 px, extremo derecho en 127 px y herramientas desde 132 px, tanto en aérea como en tercera persona. A 390 × 844 se verificaron visualmente ambas zonas de control; a 844 × 390 se comprobaron sus rectángulos dentro del área ampliada.
- El joystick desplazó la posición confirmada de `(1; 6,4)` a `(1,1; 6,2)`, volvió al centro al soltarlo y no envió movimiento continuo posterior. Mirar giró la cámara sin cambiar esa posición. La edición de terreno forzó la cámara aérea al visualizar la escena y desactivó primera y tercera persona; el selector aéreo 2D/3D siguió funcionando.
- El joystick y el control Mirar se comprueban en el navegador integrado mediante eventos Pointer de la interfaz generados con mouse. La automatización de ese navegador no admite `CDP touchStart`; esta comprobación no acredita multitáctil real.
- Las capturas de pantalla completa nativa con el tamaño móvil sobrescrito en el navegador integrado presentan una superficie negra o reescalada, aunque la geometría DOM corresponde a la ventana solicitada. Esta combinación de emulación y captura no permite confirmar la presentación final de pantalla completa móvil; debe contrastarse en el dispositivo real.
- Teléfono físico: **pendientes** la pantalla completa móvil, la interacción simultánea con dos dedos, la adaptación de orientación y el rendimiento. La emulación de escritorio no demuestra el comportamiento de todos los dispositivos reales.

No utilizar pulsaciones prolongadas de teclado mediante el parámetro de duración de la automatización para repetir esta comprobación: se observó una ejecución excesiva del envoltorio de entrada. Las verificaciones pendientes deben realizarse con entrada acotada y liberación explícita de controles.

## Release original de cámaras y conservación

La compilación original de cámaras tiene 107 archivos y SHA-256 `f435813476378faf3be25f775ee0c6938d787f1de4e62aaa7e9da3832ab5dabb`. El gate `work/private-pc/camera-release-gate-1792286197640.json` confirmó que los cinco chunks del motor, API y autenticación eran idénticos al runtime anterior. Esa copia se conserva en `work/private-pc/runtime/2026-10-18T01-17-02-644Z-35af0611`; no se importó ni migró la base y no se desplegó al dominio Workers anterior.

La versión privada activa fue actualizada después con exploración y su ajuste de acciones rápidas: `work/private-pc/runtime/2026-10-18T01-48-28-933Z-95170249`, build `1efa74c8c51f76b8af1bd51039f6b2f039f58651bbfb9b8576764bb138a8afb3`. El alcance vigente, los informes de esa entrega y los viajes pendientes de verificar se encuentran en [PRIVATE-PC-EXPLORATION.md](PRIVATE-PC-EXPLORATION.md).

Los informes `work/private-pc/cameras-20261017/release-save-preservation.json` y `final-release-save-preservation.json` comprueban igualdad exacta del JSON de juego a través de ambos reinicios. `qa-walk-preservation.json` conserva los cuatro perfiles, 66 lotes, siete construcciones, progresión y 28 trabajos; permite exclusivamente posición/movimiento y cuatro recibos nuevos de las pruebas de caminar. Los recibos guardan hashes y no acreditan por sí solos el tipo de acción; la atribución se apoya también en las acciones observadas en la interfaz. Los cambios de metadata interna de workerd y de ruta de configuración se muestran aparte.

Respaldo de cierre de esa entrega: `work/private-pc/backups/local-auto-2026-10-18T01-17-31.158Z-8ed757d1.json`, revisión 293, 149 recibos, JSON SHA-256 `e3189e158a5e4edf1b815a21a2532a022de49f9bd0da04d3ba4a8b69103baae1`. Las ocho comprobaciones finales de aislamiento, túnel y conservación del dominio anterior pasaron en `work/private-pc/final-probes.json`. El navegador no registró errores de consola en la revisión final de cámaras; persistía el aviso anterior de Three.js sobre el reemplazo de PCFSoftShadowMap. Este respaldo histórico no sustituye una copia reciente de la partida actual.

Capturas en `work/private-pc/cameras-20261017/`: `qfrontier-cameras-desktop-third.png`, `qfrontier-cameras-desktop-first.png`, `qfrontier-cameras-aerial.png`, `qfrontier-cameras-desktop-final.png` y `qfrontier-cameras-mobile-third-final.png`. Los tamaños y el modo de emulación táctil del navegador se restauraron al finalizar.
