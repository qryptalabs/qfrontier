import {WORLD_LANDMARKS} from './world-geography.ts';
import {tradingGround,tradingSiteContains} from './city-shop-sites.ts';
import {ROYAL_PORT_OFFSET,ROYAL_CASTLE_BASE,ROYAL_COURT_Y,HUMAN_ASCENTS,HUMAN_LANDINGS,humanApproachHeight} from './royal-proportions.ts';
import {ROYAL_WORLD_LOCATION as site,ROYAL_WORLD_BOUNDS as bounds,royalWorldContains,royalWorldEnvelope} from './royal-world-location.ts';
import {royalRiver,royalBridgeDeck,royalAvenueDeck} from './royal-canal-layout.ts';
import {royalUrbanTerrain,royalUrbanRoadAt,royalUrbanWalkHeight,royalUrbanReserved} from './royal-urban-plan.ts';
export {royalRiver} from './royal-canal-layout.ts';

const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const smooth=(n:number)=>{const t=clamp(n);return t*t*(3-2*t);};
export const ROYAL_CITY_PLAN=Object.freeze({houseScale:1,treeScale:1,personScale:.9,shipScale:.45,streetWidth:6,quayX:27,bridgeZ:100,waterY:-1,castleBase:ROYAL_CASTLE_BASE,courtY:ROYAL_COURT_Y});
export function royalApproachY(z:number):number|null{
 if(z<50.6||z>92)return null;
 if(z<=54)return ROYAL_CITY_PLAN.courtY;
 if(z<=66)return 6.4+(66-z)/12*(ROYAL_CITY_PLAN.courtY-6.4);
 if(z<=70)return 6.4;
 if(z<=80)return 3.2+(80-z)/10*3.2;
 if(z<=84)return 3.2;
 return .8+(92-z)/8*2.4;
}
/** Compact supported precinct; natural mountains and other towns retain their
 * existing geography. All heights are in the same metres as houses and people. */
export function royalRegionalTerrain(x:number,y:number,fallback:number,baseY:number){return baseY+tradingGround(x-site.x,y-site.y-ROYAL_PORT_OFFSET,regionalTerrain(x,y,fallback,baseY)-baseY);}
function regionalTerrain(x:number,y:number,fallback:number,baseY:number){
 const dx=x-site.x,z=y-site.y,harborZ=z-ROYAL_PORT_OFFSET,r=royalRiver(dx,harborZ);
 if(!royalWorldContains(x,y)){if(royalWorldEnvelope(x,y,2048)&&r.water)return Math.min(fallback,baseY+ROYAL_CITY_PLAN.waterY-2.5);return fallback;}
 const edge=Math.min(dx-bounds.minX,bounds.maxX-dx,z-bounds.minZ,bounds.maxZ-z),weight=smooth(edge/64);let h=fallback-baseY;
 const hill=1-smooth(Math.max(Math.abs(dx)-79,-54-z,z-84.4,0)/48);h=Math.max(h,(fallback-baseY)+(ROYAL_CASTLE_BASE-fallback+baseY)*hill);
 for(const a of HUMAN_LANDINGS)if(z<=a.startZ+ROYAL_PORT_OFFSET&&z>=a.endZ+ROYAL_PORT_OFFSET&&Math.abs(dx)<=a.width/2)h=Math.min(h,a.y-.2);
 const ascent=HUMAN_ASCENTS.find(a=>harborZ<=a.startZ&&harborZ>=a.endZ);if(ascent&&Math.abs(dx)<ascent.width/2+.2)h=(humanApproachHeight(harborZ)??h)-.15;
 if(Math.abs(dx)<195&&harborZ>=76&&harborZ<=280)h=.8;
 if(z>=ROYAL_PORT_OFFSET-8&&z<=ROYAL_PORT_OFFSET+103&&Math.abs(dx)<12)h=.65;
 h=royalUrbanTerrain(dx,harborZ,h);
 if(r.halfWidth>0){const shore=smooth((Math.abs(dx-r.center)-r.halfWidth+3)/5);h=-3.5+(h+3.5)*shore;}
 const neighborWeight=WORLD_LANDMARKS.reduce((w,p)=>Math.min(w,smooth((Math.max(Math.abs(x-p.x),Math.abs(y-p.y))-192)/64)),1);
 const harborWeight=1-smooth(Math.max(Math.abs(dx)-190,ROYAL_PORT_OFFSET+76-z,z-ROYAL_PORT_OFFSET-280,0)/40),blend=Math.max(weight*neighborWeight,harborWeight),result=fallback*(1-blend)+(baseY+h)*blend;
 return r.water?Math.min(result,baseY-3.5):result;
}

export function royalCityRoad(x:number,z:number){return !!royalUrbanRoadAt(x,z)||royalBridgeDeck(x,z)!==null;}

/** Shared exclusion includes the full tree crown, not just its trunk. Coordinates
 * are metres relative to the harbor origin in every forest renderer. */
export function royalVegetationAllowed(x:number,z:number,canopy=5){
 if(tradingSiteContains(x,z,canopy))return false;
 if(royalUrbanReserved(x,z,canopy+3))return false;
 const inside=(a:number,b:number,c:number,d:number)=>x>=a-canopy&&x<=b+canopy&&z>=c-canopy&&z<=d+canopy;
 if(inside(-78,78,-179,-40)||inside(-112,112,-42.3,100)||inside(-192,192,76,286))return false;
 const river=royalRiver(x,z);return !(z>=-760&&z<=1500&&Math.abs(x-river.center)<river.halfWidth+canopy+5);
}

/** Bridge decks include approach ramps across both banks, not only wet pixels. */
export function royalRoadDeck(x:number,z:number,ground:number):number|null{
 if(Math.abs(x)<=3&&z>=-4&&z<=20)return royalAvenueDeck(z);
 return royalBridgeDeck(x,z)??royalUrbanWalkHeight(x,z);
}
