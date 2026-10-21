# Flota de Corona del Alba — primera etapa Tripo

Dos modelos independientes se generaron en Tripo Studio, sin comprar créditos adicionales:

| Modelo | Tarea de Tripo | Exportación del juego | Triángulos | Tamaño |
|---|---|---|---:|---:|
| Galeón real | `6a9a56e0-fd46-4784-b539-ddc0a6f2080d` | `/models/tripo-v1/galleon.glb` | 12.282 | 1.066.816 bytes |
| Pesquero | `69073075-45d1-4766-830b-4f96d8735ab3` | `/models/tripo-v1/fishing.glb` | 12.720 | 867.636 bytes |

Los registros privados de generación no se distribuyen. La herramienta de preparación es `scripts/prepare-tripo-ships.mjs`.

Cada GLB contiene dos lotes de geometría y un atlas de color 1K embebido. Se conserva el estilo con muestreo de píxeles y materiales de madera/lino. Carga próxima y reutilización de buffers para los cinco galeones menores; el galeón principal conserva su propio equipamiento transitable. Existe una representación anterior de respaldo mientras carga el GLB o ante un fallo de descarga.

## Ubicación y acceso

Servidor privado: `https://qfrontier.example.invalid/mundo/reino`.

- Galeón: puerto de Corona del Alba, X −2295, Y −4296 aproximadamente. Desde «Flota del Alba»: «Ver galeón», «Pasarela del galeón», «Recorrer el galeón» y «Cámara del capitán».
- Pesquero: muelle de trabajo al sur, X −2293, Y −4257 aproximadamente. «Seguir pesquero» acompaña su recorrido; «Muelle pesquero» permite observar la descarga.
- El mismo distrito y la misma flota se montan en el planeta. La lectura autenticada del ciclo pesquero se solicita solamente cuando ese distrito está visible; una petición a la vez, cancelada al desmontar.

El galeón permanece atracado. Se puede caminar desde la calle por la pasarela, la cubierta, las dos escaleras y el alcázar de popa, y entrar al camarote. Los pisos, escalones y obstáculos proceden de la misma geometría métrica usada por el servidor; no se habilita un piso invisible sobre todo el río. Las visitas de cámara no trasladan al explorador guardado. Se conservan cámaras, teclado, mouse y controles móviles existentes.

## Trabajo y economía

El pesquero sale por un canal libre, llega al caladero, pesca, vira, regresa y atraca. La tripulación y los trabajadores de muelle llevan las cajas al almacén; una carreta con caballo y conductor recorre las calles hacia el mercado. Se separan los corredores de carga. El movimiento se detiene en la siguiente frontera temporal hasta recibir la lectura del servidor.

Se reutilizan las fases, el cupo finito, las existencias, la procedencia y las transferencias económicas del puerto. Ningún temporizador gráfico fabrica pescado ni liquida órdenes. Para una partida antigua sin puerto inicializado, el servidor muestra la reserva de apertura sin escribir la partida; la primera operación comercial confirmada conserva la inicialización existente.

## Validación

48 pruebas aprobadas: presupuestos GLB; canal navegable sin puentes/bancos/galeones; ida y vuelta por la autoridad de movimiento; cabina y cubiertas a distintas alturas; bloqueo de mástiles/barandillas/agua; cámara que se recorta ante las velas reales; continuidad del mismo marinero al desembarcar y volver a bordo; proyecciones de fases sin mutación; conservación económica, idempotencia y compatibilidad de viajes del reino. Evidencias de ejecución y revisión visual en `work/tripo-ships-20261019`. La prueba móvil usa un viewport de 390×844 en el navegador; no sustituye un teléfono físico.

Se activa únicamente en el servidor privado de la PC, con su base local existente. No hay migraciones, reinicios de partidas ni despliegues al dominio Workers original. Ambos respaldos contienen revisión 989, seis perfiles, 31 órdenes y 390 recibos. La comparación exacta aprobó todos los controles: JSON, esquemas y tablas protegidas sin cambios. Hash del estado: `6cad26130e56e1c418ec616e00b19bdebea86d0cae37a140cc7afb0a733e0057`.

Pendiente para otra etapa: pilotar el galeón, compra/propiedad de barcos, combate naval y nuevas clases de mercante. No se presentan como funciones disponibles.
