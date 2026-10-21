import { getChatGPTUser } from '../../chatgpt-auth.ts';
import { getMvpStore } from '../../../lib/mvp/store.ts';
import { executeMvp, readMvpView, validateMvpQuote } from '../../../lib/mvp/engine.ts';
import { actionRequest, apiFailure, apiJson } from '../../../lib/mvp/http.ts';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return apiJson({ error: 'Inicia sesión para entrar a la frontera.' }, 401);
    const id = new URL(request.url).searchParams.get('playerId') ?? undefined;
    return apiJson({ view: await readMvpView(getMvpStore(), user.userId, id) });
  } catch (error) { return apiFailure(error); }
}
export async function POST(request: Request) {
  try {
    const { user, body } = await actionRequest(request);
    const store = getMvpStore();
    const authorization = body.command.type !== 'player.create'
      ? await validateMvpQuote(store, user.userId, body.command, body.requestId, body.expectedRevision, body.quoteToken, body.quoteExpiresAt)
      : undefined;
    return apiJson({ view: await executeMvp(store, user.userId, body.command, body.requestId, body.expectedRevision, undefined, authorization) });
  } catch (error) { return apiFailure(error); }
}
