# Primer distrito jugable

La entrega del 15 de octubre de 2026 añade **Recorrer** a la navegación del juego. El distrito utiliza la parcela y la aldea existentes. Sus cambios se guardan en D1 junto a la partida; no reinicia perfiles, materiales, edificios, coordenadas ni protección inicial.

## Probarlo

1. Abre **Recorrer** o la [entrada directa](https://qfrontier-preview.example.invalid/?view=recorrer) con tu sesión privada.
2. Pulsa **Entrar al distrito**. En **Personaje**, elige conjunto, tono de piel, cabello y oficio; guarda los cambios.
3. Pulsa el suelo para caminar. Con la escena activa también puedes usar WASD o las flechas. El personaje sigue una ruta comprobada; la cámara lo acompaña y permite girar o alternar 2D y 3D.
4. En **Encargo**, acepta el trabajo del distrito. Los botones **Ir a…** te acercan al puesto correspondiente. La operación económica se confirma por separado cuando has llegado.
5. En **Construir**, elige una mesa de trabajo, un bancal, un cobertizo, una vivienda, un puesto forestal o un aserradero propio. Coloca la huella tocando el suelo, con **Sugerir espacio libre** o con los campos **X/Y** en pasos de 0,5. Gira el plano y revisa el coste antes de confirmar. Las obras se conservan al recargar y aparecen en las vistas de la parcela.
6. Abre **Habitantes** para registrar la comunidad y asignar un habitante a una instalación productiva. Su puesto define el oficio. Los trabajos que ya estaban iniciados mantienen su funcionamiento.
7. Abre **Producción** o pulsa una de tus construcciones en la escena. Usa su botón **Ir…** para acercar al personaje. Elige receta y origen de insumos —Estación o un cobertizo propio— y revisa la orden. El panel sigue la entrada de materiales, el trabajo y la entrega final.
8. El puesto forestal y el aserradero propio forman una cadena de madera y tablones. En **Economía** puedes preparar el contrato de Valleverde, seguir la recogida y el viaje del carruaje y comprobar el pago. La guía [Industria y comercio](INDUSTRIA-Y-COMERCIO.md) explica los recursos finitos y la entrega.

El oficio de tu personaje es una preferencia modificable; cualquiera de los tres permite completar el encargo. El puesto de un habitante se gestiona por separado desde **Habitantes**. Las obras que ya estaban construidas pueden usarse sin volver a pagar su coste. Las mejoras económicas originales siguen en **Estación**.

## Almacenamiento, fabricación y cultivo

El **cobertizo** guarda hasta 80 unidades en nivel uno y 160 en nivel dos, sumadas entre todos sus lotes. La ampliación tarda 60 segundos y utiliza dos tablones, dos maderas y dos fibras del inventario de Estación. Durante la obra conserva su capacidad anterior, su huella y sus lotes. Suministra insumos y recibe los productos transportados desde las instalaciones productivas. El panel separa las unidades almacenadas, el espacio reservado para entregas y la capacidad libre: una reserva en camino impide ocupar ese mismo espacio con otro depósito. Depositar traslada recursos del inventario de Estación al edificio; retirar los devuelve. No crea recursos, no convierte materiales vinculados en transferibles y conserva procedencia, calidad, desgaste y caducidad. Los alimentos también caducan almacenados. Puedes elegir el cobertizo como origen de una receta de mesa o un cultivo sin retirar los insumos a Estación; el aserradero propio se abastece de un cobertizo y el contrato de Economía carga sus tablones directamente allí. Las otras operaciones de Estación que usan el inventario del explorador requieren retirar primero sus lotes. Las cajas visibles reflejan su ocupación real.

La **mesa de trabajo** admite un lote por orden y una operación activa por mesa. Ofrece tablón, tejido, semilla, nutriente y ración con las recetas existentes: cada receta consume sus insumos y tarda cinco minutos base, o cuatro minutos y medio para Forjadores. La cotización muestra los recursos que se reservarán y la salida esperada. En las nuevas órdenes, un habitante trabaja en la mesa y lleva la salida a un cobertizo propio con espacio y acceso disponibles. El tiempo de traslado se añade al de fabricación. Los insumos vinculados producen bienes vinculados.

El **bancal** consume una semilla, dos aguas y un nutriente. En 45 segundos produce tres granos y una biomasa; después, el habitante transporta la cosecha al cobertizo. El grano se puede retirar para utilizarlo en las recetas de alimentos existentes. Utiliza la región del hogar y comparte los diez ciclos agrícolas de temporada del explorador y el presupuesto regional con la agricultura de Estación; construir más bancales no reinicia esas reservas. Necesita un hogar de bosque o llanura. Los brotes crecen durante el ciclo.

## Suministro desde el almacén

Cada receta y cultivo permite elegir **Origen de los insumos**. Estación conserva el uso directo del inventario del explorador. Al elegir un cobertizo, el panel muestra sus lotes vigentes y el tiempo estimado de suministro. La disponibilidad corresponde a ese origen: tener materiales en otro almacén o en Estación no completa una reserva del cobertizo seleccionado.

La cotización compromete lotes reales para una única orden. El habitante camina al cobertizo, recoge los materiales, regresa al puesto y los recibe antes de comenzar a producir. El panel distingue suministro programado, camino al almacén, recogida, traslado de insumos, preparación del puesto e insumos recibidos. La duración de la receta permanece en 300 segundos base —270 para Forjadores— y la del cultivo en 45; el transporte se añade antes y después del trabajo.

Los materiales reservados no pueden gastarse de nuevo durante el trayecto. Conservan procedencia, vinculación y caducidad. El servidor comprueba insumos, puesto, habitante y ruta al confirmar; una orden no empieza si falta alguno de ellos. Los botones muestran la razón de indisponibilidad y no sustituyen un origen por otro automáticamente.

Mientras el suministro está en cola y el habitante todavía no ha salido, la cancelación devuelve los lotes vigentes al mismo cobertizo y libera el ciclo agrícola reservado. Durante la caminata no se cancela el transporte. Tras recibir los materiales se aplica la regla de producción iniciada: cancelar consume los insumos y, en el bancal, el ciclo. El panel utiliza la disponibilidad del servidor y la cotización muestra el resultado antes de confirmar.

## Habitantes, oficios y viviendas

La parcela conserva dos plazas base. **Revisar registro de habitantes** crea explícitamente el padrón que permite asignar sus puestos; leer una partida anterior no lo inicializa ni reemplaza los obreros de sus trabajos ya iniciados. En **Habitantes** se ven los nombres, el puesto, la vivienda y si cada persona está disponible, trabajando, buscando insumos o transportando.

Una mesa asigna el oficio de fabricación, un bancal el de agricultura, un puesto forestal el de extracción y un aserradero propio el de aserrado. Un mismo habitante realiza el suministro, la producción y la entrega de su orden. La asignación y el retiro del puesto pasan por cotización; el personaje debe estar detenido. Un habitante ocupado mantiene su puesto hasta terminar y regresar. No se añade un transportista separado por cada tramo. Deja libre el acceso del edificio: estar cerca permite gestionarlo, pero ocupar la puerta puede impedir el paso del trabajador o del conductor comercial.

Una **vivienda** terminada habilita dos plazas adicionales. Construirla no incorpora habitantes automáticamente: acércate a su acceso y pulsa **Revisar incorporación** en su ficha de **Habitantes**. El servidor comprueba la plaza libre y la propiedad. La ficha de la vivienda en **Producción** enlaza con ese panel. No se introducen salarios.

La rutina de **Jornada y alimentación** requiere una activación explícita. Consume una ración por habitante y una madera por cada tres obras terminadas, redondeando hacia arriba, desde el cobertizo elegido. Un habitante existente y libre recoge los lotes, reparte a los demás, atiende el mantenimiento y vuelve a su puesto. Cada persona recibe 20 minutos de cobertura desde su entrega; no hay jornadas automáticas ni deudas acumuladas por ausencia. Las nuevas fabricaciones avanzadas se pausan al terminar la cobertura, mientras agricultura, extracción básica y recetas de ración, semilla y nutriente permiten preparar otra jornada. Las órdenes anteriores conservan sus reglas. La [guía de jornada y almacén](JORNADA-Y-ALMACEN.md) detalla costes, reparto, balance y ampliación.

## Habitantes y entregas

Cada nueva orden de mesa o bancal vincula el trabajo y el transporte de un habitante con esa producción real. El panel **Producción** distingue producción, recogida, camino al cobertizo, descarga, regreso y entrega terminada. Muestra la carga, el destino asignado y el tiempo restante del recorrido completo de entrega. Si el camino tiene otra entrega en curso, muestra la salida programada y conserva la reserva de espacio del cobertizo. **Ver cobertizo de destino** abre sus existencias; no desplaza al personaje ni mueve recursos.

Si falta un cobertizo terminado, capacidad o un camino seguro, los productos quedan pendientes en la instalación. No se envían automáticamente a Estación. Los lotes conservan su caducidad durante la espera y el traslado; almacenarlos no renueva su edad. Si todos los productos pendientes caducan antes de asignarse una entrega, el panel informa **Productos caducados** y permite iniciar otra orden sin devolver los insumos anteriores. El panel explica la espera; puedes preparar el almacén o liberar espacio retirando lotes. La entrega se vuelve a evaluar al consultar la partida y también puedes acercarte a la instalación de origen y **Revisar reintento de entrega**, con la cotización habitual. No hay un botón que cree una segunda copia de la carga.

La mesa o el bancal no admiten otro ciclo mientras haya producción, entrega o regreso pendientes. La capacidad de destino se reserva para la carga asignada y el depósito se registra una sola vez. La vista y la animación se derivan de esos tiempos y estados; cerrar la pestaña no interrumpe el trabajo confirmado.

Las órdenes de instalaciones que ya estaban iniciadas antes de esta ampliación conservan su entrega original al inventario de Estación. El panel las identifica por su destino. El encargo inicial del distrito y las operaciones de Estación mantienen sus reglas; no se reinician partidas ni se reconvierten sus resultados en transportes nuevos.

Cada operación requiere una obra propia terminada y un personaje detenido cerca de su acceso seguro. No se puede usar una obra ajena ni operarla a distancia durante un paseo o viaje. La producción ya confirmada continúa al salir del juego y se resuelve al consultar de nuevo la partida. Cancelar una producción iniciada no devuelve sus insumos ni el ciclo agrícola consumido. El servidor comprueba los límites al confirmar y conserva los recibos para impedir entregas duplicadas.

## Un encargo, de principio a fin

La encargada necesita **dos tablones** hechos con **cuatro maderas**. Al aceptar se reservan **16 créditos** del presupuesto existente de la feria y cuatro unidades de un yacimiento forestal con existencias disponibles. La ficha identifica el sector de origen.

El puesto forestal gestiona esa reserva del distrito. No convierte la llanura de tu expedición en bosque ni cambia su casilla económica. Al solicitar la extracción desde el puesto, el trabajo tarda diez segundos y entrega madera transferible con la procedencia del yacimiento y del trabajo.

El aserradero utiliza la receta existente de tablones: dos maderas por tablón, dos lotes. Su duración base total es diez minutos, con los modificadores originales de fabricación y las colas del taller. La madera del tutorial no sustituye los insumos de este encargo.

Acércate a recepción cuando termine la fabricación. La entrega consume los dos tablones de ese trabajo y libera los 16 créditos reservados. Los tablones deben conservar su procedencia: venderlos o usarlos antes de entregar impide cumplir el encargo. La entrega queda registrada y no puede cobrarse de nuevo.

El encargo vence a las 24 horas. Cancelarlo o dejarlo vencer devuelve el pago reservado y la madera sin extraer a sus reservas. La madera ya extraída no se regenera; los trabajos de fabricación iniciados mantienen sus reglas. Es un encargo inicial por cuenta, compartido entre sus exploradores. Cancelar antes de retirar madera permite empezarlo con otro perfil sin duplicar recursos.

## Construcción y movimiento

Las obras usan el inventario existente y conservan si sus materiales estaban vinculados. El piloto permite seis obras pequeñas por parcela.

| Plano | Materiales | Obra | Huella sin girar |
| --- | --- | --- | --- |
| Cobertizo | 4 maderas + 2 piedras | 30 s | 3,2 × 2,8 |
| Mesa de trabajo | 3 maderas + 1 piedra | 15 s | 2,4 × 1,6 |
| Bancal | 2 maderas + 2 fibras | 20 s | 2,6 × 2 |
| Vivienda | 1 tablón + 2 piedras + 1 tejido | 45 s | 3,2 × 2,8 |
| Puesto forestal | 1 madera + 1 piedra | 25 s | 2,2 × 1,8 |
| Aserradero propio | 4 maderas + 2 piedras | 60 s | 3,2 × 2,8 |

Los planos nuevos no cambian la mesa ni el aserradero del encargo inicial. El aserradero propio utiliza su ciclo específico de 60 segundos; la mesa y el encargo mantienen sus recetas y tiempos anteriores.

Las **mejoras de los edificios originales de Estación** también tienen un plazo real: 60 segundos multiplicados por el nivel actual. Subir de nivel uno a dos tarda un minuto; de dos a tres, dos minutos. Durante la obra se ven cuadrilla y andamios y el edificio conserva su nivel y capacidad anteriores. El nuevo nivel se activa al finalizar, sin reiniciar cuotas ni reservas. Una misma instalación no admite dos mejoras simultáneas; la cotización conserva los materiales y límites del catálogo existente.

La validación comprueba el área habilitada de la aldea dentro de la parcela, edificios, árboles, cultivos, rocas, agua, pendientes, puestos, el personaje y los accesos. Las obras nuevas necesitan una entrada alcanzable y deben conservar las entradas de las instalaciones existentes. Las huellas de colisión de los edificios originales corresponden a sus modelos para conservar los pasillos visibles. El servidor repite las comprobaciones al confirmar. El movimiento utiliza la misma geometría y una velocidad máxima de 2,2 unidades por segundo. El cliente dibuja la interpolación de la ruta aprobada; no autoriza desplazamientos ni pagos.

La posición caminable se añade como un campo separado. No reinterpreta `Player.position`, que continúa identificando el sector de la expedición. Un viaje o convoy activo impide recorrer el distrito hasta terminar. En esta entrega el recorrido a pie está delimitado al distrito propio; el atlas completo mantiene su navegación visual y sus viajes económicos.

## Persistencia y comprobación

El estado opcional `Player.habitable` contiene apariencia, oficio, posición, ruta temporal, obras y encargo. El padrón de habitantes se conserva por separado dentro de ese estado. Cada obra puede incorporar sus lotes de almacenamiento, la referencia a su trabajo y sus trayectos de suministro y entrega. Las partidas anteriores pueden leerse sin inicializar estos campos ni consumir materiales. No se cambia el esquema SQL ni se sustituyen los datos del mundo. Las aldeas ajenas sólo reciben el resumen visual de sus obras y habitantes; no se publican sus lotes ni sus referencias privadas de producción.

Las órdenes pasan por la cotización firmada, control de revisión y recibo idempotente existentes. Caminar y guardar apariencia confirman automáticamente una cotización sin consumos; las obras y el encargo mantienen la revisión visible. El saldo en reserva se incluye en la conciliación del presupuesto de créditos.

Las pruebas cubren conservación de partidas anteriores, propiedad, rutas, agua, obstáculos, construcción, reservas, procedencia de materiales, cancelación, vencimiento y repetición de entrega. El acceso privado y las comprobaciones de Cloudflare Access permanecen activos.

Las profesiones avanzadas, interiores, supervivencia, animales propios, delitos, gobierno y préstamos siguen en el [diseño de evolución](DISENO-MUNDO-HABITABLE.md). Esta entrega establece el primer ciclo de personaje, trabajo y construcción sobre la economía actual.
