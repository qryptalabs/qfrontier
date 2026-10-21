import {shopInside,shopYardAt} from './city-shop-layout.ts';
import {royalCityRoad} from './royal-regional-terrain.ts';
import {SHOP_SITES,siteOffset} from './city-shop-sites.ts';
import {shopRoadNear} from './city-shop-route.ts';
import {oldTownInside,oldTownOwns} from './royal-old-town-plan.ts';
import {royalUrbanRoadAt} from './royal-urban-plan.ts';
/** Carriages use streets and the collection yard, never palace stairs or shop aisles. */
export function shopDrivingAllowed(x:number,z:number){if(oldTownInside(x,z))return false;if(oldTownOwns(x,z)){const lane=royalUrbanRoadAt(x,z);if(!lane||lane.width<5.5)return false;}const d=siteOffset('paso-del-norte');if(shopInside(x-d.x,z-d.z))return false;const s=SHOP_SITES['paso-del-norte'];return z>=94&&!shopInside(x,z)&&(shopYardAt(x,z)||royalCityRoad(x,z)||x>=-128&&x<=-117&&z>=168&&z<=181||shopRoadNear(x,z)||x>=s.x-54&&x<=s.x-24&&z>=s.z-13&&z<=s.z+20);}
