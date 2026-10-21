> Informe histórico redactado. Dominios, correos y rutas son ejemplos; los artefactos privados de `work/` no se distribuyen. Para un despliegue nuevo usar [Operación](architecture/OPERATIONS.md).

# Circulación terrestre y controles continuos

Entrega activa en https://qfrontier.example.invalid/. Verificada el 17 de octubre de 2026, hora de Costa Rica. El dominio Workers anterior permanece intacto.

## Reglas

Los viajes automáticos conservan una secuencia de caminos, accesos y muelles existentes. Los cruces se conectan donde las líneas se encuentran realmente. La salida de la parcela y la incorporación desde una posición manual son enlaces locales limitados; no habilitan atajos entre ciudades. La red y las mallas conservan su calidad y geometría originales.

Los recorridos confirmados reservan sus cuerpos y tiempos dentro de la escritura atómica del mundo actual. La comprobación incluye el animal y la carreta. Una espera consume tiempo y no distancia. El personaje y las ruedas se detienen mientras esperan y se muestra “Cediendo el paso”. Si no existe un lugar seguro para esperar, la operación se rechaza sin confirmar un cruce inseguro. Un bloqueo prolongado termina en un punto seguro y permite volver a trazar la ruta.

Las flechas y el joystick renuevan una autorización de movimiento de 900 ms cada 250 ms mientras se mantienen pulsados. La dirección se valida con las mismas colisiones del servidor; no se adelanta localmente el personaje. Soltar el control, cambiar de cámara, perder foco u ocultar la escena envía la parada. Si se pierde la conexión, vence la autorización. La sesión y secuencia evitan que una renovación atrasada reactive una marcha detenida. Estas renovaciones no crean un comprobante económico permanente por cada pulso.

## Alcance

La cesión nueva se limita al tráfico terrestre. Los itinerarios marítimos conservan su comportamiento previo; esta entrega no implementa prioridades entre barcos. Las cámaras, la calidad gráfica, el terreno y los edificios existentes se conservan. Las comprobaciones de disposición móvil se realizan por emulación y no sustituyen la prueba de GPU, tacto simultáneo y latencia en un teléfono físico.

La base local sigue siendo la autoridad existente. No se activa la arquitectura particionada, no se modifica D1 remota y no se despliega al antiguo dominio Workers.

## Versión y comprobaciones

Instantánea activa: `D:/Projects/qfrontier/work/private-pc/runtime/2026-10-18T04-36-55-821Z-a5c9b86a`. Compilación SHA-256 `34fecc1aba25300e76ec6204d417a1b0bdc695547bcd1c4efdaad9a551a621b1`, 119 archivos. Gate aprobado: `work/private-pc/exploration-20261017/release-gate-1792298195055.json`. La configuración local mantiene la excepción de compatibilidad documentada de 2026-05-22; no acredita equivalencia exacta con producción.

La batería general aprobó 1.063 de 1.063 pruebas. Tras el último ajuste acotado de NPC, aprobaron otras 47 comprobaciones focales, incluidas colisiones, tráfico, laboratorio y representación. TypeScript y compilación aprobaron; lint no registra errores y mantiene cuatro avisos previos del cliente principal. La validación física cubrió los 45 destinos y 1.980 pares. Las 45 idas y vueltas se repitieron en clones desechables del respaldo 722; nunca se restauró esa copia sobre la partida activa. Los 100 pares de cotización y confirmación de controles conservaron recursos y recibos; su p95 aislado de 81 ms corresponde a MemoryStore, no a latencia de Internet.

## Partidas y prueba real

El respaldo fresco previo al cambio fue la revisión 742, con cuatro perfiles, 28 órdenes y 378 recibos. El respaldo inmediato posterior al arranque fue idéntico: mismo hash de mundo y SQLite, sin cambios de revisión, esquema ni tablas protegidas (`traffic-cutover-preservation.json`). No hubo importación, restauración ni migración.

QA terminó en revisión 746. Se observaron una orden por flecha en la partida real y un viaje por caminos hasta Las Brumas, X -216, Y 168, cuya llegada persistió al recargar. Se añadieron únicamente navegación, metadatos acotados del control y un recibo del viaje. `traffic-final-qa-preservation.json` exige inventarios, recursos, edificios, progreso y recibos anteriores exactos. `traffic-final-checkpoint.json` confirma que los otros tres perfiles completos y el punto original de regreso a casa permanecen idénticos; el personaje ensayado queda en Las Brumas, sin viaje pendiente y con el control detenido. Respaldo final: `local-auto-2026-10-18T04-42-07.459Z-5d6a893a.json`.

En `/ensayos/viajes`, exclusivamente en memoria, se observó la carreta con animal esperar y reanudar, el ensayo de marcha de aproximadamente cinco segundos y un arrastre del joystick que recibió 18 controles, incluida la parada. Estos escenarios son ficticios y no se presentan como una ciudad persistente con dos usuarios reales. Se probaron vistas aérea, primera y tercera persona, disposición móvil 390×844 y pantalla completa nativa 1920×1080. Consolas del juego y laboratorio sin errores. Las nueve comprobaciones de aislamiento y Access aprobaron; el hash de la configuración del dominio anterior sigue intacto.

## Límite de los NPC ambientales

Los viajes confirmados de jugadores usan reservas de trayectoria y escritura atómica. La población ambiental conserva resolución determinista por grupo: contempla el giro y tamaño de las carretas, valida toda la cápsula y su desplazamiento sobre cubiertas, y limita una espera alternativa a 0,25 unidades. Ante un puente totalmente bloqueado puede ocultarse temporalmente un NPC en vez de atravesar cuerpos o retroceder varios metros. La reserva persistente entre grupos y ciudades es trabajo pendiente; no se promete continuidad física absoluta de toda la población.

Capturas y resumen de entrega: `work/private-pc/exploration-20261017/traffic-delivery-summary.json`, `qfrontier-trafico-cesion-escritorio.png`, `qfrontier-controles-movil-trafico.png`, `qfrontier-ruta-real-caminos.png` y `qfrontier-trafico-partida-real-final.png`.

