import {geographicWorldBounds} from '../graphics/world-navigation.ts';

export type GameTab='world'|'roam'|'station'|'trade'|'community'|'expeditions'|'season';
export interface GameWorldLocation {x:number;y:number;settlementId?:string;placeId?:string;zoom?:number;camera?:'2d'|'3d';tilt?:number}
export interface GameNavigation {tab:GameTab;section:string;profileId?:string;tileId?:string;facilityId?:string;world?:GameWorldLocation}
export interface GameNavigationLocation {pathname:string;search?:string;hash?:string}
export interface NavigationProfile {id:string;habitable?:{buildings:readonly{id:string}[]}}
export interface NavigationAccess {profiles:readonly NavigationProfile[];selectedProfileId?:string;isAdmin?:boolean}

export const GAME_NAVIGATION_ROUTES=Object.freeze({
  world:{path:'mundo',defaultSection:'planet',sections:{planet:'planeta',settlements:'aldeas',sectors:'sectores',kingdom:'reino'}},
  roam:{path:'recorrer',defaultSection:'job',sections:{job:'encargo',build:'construir',land:'terreno',network:'circuito',production:'produccion',residents:'habitantes',economy:'economia',profile:'personaje'}},
  station:{path:'estacion',defaultSection:'overview',sections:{overview:'resumen',inventory:'inventario',craft:'fabricacion',farm:'agricultura',buildings:'edificios',army:'unidades'}},
  trade:{path:'comercio',defaultSection:'market',sections:{market:'mercado',publish:'publicar',contracts:'contratos',npc:'feria'}},
  community:{path:'comunidad',defaultSection:'clan',sections:{clan:'clan',treasury:'tesoreria',projects:'obras',alliances:'alianzas',referrals:'invitaciones'}},
  expeditions:{path:'expediciones',defaultSection:'explore',sections:{explore:'hallazgos',convoys:'convoyes',combat:'encuentros',reports:'informes'}},
  season:{path:'temporada',defaultSection:'rewards',sections:{rewards:'resumen',funding:'proyectos',ledger:'movimientos',admin:'administracion'}},
} as const);

const base='https://navigation.invalid';
const identifier=(value:unknown):string|undefined=>typeof value==='string'&&/^[a-zA-Z0-9_:-]{1,160}$/.test(value)?value:undefined;
const tile=(value:unknown):string|undefined=>typeof value==='string'&&/^t_[0-8]_[0-8]$/.test(value)?value:undefined;
const tabFromName=(value:string|null|undefined):GameTab|undefined=>{if(!value)return undefined;const normalized=value.toLowerCase();return(Object.keys(GAME_NAVIGATION_ROUTES)as GameTab[]).find(tab=>tab===normalized||GAME_NAVIGATION_ROUTES[tab].path===normalized)||(normalized==='regional'?'world':undefined);};
const sectionFor=(tab:GameTab,value:unknown):string=>{const route=GAME_NAVIGATION_ROUTES[tab];return typeof value==='string'&&Object.hasOwn(route.sections,value)?value:route.defaultSection;};
const finite=(value:unknown):number|undefined=>{if(typeof value==='string'&&(!value.trim()||!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(value)))return undefined;if(typeof value!=='number'&&typeof value!=='string')return undefined;const n=Number(value);return Number.isFinite(n)?n===0?0:n:undefined;};
function validWorld(value:Partial<GameWorldLocation>|undefined):GameWorldLocation|undefined{
  if(!value)return undefined;const x=finite(value.x),y=finite(value.y),bounds=geographicWorldBounds;if(x===undefined||y===undefined||x<bounds.minX||x>bounds.maxX||y<bounds.minY||y>bounds.maxY)return undefined;
  const zoom=finite(value.zoom),tilt=finite(value.tilt),settlementId=identifier(value.settlementId),placeId=identifier(value.placeId);
  return{x,y,...(settlementId?{settlementId}:{}),...(placeId?{placeId}:{}),...(zoom!==undefined&&Number.isInteger(zoom)&&zoom>=1&&zoom<=10?{zoom}:{}),...(value.camera==='2d'||value.camera==='3d'?{camera:value.camera}:{}),...(tilt!==undefined&&tilt>=30&&tilt<=75?{tilt}:{})};
}
function locationUrl(input:string|URL|GameNavigationLocation):URL{
  try{return input instanceof URL?new URL(input.href):typeof input==='string'?new URL(input,base):new URL(`${input.pathname}${input.search??''}${input.hash??''}`,base);}catch{return new URL('/',base);}
}
function pathnameParts(pathname:string):string[]{try{return pathname.split('/').filter(Boolean).map(part=>decodeURIComponent(part).toLowerCase());}catch{return['invalid'];}}
function pathRoute(pathname:string):{tab:GameTab;section:string}|undefined{
  const parts=pathnameParts(pathname);if(!parts.length)return undefined;if(parts.length>2)return undefined;const tab=(Object.keys(GAME_NAVIGATION_ROUTES)as GameTab[]).find(tab=>GAME_NAVIGATION_ROUTES[tab].path===parts[0]);if(!tab)return undefined;const route=GAME_NAVIGATION_ROUTES[tab];if(parts.length===1)return{tab,section:route.defaultSection};const section=Object.entries(route.sections).find(([,path])=>path===parts[1])?.[0];return section?{tab,section}:undefined;
}

/** App Router catch-all pages use this before reading any authenticated world. */
export function isGamePathname(pathname:string):boolean{return pathname==='/'||!!pathRoute(pathname);}
export function defaultGameNavigation(tab:GameTab='world'):GameNavigation{return{tab,section:GAME_NAVIGATION_ROUTES[tab].defaultSection};}

/** Parse only navigation data. Public settlement IDs never become financial profile IDs. */
export function parseGameNavigation(input:string|URL|GameNavigationLocation):GameNavigation{
  const original=locationUrl(input);let url=original;
  // Legacy hash routing is accepted only at the root. A canonical pathname wins.
  if(original.pathname==='/'&&original.hash.length>1){const hash=original.hash.slice(1);if(hash.startsWith('/')||/^(?:\?|view=)/.test(hash)){const candidate=new URL(hash.startsWith('/')?hash:hash.startsWith('?')?`/${hash}`:`/?${hash}`,base);if(candidate.origin===base&&(candidate.pathname==='/'||pathRoute(candidate.pathname))){for(const[key,value]of original.searchParams)candidate.searchParams.set(key,value);url=candidate;}}}
  const path=pathRoute(url.pathname),tab=path?.tab??tabFromName(url.searchParams.get('view'))??'world',section=path?.section??sectionFor(tab,url.searchParams.get('section'));
  const profileId=identifier(url.searchParams.get('profile')??url.searchParams.get('playerId')),facilityId=tab==='roam'?identifier(url.searchParams.get('building')??url.searchParams.get('facility')):undefined,tileId=tab==='world'?tile(url.searchParams.get('tile')):undefined;
  const world=tab==='world'?validWorld({x:finite(url.searchParams.get('x')),y:finite(url.searchParams.get('y')),settlementId:identifier(url.searchParams.get('settlement')),placeId:identifier(url.searchParams.get('place')),zoom:finite(url.searchParams.get('zoom')),camera:url.searchParams.get('camera') as GameWorldLocation['camera'],tilt:finite(url.searchParams.get('tilt'))}):undefined;
  return{tab,section,...(profileId?{profileId}:{}),...(facilityId?{facilityId}:{}),...(tileId?{tileId}:{}),...(world?{world}:{})};
}

/** Resolve exclusively against the session's own profiles, never the public player directory. */
export function resolveOwnedProfileId(requested:string|undefined,profiles:readonly{id:string}[],selectedProfileId?:string):string|undefined{
  return profiles.find(p=>p.id===requested)?.id??profiles.find(p=>p.id===selectedProfileId)?.id??profiles[0]?.id;
}
export function normalizeGameNavigation(value:GameNavigation,access:NavigationAccess):GameNavigation{
  const tab=Object.hasOwn(GAME_NAVIGATION_ROUTES,value.tab)?value.tab:'world',profileId=resolveOwnedProfileId(value.profileId,access.profiles,access.selectedProfileId),profile=access.profiles.find(p=>p.id===profileId);
  const wantedSection=sectionFor(tab,value.section),section=tab==='season'&&wantedSection==='admin'&&!access.isAdmin?'rewards':wantedSection;
  const facilityId=tab==='roam'&&profile?.habitable?.buildings.some(b=>b.id===value.facilityId)?value.facilityId:undefined;
  const world=tab==='world'?validWorld(value.world):undefined,tileId=tab==='world'?tile(value.tileId):undefined;
  return{tab,section,...(profileId?{profileId}:{}),...(facilityId?{facilityId}:{}),...(tileId?{tileId}:{}),...(world?{world}:{})};
}

/** Stable relative URLs contain no tokens, account owners, action payloads or unknown query keys. */
export function formatGameNavigation(value:GameNavigation):string{
  const tab=Object.hasOwn(GAME_NAVIGATION_ROUTES,value.tab)?value.tab:'world',route=GAME_NAVIGATION_ROUTES[tab],section=sectionFor(tab,value.section),segment=(route.sections as Record<string,string>)[section],params=new URLSearchParams();
  const profileId=identifier(value.profileId);if(profileId)params.set('profile',profileId);
  const world=tab==='world'?validWorld(value.world):undefined;if(world){params.set('view','regional');params.set('x',String(world.x));params.set('y',String(world.y));if(world.settlementId)params.set('settlement',world.settlementId);if(world.placeId)params.set('place',world.placeId);if(world.zoom!==undefined)params.set('zoom',String(world.zoom));if(world.camera)params.set('camera',world.camera);if(world.tilt!==undefined)params.set('tilt',String(world.tilt));}
  const tileId=tab==='world'?tile(value.tileId):undefined;if(tileId)params.set('tile',tileId);
  const facilityId=tab==='roam'?identifier(value.facilityId):undefined;if(facilityId)params.set('building',facilityId);
  return`/${route.path}/${segment}${params.size?`?${params}`:''}`;
}
export function sameGameNavigation(a:GameNavigation,b:GameNavigation):boolean{return formatGameNavigation(a)===formatGameNavigation(b);}
