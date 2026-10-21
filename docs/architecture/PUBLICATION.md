# Verificación de esta publicación

Corte de fuente: 2026-10-20. La publicación se preparó en una copia independiente de la aplicación, sin publicar el workspace de desarrollo completo ni modificar su servidor.

## Contenido y privacidad

- Incluye aplicación, dominio, visores, GLB, audio, fuentes, SQL de esquema, pruebas, herramientas y documentación.
- Excluye `node_modules`, `dist`, `.next`, `.wrangler`, `work`, `outputs`, perfiles, backups, bases SQLite/D1, credenciales, OTP y registros del servidor.
- Account ID, audiencia y base del entorno original se sustituyeron por ejemplos. Los correos personales se sustituyeron por identidades sintéticas distintas.
- Configuración y documentos históricos están redactados. Los enlaces a evidencia privada se explican como artefactos no distribuidos.
- No hay historial Git anterior que publique una versión con secretos: el repositorio público empieza desde la copia revisada.

`node scripts/audit-publication.mjs` comprueba los archivos preparados en Git: directorios privados/generados, extensiones de persistencia/credenciales, patrones de tokens y correos/rutas personales. No equivale a una auditoría de seguridad completa. Los resultados detallados y hashes se escriben en `work/`, excluido de Git.

## Comprobaciones

| Control | Resultado de esta publicación |
| --- | --- |
| TypeScript | Aprobado (`npm run typecheck`). |
| Build vinext/Worker | Aprobado (`npm run build`); genera cliente, RSC, SSR y rutas API. |
| Primera suite completa | 1.309/1.311 aprobadas; dos fallos de preparación/regresión gráfica descritos debajo. |
| Revisión dirigida posterior | 10/10 aprobadas, sin omisiones. |
| Suite completa final | **1.311/1.311 aprobadas**, cero fallos y cero omisiones; 139,33 s en Node 24.19.0. |
| Lint | **No aprobado:** 33 errores y 34 advertencias existentes en componentes/pruebas; se conservan sin desactivar reglas. |
| Inventario público y búsqueda de patrones privados | Aprobado antes de confirmar; se repite al cerrar el paquete. |

Dos adaptaciones de pruebas, sin cambiar las geometrías o reglas del juego:

1. La prueba de barcos leía `work/tripo-ships-20261019/assets.json`, evidencia privada no publicada. Ahora verifica los dos GLB distribuidos contra hashes, tamaños y triángulos del manifiesto de `lib/graphics/tripo-ship-assets.ts`, además de los límites de geometría/textura existentes.
2. La prueba de fachadas imponía profundidad menor a diez metros, anterior al rediseño de casas y almacenes a escala humana. Ahora verifica las dimensiones y huella declaradas del modelo actual, mantiene el límite de altura, puerta de 2,2 m, reutilización de materiales, finitud de buffers y disposición de recursos.

Los componentes y activos de juego no se simplificaron para pasar estas pruebas. Esta revisión no es una nueva certificación visual, de teléfono físico o de capacidad de producción.

La deuda de lint incluye uso de refs/actualización de estado en efectos en `app/graphics/tavern-supply-panel.tsx`, declaraciones `let` que podrían ser `const` en pruebas y un tipo `{}` en una prueba gráfica. No se declara un lint limpio ni se modifica la lógica del juego para ocultarlo. Los archivos de aplicación y dominio publicados conservan sus bytes originales; las dos adaptaciones anteriores son de pruebas.

## Qué no afirma esta publicación

No se desplegó un backend nuevo, no se activó el adaptador experimental, no se migraron usuarios ni se reinició el runtime privado. No se repitió una carga de 100 para esta tarea de documentación/publicación; las cifras de escalabilidad del README son históricas y se identifican como tales. La prueba unitaria completa no acredita concurrencia de jugadores reales.

Las herramientas que preparan modelos desde exportaciones originales requieren esos insumos, no distribuidos. Las pruebas de funcionamiento del juego usan los GLB finales incluidos. Los comparadores de carga histórica requieren baselines propios; ver `scripts/load-test.README.md`.
