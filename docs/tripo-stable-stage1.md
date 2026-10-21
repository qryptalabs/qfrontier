# Caballerizas del Alba

Primer establo y cochera en el patio existente de Suministros del Alba. Se usan las mismas coordenadas en el planeta y en la visita del Reino: centro local X −123, Z 149,8; superficie a 0,92 m. No se trasladan compras, equipo ni puntos de recogida.

La cubierta y el desván proceden del modelo de Tripo `83cdcb93-b172-4957-a487-75e72fdbe503`. El original se remalló de 1.874.033 a 10.730 triángulos. La adaptación modular conserva 4.887 triángulos y un único atlas de color, en un GLB autónomo de 863.436 bytes. Las texturas usan muestreo de píxel y los materiales reciben la iluminación del juego.

La estructura inferior, paredes, dos accesos abiertos, puertas recogidas junto a los marcos, separador, pesebre, heno, herramientas, bebedero y faroles están construidos como piezas independientes. Esto permite que sus colisiones coincidan con los espacios transitables. Las paredes nuevas permiten salir de una posible posición guardada dentro de ellas, pero impiden entrar desde fuera. La cubierta se oculta al recorrer el interior, como en la tienda; se carga al acercarse y existe una cubierta ligera de respaldo.

«Visitar establo» e «Interior del establo» son accesos de visita sin modificar la partida. El personaje real puede llegar por el mismo patio. Las rutas del trabajador, el aparcamiento del equipo propio, la tienda del Norte y la economía existente se conservan. Esta fase no añade una nueva economía de alimentación, alquiler ni mejora de animales.

Los registros privados de cuenta y generación no se distribuyen. La fuente original se referencia en `work/tripo-stable-20261019/stable-export.glb`; la preparación reproducible está en `scripts/prepare-tripo-stable.mjs`.

Validación: 19 pruebas focales de acceso, colisiones, paso de carruajes, carga/descarga, procedencia económica, equipo y compatibilidad; TypeScript y compilación. Capturas y auditoría de partidas en `work/tripo-stable-20261019`.

Revisión visual terminada en escritorio y vista móvil de 390 × 844. El canvas móvil conserva 388 × 510 píxeles sin desbordamiento horizontal. Se comprobó el cambio de cámara, el avance por joystick y las flechas. El aviso de recogida queda por encima de los controles táctiles. No se midieron FPS en un teléfono físico.

Las seis partidas se conservaron. Durante la revisión terminó un regreso que ya estaba programado: la comparación estricta original declara ese cambio y la regla existente de liquidación lo reproduce exactamente sobre una copia en memoria. Todos los demás campos coinciden. La última activación conservó el mundo completo de forma exacta, revisión 989 → 989; no hubo restauración de datos para realizar la comprobación.
