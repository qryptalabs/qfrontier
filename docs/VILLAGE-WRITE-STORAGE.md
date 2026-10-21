# Escrituras atómicas por aldea: candidato local

Esta opción no está seleccionada por `getMvpStore()`. No migra `world_state`, no
cambia la base activa y no requiere modificar los gráficos ni las partidas.
`villageWrites: true` necesita las tablas aisladas de `partitioned-world.sql`,
`player-read-model.sql` y `village-writes.sql`.

## Autoridad de escritura

`compareAndSwapVillage(record, nextWorld, context)` recibe el conjunto explícito
de versiones que leyó el motor. Revalida esas versiones y el hash de cada registro
que pretende modificar, incluidos los registros compartidos. La creación de un
registro exige que su identidad todavía no exista. Una cuenta conserva su guardia
compartida entre perfiles.

La primera sentencia crea una autoridad efímera solo si todas esas condiciones se
cumplen. Todas las mutaciones económicas, los recibos, las versiones y las
proyecciones públicas comprueban esa autoridad en la misma transacción D1. Una
guardia fallida publica cero cambios; un error SQL posterior revierte el lote entero.
La autoridad se elimina antes de terminar la transacción.

La revisión general se incrementa para identificar la instantánea, pero no se exige
que coincida con la revisión observada por una aldea independiente. Dos aldeas que
leyeron la misma revisión pueden confirmar cambios distintos. El método devuelve
una lectura fusionada de los registros autoritativos, con la revisión real. No
devuelve la propuesta obsoleta ni supone que la revisión nueva sea `observada + 1`.

Las operaciones que comparten bienes, ofertas, reservas o recursos sí conservan
guardias compartidas. El intercambio entre aldeas todavía se confirma dentro de
una sola transacción D1. Esta fase no introduce transferencias distribuidas entre
Durable Objects.

## Identidades, historiales y versiones

El motor asigna identidades de operación a las nuevas órdenes y entradas. El
almacenamiento fusiona los registros por identidad. Las entradas nuevas de la
crónica y del libro contable no sustituyen las de otra aldea que confirmó mientras
tanto. Los ordinales de serialización se normalizan dentro de la transacción; no
son una guardia económica global. La crónica conserva su límite de 150 entradas.
El método por aldea no permite borrar el libro contable. Las entradas nuevas de
cada operación se añaden juntas después de las ya confirmadas, conservando el
orden y la adyacencia de sus comprobantes de débito y pago.

Solo se incrementan las versiones semánticas afectadas. Un índice compartido se
incrementa sobre su valor SQL actual, para conservar todas las invalidaciones
concurrentes. Sus huellas tienen el formato explícito `delta:<sha256>`: describen
la procedencia de un cambio, no afirman contener el hash materializado de un
agregado mundial que pudo recibir otra entrada simultánea. Las versiones atómicas
son la autoridad de las cotizaciones. La reparación tras un escritor antiguo
considera estas huellas desconocidas, deriva los valores completos y rota las
versiones de forma conservadora. La ruta global conserva sus huellas semánticas
ordinarias.

Las proyecciones públicas se actualizan solo para los actores cuyos registros u
órdenes cambiaron. No se republican todos los perfiles de sus propietarios desde
una instantánea antigua. Los cambios de clan siguen exigiendo la ruta global.
La autoridad también verifica los recuentos de metadatos y actores: una fila
desaparecida después de la lectura no puede quedar oculta por el sello de una
escritura posterior.

La frescura pública corresponde al último actor confirmado. Sus futuros cambios
visuales actualizan la proyección, mientras que una orden privada ajena vencida
no bloquea todas las cachés del mundo ni se presenta como completada. La caché
privada sigue venciendo por las órdenes de la propia cuenta y por los plazos
compartidos de recursos, comida, caravanas, contratos y política. La comprobación
incluye lecturas exactamente en el instante de vencimiento.

## Alcance y comprobaciones

El adaptador todavía reconstruye la instantánea completa para leer y devolver el
resultado. Reutiliza un hash ya verificado únicamente cuando el cuerpo almacenado
y su hash son idénticos a los de la lectura confiable previa. No elimina todavía
el coste de construir vistas del mundo, ni certifica una capacidad de concurrencia.
Una sola base D1 mantiene su capacidad física compartida aunque desaparezcan los
conflictos artificiales entre aldeas independientes.

Las pruebas nuevas cubren confirmaciones independientes desde la misma revisión,
rechazo de versiones obsoletas, conflictos de recursos compartidos, historiales
concurrentes, recibos, pérdida de confirmación, reversión completa y transferencia
atómica entre dos inventarios. Las pruebas anteriores del almacenamiento y las
lecturas privadas también siguen pasando.

La verificación local con workerd está en
`work/village-writes-runtime-verification-20261017-r4.json`: atestó los 116 archivos
de `lib/`, estables antes y después, y confirmó el nuevo SQL,
una partida sintética de 2.295.622 bytes con UTF-8 exacto y una escritura posterior
sin dañar ese contenido. Midió como máximo 38 sentencias por lote, 98 parámetros
por sentencia y fragmentos de 65.536 bytes. El binario instalado usa compatibilidad
del 22 de mayo; no acredita el runtime de octubre configurado para producción.
No se hicieron peticiones remotas a Cloudflare ni escrituras en bases persistentes.

La prueba de 100 jugadores y el informe principal determinan si este candidato
puede avanzar. Pasar las pruebas de integridad locales no sustituye esa medición.
