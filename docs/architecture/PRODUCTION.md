# Arquitectura modular de producción · plan implementable

Fecha de corte: 2026-10-20. Este documento separa el código que existe del despliegue siguiente que se propone implementar. **No hay servicios DO/Queue de producción ocultos en este repositorio**. La raíz actual sigue siendo una aplicación vinext/React sobre Workers con D1, también ejecutable con SQLite local y Tunnel.

## 1. Contratos de la API actual

| Ruta real | Lectura | Escritura y autorización |
| --- | --- | --- |
| `/api/mvp?playerId=...` | `readMvpView` | `executeMvp`; requiere cotización validada salvo `player.create`. |
| `/api/mvp/quote` | No es lectura de mundo por GET | Cotiza un comando sin ejecutarlo; el resultado autoriza la confirmación posterior. |
| `/api/city-shop?cityId=...&playerId=...` | `readCityShop` | `executeCityShop`, validación específica del servicio. |
| `/api/royal-harbor?playerId=...` | `readRoyalHarbor` | `executeRoyalHarborTrade`; rechaza campos de cotización MVP y usa su confirmación y revisión propias. |
| `/api/royal-kingdom?playerId=...` | `readRoyalKingdom` | `executeRoyalKingdom`, validación específica del servicio. |

Todas pasan por `getChatGPTUser()` y el Worker de Access. Ese nombre de función es histórico; en este despliegue obtiene identidad verificada de Cloudflare, no una identidad elegida por el navegador. Los POST comparten la envoltura validada por `lib/mvp/http.ts`:

```json
{
  "requestId": "00000000-0000-4000-8000-000000000101",
  "expectedRevision": 42,
  "quoteToken": "token-obtenido-al-cotizar",
  "quoteExpiresAt": 1792500000000,
  "command": {
    "type": "craft.start",
    "playerId": "p_example",
    "recipeId": "plank",
    "qty": 1,
    "transferableOnly": true
  }
}
```

Los campos de cotización no se envían indiscriminadamente a todos los servicios. Esquema, estado y token deben corresponder a la operación real. No enviar este ejemplo literal a una partida. `actionRequest` limita el cuerpo a 16.000 caracteres, valida origen cuando se informa, y no confía en `ownerId` enviado por el cliente. Las vistas son privadas, con `Cache-Control: no-store`.

## 2. Punto de partida y restricciones

- `lib/mvp/store.ts` selecciona `world_state`, revisión global y JSON. Conserva atomicidad de la alfa; serializa conflictos y crece con el mundo.
- `createPartitionedMvpStore` es opt-in. `db/partitioned-world.sql`, `player-read-model.sql`, `village-writes.sql`, `bounded-village-reads.sql` son preparación experimental, fuera de `drizzle/`.
- El candidato ya aporta versiones de entidades, contexto por aldea/cuenta, recibos y proyecciones; todavía tiene fallbacks y conjuntos compartidos que crecen.
- Tiendas y servicios reales del reino siguen usando el selector global. No basta con renombrar carpetas para portarlos a commits acotados.
- Los mundos de pruebas Workers y PC son bases independientes. Publicar GitHub no los reconcilia ni modifica.
- La presencia visual, las animaciones y la posición dibujada nunca constituyen prueba suficiente de propiedad, gasto o entrega.

## 3. Topología elegida para la primera producción

Entorno objetivo concreto: `prod/frontier-01`, separado de `staging/frontier-01`. D1 mantiene una autoridad económica por realm para conservar transacciones entre compradores, vendedores y aldeas. Durable Objects sólo coordinan presencia y distribución por área de interés durante esta fase. No se entrega toda una ciudad concurrida a un único objeto.

| Desplegable objetivo | Bindings propuestos | Función y permisos |
| --- | --- | --- |
| `qf-web` | `ASSETS`, `GAME_API` (service binding), `PRESENCE` | Access, rutas web, estáticos y proxy de API. Sin SQL económico directo. |
| `qf-game-api` | `REALM_DB`, `JOBS_QUEUE`, `PROJECT_QUEUE` | Único escritor económico; comandos autenticados y liquidaciones internas verificadas. |
| `qf-jobs` | `GAME_API`, `REALM_DB` sólo para planificador | Consume avisos de vencimiento y pide liquidación. No calcula recompensas independientemente. |
| `qf-projection` | `REALM_DB`, `PUBLIC_DB`, `PRESENCE` | Lee outbox confirmado, publica vistas públicas y notifica versiones. No escribe carteras. |
| `qf-presence` | namespace `PRESENCE`, clase SQL `PresenceHub` | WebSockets con hibernación y suscripciones por celda; sin autoridad de inventarios. |

`PUBLIC_DB` es un read model derivado y reconstruible; no un segundo propietario de los mismos recursos. Las dos colas tienen consumidores y colas de fallos separadas. Un fallo de la cola no invalida un commit ya realizado: outbox y tabla de trabajos pendientes permiten recuperar el envío.

No se configura esta topología automáticamente al clonar. Los bindings anteriores son nombres del contrato de implementación futuro, no bindings existentes del `wrangler.jsonc` actual.

## 4. Carpetas objetivo y origen de cada módulo

```text
apps/
  web/
    app/                       # app/ actual, separando mvp-client por sección
    features/{world,village,travel,trade,progress,royal-city}/
    public/{models,audio,fonts}/
  game-api/
    src/http/{auth,commands,queries,quotes,errors}.ts
    src/handlers/{mvp,city-shop,royal-harbor,royal-kingdom}.ts
    src/internal/{settle-job,drain-outbox}.ts
workers/
  jobs/src/{consumer,sweep,due-index}.ts
  projection/src/{consumer,project-village,project-region,deliver}.ts
  presence/src/{PresenceHub,subscriptions,admission,protocol}.ts
packages/
  domain/src/
    inventory/{lots,reservations,provenance}.ts
    production/{recipes,jobs,settlement}.ts
    village/{land,paths,buildings,residents,manager}/
    trade/{offers,contracts,escrow,settlement}.ts
    travel/{network,routes,traffic,vehicles}.ts
    cities/{shops,harbor,tavern}.ts
    progress/{xp,unlocks,boosts,account-limits}.ts
  application/src/{command-bus,query-service,unit-of-work}.ts
  storage/src/
    d1/{entity-repository,version-guards,receipts,outbox,transaction}.ts
    legacy/{world-store,migration-reader}.ts
    projections/{village,region,globe}.ts
  protocol/src/{commands,views,events,versions}.ts
  render/src/{world,royal-city,terrain,models,cameras,physics,lifecycle}/
  audio/src/{mixer,emitters,footsteps,dialogue}/
infra/
  environments/{staging,production}/
  migrations/{authority,public-projections}/
  wrangler/{web,game-api,jobs,projection,presence}.jsonc
tests/
  {domain,conservation,storage,contracts,migration,load,render}/
```

| Fuente actual | Destino | Regla de dependencia |
| --- | --- | --- |
| `app/`, `components/`, `hooks/`, `lib/client/` | `apps/web/` | Importa protocolo/render/audio; no importa un repositorio SQL. |
| `lib/mvp/types.ts`, `view.ts`, esquemas HTTP | `packages/protocol/` | Tipos serializables versionados; no secretos ni Three.js. |
| Reglas de `production.ts`, `social.ts`, `habitable*.ts`, `land-*.ts` | `packages/domain/` | Reciben contexto y reloj explícito; no fetch ni D1 ni JSX. Separación gradual de archivos grandes. |
| `engine.ts`, servicios `city-shop`, `royal-*` | `packages/application/` + handlers | Abren unidad de trabajo, ejecutan dominio, confirman recibo y eventos. |
| `store.ts`, `partitioned-*.ts`, `village-*.ts` | `packages/storage/` | Implementan interfaces de aplicación; ninguna regla económica duplicada. |
| `lib/graphics/`, visores de `app/graphics/` | `packages/render/` + adaptadores React | Reciben DTO público/propio; render es cliente. |
| `lib/audio/`, `app/game-audio*` | `packages/audio/` + adaptador React | El AudioContext se activa por gesto; pausa al ocultarse. |
| `scripts/private-pc-*` | herramientas de desarrollo | Perfil y estado local excluidos del repositorio y de los paquetes de producción. |

Este árbol es una migración propuesta, **no** una descripción falsa de carpetas ya movidas. El catálogo de archivos actuales está en [MODULES.md](MODULES.md).

## 5. Autoridad, claves y confirmación

La implementación inicial puede mantener las tablas particionadas candidatas y añadir metadatos en migraciones nuevas. No requiere reescribir bienes como saldos aproximados.

| Registro objetivo | Clave / índices necesarios | Escritura permitida |
| --- | --- | --- |
| Entidades actuales particionadas | `(realm_id, collection, entity_id, part_index)`; versiones por clave semántica | Sólo unidad de trabajo autorizada; incluye metadatos de cobertura. |
| `command_receipts` | UNIQUE `(realm_id, account_id, request_id)`; `payload_hash`, resultado y versión | Misma transacción que los efectos. Mismo ID con contenido diferente = conflicto. |
| `due_jobs` | PK `(realm_id, job_id)`; índice `(status, due_at, job_id)` | Inicio/liquidación/cancelación económica; lectura paginada por vencimiento. |
| `outbox` | PK `(realm_id, event_id)`; índice `(delivery_status, created_at, event_id)` | Inserción atómica con el cambio; envío posterior recuperable. |
| `consumer_inbox` | UNIQUE `(consumer, realm_id, event_id)` | Deduplicación de consumidores; junto a la proyección aplicada. |
| `public_villages` | `(realm_id, village_id)` + `(region_id, cell_id, village_id)` | Sólo proyector; `village_version`, `schema_version`, contenido público. |
| `public_regions` | `(realm_id, region_id, lod, bucket_id)` | Agregados del globo; sin inventarios, correos ni recibos privados. |

Las tablas nuevas son especificación: no se hacen pasar por migraciones incluidas. Antes de activarlas se necesita implementación y prueba de la transacción completa.

Algoritmo de confirmación: comprobar recibo existente → cargar contexto y versiones → validar identidad/cotización/límites → construir delta y ledger → confirmar **juntos** guardas, delta, recibo, trabajo y outbox → devolver el resultado confirmado. Una falla de guarda no puede dejar un débito o recibo suelto. No usar una secuencia de llamadas `.run()` sin transacción para una compra.

En D1 la transacción por lote debe fallar o condicionar **todas** las escrituras si una guarda pierde; no basta con ignorar un `UPDATE` que afectó cero filas y seguir insertando un pago. Reutilizar el patrón de token de commit y las pruebas SQL del candidato. Las operaciones no auditadas no reciben autoridad parcial.

## 6. Eventos y versiones concretas

Ejemplo de contrato futuro, no endpoint ya existente:

```json
{
  "schemaVersion": 1,
  "eventId": "evt:frontier-01:op-101:1",
  "operationId": "00000000-0000-4000-8000-000000000101",
  "realmId": "frontier-01",
  "aggregate": {"kind": "village", "id": "v_example", "version": 18},
  "type": "village.building.started",
  "occurredAt": 1792500000000,
  "publicPayload": {
    "buildingId": "b_example", "templateId": "shed",
    "position": {"x": 4, "y": 3}, "phase": "foundation",
    "startsAt": 1792500000000, "endsAt": 1792500060000
  }
}
```

No incluir correo, wallet, identidad de Access, lotes privados ni token de cotización en un evento público. Los consumidores detectan huecos por versión; si reciben 18 y tienen 16, descargan snapshot 18 en vez de inventar 17. Duplicados se descartan por `eventId`; eventos viejos no revierten una proyección más nueva. Versiones de cuenta, recurso compartido y aldea son independientes; una revisión de toda la humanidad no invalida la cámara local.

## 7. Recorridos completos

### A. Construir un cobertizo

1. Web solicita cotización con plantilla/posición; API autentica, carga aldea, terreno y lotes necesarios, y verifica que el espacio y camino sean válidos.
2. Confirmación revalida el contexto, reserva/consume según reglas, crea obra y recibo; `building.started` y `due_jobs` se confirman con el mismo commit.
3. Respuesta propia muestra andamios y trabajadores inmediatamente desde el estado confirmado. No espera a WebSocket para validar el gasto.
4. Outbox publica nueva versión pública; espectadores de la celda ven la obra con materiales/tiempos públicos. GLB y texturas no viajan dentro del evento.
5. Al vencer, el consumidor llama a `settleJob(jobId)` con ID derivado estable. El motor verifica el estado y finaliza una sola vez. Caída/reintento no duplica edificio, XP ni devolución.

### B. Cosecha → cobertizo → mesa y obra

1. El encargado sólo inicia órdenes dentro del turno, presupuesto, reservas mínimas y aprobaciones guardadas.
2. Bancal reserva semillas/nutrientes y registra tiempos; el aserradero no usa material ya reservado para otra obra.
3. Al vencer un trabajo el servidor genera lotes con procedencia. El transportista mueve lotes y estado de entrega; no fabrica recursos por estar dibujando una caja.
4. La mesa consume del inventario/almacén permitido; el cambio conserva cantidades, vínculo, caducidad y ledger. Dos trabajos paralelos y un transportista siguen siendo límites de dominio.
5. Si el usuario se desconecta, el planificador procesa lo ya autorizado y acotado. No renueva turnos ni aprueba obras nuevas. Al volver, la lectura concilia vencimientos si el aviso faltó.

### C. Venta de un tablón

1. Primera guía identifica un tablón transferible y la demanda/presupuesto real de la Feria; kit vinculado no se convierte automáticamente en mercancía.
2. Cotización expone precio, cantidad y vencimiento; confirmación revalida lote, calidad, presupuesto y revisión.
3. Para la Feria: salida del tablón, débito del presupuesto NPC, crédito del vendedor, ledger y recibo son **una** transacción.
4. Para venta entre jugadores dentro del mismo realm: reservar lote/saldo y liquidar ambas partes en la misma autoridad D1. WebSocket sólo anuncia el resultado.
5. Si se pierde la respuesta, consultar/repetir con el mismo `requestId`. Un 409 requiere recotizar; nunca crear una venta nueva para ocultar un resultado desconocido.

### D. Ver la aldea del vecino desde el planeta

1. Globo lejano obtiene agregados por región y LOD. No reconstruye inventarios ni escenas completas de todos los propietarios.
2. Al acercarse, consulta celdas visibles y DTO público de aldeas. Abre suscripción AOI autorizada al hub correspondiente.
3. `villageVersion` nueva invalida sólo esa aldea; render reutiliza modelos/texturas y actualiza transformaciones/obra.
4. La cámara cercana carga GLB detallado; la lejana usa representación simplificada. Las coordenadas y el terreno derivan de la misma referencia espacial.
5. Salir del área elimina suscripciones, pausa animaciones no visibles y libera recursos según el ciclo de vida. El cliente no mantiene un contexto WebGL por cada aldea.

### E. Un puerto o una taberna

Las reglas existentes de stock, presencia, reserva de carga, ruta y entrega se conservan al mover el servicio. La carreta sólo paga un pedido al finalizar su entrega confirmada. El proyector público muestra estado/carga permitidos y no las credenciales del propietario. Los NPC de ambiente no gastan del stock económico salvo que ejecuten ese servicio.

## 8. Presencia, concentraciones y transporte

Clave de hub: `frontier-01:region-R:cell-X-Y:partition-P`. El servidor decide partición y AOI; el usuario no puede subscribirse a todo el planeta. Cada conexión recibe identificación de realm/cuenta/posición autorizada y límite de suscripciones. La posición de presencia puede interpolarse; transacciones y viajes económicos siguen verificándose en autoridad.

El contrato inicial propone snapshots públicos paginados hasta 100 entidades, deltas agrupados y cotas de bytes, nunca una lista ilimitada de usuarios. Las cuotas finales de conexiones, frecuencia y tamaño se fijan con medición. Una ciudad caliente se subdivide en celdas y particiones con reasignación, no en un objeto mundial serial.

Usar WebSocket Hibernation API y reconstruir la metadata necesaria desde adjuntos/almacenamiento al despertar; no depender de memoria de constructor. Ante un hueco de eventos o reconexión, solicitar snapshot versionado. No usar este canal para confirmar un pago. Referencia oficial: [WebSockets en Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/websockets/).

## 9. Si más adelante se separa la economía entre shards

No crear un DO por aldea y otro por mercado suponiendo una transacción distribuida. Protocolo mínimo futuro:

1. Coordinador crea `operationId`, hash de términos y participantes persistentes en estado `PREPARING`.
2. Cada participante reserva cantidades/saldo localmente con versión, recibo idempotente y lease. Un lote reservado no puede gastarse en otra operación.
3. Sólo tras ambas confirmaciones de preparación, el coordinador persiste `COMMIT_DECIDED`. Tras esa decisión los participantes no liberan por simple timeout; consultan al coordinador y reintentan aplicación.
4. Cada participante aplica débito/crédito una sola vez con inbox/outbox. `COMPLETED` exige recibos verificables de ambos. El ledger conserva la operación común.
5. Antes de decisión de commit, un fallo produce `ABORT_DECIDED` y liberación idempotente; después de commit no se improvisa un reembolso unilateral.
6. Recuperador recorre estados pendientes y reenvía; fallos van a revisión sin crear bienes. Un destino permanente no disponible no autoriza inventar una entrega.

Esto exige pruebas de caída en cada transición, duplicados, mensajes fuera de orden y pérdida de respuesta. Mantener la transacción D1 actual hasta que pasen todas las invariantes. No hay activación automática de este protocolo en la alfa.

## 10. Migración, observabilidad y criterio de salida

1. Crear entorno aislado y copia autorizada verificada de autoridad, identidad, revisiones y recibos. Nunca usar partidas reales en un repo o carga pública.
2. Ejecutar migración idempotente y comparar todos los lotes, reservas, saldos, trabajos, procedencia, cuotas, XP, terreno, edificios y posiciones. Totales no bastan: comparar pertenencia e historial.
3. Correr suites de conservación históricas y las nuevas contra SQL real; shadow reads no escriben ni liquidan premios por duplicado.
4. Repetir 100 actores, mezcla de principiantes/ciudades maduras y concentraciones, con el timeout real 8/12 s; medir p50/p95/p99, conflictos, bytes, consultas, CPU y fallback. No ocultar rechazos ni operaciones que terminan después del timeout.
5. Corregir visibilidad de convoyes y otros cierres pendientes, portar tiendas/reino, luego canario explícito. Una misma cuenta usa una autoridad activa; no dual-write ciego.
6. Congelar escrituras durante corte verificado si es necesario. Guardar backup y punto de reversión. Tras recibir escrituras en el formato nuevo, rollback requiere export/reconciliación; no basta cambiar un flag para leer una copia vieja.

Medir por `operationId` y versiones sin registrar tokens ni datos privados: latencia de comando, filas/bytes, edad del outbox, retraso de proyección, trabajos vencidos, conflictos por recurso, deduplicaciones, diferencia de ledger, conexiones por celda y fallos de conservación. El panel de salud no es la fuente del dinero.

Los objetivos de 500 beta y diseño hacia 3.000 son metas sujetas a estos controles. No prometer 2 millones simultáneos con esta base. D1, hibernación y colas son herramientas; no sustituyen una prueba de capacidad ni el particionado medido.

Referencias de implementación: [D1 Database API](https://developers.cloudflare.com/d1/worker-api/d1-database/), [índices D1](https://developers.cloudflare.com/d1/best-practices/use-indexes/), [histórico de lecturas acotadas](../BOUNDED-VILLAGE-READS.md) y [proyecciones/vencimientos](../PROJECTION-AND-SHARED-EXPIRY.md).
