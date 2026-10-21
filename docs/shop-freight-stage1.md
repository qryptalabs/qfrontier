# Primera logística física del patio

Esta fase usa las compras, el equipo propio, el Camino Real y los encargos existentes entre Corona del Alba y Paso del Norte.

- `shop.collect-crew`: un trabajador lleva una compra pagada del almacén al costado del vehículo. Los lotes permanecen en la orden hasta el instante de transferencia; entonces pasan a la carga con su procedencia intacta.
- `shop.deliver-crew`: descarga los materiales producidos de un encargo. El pago sale de su escrow existente, al llegar al almacén. Las existencias iniciales compradas no cumplen encargos productivos.
- `shop.sell-crew`: descarga una venta en el patio. Sólo opera con el presupuesto y la capacidad finitos de la tienda receptora.
- El servidor calcula los caminos y tiempos; el cliente no envía poses, precios, recompensas ni duraciones. La cuadrilla y el vehículo quedan reservados durante el servicio.
- Un almacenero por tienda atiende un transporte a la vez. Se conserva la API de recogida y entrega manual para personajes a pie y clientes anteriores.
- Los nuevos campos son opcionales. No hay migración ni reinicio. Las operaciones conservan sus identificadores para reintentos; las transferencias tienen una marca persistida que evita repetirlas.
- La primera entrega productiva a cada ciudad da 25 XP derivados de lotes y pago verificados. Las siguientes entregas a esa ciudad no repiten XP.
- La tienda se actualiza mientras exista carga, descarga o viaje activo, aunque su panel esté cerrado. La confirmación visual distingue el tiempo previsto de la transferencia ya confirmada.
- Las visitas «Ver carga con trabajador» y «Ver descarga con trabajador» son demostraciones sin compras, inventario ni cambio de ubicación del jugador.

Verificación: pruebas económicas con partidas en memoria, recorrido completo de compra/carga/viaje/venta, recarga, reintento de respuesta perdida, conservación de créditos y procedencia, control de acceso, requisitos productivos, rutas físicas en ambos patios, progresión y notificaciones. Revisión visual en el servidor privado. No se realizan compras sobre las partidas reales durante la revisión.
