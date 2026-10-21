# Desbloqueos por experiencia y equilibrio de acceso

## Implementado en la alfa

El nivel del explorador habilita conocimiento, separado del nivel de sus edificios. Las 24 recetas y los seis planos habitables tienen un nivel requerido visible. El servidor comprueba el requisito tanto al cotizar como al confirmar. La XP no se consume, no se compra y no se reemplaza por un campo enviado por el cliente.

| Nivel del explorador | XP acumulada | Recetas habilitadas | Planos habitables |
| --- | ---: | --- | --- |
| 1 | 0 | Tablón, Tejido, Semilla, Nutriente, Ración, Pan, Lingote, Pico, Armadura, Lanza, Munición | Cobertizo, Mesa de trabajo, Bancal |
| 2 | 100 | Cable de cobre, Vidrio, Botiquín, Kit de campamento | Vivienda, Puesto forestal |
| 3 | 250 | Aleación, Reparación, Carro | Aserradero propio |
| 4 | 450 | Conserva, Módulo de apertura I, Escáner, Refugio climático, Kit de puente | — |
| 5 | 700 | Módulo de apertura II | — |

Los ingredientes y el nivel del taller siguen siendo necesarios. Por ejemplo, desbloquear Reparación a nivel 3 no regala la aleación ni elimina su fabricación. El catálogo de esta entrega cubre los niveles 1–5; la experiencia y los niveles posteriores siguen acumulándose, sin prometer recetas o planos que todavía no existen.

La primera venta permanece disponible desde nivel 1. Un jugador puede acumular 61 XP con la ruta guiada y 90 XP con las tres obras básicas, alcanzando nivel 2 sin pagar. Son ejemplos de acciones existentes, con sus costes y tiempos; no se conceden esas recompensas automáticamente.

Los edificios construidos o aceptados antes de la activación conservan sus funciones y su plano. Las recetas previamente aceptadas y las capacidades históricas comprobables de estaciones avanzadas se conservan. El corte es fijo: `2026-10-16T10:58:05.601Z`. Ni el inventario comprado ni mejorar un edificio después del corte crean evidencia histórica para saltarse niveles. No se reescribe la partida ni se cancela trabajo ya confirmado.

## Aviso y animación

Cada umbral alcanzado genera un aviso histórico con identificador estable y cero XP adicional. El cliente muestra una celebración breve con los nuevos contenidos habilitados; los saltos de varios niveles se agrupan, incluyendo los desbloqueos del rango. No se celebran retroactivamente todos los niveles en el primer acceso.

La celebración espera a que terminen las cotizaciones, confirmaciones y otros avisos. Las recargas no vuelven a premiar una actividad. El estado de presentación se conserva por explorador en este navegador y se sincroniza entre sus pestañas; el servidor sigue siendo la autoridad del nivel. Se respeta la preferencia de movimiento reducido y no se añade ningún contexto WebGL ni bucle gráfico continuo.

## Gratis y pago

**Reglas activas:** todos los desbloqueos se consiguen jugando. No existe compra de XP, saltos de nivel, recetas exclusivas de pago ni aumento de las reservas por pagar. Se mantienen los costes, cantidades, cupos y monedas existentes. Hay [potenciadores gratuitos de prueba](TEST-BOOSTERS.md) para producción civil manual: hasta 20 % menos de tiempo de trabajo y 30 minutos de ahorro por cuenta en las últimas 24 horas. No hay cobros ni multiplicador de XP.

Los potenciadores utilizan pases ganados jugando, separados de la XP y de los créditos. La bienvenida concede tres una sola vez por cuenta. Cada primer alcance de un nuevo nivel máximo de la cuenta, desde el nivel 2, reconoce dos más; llevar otro explorador a un nivel ya alcanzado no repite esa recompensa. El nivel propio del explorador sigue determinando sus recetas y planos, aunque el saldo de pases sea común.

También hay pases por el encargo inicial del distrito pagado, por cada producto demandado vendido a la Feria una vez por cuenta y temporada, y por entregas comerciales pagadas de dos tablones a Valleverde. Fabricar, aceptar un contrato o presentar una cotización no basta. Los hechos históricos comprobables se reconocen automáticamente, sin migración ni botón para reclamarlos. El [detalle de obtención y consumo](TEST-BOOSTERS.md) incluye el límite de un pase por orden potenciada, incluso con ahorro parcial, y la conservación de las reservas anteriores.

**Propuesta para una fase posterior, pendiente de medir:**

- Comenzar la monetización por cosméticos y comodidad; medir primero el prototipo gratuito de aceleración de producción civil.
- Conservar los límites del prototipo: máximo 20 % de reducción de duración y 30 minutos de ahorro acumulado por cuenta en las últimas 24 horas, sin combinar potenciadores. El servidor controla las reservas por cuenta y su procedencia.
- Conservar los mismos materiales por unidad producida, el gasto de agua, la fertilidad, los yacimientos finitos y los cupos regionales. Un potenciador no debe crear recursos gratuitos.
- Sin multiplicador directo de XP ni compra de niveles. Una mayor velocidad de producción puede acelerar indirectamente la progresión; hay que medir también esa diferencia.
- Excluir combate, protección, cuotas de extracción y ventajas exclusivas. La alfa ya permite ganar pases acotados mediante juego; cualquier ampliación de esas recompensas o venta futura necesita conservar su presupuesto y trazabilidad.
- Medir antes de abrir ventas: tiempo hasta cada nivel, volumen diario por cuenta, acceso del jugador gratuito al mercado, riqueza acumulada, precios y diferencia entre usuarios con y sin potenciador. Ajustar los límites según datos, sin presentarlos como equilibrio ya demostrado.

La monetización no está conectada en esta alfa. Activarla requerirá un circuito de compra y reembolso, límites verificables y pruebas económicas propias; no basta con añadir un botón de pago.

## Conservación y desarrollo

Se conserva el mismo Worker, D1 y acceso privado. Las comprobaciones comparan las cuatro partidas con el respaldo previo y verifican que proyectar XP y desbloqueos no escriba datos. La configuración de TypeScript excluye exportaciones antiguas, QA y artefactos generados; el Worker fuente y las pruebas de producto siguen incluidos.
