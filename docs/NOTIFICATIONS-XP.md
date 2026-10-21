# Avisos y experiencia del explorador

Publicado en el entorno privado de pruebas el 16 de octubre de 2026.

## Funcionamiento

- La campana muestra resultados del explorador seleccionado, ordenados del más reciente al más antiguo. El menú indica cuántos avisos sin leer pertenecen a cada sección.
- Los resultados nuevos aparecen agrupados en un aviso dentro del juego. No interrumpen una cotización, una confirmación, un cambio de perfil ni una recuperación de conexión. No se solicitan permisos del navegador.
- Abrir una actividad lleva a su sección y la marca como leída. Se puede marcar una o todas como leídas sin iniciar órdenes ni mover recursos. El historial sigue disponible.
- En el primer acceso, la actividad anterior se incorpora a la bandeja sin una ráfaga de avisos. Las próximas consultas y recargas no vuelven a premiar los mismos resultados.
- Los recursos de Estación se entregan automáticamente al terminar. La producción de las instalaciones distingue la finalización del trabajo de la entrega física al cobertizo. Leer un aviso no reclama ni duplica productos.

## Experiencia

Los puntos de actividad son la misma unidad que la XP acumulada. No son créditos, no se gastan y no conceden ventajas económicas ni acceso a contenido en esta versión. El nivel es un indicador de progreso del personaje.

| Actividad completada | XP |
| --- | ---: |
| Prospección | 20 |
| Extracción | 3 por unidad |
| Fabricación | 10 por lote de receta |
| Cosecha | 15 |
| Obra nueva | 30 |
| Mejora | 40 |
| Expedición | 25 |
| Convoy | 15 |
| Primera visita a un destino distinto de la estación inicial | 5 |
| Primera venta pagada a una ciudad | 20 |
| Primer intercambio del mercado con cada cuenta distinta | 20 |

Un traslado al cobertizo, una visita repetida, un enfrentamiento o un intercambio entre perfiles propios no concede XP adicional. La venta necesita prueba de pago; publicar una oferta no basta.

El nivel `L` empieza en `25 × (L − 1) × (L + 2)` XP: nivel 1 a 0, nivel 2 a 100, nivel 3 a 250, nivel 4 a 450. La barra muestra el tramo actual y la experiencia que falta para el siguiente nivel.

La proyección usa los trabajos, obras y pagos históricos confirmados por el servidor. Incluye el progreso anterior disponible y no modifica el mundo guardado: no hay migración, reinicio, comando para reclamar XP ni nueva moneda. Los trabajos futuros, pendientes y cancelados no dan experiencia.

## Alcance y conservación

- Hasta 200 resultados recientes en la bandeja; la XP usa todo el historial elegible, antes de ese límite.
- El estado leído se guarda por explorador en este navegador, con hasta 512 identificadores por conjunto. Se comparte entre pestañas del mismo navegador, pero no entre dispositivos. No se guarda el contenido privado del mundo en ese registro.
- La logística y el reparto diario conservan sólo el último envío de cada instalación o jornada en el modelo existente. Se muestran sus eventos disponibles, sin reconstruir entregas antiguas sobrescritas. Estas fases no generan XP.
- El cliente consulta al vencer el siguiente trabajo propio conocido y al volver a una pestaña visible; conserva el sondeo y los controles de conexión existentes. No se añaden bucles gráficos, contextos WebGL ni WebSockets.
- Se mantienen el mismo Worker, el acceso privado y la D1 de recuperación. Las cuatro partidas se comparan con el respaldo previo al despliegue; el despliegue no incluye ni reemplaza datos.

## Validación

531 pruebas de dominio y cliente aprobadas, comprobación de tipos y compilación aprobadas, sin errores de lint en los archivos cambiados. El escaneo general heredado también recorre exportaciones antiguas y cachés de QA; no se considera una comprobación limpia de este cambio.

La comparación de conservación pasó 15 controles antes del despliegue: cuatro perfiles, revisión 249, 28 trabajos y 126 recibos, con cero escrituras durante las proyecciones. Un ensayo completo de prospección → viaje → extracción → tablón → venta termina con 61 XP y 6 CR, manteniendo intactas las 113 unidades del kit inicial. La interfaz se comprueba en escritorio y con viewport móvil; no es una medición sobre un teléfono físico.
