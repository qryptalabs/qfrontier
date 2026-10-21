# Seguridad

No publiques credenciales, JWT, cookies, códigos de Access, tokens de túnel, correos privados, carteras ni bases de jugadores en issues o propuestas de cambio. Para reportar una vulnerabilidad usa el canal privado que el propietario indique en el perfil de la organización; si GitHub habilita reporte privado de vulnerabilidades, úsalo.

La configuración incluida es de ejemplo. `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ACCESS_ALLOWED_EMAILS`, `account_id` y `database_id` deben sustituirse por los del operador. El Worker valida JWT y falla cerrado. Nunca introducir una identidad de prueba confiando en cabeceras enviadas por Internet.

Un despliegue de frontend no debe migrar ni restaurar una base. Los cambios económicos y de identidad necesitan respaldo, revisión y conservación verificada. Un error de D1 no debe crear un mundo vacío. Un reintento económico conserva su `requestId`.
