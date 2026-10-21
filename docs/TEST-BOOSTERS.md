# Potenciadores gratuitos de prueba

## Uso y límites

En Fabricación, Agricultura, la mesa de trabajo y el bancal, el jugador puede marcar un potenciador antes de cotizar una nueva orden manual. Es opcional y comienza desmarcado. No existen cobros, compras, suscripciones ni moneda de pago para activarlo.

## Pases ganados jugando

Cada nueva orden potenciada confirmada utiliza **un pase de la cuenta**, compartido entre todos sus exploradores. Los pases se obtienen de hechos registrados por el servidor:

| Recompensa | Pases | Condición para no repetirla |
| --- | ---: | --- |
| Bienvenida | 3 | Una sola vez por cuenta, aunque tenga varios exploradores. |
| Nuevo nivel máximo de la cuenta | 2 por nivel desde el 2 | Sólo el primer alcance de ese máximo; otro explorador que alcance el mismo nivel no vuelve a premiarlo. |
| Encargo inicial del distrito | 1 | Una entrega completada y pagada, una sola vez por cuenta. |
| Venta a la Feria regional | 1 | Por producto demandado, cuenta y temporada; repetir la venta del mismo producto en esa temporada no repite el premio. |
| Contrato comercial de Valleverde | 1 | Entrega real y pagada de sus dos tablones; aceptar, despachar o fabricar no basta. |

No hay botón para reclamar ni petición que cree un premio. Los niveles y pagos históricos comprobables también se reconocen sin reescribir la partida. Cambiar de explorador, recargar o abrir otra pestaña no duplica recompensas. Las recompensas no se calculan a partir de saldos enviados por el navegador.

La interfaz muestra pases disponibles, obtenidos y utilizados, y las últimas veinte recompensas de la cuenta. Los totales incluyen todo el historial elegible, aunque sólo se muestren veinte entradas. Por ejemplo, bienvenida, primer nivel máximo 2 y encargo inicial pagado suman seis pases; confirmar una orden potenciada deja cinco. No se entregan esos hitos por abrir la pantalla.

Los pases y el cupo diario son límites diferentes: **se necesita un pase y ahorro disponible**. Los pases no vencen a las veinticuatro horas. Ese plazo sólo libera las reservas del cupo de ahorro. Agotar cualquiera de los dos impide activar otro potenciador; si ya estaba seleccionado, se puede desmarcar para revisar una orden normal.

El tiempo de trabajo se reduce como máximo un 20 %. La cuenta dispone de 1.800 segundos (30 minutos) de ahorro reservado durante las últimas 24 horas, compartidos entre todos sus exploradores. Es una ventana móvil: cada reserva vuelve a estar disponible 24 horas después de confirmar esa orden; no hay reinicio a medianoche. La interfaz muestra el cupo usado y disponible y actualiza el estado cuando se libera ahorro.

La cotización muestra el plazo normal del trabajo, el plazo reducido, el ahorro que se reservará, el pase que se utilizará y ambos saldos resultantes. Si queda menos cupo que el 20 % solicitado, se aplica solamente ese resto y se avisa. Incluso ese ahorro parcial utiliza un pase completo. Nunca se cambia silenciosamente una orden potenciada por una normal.

El pase y el cupo se reservan al confirmar, incluso si el trabajo queda en cola. Cotizar no los consume. Cancelar después de confirmar no devuelve el pase ni el ahorro reservado; esto se indica antes de confirmar y evita reutilizar los límites mediante cancelaciones. Repetir una petición confirmada no vuelve a consumirlos.

## Alcance

- Incluye fabricación civil manual y cultivos manuales de Estación, mesa y bancal.
- Excluye armadura, lanzas y munición; tampoco acelera extracción, exploración, construcción, mejoras, combates, viajes, protección ni transportes.
- El aserradero automático y los encargos automáticos conservan sus tiempos. Fabricar en el aserradero no premia pases por ciclo. Una entrega comercial a Valleverde sólo los obtiene por su pago confirmado, según la regla anterior. Las colas, el suministro y la entrega de NPC tampoco se aceleran.
- Materiales, producción, agua, fertilidad, recursos finitos, cupos regionales, vínculos de inventario y XP por acción son iguales con y sin potenciador.
- Las órdenes ya iniciadas no se modifican. Ninguna receta ni edificio exige usar el potenciador.

El servidor calcula primero los segundos normales, incluyendo la facción y la cantidad, y ahorra como máximo la parte entera de una quinta parte. Por ejemplo, 300 segundos pasan a 240 y 45 a 36. Un plazo de 54 segundos ahorra 10, evitando superar el 20 % por redondeo.

## Conservación y comprobación

El presupuesto se obtiene de la reserva registrada por el servidor en las nuevas órdenes. Las reservas de versión 2 registran el consumo de un pase. Las reservas históricas de versión 1 mantienen su ahorro y su plazo originales, sin consumir pases retroactivamente; su ahorro todavía ocupa el cupo móvil mientras esté dentro de las veinticuatro horas. Las partidas antiguas no necesitan migración. Se conserva la misma base D1 y no se alteran modelos, materiales, iluminación ni animaciones 3D. Las animaciones de trabajo siguen el plazo de la orden y la logística conserva sus trayectos.

Las pruebas cubren cuentas con varios exploradores, cuota parcial y agotada, vencimiento a las 24 horas, cancelación, reintentos, concurrencia, cotizaciones que vencen antes de liberarse cupo y entregas de NPC sin duplicados. La recuperación de partidas se compara con un respaldo previo al despliegue. El equilibrio económico futuro deberá medirse con actividad real antes de abrir ventas de aceleradores; este prototipo no demuestra por sí solo ese equilibrio.
