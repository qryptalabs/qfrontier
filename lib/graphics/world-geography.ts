import { geoToWorld, NPC_SETTLEMENTS, PLANET_ANCHOR, worldToGeo } from './planet-data.ts';

/** Geography is fixed independently of accounts, economic sectors and chunks. */
export type WorldBiome = 'ice'|'desert'|'forest'|'tropical'|'mountain'|'coast'|'ocean'|'plains';
export interface WorldSample { x:number;y:number;lat:number;lon:number;biome:WorldBiome;height:number;waterLevel:number;water:boolean;moisture:number;road:boolean;river:boolean }
export interface BiomeStyle {label:string;ground:number;rock:number;water:number;sky:number;foliage:number;building:number;roof:number}
export interface WorldLandmark {readonly id:string;readonly name:string;readonly alias?:string;readonly kind:'village'|'city'|'cave'|'landmark';readonly x:number;readonly y:number;readonly biome:WorldBiome;readonly stage?:'village'|'construction'|'city';readonly tier:1|2|3}
export type WorldSettlement=WorldLandmark&{readonly alias:string;readonly kind:'village'|'city';readonly stage:'village'|'construction'|'city'};
export const WORLD_CHUNK_SIZE=64;
const DEG=Math.PI/180;
const clamp=(value:number,lo=0,hi=1)=>Math.max(lo,Math.min(hi,value));
const smooth=(lo:number,hi:number,value:number)=>{const t=clamp((value-lo)/(hi-lo));return t*t*(3-2*t);};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
function hash(x:number,y:number,z:number){let n=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(z,2147483647)^0x6a09e667;n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;}
function noise(x:number,y:number,z:number){
  const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z),sx=smooth(0,1,x-ix),sy=smooth(0,1,y-iy),sz=smooth(0,1,z-iz);
  const a=mix(hash(ix,iy,iz),hash(ix+1,iy,iz),sx),b=mix(hash(ix,iy+1,iz),hash(ix+1,iy+1,iz),sx),c=mix(hash(ix,iy,iz+1),hash(ix+1,iy,iz+1),sx),d=mix(hash(ix,iy+1,iz+1),hash(ix+1,iy+1,iz+1),sx);
  return mix(mix(a,b,sy),mix(c,d,sy),sz);
}
function fbm(x:number,y:number,z:number,octaves=4){let sum=0,amplitude=.5,weight=0;for(let octave=0;octave<octaves;octave++){sum+=noise(x,y,z)*amplitude;weight+=amplitude;x=x*2.03+13.1;y=y*2.01+7.7;z=z*2.02+4.3;amplitude*=.49;}return sum/weight;}
function direction(lat:number,lon:number){const cos=Math.cos(lat*DEG);return{x:cos*Math.cos(lon*DEG),y:Math.sin(lat*DEG),z:-cos*Math.sin(lon*DEG)};}
const continents=[
  [-7,-56,25,1.05],[21,-38,24,1.05],[42,-20,18,.87],[4,-12,16,.73],[-34,-38,18,.91],[-12,-77,14,.72],
  [35,87,22,1.08],[-2,91,24,.96],[-25,105,22,1.1],[-44,115,14,.9],[10,116,15,.73],
  [35,-143,20,1.12],[8,-156,17,.95],[-20,-133,22,.98],[-47,-100,11,.89],[58,138,13,.8],
].map(([lat,lon,radius,weight])=>({...direction(lat,lon),scale:1/Math.pow(radius*DEG,2),weight}));

/** Extracted unchanged from the original visible sphere sampler. Coordinates,
 * seed, continental field, moisture and the introductory green region are exact.
 */
export function planetTerrainAt(lat:number,lon:number){
  const p=direction(lat,lon),anchor=direction(PLANET_ANCHOR.lat,PLANET_ANCHOR.lon);
  const anchorDistance=Math.max(0,2-2*(p.x*anchor.x+p.y*anchor.y+p.z*anchor.z));
  let field=0;
  for(const continent of continents){const distance=Math.max(0,2-2*(p.x*continent.x+p.y*continent.y+p.z*continent.z));field+=Math.exp(-distance*continent.scale*1.65)*continent.weight;}
  const coast=fbm(p.x*5+19,p.y*5+3,p.z*5+7,4);field+=(coast-.49)*.56-.46;
  const ridges=Math.pow(1-Math.abs(fbm(p.x*18+4,p.y*18+13,p.z*18+31,3)*2-1),6);
  const mountain=smooth(.45,.7,fbm(p.x*7+31,p.y*7-3,p.z*7+11,3));
  let moisture=fbm(p.x*6+103,p.y*6+29,p.z*6+41,3);
  let elevation=field>0?.035+clamp(field)*.2+ridges*mountain*.78:-clamp(-field*1.8+.01);
  const protectedPlain=1-smooth(.006,.018,anchorDistance);
  if(protectedPlain>0){elevation=mix(elevation,.14,protectedPlain);moisture=mix(moisture,.82,protectedPlain);}
  return{elevation,moisture,land:elevation>0,latitude:lat,protectedPlain};
}

function biomeFor(sample:ReturnType<typeof planetTerrainAt>):WorldBiome{
  const lat=Math.abs(sample.latitude),e=sample.elevation;
  // Polar oceans are covered by the same permanent ice cap seen on the globe.
  if(lat>=77||e>.78&&lat>48)return'ice';
  if(!sample.land)return e>-.095?'coast':'ocean';
  if(sample.protectedPlain>.9)return'forest';
  if(e<.065)return'coast';
  if(e>.43)return'mountain';
  if(lat>11&&lat<42&&sample.moisture<.45)return'desert';
  if(lat<25&&sample.moisture>.55)return'tropical';
  return sample.moisture>.52&&lat<67?'forest':'plains';
}

/** A global drainage curve, not a per-chunk random choice. Neighboring chunks
 * sample identical beds, water levels and roads at their shared boundaries.
 */
function drainage(x:number,y:number){
  const basin=Math.round((x-9.78)/768);let distance=Infinity;
  for(let index=basin-1;index<=basin+1;index++){
    const center=index*768+9.78+Math.sin(y/140+index*.5)*30+Math.sin(y/37+index)*4;
    distance=Math.min(distance,Math.abs(x-center));
  }
  return{distance,width:2.6+noise(y/210,basin,33)*1.2};
}

export function sampleWorld(x:number,y:number):WorldSample{
  const point=worldToGeo(x,y),macro=planetTerrainAt(point.lat,point.lon),biome=biomeFor(macro),e=macro.elevation;
  const micro=(noise(x/180,y/180,43)-.5)*3+(noise(x/43,y/43,61)-.5)*1.15;
  const homeBlend=smooth(27,52,Math.max(Math.abs(x),Math.abs(y)));
  let height:number,waterLevel=0,water=false,river=false,road=false;
  if(biome==='ice'&&!macro.land){height=.48+noise(x/120,y/120,78)*.28;}
  else if(!macro.land){height=-.6-Math.abs(e)*15;water=true;}
  else{
    const macroHeight=e*(2/.14)+Math.max(0,e-.25)*48;
    const relief=(biome==='mountain'?Math.abs(micro)*2.2:micro)*smooth(.035,.12,e)*homeBlend;
    height=Math.max(.035,macroHeight+relief);
    const channel=drainage(x,y),wet=biome!=='ice'&&biome!=='desert';
    const influence=wet?1-smooth(channel.width/2,channel.width/2+2.5,channel.distance):0;
    if(influence>0){waterLevel=Math.max(.015,macroHeight-.72);height=mix(height,Math.min(height,waterLevel-.48),influence);}
    river=wet&&channel.distance<channel.width/2;water=river;
    if(!river)waterLevel=0;
    const horizontal=Math.abs(y-Math.round(y/768)*768-Math.sin(x/130)*6);
    const vertical=Math.abs(x-Math.round(x/1152)*1152-Math.sin(y/170)*7);
    road=!water&&biome!=='mountain'&&(horizontal<1.05||vertical<.92);
  }
  return{x,y,lat:point.lat,lon:point.lon,biome,height,waterLevel,water,moisture:macro.moisture,road,river};
}

function finite(value:number){if(typeof value!=='number'||!Number.isFinite(value))throw new RangeError('Las coordenadas deben ser finitas.');return value;}
type Point={x:number;y:number};
export function chunkCoordinates(point:Point):{cx:number;cy:number};
export function chunkCoordinates(x:number,y:number):{cx:number;cy:number};
export function chunkCoordinates(x:number|Point,y?:number){const p=typeof x==='number'?{x,y:y!}:x;return{cx:Math.floor(finite(p.x)/WORLD_CHUNK_SIZE),cy:Math.floor(finite(p.y)/WORLD_CHUNK_SIZE)};}
export function chunkKey(point:Point):string;
export function chunkKey(x:number,y:number):string;
export function chunkKey(x:number|Point,y?:number){const p=typeof x==='number'?chunkCoordinates(x,y!):chunkCoordinates(x);return`${p.cx}:${p.cy}`;}
export function chunkOrigin(cx:number,cy:number):Point{finite(cx);finite(cy);if(!Number.isSafeInteger(cx)||!Number.isSafeInteger(cy))throw new RangeError('El índice de chunk debe ser entero.');return{x:cx*WORLD_CHUNK_SIZE,y:cy*WORLD_CHUNK_SIZE};}

const STYLES:Record<WorldBiome,Readonly<BiomeStyle>>={
  forest:{label:'Bosque templado',ground:0x738c47,rock:0x7f8874,water:0x398b94,sky:0x28473b,foliage:0x386139,building:0xbca57d,roof:0x8e6038},
  tropical:{label:'Bosque tropical',ground:0x638441,rock:0x6e8274,water:0x3b9f9f,sky:0x31584a,foliage:0x32744a,building:0xb6a476,roof:0x946341},
  plains:{label:'Llanuras',ground:0x96a25b,rock:0x989783,water:0x4b929b,sky:0x557060,foliage:0x729245,building:0xc5b28c,roof:0x996a3a},
  desert:{label:'Desierto',ground:0xc9a76c,rock:0xa68b69,water:0x468d97,sky:0x8b795e,foliage:0x7d8a4c,building:0xcab17e,roof:0x9d6d45},
  mountain:{label:'Cordillera',ground:0x858b78,rock:0x9b9d92,water:0x4b8c9b,sky:0x556b69,foliage:0x4a693f,building:0xa19a88,roof:0x716149},
  ice:{label:'Región glacial',ground:0xc8dcdb,rock:0x879ca1,water:0x3d798d,sky:0x667f8c,foliage:0x758e87,building:0xc1d5d6,roof:0x6d8a96},
  coast:{label:'Costa',ground:0xcbbd8c,rock:0x929a89,water:0x42a2a8,sky:0x527c7b,foliage:0x568452,building:0xd4c5a2,roof:0x98734b},
  ocean:{label:'Océano',ground:0x3f665d,rock:0x6d8e8c,water:0x286e91,sky:0x2b5269,foliage:0x3c8b78,building:0xb8aa88,roof:0x806546},
};
Object.values(STYLES).forEach(Object.freeze);
export function getBiomeStyle(biome:WorldBiome):Readonly<BiomeStyle>{return STYLES[biome];}

type Candidate={lat:number;lon:number;x:number;y:number;biome:WorldBiome;water:boolean};
function chord(a:{lat:number;lon:number},b:{lat:number;lon:number}){const p=direction(a.lat,a.lon),q=direction(b.lat,b.lon);return Math.max(0,2-2*(p.x*q.x+p.y*q.y+p.z*q.z));}
function buildLandmarks():readonly WorldLandmark[]{
  const result:WorldLandmark[]=NPC_SETTLEMENTS.map(location=>Object.freeze({id:location.id,name:location.name,alias:location.alias,kind:location.stage==='city'?'city':'village',x:location.x,y:location.y,biome:sampleWorld(location.x,location.y).biome,stage:location.stage,tier:location.stage==='city'?3:location.stage==='construction'?1:2}));
  const candidates:Candidate[]=[];
  // Deterministic global sweep: each selected place has its actual sampled biome.
  for(let lat=-81;lat<=81;lat+=3)for(let lon=-177;lon<=177;lon+=3){const point=geoToWorld(lat,lon),sample=sampleWorld(point.x,point.y);candidates.push({lat,lon,...point,biome:sample.biome,water:sample.water});}
  const used=result.map(location=>worldToGeo(location.x,location.y));
  function place(id:string,name:string,kind:WorldLandmark['kind'],biome:WorldBiome,targetLat:number,targetLon:number,alias?:string,tier:1|2|3=1,stage?:WorldSettlement['stage']){
    let best:Candidate|undefined,score=Infinity;
    for(const candidate of candidates){
      if(candidate.biome!==biome||kind!=='landmark'&&candidate.water)continue;
      if(used.some(point=>chord(candidate,point)<.013))continue;
      const distance=chord(candidate,{lat:targetLat,lon:targetLon});if(distance<score){best=candidate;score=distance;}
    }
    if(!best)throw new Error(`No existe una ubicación válida para ${id} (${biome}).`);
    used.push({lat:best.lat,lon:best.lon});
    result.push(Object.freeze({id,name,kind,x:best.x,y:best.y,biome:best.biome,tier,...(alias?{alias}:{}),...(stage?{stage}:{})}));
  }
  const villages:[string,string,WorldBiome,number,number][]=[
    ['Aldea de las Auroras','ElenaAurora','ice',79,-110],['Dunas Doradas','RafaDunas','desert',-22,107],['Valle del Cedro','AlmaCedro','forest',36,-141],['Jardines del Monzón','IrisJade','tropical',5,95],['Refugio de las Águilas','LeoCumbres','mountain',37,89],['Bahía del Alba','ClaraMarea','coast',-32,-38],['Pradera Serena','HugoPrado','plains',48,-24],
    ['Villa Escarcha','NinaEscarcha','ice',-79,58],['Oasis de las Palmeras','OmarPalmeras','desert',24,-40],['Los Robledales','SofiaRobles','forest',20,-152],['Villa Manglar','BrunoManglar','tropical',-12,-60],['Piedra del Viento','VioletaSierra','mountain',-20,106],['Costa de Coral','DarioCoral','coast',12,116],['Campo del Trébol','EvaTrebol','plains',-42,113],
    ['Aldea Boreal','GaelBoreal','ice',80,136],['Las Caravanas','MilaArena','desert',-17,-136],['Bosque de la Luna','LucasLuna','forest',45,83],['Flor de Cacao','AbrilCacao','tropical',7,-157],['Pinar de las Nubes','ThiagoNubes','mountain',-38,-38],['Puerto del Sauce','NoaSauce','coast',57,135],['Valle de los Girasoles','SaraGirasol','plains',18,-22],['Isla de la Brisa','MarcoBrisa','coast',-46,-102],
  ];
  villages.forEach(([name,alias,biome,lat,lon],index)=>place(`world-village-${index+1}`,name,'village',biome,lat,lon,alias,([1,2,3]as const)[index%3],index%7===6?'construction':'village'));
  place('world-ciudad-del-sol','Ciudad del Sol','city','tropical',-5,93,'SolMarquez',3,'city');
  place('world-reino-del-hielo','Reino del Hielo','city','ice',80,18,'AriaInvierno',3,'city');
  place('world-ciudad-areneros','Ciudad de los Areneros','city','desert',-24,113,'DanteArenas',3,'city');
  place('world-gruta-basalto','Gruta de Basalto','cave','mountain',34,88);
  place('world-caverna-cedros','Caverna de los Cedros','cave','forest',30,-143);
  place('world-boveda-sal','Bóveda de Sal','cave','desert',-26,96);
  place('world-gruta-deshielo','Gruta del Deshielo','cave','ice',-79,-40);
  place('world-agujas-blancas','Las Agujas Blancas','landmark','mountain',39,-24);
  place('world-acantilado-viento','Acantilado del Viento','landmark','coast',-29,-135);
  place('world-cascadas-jade','Cascadas de Jade','landmark','tropical',0,114);
  place('world-abismo-zafiro','Abismo de Zafiro','landmark','ocean',-28,20);
  return Object.freeze(result);
}
export const WORLD_LANDMARKS=buildLandmarks();
export const WORLD_SETTLEMENTS:readonly WorldSettlement[]=Object.freeze(WORLD_LANDMARKS.filter((place):place is WorldSettlement=>place.kind==='village'||place.kind==='city'));
