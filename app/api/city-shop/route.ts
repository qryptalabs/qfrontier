import {getChatGPTUser} from '../../chatgpt-auth.ts';
import {actionRequest,apiJson,apiFailure} from '../../../lib/mvp/http.ts';
import {getMvpStore} from '../../../lib/mvp/store.ts';
import {SHOP_SITES,type ShopCity} from '../../../lib/graphics/city-shop-sites.ts';
import {readCityShop,executeCityShop} from '../../../lib/mvp/city-shop-service.ts';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const user=await getChatGPTUser();if(!user)return apiJson({error:'Inicia sesión para entrar a la tienda.'},401);const city=new URL(request.url).searchParams.get('cityId')??'corona-del-alba';if(!Object.hasOwn(SHOP_SITES,city))return apiJson({error:'Tienda no válida.'},400);return apiJson({shop:await readCityShop(getMvpStore(),user.userId,new URL(request.url).searchParams.get('playerId')??undefined,Date.now(),city as ShopCity)});}catch(error){return apiFailure(error);}}
export async function POST(request:Request){try{const{user,body}=await actionRequest(request);return apiJson({shop:await executeCityShop(getMvpStore(),user.userId,body)});}catch(error){return apiFailure(error);}}
