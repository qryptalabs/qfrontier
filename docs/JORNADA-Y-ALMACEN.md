# Jornada, alimentación y ampliación del almacén

Esta etapa añade una rutina voluntaria para la comunidad de **Recorrer** y una mejora del cobertizo. Usa habitantes, materiales e inventarios existentes. Abrir una partida anterior no activa la rutina, no descuenta alimentos y no crea costes atrasados.

## Organizar la primera jornada

1. Registra la comunidad en **Habitantes**, si aún no lo has hecho, y espera a que todos terminen sus trabajos y recorridos.
2. Prepara raciones y madera en un cobertizo propio terminado. Puedes depositar lotes de Estación o fabricar las raciones en tu mesa con dos granos y un agua por ración. La mesa conserva su receta y tiempo: cinco minutos base, o 270 segundos para Forjadores, más los traslados.
3. En **Jornada y alimentación**, elige el cobertizo y un habitante disponible para repartir. Es una persona de tu padrón; no crea otro NPC ni requiere cambiar su oficio.
4. Acércate al almacén y usa **Dejar libre el acceso** si ocupas su puerta. El botón busca un punto próximo y solicita un paseo normal; el servidor vuelve a comprobar el camino y las colisiones.
5. Revisa la cotización y confirma la activación. El servidor comprueba la agenda completa del reparto antes de reservar los recursos. Si falta stock, un habitante o una ruta segura, la orden se rechaza sin consumir materiales.

La alimentación utiliza lotes vigentes y de calidad válida del cobertizo seleccionado. Tener las raciones en otro almacén o en Estación no completa la reserva de ese origen. La vinculación y la caducidad se conservan; los alimentos reservados no pueden gastarse a la vez en otra operación.

## Coste y recorrido

Una jornada reserva **una ración por habitante** y **una madera por cada tres obras terminadas**, redondeando hacia arriba. Con cuatro habitantes y seis obras terminadas son cuatro raciones y dos maderas. No hay un pago en créditos ni un salario añadido.

El repartidor sale de su puesto habitual, recoge los materiales en el cobertizo y recibe su propia ración. Visita después a los otros habitantes, entrega una ración a cada uno, vuelve al almacén para el mantenimiento y regresa a su puesto. La madera se consume al completar ese mantenimiento. El panel muestra las entregas confirmadas, la carga pendiente y el tiempo del recorrido completo.

La comunidad queda reservada para este reparto hasta que termina; no se reasignan sus habitantes ni se inicia una tarea que los ocupe durante ese trayecto. Las figuras y las cargas se derivan de esta agenda real, con un único modelo por habitante.

Cada persona obtiene **20 minutos de cobertura desde que recibe su ración**. Sus vencimientos pueden diferir por el tiempo entre las visitas. El estado Alimentado y su contador reflejan esa entrega; agotar un contador local no confirma otra comida ni mueve materiales.

## Ausencias y nueva confirmación

La primera aceptación activa las reglas de jornada desde ese momento. Los trabajos y pedidos que ya estaban confirmados mantienen su funcionamiento. No se reconstruyen jornadas anteriores.

Cada confirmación autoriza un único reparto. No se pueden pagar jornadas por adelantado mientras siga cubierta alguna persona o el repartidor continúe su recorrido. Al cerrar el navegador, se resuelve la jornada ya reservada; permanecer fuera varias jornadas no programa más consumos, no genera deuda y no descuenta reservas adicionales.

Después de agotar la cobertura, las nuevas fabricaciones avanzadas requieren otra jornada. La agricultura, la extracción básica y las recetas de ración, semilla y nutriente siguen disponibles para preparar la recuperación. Cuando haya stock, habitantes libres y paso seguro, se revisa y confirma una nueva jornada. No hay un reintento que cobre automáticamente al reaparecer materiales.

## Balance de la comunidad

**Habitantes** muestra el estado alimentario de cada persona, su cobertura y el seguimiento del reparto. El cobertizo y el repartidor se eligen en ese panel.

**Economía** conserva el balance industrial y comercial y añade los consumos confirmados de raciones y madera de mantenimiento. Se cuentan al completar sus entregas, separados de los créditos ingresados por ventas y del stock que todavía está en camino.

La previsión de próxima jornada usa la población y las obras actuales. El número de jornadas posibles por stock es una referencia del cobertizo elegido: no reserva ciclos futuros y puede cambiar por caducidad, otros usos de los lotes o nuevos habitantes. El panel distingue esta previsión de los consumos que ya ocurrieron.

## Cobertizo de nivel dos

En la ficha del cobertizo, **Revisar ampliación a nivel 2** consume **dos tablones, dos maderas y dos fibras del inventario de Estación**. Si los insumos están en un cobertizo, retíralos antes de cotizar. La obra dura **60 segundos** y utiliza una cuadrilla con andamios visibles.

El nivel uno mantiene sus **80 unidades** mientras dura la obra. Al terminar y recibir la confirmación del servidor, el nivel dos habilita **160 unidades**. La ampliación no cambia la ubicación, orientación ni huella del edificio; conserva sus lotes y reservas. No vuelve transferibles los materiales vinculados ni renueva la caducidad de los alimentos.

La capacidad libre y las reservas para entregas utilizan el nivel efectivo del almacén. Un contador que llega a cero muestra que falta confirmar la finalización; no permite ocupar por adelantado las nuevas plazas.

La [guía del distrito](DISTRITO-JUGABLE.md) describe construcción, oficios y almacenamiento. La [guía industrial](INDUSTRIA-Y-COMERCIO.md) explica la madera finita, los pedidos del aserradero y el contrato que paga al descargar.
