import { getChatGPTUser } from '../../chatgpt-auth.ts';
import { actionRequest, apiFailure, apiJson } from '../../../lib/mvp/http.ts';
import { getMvpStore } from '../../../lib/mvp/store.ts';
import { executeRoyalHarborTrade, readRoyalHarbor } from '../../../lib/mvp/royal-harbor-service.ts';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return apiJson({ error: 'Inicia sesión para visitar el puerto.' }, 401);
    const playerId = new URL(request.url).searchParams.get('playerId') ?? undefined;
    return apiJson({ harbor: await readRoyalHarbor(getMvpStore(), user.userId, playerId) });
  } catch (error) { return apiFailure(error); }
}
export async function POST(request: Request) {
  try {
    const { user, body } = await actionRequest(request);
    if (body.quoteToken !== undefined || body.quoteExpiresAt !== undefined) return apiJson({ error: 'Usa la confirmación del mercado portuario.' }, 400);
    // Domain validation rejects missing revisions, extra command fields and
    // unrecognized resources before a single inventory or balance can change.
    return apiJson({ harbor: await executeRoyalHarborTrade(getMvpStore(), user.userId, body) });
  } catch (error) { return apiFailure(error); }
}
