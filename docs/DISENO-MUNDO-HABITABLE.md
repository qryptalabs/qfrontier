# Diseño del mundo habitable de QFrontier

Propuesta de evolución del 15 de octubre de 2026.

La primera parte ya cuenta con una entrega acotada: [DISTRITO-JUGABLE.md](DISTRITO-JUGABLE.md) describe lo implementado y cómo probarlo. Las propuestas más amplias de este documento siguen siendo etapas de evolución.

QFrontier evolucionará hacia un mundo social donde cada persona pueda explorar, elegir oficios, construir, comerciar y asumir las consecuencias de sus actos. Personaje, edificios, habitantes, vehículos y ciudades compartirán recursos y reglas verificables. La primera entrega conectará una actividad completa con la propiedad y el progreso del jugador; las demás capas crecerán sobre esa base.

## Base del juego actual

El juego conserva parcelas permanentes, protección inicial de 72 horas, inventarios por lotes con procedencia y caducidad, herramientas con desgaste, recetas, viajes, convoyes, mercado, trueque, contratos y clanes. Las concesiones territoriales ya incluyen mantenimiento. Los movimientos de dinero y materiales se autorizan en el servidor.

La economía efectiva utiliza 81 sectores. El planeta, sus poblados y las cinco comunidades pesqueras amplían el escenario gráfico, pero las capturas y cajas animadas no son existencias económicas. El catálogo original tiene 40 objetos y 24 recetas; pescado, animales, redes y barcos propios necesitan una extensión de catálogo. La conserva existente utiliza raciones y hierbas y conservará su receta.

La cámara del atlas y la posición del explorador son datos distintos. El personaje caminable necesitará una posición propia. Las coordenadas de una ciudad distante tampoco pueden recortarse a uno de los sectores actuales para darle inventario: cada comunidad económica nueva necesitará un nodo y rutas identificables.

## Identidad y profesiones

El perfil tendrá nombre, apariencia, indumentaria, biografía, oficios, habilidades y reputación. La facción existente seguirá siendo independiente del oficio. Cualquier persona podrá aprender a pescar, transportar, construir, cultivar o comerciar y combinar actividades sin reiniciar su personaje.

La especialización mejorará la calidad, las recetas y la eficiencia de forma moderada. El prestigio profesional reconocerá entregas útiles, obras y servicios completados. La reputación civil dependerá de hechos registrados, como cumplir contratos o cometer delitos, y podrá cambiar con el comportamiento.

Una persona especializada en pesca tendrá varias formas de prosperar: mejorar su equipo, conservar mejor las capturas, operar varios barcos dentro de su capacidad, contratar tripulación y negociar suministros. También podrá seguir siendo un buen pescador sin convertirse obligatoriamente en gobernador o industrial.

## Mundo y formas de recorrerlo

El atlas mantendrá la navegación planetaria, coordenadas, localización de aldeas y vuelo hasta destinos. Un modo Recorrer permitirá controlar al personaje con teclado y clic, con cámara en tercera persona elevada. Ambos modos mostrarán los mismos lugares; observar una ciudad desde el atlas no trasladará al personaje ni sus recursos.

El planeta tiene una superficie finita. La generación determinista y la carga de zonas cercanas permitirán ampliar el contenido y explorar regiones extensas. Nuevos territorios o mundos podrán incorporarse después manteniendo sus coordenadas y reglas. El objetivo será una experiencia amplia y expansible, sin prometer una superficie literalmente infinita dentro de una esfera.

Antes de abrir toda la superficie al paseo se comprobarán escala humana, pendientes, agua, puentes, cercas y colisiones de edificios y vegetación. Los modelos del atlas necesitan una revisión a distancia cercana, especialmente puertas, accesos y vehículos. Los interiores llegarán después de esa revisión.

## Viajes y supervivencia

Un viaje identificará origen, destino, ruta, distancia, duración estimada, clima, zonas de riesgo, provisiones y carga. El jugador verá el coste antes de salir. Podrá explorar manualmente; los trayectos despachados actuales se extenderán a las nuevas rutas del mundo habitable.

| Transporte | Necesidades | Consecuencia del agotamiento |
| --- | --- | --- |
| A pie | Agua, alimento, descanso y capacidad de carga | Fatiga, menor velocidad y necesidad de acampar o pedir ayuda |
| Carreta | Provisiones del viajero, agua y alimento del animal, arnés y condición de ruedas | Descanso, reparación, descarga parcial o rescate |
| Barco | Provisiones de tripulación, condición del casco, equipo y espacio de carga | Regreso, reparación, refugio o asistencia |

El consumo dependerá de distancia, carga, clima y esfuerzo autorizado, con cantidades máximas conocidas. Los animales tendrán propietario, salud, cansancio y necesidades. Un animal herido podrá recibir cuidados; una muerte durante un viaje peligroso dejará la carreta sin tracción y exigirá sustitución, remolque o recuperación de la carga.

Desconectarse cerrará el control manual mediante un estado de campamento o una resolución de viaje definida, conservando cualquier exposición o conflicto previamente aceptado. Los trayectos despachados seguirán las condiciones aceptadas. Reconectar no permitirá repetir un accidente hasta obtener un resultado favorable. El personaje y los animales guardados en un lugar seguro no sufrirán hambre indefinida por ausencia del usuario.

## Averías rescates y recuperación de materiales

Una carreta inmovilizada conservará vehículo, propietario, condición y carga en su posición autorizada. El dueño podrá repararla, pedir ayuda, descargar hasta su capacidad de transporte o abandonarla expresamente.

El humo, las bengalas y las balizas tendrán alcance, duración, consumo y destinatarios definidos. El humo dependerá de la visibilidad local; una bengala ofrecerá una señal más visible. La señal llegará a compañeros dentro de su cobertura y podrá convertirse en un contrato de rescate. No garantizará que un equipo lejano pueda llegar de inmediato.

Un plazo de recuperación protegerá inicialmente la carga. Tras un abandono o vencimiento publicado, los bienes recuperables podrán pasar a otros jugadores o recuperadores NPC según la ley de esa zona. El rescate y el desguace serán acciones excluyentes: las mismas ruedas no podrán aparecer a la vez en una reparación y en el inventario de otro usuario.

El desguace devolverá una parte de los materiales identificados de la fabricación, ajustada por condición. Construir, desmontar y reconstruir no aumentará materiales ni renovará su procedencia. Si nadie atiende un rescate básico, una alternativa NPC con coste y espera acotados permitirá volver a jugar.

## Construcción y propiedad

La construcción empezará con módulos y planos: cimientos, paredes, techos, accesos, almacenes, viviendas y talleres. Los costes, resistencia y utilidad pertenecerán a esas piezas. Después se ampliarán formas, materiales y combinaciones para permitir edificios más libres.

Colocar una obra exigirá propiedad o permiso, terreno apropiado, materiales reservados, espacio, acceso y tiempo de trabajo. El servidor comprobará ocupación, caminos y agua. La expansión de una aldea requerirá nuevos derechos sobre terreno; la parcela inicial no crecerá sobre la propiedad de otro jugador.

Una ciudad crecerá por viviendas, población, abastecimiento, empleo y servicios disponibles. Su categoría reconocerá capacidad real. Hospitales, industria y tecnología necesitarán personal, equipos, suministros y mantenimiento.

Las propiedades tendrán títulos independientes de su apariencia gráfica. Un edificio podrá dividirse en apartamentos con propietario, acceso, áreas comunes y cuotas conocidas. La compraventa transferirá el título mediante una transacción; el edificio y sus almacenes no se duplicarán.

Vender un terreno o un complejo urbano respetará los títulos y contratos de sus residentes. La administración de una ciudad, la propiedad de un edificio y la titularidad de cada apartamento serán derechos distintos. La parcela básica permitirá recuperarse de una quiebra sin perder todo acceso al juego.

## Economías conectadas

| Escala | Actividades | Conexión con las otras escalas |
| --- | --- | --- |
| Persona y pequeña comunidad | Pescar, cultivar, recolectar, reparar, transportar | Aporta alimentos, trabajo e insumos; compra herramientas y servicios |
| Aldea y empresa | Conservar alimentos, aserrar, cocinar, almacenar, construir | Compra producción local, añade valor y organiza entregas mayores |
| Ciudad y región | Medicina, maquinaria, infraestructura, investigación y gobierno | Compra suministros y distribuye tecnología, encargos y servicios |

Las conexiones funcionarán en ambos sentidos. Una ciudad necesitará alimentos de sus comunidades, mientras las comunidades comprarán medicinas, herramientas y transporte. Los contratos asíncronos permitirán participar sin que todos los proveedores estén conectados al mismo tiempo.

Toda producción requerirá tiempo, capacidad, insumos y un recurso o encargo reservado. Los almacenes tendrán espacio limitado y las mercancías estarán en una ubicación concreta: mochila, carreta, barco, taller o depósito. Transferir carga será una operación verificable; un objeto en una ciudad no estará disponible automáticamente en otra.

La pesca tendrá bancos identificables, reservas de captura y, si se habilita recuperación, un ritmo y un máximo explícitos. La regeneración no dependerá del número de cuentas conectadas. Las reglas existentes de minerales y demás reservas conservarán su significado. Los nuevos objetos y recetas se añadirán mediante una extensión versionada.

Las ciudades y empresas NPC comprarán dentro de sus necesidades, capacidad de almacenamiento y presupuestos. Los pagos de jugadores, jornales, tributos y contratos moverán créditos existentes. Cualquier emisión inicial o recompensa tendrá un presupuesto separado y visible en la contabilidad.

Transportar la misma caja entre cuentas no generará progreso ilimitado. La experiencia económica reconocerá el uso final de bienes en servicios, consumo u obras. La caducidad acompañará al lote y no se reiniciará al cambiar de dueño o de almacén.

## Costes y rentabilidad

La gestión mostrará ingresos, salarios, suministros, desgaste, transporte, impuestos y reservas para imprevistos. La diferencia disponible permitirá invertir, ampliar o guardar un fondo de mantenimiento.

Ejemplo ilustrativo de una operación, expresado íntegramente en créditos ficticios:

| Concepto | Valor |
| --- | ---: |
| Venta de la producción | 100 |
| Provisiones y suministros | 12 |
| Desgaste y reparación | 8 |
| Transporte | 15 |
| Jornales | 10 |
| Impuesto local | 5 |
| Excedente para ahorro o inversión | 50 |

Los importes sirven para explicar el margen y deberán ajustarse con las pruebas del piloto. El coste de los materiales se valorará sin cobrar dos veces el mismo gasto. Los pagos a transportistas y trabajadores serán ingresos de sus receptores, no dinero desaparecido.

Las estaciones tendrán un presupuesto diario para sus servicios activos y habitantes contratados. Los ciclos de 24 horas de la economía se distinguirán de la duración visual del día y la noche. Antes de operar se reservarán los suministros y pagos necesarios. Los ingresos de las ventas realizadas podrán financiar el siguiente ciclo; una venta futura no sustituirá esa reserva inicial.

Al faltar suministros, la instalación reducirá actividad y podrá suspenderse. El propietario elegirá qué servicios sostener y podrá usar almacenamiento de reserva. Las órdenes ya financiadas se completarán dentro de sus límites. Las ausencias no generarán una deuda de mantenimiento sin tope que destruya toda la partida.

## Ciudades impuestos y convivencia

Cada ciudad publicará su jurisdicción, servicios, normas de construcción, impuestos y permisos. Las reglas serán consultables antes de comprar, trabajar o circular con carga. Los cambios tendrán fecha de entrada en vigor y respetarán los contratos existentes.

La tesorería municipal registrará recaudación y gastos. Los impuestos financiarán servicios concretos, como caminos, seguridad, salud, abastecimiento o rescates. El gobernador administrará dentro de límites globales y con suplencia para sus ausencias.

Las normas locales podrán diferenciar ciudades, pero no eliminar las protecciones globales ni imponer sanciones inventadas después de los hechos. Una ciudad no podrá utilizar cambios de normas para confiscar arbitrariamente propiedades ajenas.

## Delitos justicia y conflicto

El sistema distinguirá comercio legal, conflicto autorizado y delito. El comportamiento del personaje definirá su reputación. Robar una carga, agredir o dañar una propiedad generará un hecho con responsable, perjudicado, lugar, hora y pruebas del servidor.

La respuesta local dependerá de jurisdicción, vigilancia y gravedad: intervención del sheriff, búsqueda, devolución del botín, reparación, multa y una detención limitada. La cárcel permitirá tareas y acciones propias, con plazo conocido y alternativas de reparación. Pagar una fianza no borrará automáticamente la restitución, la reputación ni la protección temporal del perjudicado.

Se conservarán el escudo de 72 horas y las condiciones actuales de participación en PvP. La aldea básica y su almacén conservarán su protección permanente al vencer ese escudo. Las rutas y zonas de conflicto mostrarán sus riesgos y condiciones de entrada. Los reportes de usuarios servirán para revisión, sin constituir por sí solos una sentencia automática.

Las multas y recompensas tendrán origen, destino y límites. Robar a un cómplice y dejarse capturar repetidamente no creará créditos. Habrá condiciones de recuperación para evitar ataques encadenados a la misma persona.

## Préstamos garantías e hipotecas

Los préstamos pertenecerán a la economía ficticia del juego. Un banco prestará créditos de su tesorería o fondos realmente depositados y reservados. La operación identificará principal, plazo, interés, calendario, garantía, periodo de gracia y consecuencias del incumplimiento antes de aceptarse.

La garantía tendrá valoración conservadora según condición y referencias de mercado. Como punto de partida para el balance puede estudiarse prestar hasta el 50 % de ese valor. Una compraventa aislada entre amigos no fijará el valor de una hipoteca.

Los recursos dados en garantía quedarán inmovilizados. Un edificio hipotecado conservará su título y gravamen identificables y no podrá venderse o hipotecarse de nuevo sin resolver el contrato. Cada préstamo se concederá una sola vez mediante una transferencia registrada.

La mora tendrá avisos, plazo de gracia y recargos con tope. La recuperación afectará al activo secundario pactado y devolverá cualquier excedente tras liquidar la deuda. La vivienda inicial, los derechos de terceros y la posibilidad básica de continuar jugando quedarán protegidos. Los tres meses del ejemplo del usuario requieren elegir y mostrar una escala de tiempo antes de fijar ese plazo en el juego.

## Primera entrega jugable

La primera entrega será un distrito piloto donde se pueda habitar, trabajar y construir. Tendrá estos resultados concretos:

1. Crear una apariencia y un oficio inicial flexible, conservando la cuenta y la parcela.
2. Entrar en Recorrer, caminar por una zona delimitada, ver a otros participantes cercanos e interactuar con edificios y un contratante.
3. Separar mochila y almacén, con capacidad y transferencias comprobadas.
4. Colocar y orientar unas pocas plantillas de taller, huerto o depósito dentro de terreno autorizado, con coste, colisiones y fase de obra.
5. Completar un encargo con el catálogo existente: extraer madera transferible, transformarla en tablones, transportarlos, entregarlos y cobrar créditos reservados. Los materiales vinculados del tutorial y sus derivados conservarán esa condición.
6. Mostrar el coste de esa actividad, su beneficio y la mejora que permite financiar.
7. Reconectar y conservar personaje, obra, mercancía y pago sin duplicaciones.

Este recorrido utilizará un oficio rentable y una entrega verificable para probar la conexión entre identidad, libertad, propiedad y economía. Los NPC podrán cubrir encargos con presupuesto y capacidad limitados mientras haya pocos jugadores.

## Etapas posteriores

| Etapa | Resultado verificable |
| --- | --- |
| Logística y pesca jugable | Una ruta puerto ciudad produce lotes reales, utiliza animales propios, consume provisiones y admite un rescate básico |
| Empresas y crecimiento urbano | Trabajadores, mantenimiento financiado, servicios y viviendas permiten ampliar una comunidad sin romper el abastecimiento |
| Comercio regional | Las cinco comunidades tienen nodos económicos, especialidades y rutas con inventarios localizados |
| Gobierno y propiedad transferible | Ciudades con tesorería, normas publicadas, edificios vendibles y apartamentos con derechos separados |
| Justicia y riesgo | Delitos verificables, sheriff, restitución, cárcel recuperable y rutas de conflicto con condiciones claras |
| Crédito | Garantías bloqueadas, préstamos financiados, intereses acotados y recuperación contractual de activos |

## Contratos técnicos

El servidor mantendrá los estados que conceden derechos, consumen bienes o cambian saldos. El cliente representará sus resultados. Las rutinas de los habitantes comunes podrán funcionar con estados y horarios; cada NPC no necesita una llamada a un modelo de lenguaje para caminar o trabajar.

| Entidad | Datos que necesita |
| --- | --- |
| Avatar | Cuenta y personaje, apariencia, oficios, posición autorizada, orientación, actividad y provisiones |
| Propiedad | Titular, límites, permisos, subunidades y gravámenes |
| Edificio | Plano, ubicación, orientación, obra, condición, capacidad, servicios y almacén |
| Nodo económico | Puerto, ciudad o instalación, inventarios, demanda, presupuesto y conexiones |
| Viaje | Participantes, vehículo, animal, ruta, carga, reservas, tiempos y estado de recuperación |
| Contrato | Partes, bienes, pago reservado, condiciones, entrega y resolución |
| Hecho legal | Autor, víctima, lugar, jurisdicción, acción validada y resolución |

El movimiento frecuente y la presencia de avatares utilizarán un canal por región, con validación de velocidad y acciones. Los cambios de inventario, títulos y contratos seguirán transacciones persistentes. El estado mundial actual se guarda como un JSON en D1 con revisión; no se reescribirá ese documento por cada fotograma del paseo.

La ampliación añadirá estados y migraciones versionados. Mantendrá identificadores, inventarios, cuentas, parcelas, trabajos y vencimientos existentes. La activación de nuevas reglas económicas empezará en el distrito piloto; las cajas de los ciclos visuales actuales no se convertirán retroactivamente en riqueza de un usuario.

## Criterios para probar cada entrega

- Dos personas ven posiciones coherentes y nadie cruza propiedades o edificios mediante movimiento inválido.
- Mirar otra parte del mapa no consume provisiones ni teletransporta personaje o mercancía.
- Una misma carga no puede estar en mochila, carreta y almacén simultáneamente.
- Repetir una solicitud o reconectar durante una entrega no duplica objetos ni créditos.
- Una obra exige materiales y permiso, y no bloquea accesos protegidos ni terrenos ajenos.
- Producción, venta, impuestos, salarios y gastos concilian con sus presupuestos.
- Un animal o vehículo inmovilizado permite una salida recuperable y conserva la propiedad de la carga durante su plazo.
- Una garantía no puede comprometerse dos veces y el banco no presta fondos inexistentes.
- Las partidas previas conservan progreso y las protecciones acordadas.

## Referencias del proyecto

- [Tipos y estado económico](../lib/mvp/types.ts).
- [Catálogo y recetas](../lib/mvp/catalog.ts).
- [Mercados contratos y cuentas](../lib/mvp/social.ts).
- [Parcelas y protección inicial](../lib/mvp/settlements.ts).
- [Concesiones con mantenimiento](../lib/mvp/territory.ts).
- [Persistencia económica](../lib/mvp/store.ts).
- [Comunidades pesqueras actuales](COMUNIDAD-PESQUERA.md).
- [Mundo y navegación continua](MUNDO-CONTINUO.md).
