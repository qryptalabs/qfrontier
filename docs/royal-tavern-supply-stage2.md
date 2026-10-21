# La Vela Azul: abastecimiento real

Versión del 20 de octubre de 2026, servidor privado de la PC. El dominio Workers anterior no se modifica.

## Circuito

1. Reservar «Cosecha para La Vela Azul» desde la propia aldea o hablando con Isabel en la barra real.
2. Cargar 4 grano y 2 agua transferibles desde el inventario de la estación y cobertizos terminados. Se preservan los mínimos del encargado y se excluyen lotes reservados para obras. No se inicia otro turno de producción ni se añaden recursos.
3. Viajar al reino por los caminos existentes. Los botones «Caminar a la taberna» y «Caminar al almacén» usan el navegador físico del personaje, sin teletransporte.
4. Entregar junto al Almacén de la Ribera, en x32/z154 locales. Se puede llevar a pie (6 unidades de una capacidad de 20) o llegar con el equipo propio. El trabajador necesita su acceso libre.
5. El cargamento pasa a custodia del almacén. El empleado se acerca, descarga, lleva los bultos dentro, prepara el reparto, camina por el muelle y las calles hasta la barra, deposita la cosecha y vuelve sin carga.
6. Se liberan 20 CR de la reserva al llegar a la despensa. La operación y la procedencia de los lotes se conservan después de salir del juego.

## Límites e integridad

- Seis abastecimientos por temporada en esta prueba: 24 grano y 12 agua como objetivo acumulado; no hay reposición ilimitada de demanda.
- Presupuesto de créditos NPC existente; se mantienen un encargo activo por cuenta, tres entregas diarias y doce reservas por temporada entre todos sus exploradores.
- La carga debe ser transferible y seguir vigente hasta la entrega. El tutorial y las existencias iniciales de tiendas no pagan este encargo.
- Un empleado de recepción/reparto por turno. No acepta dos cargamentos simultáneos; vuelve al almacén antes de otro reparto.
- Movimiento bloqueado durante la descarga inicial. Después se puede continuar, mientras el reparto termina.
- Cancelación antes de la recepción; después los recursos quedan en custodia y el pago sigue en reserva hasta la entrega. No hay devolución y pago simultáneos.
- Identificador de operación persistido en sesión, revisión esperada y reintento con el mismo identificador. Un resultado incierto no se convierte en otra venta.
- Liquidación determinista al consultar o avanzar el estado. La consulta autenticada del puerto o la tienda también confirma entregas vencidas de dueños desconectados; un vecino ve los bienes recibidos y el dueño conserva su único pago. Recuperar la partida no repite el pago. No se requiere un temporizador residente del servidor para cada NPC.

## Presentación

- Isabel y Mateo tienen interacción E y botón táctil. Consulta de visita y presencia del personaje real se distinguen en la interfaz y se comprueban en el servidor.
- Bienvenida en español mediante la voz disponible del dispositivo, con texto permanente y control de sonido. Si no hay voz española instalada, la disponibilidad/calidad de pronunciación depende del navegador.
- Diálogo adaptable con confirmación, foco de teclado, Escape y recuperación de operaciones pendientes.
- Transportista y carga visibles desde un calendario confirmado por el servidor. Vuelve vacío. Los bultos de despensa aparecen solo después de entregas confirmadas; las respuestas antiguas no borran el progreso reciente.
- El estado público del puerto lleva solamente el turno del empleado y el número de abastecimientos, para que la misma escena del planeta pueda mostrarlo sin revelar inventarios o saldos ajenos.
- Se reutilizan los materiales, modelos articulados y único renderizador existentes. No se modifica el castillo, el puente, los barcos ni sus dimensiones.

## Alcance de esta fase

Es el primer contrato completo de abastecimiento de un local. El catálogo de comida preparada, el consumo periódico de clientes, la venta al detalle de raciones/agua y los encargos de reparación de la herrería pertenecen a fases posteriores. La herrería conserva su actividad ambiental. No hay dinero ni tokens reales.

## Validación

- TypeScript y compilación de producción correctos.
- 111 pruebas de circuito/regresión y dos comprobaciones adicionales del NPC/bultos y liquidación con el dueño desconectado (113 pruebas distintas en total). Tras el último cambio de liquidación, las 30 pruebas afectadas de comercio y puerto volvieron a pasar.
- Conservación de bienes/créditos, desconexión y respuesta perdida, reintentos, reserva/cancelación, límites compartidos, una sola recepción, entrada física, caducidad y origen de lotes.
- Ruta de reparto en ambos sentidos comprobada con el terreno y colisiones CPU. Navegación desde la puerta real hasta ambos destinos comprobada (59 puntos por ruta).
- Las operaciones económicas se prueban en mundos aislados en memoria. La revisión de la PC usa consultas y visitas; no gasta ni altera recursos de los jugadores.
- Revisión en el dominio privado: escritorio, pantalla completa, diálogo a 390×844, entrada con botón táctil continuo, posadera visible, interacción con E y botón táctil. Sin errores de consola en la revisión final. La prueba móvil es una comprobación de tamaño y controles en navegador, no una medición de FPS en un teléfono físico.
- Respaldo anterior/posterior idéntico: 6 perfiles, 31 trabajos, 390 recibos, revisión 989; hash de estado `6cad26130e56e1c418ec616e00b19bdebea86d0cae37a140cc7afb0a733e0057`.

Evidencias de compilación, pruebas, revisión y conservación en `work/royal-tavern-supply-20261020/`.
