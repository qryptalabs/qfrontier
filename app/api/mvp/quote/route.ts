import { getMvpStore } from '../../../../lib/mvp/store.ts';
import { quoteMvp } from '../../../../lib/mvp/engine.ts';
import { actionRequest, apiFailure, apiJson } from '../../../../lib/mvp/http.ts';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    const { user, body } = await actionRequest(request);
    return apiJson({ quote: await quoteMvp(getMvpStore(), user.userId, body.command, body.requestId) });
  } catch (error) { return apiFailure(error); }
}
