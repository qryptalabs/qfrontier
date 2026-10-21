import { createSocialState } from './social.ts';
import { emit, give, MvpError, text } from './helpers.ts';
import { allocateSettlement, normalizeSettlements } from './settlements.ts';
import type { Biome, Context, Deposit, ItemId, MvpCommand, MvpWorld, Player, Terrain, Weather, WeatherSnapshot } from './types.ts';
export const WEATHER_WINDOW=6*3600000;
export const HOME_TILE='t_4_4';
const BIOMES:Biome[]=['forest','plains','desert','mountain','swamp'];
const TERRAINS:Terrain[]=['firm','rocky','sandy','muddy','slope','water'];
const BIOME_ITEMS:Record<Biome,ItemId[]>={forest:['timber','fiber','herbs'],plains:['water','grain','biomass'],desert:['silica','crystal_shard','stone'],mountain:['iron_ore','copper_ore','stone'],swamp:['water','biomass','data_fragment']};
export function weatherFor(regionId:string,now:number):WeatherSnapshot {
 const block=Math.floor(now/WEATHER_WINDOW);const number=regionId.split('_').slice(1).reduce((n,s)=>n+Number(s),0);
 const state=(['clear','rain','heat','storm'] as Weather[])[((block+number)%4+4)%4];
 return{regionId,state,startsAt:block*WEATHER_WINDOW,endsAt:(block+1)*WEATHER_WINDOW,movementFactor:state==='rain'?1.2:state==='storm'?1.4:1,waterFactor:state==='heat'?1.25:1};
}
function deposit(itemId:ItemId):Deposit {const amounts=[500,250,100];return{itemId,layers:amounts.map((budget,index)=>({id:`layer_${index}`,budget,remaining:budget,reserved:0,extracted:0,unlocked:index===0}))};}
export function createMvpWorld(ownerId:string,now:number):MvpWorld {
 const world:MvpWorld={schemaVersion:2,seasonId:'frontier-2026-pilot',createdAt:now,adminOwnerId:ownerId,rngSeed:crypto.randomUUID(),players:{},tiles:{},regions:{},jobs:{},battles:{},convoys:{},events:[],receipts:{},social:createSocialState(now),counters:{lot:0,job:0,event:0,unit:0},rulesVersion:'mvp-2.0-pilot'};
 for(let rr=0;rr<3;rr++)for(let rc=0;rc<3;rc++){const id=`r_${rr}_${rc}`;const stock={data_fragment:20,memory_core:1,ancient_map:1,artifact_frame:1,season_relic:1};world.regions[id]={id,name:`Región ${rr*3+rc+1}`,farmBudget:100,farmRemaining:100,waterBudget:300,waterUnassigned:300,expeditionBudget:{...stock},expeditionRemaining:{...stock}};}
 for(let row=0;row<9;row++)for(let col=0;col<9;col++){
  const id=`t_${row}_${col}`,regionId=`r_${Math.floor(row/3)}_${Math.floor(col/3)}`,biome=BIOMES[(row*3+col)%5];
  // The protected starting district always has public recovery routes.
  const terrain:Terrain=row>=3&&row<=5&&col>=3&&col<=5?'firm':TERRAINS[(row*5+col)%6];
  world.tiles[id]={id,row,col,regionId,name:`Sector ${String(row+1).padStart(2,'0')}-${String(col+1).padStart(2,'0')}`,biome,terrain,protected:row>=3&&row<=5&&col>=3&&col<=5,dangerous:row===0||row===8||col===0||col===8,bridge:false,deposits:BIOME_ITEMS[biome].map(deposit)};
  for(const d of world.tiles[id].deposits)if(d.itemId==='water')world.regions[regionId].waterBudget+=d.layers.reduce((n,l)=>n+l.budget,0);
 }
 return world;
}
export function createPlayer(world:MvpWorld,ctx:Context,cmd:MvpCommand):Player {
 if(Object.values(world.players).filter(p=>p.ownerId===ctx.ownerId).length>=2)throw new MvpError('Esta prueba permite dos estaciones por cuenta.',409);
 const faction=cmd.faction;if(!['cartographers','forgers','custodians'].includes(String(faction)))throw new MvpError('Elige una facción válida.');
 const id=`p_${ctx.requestId}`;if(world.players[id])throw new MvpError('El identificador de estación ya existe.',409);
 const p:Player={id,ownerId:ctx.ownerId,name:text(cmd.name,'Nombre',24),stationName:text(cmd.stationName,'Estación',32),faction:faction as Player['faction'],createdAt:ctx.now,position:HOME_TILE,discovered:[HOME_TILE,'t_3_4','t_5_4','t_4_3','t_4_5'],surveyed:[],inventory:[],buildings:{workshop:1,garden:1,kitchen:1,laboratory:1,barracks:1,warehouse:1,logistics:1},farmCycles:0,basicTool:true,units:[],pvpEnabled:false,pvpCooldownUntil:0,stats:{gathered:0,crafted:0,explored:0,trades:0,battles:0,farms:0},milestones:[],activityDays:[],visitedRegions:['r_1_1'],lotSequence:0};
 normalizeSettlements(world);p.settlement=allocateSettlement(world);world.players[id]=p;
 const kit:Partial<Record<ItemId,number>>={timber:12,iron_ore:9,copper_ore:6,silica:6,stone:8,fiber:9,water:18,grain:18,herbs:6,biomass:9,data_fragment:2,seed:2,nutrient:2,ration:6};
 for(const [itemId,qty]of Object.entries(kit))give(p,itemId as ItemId,qty!,ctx.now,'tutorial',[],true);
 emit(world,p,ctx.now,`fundó ${p.stationName}. El kit de tutorial está vinculado; las reservas naturales son compartidas.`);return p;
}
export function neighboring(world:MvpWorld,tileId:string):string[]{const t=world.tiles[tileId];if(!t)return[];return[[t.row-1,t.col],[t.row+1,t.col],[t.row,t.col-1],[t.row,t.col+1]].map(([r,c])=>`t_${r}_${c}`).filter(id=>!!world.tiles[id]);}
export function routeTo(world:MvpWorld,from:string,to:string):string[]{
 if(!world.tiles[from]||!world.tiles[to])throw new MvpError('El sector no existe.',404);
 const queue:string[][]=[[from]],seen=new Set([from]);while(queue.length){const route=queue.shift()!,last=route.at(-1)!;if(last===to)return route;for(const next of neighboring(world,last)){if(seen.has(next))continue;const tile=world.tiles[next];if(tile.terrain==='water'&&!tile.bridge)continue;seen.add(next);queue.push([...route,next]);}}
 throw new MvpError('No hay un paso terrestre; construye un puente o elige otra ruta.',409);
}

