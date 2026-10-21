# Industria y comercio del distrito

Esta ampliación de **Recorrer** conecta extracción finita, abastecimiento, fabricación, almacenamiento y una venta entregada físicamente. Usa la parcela, los habitantes, los lotes y el presupuesto NPC existentes. No reinicia partidas ni cambia las recetas de la mesa, del bancal o del encargo inicial. Todos los créditos son moneda ficticia del juego.

## Preparar la cadena

1. Conserva un cobertizo terminado y espacio libre. Registra la comunidad en **Habitantes** si aún no lo has hecho.
2. En **Construir**, coloca un **puesto forestal** y un **aserradero propio**. El primero cuesta una madera y una piedra y tarda 25 segundos; el segundo cuesta cuatro maderas y dos piedras y tarda 60 segundos. Sus huellas son 2,2 × 1,8 y 3,2 × 2,8 unidades, respectivamente.
3. Asigna un habitante a cada puesto que quieras operar. Con dos habitantes puedes repartir o cambiar los oficios cuando estén libres; una vivienda terminada permite incorporar otros dos. No aparecen trabajadores extra por cada fase del recorrido.
4. Acércate a una instalación mediante su botón **Ir…**. Deja libre la puerta y los pasillos del trabajador. El servidor vuelve a comprobar proximidad, ruta, materiales y disponibilidad al confirmar.
5. Desde **Producción**, extrae madera, sigue su entrega al cobertizo y prepara allí el suministro del aserradero. **Economía** muestra el contrato comercial y el balance confirmado.

La parcela admite seis obras pequeñas en total. **Sugerir espacio libre** coloca una vista previa válida; los campos **X/Y** permiten ajustar el lugar en pasos de 0,5 unidades. Ambos conservan la revisión y confirmación de la cotización antes de construir. Los accesos, la bahía comercial y su corredor deben permanecer libres.

## Puesto forestal

Cada pedido solicita entre **una y diez maderas** y tarda **15 segundos por unidad**, más la entrega al cobertizo. La ficha identifica el yacimiento y su cuota disponible. Es una licencia del distrito sobre existencias económicas reales: no transforma el bioma de la expedición ni genera un depósito nuevo junto al edificio.

La reserva usa las mismas capas, ranuras y cuota de extracción de temporada que las operaciones anteriores. La cuota de 30 unidades por cuenta y yacimiento se comparte entre sus exploradores; construir otros puestos no la reinicia. El servidor selecciona una reserva forestal con existencias accesibles y descuenta la madera extraída de ese origen.

El habitante trabaja durante el pedido y transporta la salida a un cobertizo con espacio y camino seguros. Si falta destino, los productos quedan pendientes en la instalación y el panel explica la espera. La entrega no crea otra copia de los materiales. Cancelar una extracción todavía activa libera la madera reservada que no llegó a extraerse; no produce madera ni paga créditos.

## Aserradero propio

Un ciclo recoge **dos maderas del cobertizo elegido** y fabrica **un tablón en 60 segundos**. El tiempo de ir por los insumos, cargarlos, regresar al puesto, entregar el producto y volver se añade a esos 60 segundos. Este ciclo industrial es específico del edificio: la fabricación original de la mesa conserva sus cinco minutos base y sus modificadores.

El objetivo puede ser de **uno a cinco tablones**. Al confirmar se reserva material para el primer ciclo, no para todo el objetivo. Cada ciclo siguiente se inicia después de confirmar la entrega del anterior y el regreso de su habitante. La ficha muestra los ciclos iniciados y completados, el origen de la madera y el motivo de espera.

Si luego falta madera, espacio, trabajador o una ruta disponible, el pedido mantiene su avance y espera. Al resolverse la causa se vuelve a evaluar en las consultas normales del juego. La simulación no fabrica de golpe una cadena de ciclos atrasados: programa como máximo el siguiente ciclo desde la consulta que comprueba sus requisitos.

**Revisar detención de nuevos ciclos** permite terminar el ciclo y los recorridos actuales y después detener el pedido. **Revisar reanudación del pedido** reactiva un objetivo detenido e incompleto. No hay cancelación a mitad de ciclo del aserradero. La vinculación, procedencia y caducidad de los insumos se conservan en sus productos; transformar madera vinculada no la convierte en un tablón transferible.

## Contrato de Valleverde

En **Economía**, el comprador de **Valleverde —centro X 168, Y 120; descarga en su acceso occidental X 146, Y 120—** solicita **dos tablones transferibles por 12 créditos**, con un plazo total de **30 minutos**. La ruta debe ser terrestre y segura desde la parcela. La oferta depende de la demanda y del presupuesto reales del mercado; sólo hay una carreta regional disponible a la vez.

Al revisar y confirmar la aceptación se reserva el pago y la demanda del comprador. El contrato queda asociado al cobertizo elegido. Los tablones todavía no se retiran: el carruaje viene **vacío desde Valleverde** y espera en la bahía de la parcela.

Cuando llega, acércate al cobertizo y revisa el despacho. Se necesitan dos tablones transferibles de ese almacén, con calidad y caducidad válidas para la entrega. Los materiales vinculados no sirven para este contrato. El servidor reserva los lotes una sola vez y comprueba que quede tiempo para recogerlos, viajar y descargar dentro del plazo.

El conductor baja del vehículo, camina al almacén, recoge la carga, vuelve y sube al carruaje. Después regresa **cargado a Valleverde**. El panel distingue llegada, recogida, carga, viaje y descarga, con tiempos derivados del recorrido guardado. Si el personaje bloquea la entrada, el despacho pide que dejes libre el paso; no lo desplaza automáticamente.

El pago se registra **al terminar la descarga real en destino**, junto con su movimiento de créditos y la entrega de los dos tablones. Una reserva o un temporizador agotado no se presenta como un pago cobrado. El historial conserva el resultado del contrato y el carruaje deja de mostrarse al concluir su operación; el camino comercial se conserva.

Se puede cancelar antes del despacho. La demanda y el presupuesto reservados vuelven al comprador y el carruaje regresa vacío. El vencimiento sin despacho también libera esa reserva. Una carga que ya está en ruta no admite cancelación ni puede venderse por segunda vez.

## Balance y persistencia

El balance muestra la madera extraída y consumida por esta cadena, los tablones producidos y comprometidos en la carga, los vendidos y los créditos cobrados. Son totales de trabajos, cargamentos y pagos registrados; no incluyen ventas futuras calculadas ni prometen ingresos pasivos. El saldo transferible actual se muestra por separado cuando existe una cuenta económica del explorador.

Las órdenes se revisan mediante la cotización firmada habitual. Caminar conserva su confirmación automática sin consumos; extracción, pedidos, detención, reanudación y contratos pasan por revisión visible. Los lotes privados siguen en sus contenedores y el mundo ajeno recibe sólo la información gráfica pública necesaria para representar habitantes y carruajes.

Las obras, pedidos y rutas quedan dentro del estado de la partida. Las consultas liquidan etapas cumplidas sin reiniciar inventarios, cuotas, perfiles ni trabajos anteriores. La [guía del distrito](DISTRITO-JUGABLE.md) describe el almacenamiento, las viviendas, los suministros y las entregas compartidas con esta ampliación.
