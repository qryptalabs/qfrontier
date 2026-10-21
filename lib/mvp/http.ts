import { z } from 'zod';
import { getChatGPTUser } from '../../app/chatgpt-auth.ts';
import { isMvpStorageUnavailableError } from './storage-availability.ts';

export const actionSchema = z.object({
  requestId: z.string().uuid(),
  expectedRevision: z.number().int().nonnegative().optional(),
  quoteToken: z.string().max(8192).optional(),
  quoteExpiresAt: z.number().int().positive().optional(),
  command: z.object({ type: z.string().regex(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/).max(80), playerId: z.string().min(1).max(180).optional() }).passthrough(),
}).strict();
export const apiJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function actionRequest(request: Request) {
  const user = await getChatGPTUser();
  if (!user) throw Object.assign(new Error('Inicia sesión para guardar tu progreso.'), { status: 401 });
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw Object.assign(new Error('Origen de solicitud no permitido.'), { status: 403 });
  const text = await request.text();
  if (text.length > 16000) throw Object.assign(new Error('La orden es demasiado grande.'), { status: 413 });
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw Object.assign(new Error('Solicitud inválida.'), { status: 400 }); }
  return { user, body: actionSchema.parse(raw) };
}
export function apiFailure(error: unknown) {
  if (isMvpStorageUnavailableError(error)) {
    const response = apiJson({ error: error.message, code: error.code, retryable: true }, 503);
    response.headers.set('Retry-After', String(error.retryAfterSeconds));
    return response;
  }
  if (error instanceof z.ZodError) return apiJson({ error: 'Revisa los campos y las cantidades de la orden.' }, 400);
  if (error instanceof Error && 'status' in error && typeof error.status === 'number' && error.status >= 400 && error.status <= 599) return apiJson({ error: error.message }, error.status);
  console.error('QFrontier MVP request failed', error instanceof Error ? error.message : 'Unknown error');
  return apiJson({ error: 'No pudimos guardar la orden. Actualiza el estado e inténtalo de nuevo.' }, 503);
}

