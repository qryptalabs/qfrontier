import {ROYAL_PORT_OFFSET} from './royal-proportions.ts';
export type ShopCity='corona-del-alba'|'paso-del-norte';
export const SHOP_SITES=Object.freeze({
 'corona-del-alba':{id:'corona-del-alba',name:'Suministros del Alba',city:'Corona del Alba',merchant:'Don Mateo',x:-84,z:160,y:.92},
 'paso-del-norte':{id:'paso-del-norte',name:'La Espiga del Norte',city:'Paso del Norte',merchant:'Doña Inés',x:2484,z:3846-ROYAL_PORT_OFFSET,y:1.14}
} as const);
export const siteOffset=(id:ShopCity)=>{const s=SHOP_SITES[id];return{x:s.x+84,y:s.y-.92,z:s.z-160};};
export function sitePoint(id:ShopCity,p:{x:number;y:number;z:number}){const d=siteOffset(id);return{x:p.x+d.x,y:p.y+d.y,z:p.z+d.z};}
export function nearestShop(x:number,z:number):ShopCity{return Math.hypot(x-SHOP_SITES['paso-del-norte'].x,z-SHOP_SITES['paso-del-norte'].z)<100?'paso-del-norte':'corona-del-alba';}
/** A supported agricultural trading yard, with a twenty-metre approach blend. */
export function tradingGround(x:number,z:number,fallback:number){const s=SHOP_SITES['paso-del-norte'],dx=Math.max(s.x-56-x,0,x-s.x-28),dz=Math.max(s.z-15-z,0,z-s.z-20),t=Math.max(0,1-Math.max(dx,dz)/20);return fallback+(1.02-fallback)*t*t*(3-2*t);}
export function tradingSiteContains(x:number,z:number,padding=0){const s=SHOP_SITES['paso-del-norte'];return x>=s.x-56-padding&&x<=s.x+28+padding&&z>=s.z-15-padding&&z<=s.z+20+padding;}
