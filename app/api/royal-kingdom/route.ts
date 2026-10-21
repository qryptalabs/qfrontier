import {getChatGPTUser} from '../../chatgpt-auth.ts';
import {actionRequest,apiJson,apiFailure} from '../../../lib/mvp/http.ts';
import {getMvpStore} from '../../../lib/mvp/store.ts';
import {readRoyalKingdom,executeRoyalKingdom} from '../../../lib/mvp/royal-kingdom-service.ts';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const user=await getChatGPTUser();if(!user)return apiJson({error:'Inicia sesión para entrar al reino.'},401);return apiJson({kingdom:await readRoyalKingdom(getMvpStore(),user.userId,new URL(request.url).searchParams.get('playerId')??undefined)});}catch(error){return apiFailure(error);}}
export async function POST(request:Request){try{const{user,body}=await actionRequest(request);return apiJson({kingdom:await executeRoyalKingdom(getMvpStore(),user.userId,body)});}catch(error){return apiFailure(error);}}
