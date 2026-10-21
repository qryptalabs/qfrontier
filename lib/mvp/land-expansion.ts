import {nextWorldId,nextSocialId} from './operation-ids.ts';
import {HABITABLE_OBSTACLES,HABITABLE_TREE_OBSTACLES,HABITABLE_SPAWN,habitableBuildingDimensions,habitableLineClear,habitablePath,habitablePositionAt,habitableWalkableAt,houseClearsProceduralTree} from './habitable-data.ts';
import type {HabitablePoint,HabitableState} from './habitable-data.ts';
import {habitableWorkerObstacles,guardHabitableWorkerMovement,habitableWorkStand} from './habitable-logistics.ts';
import {actor,emit,MvpError,spendMany,field} from './helpers.ts';
import {getActivityProgression} from './activity-progression.ts';
import {weatherFor} from './world.ts';
import {landNaturalWater} from '../graphics/land-terrain.ts';
import {islandContains} from '../graphics/settlement-layout.ts';
import {sampleWorld} from '../graphics/world-geography.ts';
import {LAND_BATCH_LIMIT,LAND_CELL_SIZE,LAND_GRID_SIZE,LAND_CORE_SIZE,landAllowedSize,landBuildingLimit,landCell,landCellAt,landCellFromId,landCellInSquare,landCellOwned,landMaintenance,landNeighbors} from './land-grid.ts';
import type {LandCell,LandMethod,LandOperation,LandView,LandCellView,LandState,LandCrewSchedule} from './land-grid.ts';
import {planLandCrew} from './land-crews.ts';
import {getLandCivilView,applyCivilWork,finishCivilRecovery,reserveDemolition,demolitionReason,demolitionAccess,bridgeReason,LAND_BRIDGE_COSTS,LAND_BRIDGE_SECONDS,LAND_DEMOLITION_SECONDS,LAND_ROAD_SECONDS,LAND_ROAD_UNIT_COSTS} from './land-civil.ts';
import {landBridgePreset} from '../graphics/land-infrastructure.ts';
import type {Context,InventoryLot,ItemAmount,Job,MvpCommand,MvpWorld,Player} from './types.ts';
export type {LandView} from './land-grid.ts';
export {getLandWorkers,getLandVisual} from './land-grid.ts';

const active=(j:Job)=>j.status==='running'||j.status==='reserved';
const COLONIZE_COSTS:ItemAmount[]=[{itemId:'ration',qty:2},{itemId:'plank',qty:1}];
const CLEAR_COSTS:ItemAmount[]=[{itemId:'ration',qty:1}];
const centerCosts=(level:number):ItemAmount[]=>[{itemId:'plank',qty:level===1?2:3},{itemId:'stone',qty:level===1?2:3}];
const allCells:readonly LandCell[]=Object.freeze(Array.from({length:625},(_,i)=>landCell(Math.floor(i/25),i%25)!));
const overlaps=(cell:LandCell,o:{x:number;y:number;width:number;depth:number},padding=0)=>Math.abs(cell.x-o.x)<LAND_CELL_SIZE/2+o.width/2+padding&&Math.abs(cell.y-o.y)<LAND_CELL_SIZE/2+o.depth/2+padding;
const staticCells=new Map(allCells.map(cell=>[cell.id,{structure:HABITABLE_OBSTACLES.some(o=>overlaps(cell,o)),rocky:HABITABLE_OBSTACLES.some(o=>(o.id==='mine'||o.id==='mountain-rock-mass')&&overlaps(cell,o)),specialTree:HABITABLE_TREE_OBSTACLES.some(o=>o.width!==.55&&overlaps(cell,o)),trees:HABITABLE_TREE_OBSTACLES.filter(o=>o.width===.55&&landCellAt(o.x,o.y)?.id===cell.id)}]));
// Geography is immutable; keep sampling it out of every recurring view projection.
const waterCache=new Map<string,boolean>();
function cellInfo(state:HabitableState,cell:LandCell,plot?:{x:number;y:number}):Pick<LandCellView,'terrain'|'occupied'|'protectedReason'> {
  const occupied=state.buildings.some(b=>overlaps(cell,{...b,...habitableBuildingDimensions(b)}));
  const {structure,specialTree,rocky,trees}=staticCells.get(cell.id)!;
  const key=`${plot?.x??'local'}:${plot?.y??'local'}:${cell.id}`;let wet=waterCache.get(key);
  if(wet===undefined){wet=[[-.69,-.69],[.69,-.69],[0,0],[-.69,.69],[.69,.69]].some(([dx,dy])=>{const x=cell.x+dx,y=cell.y+dy;return landNaturalWater(x,y)||!!plot&&!islandContains(x,y)&&sampleWorld(plot.x+x,plot.y+y).water;});if(waterCache.size>=5000)waterCache.delete(waterCache.keys().next().value!);waterCache.set(key,wet);}
  const forest=trees.some(o=>!houseClearsProceduralTree(state,o.x,o.y));
  return{terrain:wet?'water':rocky?'rock':forest?'forest':'grass',occupied:occupied||structure,protectedReason:occupied?'Hay una construcción propia y su huella debe conservarse.':structure?'Estructura, cultivo o cantera del distrito protegidos.':wet?'El río, la ensenada, la poza y el agua natural conservan su cauce.':specialTree?'Árbol autoral protegido; el despeje sólo retira vegetación procedural.':null};
}
function requireStopped(world:MvpWorld,p:Player,now:number):void {if(!p.habitable)throw new MvpError('Creá primero tu personaje del distrito.',409);if(p.habitable.movement&&p.habitable.movement.endsAt>now||Object.values(world.jobs).some(j=>j.playerId===p.id&&active(j)&&(j.kind==='travel'||j.kind==='convoy')))throw new MvpError('Esperá a llegar antes de gestionar el terreno.',409);}
function currentJob(world:MvpWorld,p:Player):Job|undefined{return Object.values(world.jobs).find(j=>j.playerId===p.id&&j.kind==='land'&&active(j));}
function init(p:Player,now:number):LandState {return p.habitable!.land??={version:1,activatedAt:now,centerLevel:1,cells:{},usedProofs:[]};}
function selectedCells(command:MvpCommand):LandCell[]{if(!Array.isArray(command.cellIds)||command.cellIds.length<1||command.cellIds.length>LAND_BATCH_LIMIT||command.cellIds.some(id=>typeof id!=='string')||new Set(command.cellIds).size!==command.cellIds.length)throw new MvpError('Elegí entre una y ocho casillas distintas.');return command.cellIds.map(id=>{const cell=landCellFromId(id as string);if(!cell)throw new MvpError('La casilla no pertenece a la cuadrícula de tu parcela.');return cell;});}
function connected(cells:LandCell[]):boolean {const remaining=new Set(cells.map(c=>c.id)),todo=[cells[0]];remaining.delete(cells[0].id);while(todo.length){for(const n of landNeighbors(todo.shift()!))if(remaining.delete(n.id))todo.push(n);}return remaining.size===0;}
function touchesRights(state:HabitableState,cells:LandCell[]):boolean{return cells.some(c=>landCellOwned(state,c)||landNeighbors(c).some(n=>landCellOwned(state,n)));}
function hasHome(p:Player,now:number):boolean{return!!p.habitable?.buildings.some(b=>b.templateId==='house'&&b.endsAt<=now&&p.habitable!.workforce?.residents.some(r=>r.homeBuildingId===b.id));}
function achievementProofs(world:MvpWorld,p:Player,now:number){const profiles=Object.values(world.players).filter(other=>other.ownerId===p.ownerId),max=Math.max(1,...profiles.map(other=>getActivityProgression(world,other,now)?.progression.level??1)),used=new Set(profiles.flatMap(other=>other.habitable?.land?.usedProofs??[]));return[2,3,4,5].map(level=>({id:`account-level-${level}`,label:`Alcanzar el nivel ${level} por primera vez en la cuenta`,available:max>=level&&!used.has(`account-level-${level}`)}));}
function centerStand(world:MvpWorld,p:Player,now:number,endsAt:number):HabitablePoint|null {
  const state=p.habitable!,home=HABITABLE_OBSTACLES.find(o=>o.id==='home')!,extra=habitableWorkerObstacles(world,p,now),avatar=habitablePositionAt(state,now);
  for(const t of[0,-.95,.95])for(const point of[{x:home.x+t,y:home.y+home.depth/2+.65},{x:home.x+t,y:home.y-home.depth/2-.65},{x:home.x+home.width/2+.65,y:home.y+t},{x:home.x-home.width/2-.65,y:home.y+t}]){
    if(Math.hypot(point.x-avatar.x,point.y-avatar.y)<.8||!habitableWalkableAt(point,state,.32,extra)||!habitablePath(state,HABITABLE_SPAWN,point,extra))continue;
    try{guardHabitableWorkerMovement(world,p,{points:[point,point],startsAt:now,endsAt});if(state.movement&&state.movement.endsAt>now&&!state.movement.points.every((to,i,points)=>i===0||habitableLineClear(points[i-1],to,state,[{id:'land-center-crew',...point,width:.85,depth:.85}])))continue;return point;}catch{/* Another confirmed movement has priority. */}
  }return null;
}
function start(world:MvpWorld,p:Player,ctx:Context,operation:LandOperation,cells:LandCell[],seconds:number,costs:InventoryLot[],extra:Record<string,unknown>={}):Job {
  const crew=planLandCrew(world,p,operation,cells.map(c=>c.id),seconds,ctx.now,{workerStand:extra.workerStand as HabitablePoint|undefined,target:extra.targetPoint as HabitablePoint|undefined});if(!crew)throw new MvpError('La cuadrilla no tiene una ruta segura de ida, trabajo y regreso. Apartate del acceso y prepará primero las casillas alcanzables.',409);
  const home=world.tiles[p.settlement?.homeTileId??p.position];const id=nextWorldId(world,'job');
  const job:Job={id,playerId:p.id,kind:'land',status:'running',createdAt:ctx.now,startsAt:ctx.now,endsAt:crew.endsAt,ruleVersion:world.rulesVersion,weather:weatherFor(home.regionId,ctx.now),route:[home.id],costs,payload:{landOperation:operation,landVersion:2,landWorkSeconds:seconds,cellIds:cells.map(c=>c.id),crew,...extra},report:[]};world.jobs[id]=job;
  emit(world,p,ctx.now,operation==='center'?'inició una mejora del Centro; su capacidad actual se conserva durante la obra.':`inició ${operation==='explore'?'la exploración':operation==='clear'?'el despeje':'la colonización'} de ${cells.length} casillas de su parcela.`);
  return job;
}
export function dispatchLandExpansion(world:MvpWorld,command:MvpCommand,ctx:Context):boolean {
  const isCancel=(command.type==='job.cancel'||command.type==='craft.cancel')&&world.jobs[String(command.jobId)]?.kind==='land';
  if(!command.type.startsWith('habitat.land.')&&command.type!=='habitat.building.demolish'&&!isCancel)return false;
  const p=actor(ctx);requireStopped(world,p,ctx.now);const state=p.habitable!,running=currentJob(world,p);
  if(isCancel)throw new MvpError('La orden territorial ya comenzó y debe completar su plazo; no se devuelve su coste ni se regala terreno al cancelarla.',409);
  if(running)throw new MvpError('Esperá a que termine la orden territorial actual.',409);
  if(command.type==='habitat.land.bridge'){
    const id=field(command,'presetId'),reason=bridgeReason(world,p,id,ctx.now);if(reason)throw new MvpError(reason,409);const preset=landBridgePreset(id)!,costs=spendMany(p,LAND_BRIDGE_COSTS,ctx.now);init(p,ctx.now);start(world,p,ctx,'bridge',[],LAND_BRIDGE_SECONDS,costs,{presetId:id,workerStand:{...preset.from},targetPoint:{x:(preset.from.x+preset.to.x)/2,y:(preset.from.y+preset.to.y)/2}});return true;
  }
  if(command.type==='habitat.building.demolish'){
    const building=state.buildings.find(b=>b.id===field(command,'buildingId'));if(!building)throw new MvpError('La construcción no pertenece a tu parcela.',403);const reason=demolitionReason(world,p,building,ctx.now)??demolitionAccess(world,p,building,ctx.now);if(reason)throw new MvpError(reason,409);const stand=habitableWorkStand(world,p,building,ctx.now);if(!stand)throw new MvpError('Dejá un puesto exterior seguro para la cuadrilla de desmontaje.',409);init(p,ctx.now);const job=start(world,p,ctx,'demolish',[],LAND_DEMOLITION_SECONDS,[],{buildingId:building.id,workerStand:stand,targetPoint:{x:building.x,y:building.y}});reserveDemolition(p,building,job,job.payload.crew as LandCrewSchedule);return true;
  }
  if(command.type==='habitat.land.center.upgrade'){
    const level=state.land?.centerLevel??1;if(level===3)throw new MvpError('El Centro ya permite la cuadrícula máxima de 25 por 25.',409);
    const seconds=level===1?60:90,stand=centerStand(world,p,ctx.now,ctx.now+seconds*1000);if(!stand)throw new MvpError('Dejá un puesto exterior seguro para la cuadrilla del Centro.',409);
    const costs=spendMany(p,centerCosts(level),ctx.now);init(p,ctx.now);start(world,p,ctx,'center',[],seconds,costs,{fromLevel:level,toLevel:level+1,workerStand:stand});return true;
  }
  if(command.type==='habitat.land.road'){
    const cells=selectedCells(command);if(!connected(cells))throw new MvpError('El camino necesita tramos contiguos.',409);for(const c of cells){if(!landCellOwned(state,c)||state.land?.cells[c.id]?.clearedAt===undefined)throw new MvpError('El camino necesita casillas propias, despejadas y preparadas.',409);if(state.land?.roads?.[c.id])throw new MvpError('El lote incluye un tramo ya construido.',409);const reason=cellInfo(state,c,p.settlement).protectedReason;if(reason)throw new MvpError(reason,409);}
    const costs=spendMany(p,LAND_ROAD_UNIT_COSTS.map(i=>({...i,qty:i.qty*cells.length})),ctx.now);init(p,ctx.now);start(world,p,ctx,'road',cells,LAND_ROAD_SECONDS*cells.length,costs);return true;
  }
  const operation=command.type==='habitat.land.explore'?'explore':command.type==='habitat.land.clear'?'clear':command.type==='habitat.land.claim'?'claim':null;if(!operation)throw new MvpError('Orden territorial desconocida.');
  const cells=selectedCells(command);if(!connected(cells)||!touchesRights(state,cells))throw new MvpError('El lote debe ser contiguo y tocar el núcleo o una casilla propia.',409);
  const level=state.land?.centerLevel??1,records=state.land?.cells??{};
  if(operation!=='explore'&&cells.some(c=>!landCellInSquare(c,landAllowedSize(level))))throw new MvpError('Mejorá el Centro antes de preparar o reclamar ese anillo.',409);
  if(operation==='explore'){
    if(cells.some(c=>landCellInSquare(c,LAND_CORE_SIZE)||records[c.id]?.exploredAt!==undefined))throw new MvpError('Estas casillas ya están exploradas; no repitas la orden.',409);
    init(p,ctx.now);start(world,p,ctx,operation,cells,15,[]);return true;
  }
  for(const c of cells){const info=cellInfo(state,c,p.settlement);if(info.protectedReason)throw new MvpError(info.protectedReason,409);if(!landCellInSquare(c,LAND_CORE_SIZE)&&records[c.id]?.exploredAt===undefined)throw new MvpError('Explorá primero todas las casillas seleccionadas.',409);}
  if(operation==='clear'){
    if(cells.some(c=>records[c.id]?.clearedAt!==undefined))throw new MvpError('El lote contiene casillas ya despejadas.',409);
    const costs=spendMany(p,CLEAR_COSTS,ctx.now);init(p,ctx.now);start(world,p,ctx,operation,cells,15*cells.length,costs);return true;
  }
  if(cells.some(c=>landCellOwned(state,c)||records[c.id]?.clearedAt===undefined))throw new MvpError('Reclamá únicamente casillas exteriores despejadas que todavía no sean propias.',409);
  const method=command.method as LandMethod;if(!['colonize','deed','achievement'].includes(method))throw new MvpError('Elegí un método de expansión válido.');
  let costs:InventoryLot[]=[];let proofId:string|undefined;
  if(method==='colonize'){if(!hasHome(p,ctx.now))throw new MvpError('La colonización necesita una vivienda terminada con un habitante propio.',409);costs=spendMany(p,COLONIZE_COSTS,ctx.now);}
  else if(method==='deed'){
    if(command.currency!==undefined&&command.currency!=='SIM_QRYP')throw new MvpError('Este permiso usa solamente SIM_QRYP de alfa, sin dinero ni tokens reales.');
    const account=world.social.accounts[p.id];if(!account||account.simUnits<25)throw new MvpError('Faltan veinticinco unidades SIM_QRYP del simulador.',409);account.simUnits-=25;world.social.ledger.push({id:nextSocialId(world.social,'ledger'),at:ctx.now,currency:'sim',amount:25,from:p.id,to:'land-permits-sim',reason:'Permiso territorial de alfa con QRYP exclusivamente simulado'});
  }else{proofId=typeof command.proofId==='string'?command.proofId:undefined;if(!proofId||!achievementProofs(world,p,ctx.now).some(proof=>proof.id===proofId&&proof.available))throw new MvpError('La hazaña no está verificada o su permiso ya fue utilizado por esta cuenta.',409);}
  const land=init(p,ctx.now);if(proofId)land.usedProofs.push(proofId);start(world,p,ctx,operation,cells,30,costs,{method,...(proofId?{proofId}:{})});return true;
}
export function settleLandExpansion(world:MvpWorld,now:number,playerId?:string):void {
  for(const j of Object.values(world.jobs)){
    if(j.kind!=='land'||!active(j)||playerId!==undefined&&j.playerId!==playerId)continue;const p=world.players[j.playerId],land=p?.habitable?.land;if(!p||!land)throw new MvpError('No se pudo comprobar la orden territorial.',500);
    const operation=j.payload.landOperation as LandOperation;
    const crew=j.payload.landVersion===2?j.payload.crew as LandCrewSchedule|undefined:undefined;
    if(crew){
      const applied=j.payload.appliedWork as number[]??[];
      for(let index=0;index<crew.legs.length;index++){const leg=crew.legs[index];if(leg.phase!=='working'||leg.endsAt>now||applied.includes(index))continue;
        if(operation==='center')land.centerLevel=Math.max(land.centerLevel,Number(j.payload.toLevel)) as LandState['centerLevel'];
        if(leg.cellId&&(operation==='clear'||operation==='claim'||operation==='explore')){const cell=landCellFromId(leg.cellId)!,record=land.cells[cell.id]??={};if(operation==='explore')record.exploredAt=leg.endsAt;if(operation==='clear'){record.exploredAt??=leg.endsAt;record.clearedAt=leg.endsAt;if(landCellInSquare(cell,LAND_CORE_SIZE))record.claimedAt??=leg.endsAt;}if(operation==='claim'){record.claimedAt=leg.endsAt;record.method=j.payload.method as LandMethod;if(j.payload.proofId)record.proofId=String(j.payload.proofId);}}
        applyCivilWork(world,p,j,leg,leg.endsAt);applied.push(index);j.payload.appliedWork=applied;
      }
      if(j.endsAt>now)continue;finishCivilRecovery(p,j,j.endsAt);j.status=j.payload.demolitionAborted?'cancelled':'completed';j.report=[j.payload.demolitionAborted?`Desmontaje suspendido sin retirar bienes: ${j.payload.demolitionAborted}. La cuadrilla regresó y la instalación se conserva.`:operation==='demolish'?'Desmontaje completado y cuadrilla de regreso: la recuperación trazable llegó a Estación; el registro histórico del edificio se conserva.':operation==='road'?'Camino terminado por tramos; la cuadrilla regresó. No se crearon recursos ni experiencia.':operation==='bridge'?'Puente terminado sobre el cruce permitido; ambas orillas quedaron conectadas y la cuadrilla regresó. El cauce permanece debajo.':operation==='center'?`Centro de nivel ${land.centerLevel}; la cuadrilla regresó. Capacidad de ${landBuildingLimit(p.habitable!)} construcciones y anillo de ${landAllowedSize(land.centerLevel)}.`:operation==='clear'?'Despeje terminado por casillas y cuadrilla de regreso, sin producir madera ni piedra.':operation==='explore'?'Exploración local terminada y cuadrilla de regreso, sin propiedad ni recursos adicionales.':'Colonización confirmada por casillas y cuadrilla de regreso.'];emit(world,p,j.endsAt,j.report[0]);continue;
    }
    if(j.endsAt>now)continue;
    if(operation==='center')land.centerLevel=Math.max(land.centerLevel,Number(j.payload.toLevel)) as LandState['centerLevel'];
    else for(const id of j.payload.cellIds as string[]){const c=landCellFromId(id);if(!c)throw new MvpError('La casilla territorial guardada no concilia.',500);const record=land.cells[id]??={};if(operation==='explore')record.exploredAt=j.endsAt;if(operation==='clear'){record.exploredAt??=j.endsAt;record.clearedAt=j.endsAt;if(landCellInSquare(c,LAND_CORE_SIZE))record.claimedAt??=j.endsAt;}if(operation==='claim'){record.claimedAt=j.endsAt;record.method=j.payload.method as LandMethod;if(j.payload.proofId)record.proofId=String(j.payload.proofId);}}
    j.status='completed';j.report=[operation==='center'?`Centro de nivel ${land.centerLevel}: anillo de ${landAllowedSize(land.centerLevel)} por ${landAllowedSize(land.centerLevel)} y hasta ${landBuildingLimit(p.habitable!)} obras.`:operation==='clear'?'Despeje completado: vegetación procedural retirada, sin crear madera, piedra ni reservas.':operation==='explore'?'Exploración local completada; todavía no otorga propiedad ni recursos.':'Colonización completada: permiso local confirmado dentro de la misma parcela.'];emit(world,p,j.endsAt,j.report[0]);
  }
}
export function getLandView(world:MvpWorld,p:Player|null,now:number):LandView|null {
  if(!p?.habitable)return null;const state=p.habitable,land=state.land,level=land?.centerLevel??1,running=currentJob(world,p),proofs=achievementProofs(world,p,now),home=hasHome(p,now),sim=world.social.accounts[p.id]?.simUnits??0,records=land?.cells??{};
  const jobs=Object.values(world.jobs).filter(j=>j.playerId===p.id&&j.kind==='land').sort((a,b)=>b.createdAt-a.createdAt).slice(0,20).map(j=>({id:j.id,kind:j.payload.landOperation as LandOperation,cellIds:structuredClone(j.payload.cellIds as string[]),startsAt:j.startsAt,endsAt:j.endsAt,status:j.status,...(j.payload.crew?{crew:structuredClone(j.payload.crew as LandCrewSchedule)}:{})}));
  const cells=allCells.map(c=>{const r=records[c.id],owned=landCellOwned(state,c),locked=!landCellInSquare(c,landAllowedSize(level)),pending=running&&(running.payload.cellIds as string[]).includes(c.id),info=cellInfo(state,c,p.settlement);return{...c,...info,status:(pending?running.payload.landOperation==='explore'?'exploring':running.payload.landOperation==='claim'?'claiming':'preparing':owned?r?.claimedAt!==undefined?'claimed':'core':locked?'locked':r?.clearedAt!==undefined?'prepared':r?.exploredAt!==undefined?'explored':'available') as LandCellView['status']};});
  const upgrade=level===3?null:{targetLevel:(level+1) as 2|3,costs:centerCosts(level),seconds:level===1?60:90,canStart:!running,reason:running?'Esperá a que termine la orden territorial actual.':null,startsAt:running?.payload.landOperation==='center'?running.startsAt:null,endsAt:running?.payload.landOperation==='center'?running.endsAt:null};
  const maintenance=landMaintenance(state);
  return{playerId:p.id,grid:{size:LAND_GRID_SIZE,cellSize:LAND_CELL_SIZE,coreSize:LAND_CORE_SIZE},center:{level,allowedSize:landAllowedSize(level),upgrade},capacity:{used:state.buildings.length,max:landBuildingLimit(state)},cells,jobs,methods:[{id:'colonize',label:'Colonizar con habitantes',costs:structuredClone(COLONIZE_COSTS),simCost:0,available:home,reason:home?null:'Terminá una vivienda e incorporá un habitante propio.',proofs:[]},{id:'deed',label:'Permiso con QRYP simulado',costs:[],simCost:25,available:sim>=25,reason:sim>=25?null:'Faltan veinticinco unidades SIM_QRYP de alfa.',proofs:[]},{id:'achievement',label:'Permiso por hazaña de cuenta',costs:[],simCost:0,available:proofs.some(proof=>proof.available),reason:proofs.some(proof=>proof.available)?null:'Alcanzá un nuevo máximo de cuenta entre los niveles dos y cinco.',proofs}],rules:{batchLimit:8,clearingSecondsPerCell:15,claimSeconds:30,exploreSeconds:15},summary:{owned:cells.filter(c=>landCellOwned(state,c)).length,explored:cells.filter(c=>landCellInSquare(c,21)||records[c.id]?.exploredAt!==undefined).length,cleared:cells.filter(c=>records[c.id]?.clearedAt!==undefined).length,available:cells.filter(c=>c.status==='available'&&!c.protectedReason).length},optedIn:!!land,maintenance:{extraRations:maintenance.extraRations,extraTimber:maintenance.extraTimber,note:'Cada grupo de hasta ocho casillas exteriores añade una ración y una madera en la próxima jornada que confirmés; no hay cobros atrasados ni pérdida de terreno.'},civil:getLandCivilView(world,p,now)};
}
