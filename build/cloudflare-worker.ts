import handler from 'vinext/server/fetch-handler';
import {
  hasAccessConfiguration,
  injectVerifiedAccessIdentity,
  verifyAccessRequest,
} from '../lib/auth/cloudflare-access.ts';

function privateError(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function allowedEmails(value: string | undefined): Set<string> | null {
  if (!value || value.length > 2048) return null;
  const addresses = value.split(',').map(address => address.trim().toLowerCase());
  if (!addresses.length || addresses.some(address => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))) return null;
  return new Set(addresses);
}

// No route, health check or asset bypasses this entrypoint. Cloudflare Access
// provides the login challenge; this additional signature check also protects
// direct requests to the Worker from forged identity headers.
export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext): Promise<Response> {
    const access = { ACCESS_TEAM_DOMAIN: env.ACCESS_TEAM_DOMAIN, ACCESS_AUD: env.ACCESS_AUD };
    const permitted = allowedEmails(env.ACCESS_ALLOWED_EMAILS);
    if (!hasAccessConfiguration(access) || !permitted) {
      return privateError('El acceso privado todavía no está configurado.', 503);
    }

    try {
      const identity = await verifyAccessRequest(request, access);
      if (!identity) return privateError('Se requiere acceso autorizado.', 401);
      if (!permitted.has(identity.email.toLowerCase())) {
        return privateError('Esta cuenta no tiene acceso a las pruebas privadas.', 403);
      }

      // This creates a new request, strips all caller-supplied identity headers
      // and injects only the identity obtained from the verified signed JWT.
      const authenticated = injectVerifiedAccessIdentity(request, identity);
      if (authenticated.method === 'GET' || authenticated.method === 'HEAD') {
        const asset = await env.ASSETS.fetch(authenticated);
        if (asset.status !== 404) return asset;
        await asset.body?.cancel();
      }
      return await handler.fetch(authenticated, env, ctx);
    } catch (error) {
      console.error(JSON.stringify({
        event: 'private_worker_request_failed',
        errorType: error instanceof Error ? error.name : 'UnknownError',
      }));
      return privateError('No se pudo completar la solicitud privada.', 503);
    }
  },
} satisfies ExportedHandler<Cloudflare.Env>;
