import type {RoyalObstacle} from './royal-harbor-layout.ts';
import {siteOffset,type ShopCity} from './city-shop-sites.ts';
import {cityStableObstacles} from './city-shop-stable-layout.ts';

/** Metres in the existing royal-port frame. The road at X=-104 stays open. */
export const ROYAL_SHOP = Object.freeze({id:'corona-del-alba',name:'Suministros del Alba',x:-84,z:160,y:.92,width:20,depth:18,
  door:{x:-84,y:.92,z:169},merchant:{x:-84,y:.92,z:152},counter:{x:-84,y:.92,z:155.7},
  entrance:{x:-84,y:.92,z:173},pickup:{x:-123,y:.92,z:174},yard:{x:-123,z:160,width:26,depth:26}});
export const shopReservedAt=(x:number,z:number,padding=0)=>x>=-140-padding&&x<=-72+padding&&z>=145-padding&&z<=176+padding;
export const shopInside=(x:number,z:number)=>Math.abs(x-ROYAL_SHOP.x)<9.7&&Math.abs(z-ROYAL_SHOP.z)<8.7;
export const shopYardAt=(x:number,z:number)=>Math.abs(x+123)<14&&z>145&&z<178;
export const shopAssetPosition=(index:number,city:ShopCity='corona-del-alba')=>{const d=siteOffset(city);return{x:-132+index%3*8+d.x,y:.92+d.y,z:151+Math.floor(index/3)*14+d.z};};
export function shopAssetObstacles(assets:readonly {id:string;kind:string;cityId?:ShopCity}[],hitch?:{animalId:string;vehicleId:string}):RoyalObstacle[]{return assets.filter(a=>a.id!==hitch?.animalId&&a.id!==hitch?.vehicleId).slice(0,6).map((a,i)=>{const p=shopAssetPosition(i,a.cityId),animal=['horse','mule'].includes(a.kind);return{x:p.x,z:p.z,halfWidth:animal?.45:1.15,halfDepth:animal?1.25:1.6,minY:p.y,maxY:p.y+(animal?2.5:2.8)};});}
export const shopNearCounter=(p:{x:number;y:number;z:number})=>Math.hypot(p.x+84,p.z-155.7)<=3&&Math.abs(p.y-.92)<.3;
export const shopNearPickup=(p:{x:number;y:number;z:number})=>Math.hypot(p.x+123,p.z-174)<=4&&Math.abs(p.y-.92)<.3;
export function shopObstacles(city:ShopCity='corona-del-alba'):RoyalObstacle[]{
  const wall=(x:number,z:number,w:number,d:number,h=4.7):RoyalObstacle=>({x,z,halfWidth:w/2,halfDepth:d/2,minY:.92,maxY:.92+h});
  return [...(city==='paso-del-norte'?[wall(-64,156,12.6,10.6,7.6)]:[]),wall(-94,160,.35,18),wall(-74,160,.35,18),wall(-84,151,20,.35),wall(-89.9,169,8.2,.35),wall(-78.1,169,8.2,.35),
    wall(-84,169,3.6,.35,4.7), // Door lintel occupies headroom only, below adjusted below.
    wall(-84,153.1,6.4,.9,1.05),wall(-92.9,159,1,11,2.7),wall(-75.1,159,1,11,2.7),
    wall(-89,151.8,2.4,1,2.7),wall(-79,151.8,2.4,1,2.7),wall(-84,152,.65,.65,1.8),
    wall(-136,159,.2,26,1.3),wall(-110,157,.2,22,1.3),...(city==='corona-del-alba'?cityStableObstacles():[wall(-123,147,26,.2,1.3)]),
    wall(-132,159,1,2.6,2.5),wall(-124,159,2.3,3.2,2.8),wall(-116,159,2.3,3.2,2.8),
    wall(-91,152.65,.85,2,1.2),wall(-77,152.65,.85,2,1.2),
    wall(-98,154,.8,3,1.8),wall(-98,156.3,2,1.4,1.05),
    {x:-84,z:160,halfWidth:10,halfDepth:9,minY:5.03,maxY:5.39} // Ceiling and rafters: camera clearance above human headroom.
  ].map((o,i)=>i===(city==='paso-del-norte'?6:5)?{...o,minY:4.1}:o).map(o=>{const d=siteOffset(city);return{...o,x:o.x+d.x,z:o.z+d.z,minY:o.minY!+d.y,maxY:o.maxY!+d.y};});
}
export const SHOP_PATH = Object.freeze([{x:-156,y:.92,z:180},{x:-104,y:.92,z:180},{x:-64,y:.92,z:180},{x:-84,y:.92,z:180},ROYAL_SHOP.entrance,ROYAL_SHOP.door,{x:-84,y:.92,z:165},ROYAL_SHOP.counter]);
export const SHOP_YARD_PATH = Object.freeze([{x:-84,y:.92,z:180},{x:-123,y:.92,z:180},ROYAL_SHOP.pickup]);
