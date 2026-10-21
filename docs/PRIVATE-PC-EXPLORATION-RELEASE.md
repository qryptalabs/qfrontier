> Informe histórico redactado. Dominios, correos y rutas son ejemplos; los artefactos privados de `work/` no se distribuyen. Para un despliegue nuevo usar [Operación](architecture/OPERATIONS.md).

# Comprobación de la actualización de exploración

La entrega posterior de viajes y colisiones se documenta en [PRIVATE-PC-WORLD-TRAVEL.md](PRIVATE-PC-WORLD-TRAVEL.md). Su versión final activa es `2026-10-18T03-46-20-973Z-a7bcd1b7`, build `98c4f6ebc7b18ec58e2eae81273de20bb764c525370a36f94c44c337999ef10d`. El gate previo `release-gate-1792295155343.json` tiene SHA-256 `9709ca5d855b3a76d39c8e9800d5d83f5147ac20b8cac449c3e140a9bfe54a34`; su manifiesto inmutable tiene SHA-256 `8ec0abefe61f6989e741e1befa558327a7aecc04fbbe4ce5f9c47a8f34d25ac4`. Para una actualización futura, el auditor previo debe incorporar esta pareja exacta mediante la misma comprobación de procedencia; actualmente conserva explícitamente las cuatro versiones anteriores. `private-pc-runtime.mjs check` sí comprueba la integridad de esta versión activa. Esto no autoriza omitir la comparación de partidas ni aceptar cualquier runtime.

Los dos auditores de esta entrega sólo verifican evidencias locales. No compilan, no preparan una versión, no inician ni detienen procesos, no migran datos y no contactan Cloudflare. El auditor de partidas abre únicamente copias coherentes dentro de `work/private-pc/backups`, con SQLite en modo de sólo lectura.

## Referencias conservadas

- Fuente anterior a cámaras: `work/private-pc/camera-source-baseline-1792283327526.json`.
- Última aprobación de cámaras: `work/private-pc/camera-release-gate-1792286197640.json`. Se incorporan sus hashes finales de fuentes modificadas y añadidas; no se comparan las cámaras contra sus versiones anteriores por error.
- Versión inmutable de cámaras para volver atrás: `work/private-pc/runtime/2026-10-18T01-17-02-644Z-35af0611`, build `f435813476378faf3be25f775ee0c6938d787f1de4e62aaa7e9da3832ab5dabb`.
- Copia al comenzar esta tarea: `work/private-pc/backups/local-auto-2026-10-18T01-27-58.675Z-f33cd219.json`, revisión 417, cuatro perfiles, 28 órdenes y 211 comprobantes.

La copia de revisión 417 documenta el inicio de la tarea. No demuestra cuál es la partida más reciente si alguien siguió jugando. La comprobación de activación debe utilizar una copia nueva del estado real inmediatamente anterior a la actualización; estos scripts no restauran automáticamente ninguna copia.

## 1. Revisar fuentes y compilación terminada

Una vez congelados los cambios y terminada la compilación completa que registra el responsable de la entrega:

```powershell
node scripts/private-pc-exploration-release-check.mjs
```

El script requiere el registro más reciente `build-*.json` de `work/private-pc/exploration-20261017`. Rechaza una ejecución incompleta o fallida, verifica el hash del log y detecta fuentes modificadas después de iniciar esa compilación. Genera un informe nuevo `release-gate-*.json` en esa carpeta.

La lista de cambios permitidos incluye las fuentes concretas de exploración, su integración en el motor y los componentes de la interfaz y gráficos relacionados. Un archivo permitido tampoco puede desaparecer. Los demás archivos continúan protegidos, incluidos autenticación, HTTP y rutas API, configuración del dominio original, almacén y factoría legacy, esquema SQL, migraciones, assets, fuentes e importaciones de proveedor. Las fuentes nuevas desconocidas se rechazan.

Los chunks del motor pueden cambiar porque esta entrega incorpora comportamiento de servidor. El informe registra los chunks resultantes, pero no exige que sean idénticos a los de cámaras. Sí exige los hashes de las fuentes protegidas de autenticación y HTTP/API. Conserva la factoría original y el esquema de guardado versión 2; no activa el candidato de almacenamiento particionado.

También se verifica que el perfil privado siga apuntando a la D1 local `8b7617dc-1530-4fc4-91d7-56ac105106bc`, con enlace a `127.0.0.1:5180`, assets detrás del Worker y sin despliegue público habilitado. La versión anterior debe continuar activa e intacta al ejecutar este gate previo a la preparación.

Para el ajuste del despachador de acciones rápidas, el gate admite exactamente una segunda versión activa: `work/private-pc/runtime/2026-10-18T01-42-48-648Z-a33edb00`, build `5e82b565d4d1ec9f489af8774884e97db1498968c9dc3384efba96af88a563ce`. Su aprobación inicial `release-gate-1792287714878.json` y su manifiesto se verifican mediante hashes fijados en el auditor. Se comprueban todos sus archivos, fuentes protegidas y configuración. Esta excepción no acepta una versión activa arbitraria ni deja de verificar la copia original de cámaras `f435…`. El único helper adicional autorizado por este ajuste es `lib/client/quick-command.ts`.

Después de activar ese ajuste, se añadió un tercer par explícito para una futura comprobación previa a otra actualización: `work/private-pc/runtime/2026-10-18T01-48-28-933Z-95170249`, build `1efa74c8c51f76b8af1bd51039f6b2f039f58651bbfb9b8576764bb138a8afb3`. Su manifiesto está fijado por SHA-256 `11d48a44e0fb0af417f8d3e77b205b288111f7080a4225877e994c583f59b7c2` y su gate aprobado `release-gate-1792287968156.json` por `6c6cc4348544ee2d1de0e58c8eb4998ca1287a1f4e3aaddb0bff53a8746519f7`. Se mantienen las comprobaciones completas de archivos y fuentes protegidas; añadir este par conocido no aprueba una compilación nueva que todavía no exista ni activa otra versión.

Un informe aprobado sólo habilita continuar con la preparación del perfil privado. No demuestra todavía la conservación de las partidas ni autoriza cambios en el dominio anterior.

## 2. Comparar el estado antes y después de la actualización

El responsable de la entrega debe obtener una copia coherente reciente sin interacción de jugadores durante la comprobación y otra después de preparar/reiniciar la versión privada, antes de abrir sesiones de QA. Los nombres siguientes son ejemplos de posición; se sustituyen por los manifiestos reales:

```powershell
node scripts/private-pc-exploration-save-check.mjs --before work/private-pc/backups/ANTES.json --after work/private-pc/backups/DESPUES.json
```

Sin opciones adicionales se exige igualdad exacta del mundo, JSON guardado, revisión, fecha de actualización, perfiles, propietarios, recursos, procedencia, órdenes, comprobantes, edificios y progresión. Los manifiestos verifican tamaño, hashes, tablas, esquema, integridad SQLite, DB local y realm originales. La metadata interna de workerd se presenta por separado, como en el auditor existente; no se considera un cambio autorizado a las partidas.

La copia posterior debe comprobarse antes de acciones de juego. Una lectura que liquide actividades vencidas o una acción del jugador puede producir una diferencia legítima, pero esa diferencia no se debe ocultar ni clasificar automáticamente como efecto de la instalación.

## 3. Comparar después del recorrido de QA

Durante una sesión dedicada exclusivamente a caminar, salir, viajar, detenerse y regresar:

```powershell
node scripts/private-pc-exploration-save-check.mjs --before work/private-pc/backups/INICIO-QA.json --after work/private-pc/backups/FIN-QA.json --allow-exploration
```

Esta opción permite únicamente:

- `habitable.position` y `habitable.movement`, con la validación del auditor anterior de caminata.
- El bloque opcional `habitable.exploration`, su incorporación, actualización o eliminación al volver a casa. Su estructura se verifica estrictamente: versión, coordenadas finitas dentro del planeta, posición local de retorno, recorrido y fechas válidas. Las rutas anteriores sin tramos conservan su límite de 256 puntos. Las nuevas rutas admiten hasta 1.024 puntos y 64 tramos de caminata, carreta o barco; los índices deben cubrir la ruta sin saltos y los tiempos deben ser contiguos. No admite campos adicionales donde esconder inventario, XP u otras modificaciones.
- Comprobantes nuevos como hashes válidos añadidos al registro. Los comprobantes anteriores deben conservarse exactamente.

Inventarios, balances, materiales almacenados, procedencia, edificios, órdenes, identidades, entradas de progresión y todo el resto del mundo deben quedar exactos, incluidos los otros perfiles de la cuenta.

Los comprobantes contienen hashes del payload, no el nombre de cada acción. El informe marca expresamente `receiptAttributionVerified: false`: hay que acompañarlo con evidencia observada de UI/Network para acreditar que la sesión usó sólo órdenes de exploración. El auditor no transforma hashes opacos en una prueba de atribución.

## Pruebas de los auditores

Las pruebas puras no abren bases de datos ni ejecutan el juego:

```powershell
node --experimental-strip-types --test tests/private-pc-exploration-save-check.test.ts tests/private-pc-exploration-release-check.test.ts
```

Cubren conservación exacta, ampliación del estado de exploración, regreso a casa, bloqueo de modificaciones económicas y de XP, recibos reescritos, campos ocultos, coordenadas y rutas inválidas, listas de fuentes protegidas, borrados, archivos nuevos inesperados y registros de compilación incompletos o fallidos.
