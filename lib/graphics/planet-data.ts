/** Fixed geography for the fictional planet. This module contains no player
 * state, browser APIs, Three.js, GPS integration or economic mutations. */
export const PLANET_RADIUS=100;
export const PLANET_ANCHOR=Object.freeze({lat:12,lon:-35});
export const UNITS_PER_DEGREE=192;
export type GeoPoint={lat:number;lon:number};
export type PlanetVector={x:number;y:number;z:number};
export type WorldPoint={x:number;y:number};
export type PlanetZoomLevel={readonly level:number;readonly label:string;readonly altitude:number};
export type PlanetNPCSettlement={readonly id:string;readonly name:string;readonly alias:string;readonly kind:'npc';readonly x:number;readonly y:number;readonly stage:'village'|'construction'|'city'};
export const WORLD_MANIFEST=Object.freeze({id:'qfrontier-frontera-cero',version:1,radius:PLANET_RADIUS,anchor:PLANET_ANCHOR,unitsPerDegree:UNITS_PER_DEGREE,resourceGridSize:9,resourceOrigin:'t_4_4'});
export type WorldManifest=typeof WORLD_MANIFEST;

function finite(value:number,label:string):number {if(typeof value!=='number'||!Number.isFinite(value))throw new RangeError(`${label} debe ser un número finito.`);return value;}
function positive(value:number,label:string):number {finite(value,label);if(value<=0)throw new RangeError(`${label} debe ser mayor que cero.`);return value;}
function geo(lat:number,lon:number):GeoPoint {
  finite(lat,'Latitud');finite(lon,'Longitud');
  if(lat < -90||lat > 90||lon < -180||lon > 180)throw new RangeError('Coordenadas fuera de los límites del planeta.');
  return{lat,lon};
}

/** Positive global X points east and positive global Y points south, matching
 * increasing column/row indices in the existing t_row_col resource sectors.
 * The nine-sector resource atlas spans nine degrees, centered on the anchor.
 * Neither the projection nor existing parcel coordinates depend on population.
 * Out-of-range coordinates are rejected rather than wrapped onto another lot. */
export function worldToGeo(x:number,y:number):GeoPoint {
  finite(x,'Coordenada X');finite(y,'Coordenada Y');
  return geo(PLANET_ANCHOR.lat-y/UNITS_PER_DEGREE,PLANET_ANCHOR.lon+x/UNITS_PER_DEGREE);
}
export function geoToWorld(lat:number,lon:number):WorldPoint {
  geo(lat,lon);
  return{x:(lon-PLANET_ANCHOR.lon)*UNITS_PER_DEGREE,y:(PLANET_ANCHOR.lat-lat)*UNITS_PER_DEGREE};
}

/** Default Three.js SphereGeometry UV convention: u=(lon+180)/360,
 * v=(lat+90)/180, phi=(lon+180) radians. Vertex coordinates are
 * x=-r*cos(phi)*cos(lat), y=r*sin(lat), z=r*sin(phi)*cos(lat).
 * At lat=0/lon=0 this points along +X; eastward longitude turns toward -Z.
 * Keep this convention aligned with the procedural surface texture. */
export function geoToVector(lat:number,lon:number,radius=PLANET_RADIUS):PlanetVector {
  geo(lat,lon);positive(radius,'Radio');
  const latitude=lat*Math.PI/180,phi=(lon+180)*Math.PI/180,ring=radius*Math.cos(latitude);
  return{x:-ring*Math.cos(phi),y:radius*Math.sin(latitude),z:ring*Math.sin(phi)};
}
export function worldToPlanet(x:number,y:number,radius=PLANET_RADIUS):PlanetVector {
  const point=worldToGeo(x,y);return geoToVector(point.lat,point.lon,radius);
}

export const PLANET_ZOOM_LEVELS:readonly PlanetZoomLevel[]=Object.freeze([
  {level:1,label:'Espacio',altitude:2600},
  {level:2,label:'Planeta',altitude:420},
  {level:3,label:'Hemisferio',altitude:160},
  {level:4,label:'Continente',altitude:55},
  {level:5,label:'Región',altitude:14},
  {level:6,label:'Sector',altitude:4.2},
  {level:7,label:'Valle',altitude:2.2},
  {level:8,label:'Aldeas',altitude:1.1},
  {level:9,label:'Parcelas',altitude:.35},
  {level:10,label:'Aldea',altitude:.12},
].map(level=>Object.freeze(level)));
export function clampPlanetZoomLevel(level:number):number {return Math.max(1,Math.min(10,Math.round(finite(level,'Nivel de zoom'))));}
export function planetZoomLevel(level:number):PlanetZoomLevel {return PLANET_ZOOM_LEVELS[clampPlanetZoomLevel(level)-1];}

/** Fictional ambient locations, kept separate from PublicSettlement and its
 * player IDs. Coordinates use gaps in the 48-unit canonical parcel lattice.
 * Aliases are fictional scenery labels, never account identities or player owners.
 * These locations have no inventory, troops, rewards, accounts or player owner. */
export const NPC_SETTLEMENTS:readonly PlanetNPCSettlement[]=Object.freeze([
  {id:'npc-valleverde',name:'Valleverde',alias:'NoraRios',kind:'npc',x:168,y:120,stage:'village'},
  {id:'npc-las-brumas',name:'Las Brumas',alias:'SantiForge',kind:'npc',x:-216,y:168,stage:'village'},
  {id:'npc-puente-del-alba',name:'Puente del Alba',alias:'MateoRuta',kind:'npc',x:312,y:-168,stage:'construction'},
  {id:'npc-costa-ambar',name:'Costa Ámbar',alias:'LunaCosta',kind:'npc',x:-408,y:-312,stage:'city'},
  {id:'npc-pinar-alto',name:'Pinar Alto',alias:'MaraPino',kind:'npc',x:504,y:264,stage:'village'},
  {id:'npc-refugio-de-roca',name:'Refugio de Roca',alias:'AlexCruz_7',kind:'npc',x:-552,y:456,stage:'construction'},
  {id:'npc-puerto-aurora',name:'Puerto Aurora',alias:'VeraSalas',kind:'npc',x:648,y:-504,stage:'city'},
  {id:'npc-los-cedros',name:'Los Cedros',alias:'DaniAtlas',kind:'npc',x:-696,y:-600,stage:'village'},
  {id:'npc-paso-del-norte',name:'Paso del Norte',alias:'TavoNorte',kind:'npc',x:72,y:-744,stage:'construction'},
  {id:'npc-lago-sereno',name:'Lago Sereno',alias:'SofiLago',kind:'npc',x:-120,y:600,stage:'village'},
].map(location=>Object.freeze(location as PlanetNPCSettlement)));
export const PLANET_NPC_SETTLEMENTS=NPC_SETTLEMENTS;

export function smoothFlyProgress(progress:number):number {
  const t=Math.max(0,Math.min(1,finite(progress,'Progreso de vuelo')));
  return t*t*t*(t*(t*6-15)+10);
}
export type FlightPoint=WorldPoint&{altitude:number};
/** Camera-only interpolation: no movement order, resource change or server time.
 * Height interpolates logarithmically across the very different zoom scales. */
export function interpolateWorldFlight(from:FlightPoint,to:FlightPoint,progress:number):FlightPoint {
  worldToGeo(from.x,from.y);worldToGeo(to.x,to.y);positive(from.altitude,'Altitud inicial');positive(to.altitude,'Altitud final');
  const t=smoothFlyProgress(progress);
  if(t===0)return{...from};if(t===1)return{...to};
  return{x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t,altitude:Math.exp(Math.log(from.altitude)+(Math.log(to.altitude)-Math.log(from.altitude))*t)};
}
