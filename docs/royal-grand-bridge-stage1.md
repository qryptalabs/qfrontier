# Puente de siete arcos y salida posterior al mar

Aplicado el 20 de octubre de 2026 al servidor privado de PC `qfrontier.example.invalid`. No se desplegó al Worker anterior.

- Un único cruce fluvial principal sustituye a los dos puentes bajos. Siete arcos huecos, 177,45 m de estructura central, calzada a 31,5 m, rampas hasta X ±244 y conexión transitable con el acceso real. Las pasarelas defensivas del castillo permanecen.
- Canal portuario de 48 m de anchura normal, cuenca ensanchada bajo el puente y curva amplia al oeste del palacio. La desembocadura llega al océano existente detrás del castillo. Lecho, agua, exclusiones forestales y navegación comparten coordenadas.
- No se cambió la escala ni el diseño del castillo o sus interiores. Se retiraron únicamente construcciones ambientales que coincidían con el nuevo cauce.
- Un galeón de tránsito reutiliza el modelo Tripo ya generado, con buffers compartidos. Cruza recto antes de girar y recorre una ida y vuelta continua; reloj UTC compartido entre Reino y Planeta. Es tráfico ambiental y seguimiento de cámara, no transporte de pasajeros ni generación de mercancía. El galeón atracado sigue disponible para caminar.
- Puente modelado directamente con geometría controlada; no se gastaron créditos de Tripo.

## Validación

`tsc --noEmit` y compilación de producción aprobados. 57 pruebas aprobadas en `work/royal-grand-bridge-20261020/tests-final.txt`: envolvente completa del GLB bajo los arcos y durante el giro, casco dentro del canal, conexión con mar geográfico, navegación peatonal bidireccional, interiores, muelles, comercio, conservación e idempotencia. Reloj compartido y pausa visual verificados.

Revisión mediante navegador en escritorio y viewport móvil de 390 × 844. Sin desbordamiento horizontal, seguimiento de cámara accesible y sin errores de consola observados. Es una comprobación de formato móvil, no una medición en un teléfono físico.

Auditoría exacta de respaldos coherentes SQLite: seis perfiles, 31 trabajos, 390 recibos, revisión 989, SHA256 del estado `6cad26130e56e1c418ec616e00b19bdebea86d0cae37a140cc7afb0a733e0057`. Sin importación de DB, reinicio de partidas ni cambios económicos. Evidencia: `save-audit.json`, `backup-before.json`, `backup-after.json`, `runtime-final.json` en la misma carpeta de trabajo.

El runtime privado mantiene su override de compatibilidad local de 2026-05-22. El aviso anterior de chunks grandes del compilador sigue pendiente; no se promete un objetivo de FPS universal.
