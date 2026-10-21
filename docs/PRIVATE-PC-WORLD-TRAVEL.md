> Informe histórico redactado. Dominios, correos y rutas son ejemplos; los artefactos privados de `work/` no se distribuyen. Para un despliegue nuevo usar [Operación](architecture/OPERATIONS.md).

# Viajes del mundo y colisiones

La ampliación vigente de tráfico y controles continuos se documenta en [PRIVATE-PC-TRAFFIC.md](PRIVATE-PC-TRAFFIC.md). Las versiones y comprobaciones siguientes conservan el historial de los viajes base.

Esta entrega está activa en https://qfrontier.example.invalid/. Amplía Recorrer del servidor privado de la PC y conserva su base local. El dominio Workers anterior permanece intacto. El documento anterior de exploración conserva la historia de la primera versión y no acredita esta entrega por sí solo.

## Funcionamiento

El directorio conserva los 45 lugares del catálogo existente. La red pública conecta calles, accesos, caminos, puentes y embarcaderos; los itinerarios combinan caminata, carreta y barco. El servidor asigna los puntos y los tiempos. La escena dibuja el transporte correspondiente y coloca al personaje sobre él. Las cámaras aérea, primera persona y tercera persona, pantalla completa, joystick y controles de escritorio siguen usando el mismo visor.

La velocidad es de 3,5 unidades por segundo a pie, 8 en carreta y 12 en barco. Son unidades del juego. No se acelera el reloj ni se teletransporta al personaje para que llegue antes. Se puede detener un tramo terrestre y continuar manualmente. Durante un tramo marítimo se debe esperar al próximo desembarque para detener o cambiar el itinerario: no se abandona al jugador sobre el mar. Los cambios de barco pasan por el muelle a pie.

La ruta guardada tiene un presupuesto de 1.024 puntos, 64 tramos y 32 KiB. Las rutas de la primera versión sin tramos siguen siendo compatibles. La red se prepara y comprueba fuera de la partida; las lecturas no ejecutan búsquedas de todo el planeta. Los enlaces desde la posición del personaje usan una búsqueda local limitada.

## Física y representación

La navegación comparte geometría entre servidor y cliente: cercas, muros, edificios, troncos, rocas, cuerpos de habitantes, animales y vehículos. La colisión continua evita atravesar un objeto delgado entre dos posiciones. La altura de apoyo utiliza el terreno que se dibuja, con puentes y rampas públicas. Un desnivel sin acceso no se convierte en suelo transitable por cambiar de cámara.

La cantidad y posición de los troncos sólidos cercanos se conserva entre calidades; cambia el detalle visual. Las calles y rampas despejan su corredor en la vegetación procedural. Los accesos públicos atraviesan sólo las aperturas de puerta compartidas por la malla y las colisiones. No se abren huecos en edificios privados para hacer pasar una ruta.

Los pilares, paredes y rocas de los siete puntos de interés naturales usan las mismas piezas de vóxel que los modelos existentes. Sus entradas permanecen abiertas y los elementos elevados no cierran el piso. Las pruebas comparan el hash de la geometría original: no se cambió su aspecto. Algunas envolventes de flora siguen siendo conservadoras; no son una simulación de contacto por cada triángulo.

Es una primera capa de física cinemática y navegación, no un simulador de cuerpos rígidos con destrucción, empujes o ragdolls. Los habitantes ceden de forma determinista y acotada. Un actor sin posición libre en un caso patológico puede omitirse en vez de dibujarse atravesando otro; esa resolución no constituye todavía una simulación persistente de tráfico.

Los pasos manuales rechazan también los cuerpos confirmados de otros jugadores y sus vehículos, excluyendo únicamente el identificador propio. La reserva de paso entre dos viajes automáticos simultáneos todavía no forma parte de esta entrega; no se presenta como una simulación completa de tráfico multijugador.

## Partidas y pruebas

El estado opcional de viaje conserva la versión de esquema 2 y la base local existente. No agrega cobros, recompensas, comercio remoto ni propiedades por visitar un destino. La instalación requiere copias coherentes y comparación exacta antes y después de cambiar el runtime. La sesión de QA sólo permite diferencias de navegación y comprobantes añadidos; los recursos, edificios, órdenes, identidad y progresión siguen protegidos.

`/ensayos/viajes` es un laboratorio visual privado con estado ficticio en memoria. Permite revisar barcos, carretas, cámaras y cercas sin mover una partida real ni enviar órdenes económicas. Una captura del laboratorio demuestra representación gráfica; no demuestra que se haya esperado un viaje marítimo completo guardado. La comprobación automática de las rutas y el recorrido real observado se documentan por separado.

Los gráficos se dibujan en cada navegador. La PC sirve código y partidas; su GPU no sustituye la del teléfono. Las pruebas con anchuras móviles emuladas no acreditan FPS ni multitáctil en un teléfono físico. Esta entrega tampoco demuestra capacidad para miles de usuarios concurrentes.

El tiempo de cálculo del itinerario y la duración del viaje son medidas distintas. Las comprobaciones separan el cálculo del comando, la validación geométrica fuera de la partida y los segundos programados de desplazamiento. Cotizar y confirmar son solicitudes distintas; no se debe presentar una medición de una sola solicitud como latencia completa del botón.

## Verificación final

- Suite completa: **1.010/1.010**, 137 archivos, cero fallos, omitidos o cancelados. Registro `work/private-pc/exploration-20261017/test-1792294991491.json`. TypeScript (`typecheck-1792294989472.json`) y lint de archivos modificados (`lintChanged-1792295078910.json`) aprobados; quedan cuatro advertencias previas de variables sin uso en `app/mvp-client.tsx`.
- Red pública: **45 destinos y 1.980 pares dirigidos**, 1.229 segmentos terrestres, 2.968 marítimos y 15.868 comprobaciones de cuerpo de carreta. Cero fallos. Máximo 901 puntos, 57 tramos y 29.811 bytes por itinerario público. Evidencia `work/exploration-network-validation.json`.
- Copia real de revisión **598**, cuatro perfiles: **45/45 viajes de ida y vuelta**, parada terrestre y rechazo de parada/regreso en mar; campos originales exactos. Cien proyecciones sin modificar el mundo ni buscar rutas. Evidencia final `work/exploration-world-network-benchmark-1792295085837.json`. Los 143 archivos del verificador y sus dependencias conservaron sus hashes antes y después (`work/exploration-final-source-pin-after.json`). Los tiempos se tomaron con otras comprobaciones concurrentes; no acreditan rendimiento ni cien jugadores simultáneos.
- **35 embarcaderos y 420 poses** de embarque/desembarque: pies sobre geometría real, casco amarrado y sin intersecciones con muelle/mástil. Informe `work/private-pc/exploration-20261017/boarding-graphics-final-1792292678274.json`.
- **Ocho sectores y 387 muestras** sobre geometría real: coincidencia de apoyo y altura. Informe `work/private-pc/exploration-20261017/public-graphics-final-1792292563294.json`. Los tiempos de construcción de sectores son medidas de CPU de esta PC, no FPS de móvil.
- La medición separada del comando redujo el caso de Costa Ámbar de 44,031 s de CPU a 469 ms. Valleverde registró 844 ms, Brumas 485 ms y Ciudad del Sol 140 ms. Informe `work/exploration-command-cpu-598-hotfix.json`. Se priorizaron corredores validados y se acotó la búsqueda local; las lecturas no hacen ese trabajo.

El respaldo de revisión 447 es evidencia histórica del inicio; no se restauró. La revisión 598 incorpora los avances posteriores y es la referencia de inicio de QA. La revisión 607 es la copia más reciente tomada inmediatamente antes de activar la revisión final.

## Activación y conservación

La revisión final usa `work/private-pc/runtime/2026-10-18T03-46-20-973Z-a7bcd1b7`, con 125 archivos y build SHA-256 `98c4f6ebc7b18ec58e2eae81273de20bb764c525370a36f94c44c337999ef10d`. Compilación completa `build-1792295141460.json`; aprobación de los 13 controles `release-gate-1792295155343.json`.

La copia inmediatamente anterior fue `local-auto-2026-10-18T03-46-15.542Z-c87d3a49.json` y la posterior `local-auto-2026-10-18T03-46-48.565Z-64c75804.json`. Ambas contienen revisión **607**, cuatro perfiles, 28 órdenes y 309 comprobantes. Comparación exacta aprobada: `world-travel-final-install-preservation.json`. No se importó ni restauró una base, ni se cambiaron esquema, autenticación o configuración del dominio original.

La prueba real comenzó con el estado 598 conservado y terminó en revisión **609**, con los mismos cuatro perfiles y 28 órdenes. `world-travel-final-qa-preservation.json` demuestra identidad, inventarios, edificios, XP y campos protegidos exactos; sólo cambiaron navegación y siete comprobantes añadidos. `world-travel-final-checkpoint.json` demuestra el regreso exacto a X -1.846378973873936, Y 7.078336606581198, sin viaje ni movimiento pendiente; los otros tres personajes conservaron exactamente su navegación. El respaldo final es `local-auto-2026-10-18T03-49-27.794Z-bc8cfd11.json`.

## QA en el navegador privado

Se observó un viaje guardado a Valleverde (X 168, Y 120), movimiento manual con flechas y joystick, conservación de la posición al recargar y regreso al punto original. La primera prueba descubrió un desvío de 32 minutos después de caminar unos pasos fuera del centro urbano: se corrigieron los conectores de salida de la ciudad y el acceso bidireccional. La repetición real volvió por un tramo terrestre de aproximadamente 122 segundos, incluyendo una recarga durante el trayecto. La regresión de la copia 607 está en `work/exploration-local-return-607-1792294474113.json`.

Se verificaron las tres cámaras, arrastre del mouse, pantalla completa nativa 1920×1080 y disposiciones móviles emuladas de 320×740, 390×844 y 844×390. El joystick movió el personaje de la partida; durante un itinerario automático aparece desactivado para no enviar dos órdenes de movimiento. El laboratorio mostró bloqueo de una cerca, carreta con animal y pasajero, barco con pasajero y las vistas correspondientes. Estas vistas de transporte usan estado ficticio: no se presenta como un viaje marítimo guardado que se haya esperado completo.

Una secuencia inicial de cambios de escenario del laboratorio ocultó el avatar en Rendimiento. No volvió a reproducirse tras la recarga limpia, ni en la escena real final ni en la regresión completa de geometría, encuadre y ciclo de transportes (`graphics-district-renderer-lifecycle.test.ts`). No se confirmó una causa ni se aplicó un arreglo especulativo. Se conservan pruebas visuales del avatar en Rendimiento y de la partida real. Sigue pendiente comprobar comportamiento GPU, FPS y multitáctil en teléfonos físicos.

La revisión final no registra errores de consola en el juego ni en el laboratorio. El enlace del laboratorio usa navegación nativa documentada para evitar el error observado de precarga RSC de Vinext. Las nueve comprobaciones de seguridad y aislamiento de `work/private-pc/final-probes.json` aprobaron: origen/API/assets/laboratorio anónimos rechazados, identidades falsas rechazadas, túnel listo, Access del dominio anterior y hash de su configuración conservados.

Capturas dentro de `work/private-pc/exploration-20261017/`: `qfrontier-viaje-real-escritorio-final.png`, `qfrontier-viaje-real-movil-final.png`, `qfrontier-valleverde-tercera-20261017.png` y las capturas identificadas como ensayo. El juego queda abierto en la aldea original, sin un viaje pendiente.
