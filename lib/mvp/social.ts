import {nextSocialId} from './operation-ids.ts';
import { ITEM_CATALOG } from './catalog.ts';
import { addLots, consume, MvpError } from './helpers.ts';
import type { Context, InventoryLot, ItemId, MvpCommand, MvpWorld, Player } from './types.ts';
import { TERRITORY_PARAMETERS } from './territory.ts';
import type { Outpost } from './territory.ts';
import { invitationCodeForPlayer, resolveInvitationPlayerId } from './invitations.ts';
import {playerIdentity} from './village-evidence.ts';

export { MvpError as SocialError } from './helpers.ts';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const FEE_PERCENT = 2;
type Currency = 'credits'|'bound-credits'|'sim'|'item';
type ClanRole = 'founder'|'coordinator'|'storekeeper'|'member';
type Account = { credits: number; boundCredits: number; simUnits: number };
interface Ledger { id: string; at: number; currency: Currency; amount: number; from: string; to: string; reason: string; itemId?: ItemId }
interface MarketOffer { id: string; makerId: string; mode: 'barter'|'credits'; itemId: ItemId; qty: number; lots: InventoryLot[]; wantItemId: ItemId|null; wantQty: number; price: number; fee: number; status: 'open'|'filled'|'cancelled'|'expired'; createdAt: number; expiresAt: number; takerId: string|null }
interface DeliveryContract { id: string; requesterId: string; carrierId: string|null; kind: 'delivery'|'transport'; itemId: ItemId; qty: number; quality: number; destination: string; price: number; escrow: number; cargo: InventoryLot[]; deadline: number; status: 'published'|'accepted'|'settled'|'expired'|'cancelled' }
interface Withdrawal { id: string; requesterId: string; currency: 'credits'|'item'; amount: number; itemId: ItemId|null; lots: InventoryLot[]; approvals: string[]; status: 'pending'|'released'|'cancelled'; expiresAt: number }
interface Clan { id: string; name: string; members: Record<string,ClanRole>; credits: number; lots: InventoryLot[]; highCreditAmount: number; highItemAmount: number; withdrawals: Withdrawal[] }
interface CommunityProject { id: string; clanId: string; tileId: string; requirements: {itemId: ItemId;qty: number}[]; contributions: {playerId:string;lots:InventoryLot[]}[]; deadline: number; status:'open'|'completed'|'cancelled' }
interface Alliance { id:string; name:string; clanIds:string[]; acceptedClanIds:string[]; status:'proposed'|'active'|'ended'; expiresAt:number; noAggression:boolean }
interface Referral { childId:string; parentId:string; linkedAt:number; status:'progressing'|'valid'|'rejected'; validatedAt:number|null }
interface FundingContribution { playerId:string; coupons:number; paid:number; deliveredCoupons:number; releasedUnits:number; refundedUnits:number; delivered:boolean; released:boolean; refunded:boolean }
interface FundingProject { id:string; promoterId:string; itemId:ItemId; qty:number; unitsPerCoupon:number; couponCount:number; pricePerCoupon:number; reserved:InventoryLot[]; contributions:FundingContribution[]; heldUnits:number; fundingDeadline:number; deliveryDeadline:number; status:'open'|'funded'|'delivering'|'settled'|'refund-pending'|'refunded'; lastError:string|null }
interface Activity { points:number; snapshot:{gathered:number;crafted:number;explored:number;farms:number}; daily:Record<string,Record<string,number>> }
interface Reward { playerId:string; points:number; multiplier:number; weight:number; amount:number; status:'pending'|'paid'; lastError:string|null }
interface RewardSeason { state:'active'|'closed'; budget:number; reserve:number; endsAt:number; allocations:Reward[]; closedAt:number|null }
export interface SocialState {
  accounts:Record<string,Account>; ledger:Ledger[]; sequence:number; offers:MarketOffer[];
  npc:{budget:number; remaining:number; demand:Partial<Record<ItemId,{remaining:number;price:number}>>};
  contracts:DeliveryContract[]; clans:Clan[]; projects:CommunityProject[]; alliances:Alliance[];
  referrals:Referral[]; mentors:Record<string,string>; funding:FundingProject[]; activity:Record<string,Activity>;
  rewards:RewardSeason; creditFees:number; creditSinks:number; incidents:{at:number;hours:number;reason:string}[];
  outposts:Outpost[];
}

export function createSocialState(now = Date.now()):SocialState {
  return {
    accounts:{},ledger:[],sequence:0,offers:[],contracts:[],clans:[],projects:[],alliances:[],referrals:[],mentors:{},funding:[],activity:{},outposts:[],
    npc:{budget:10_000,remaining:10_000,demand:{timber:{remaining:150,price:2},iron_ingot:{remaining:100,price:8},ration:{remaining:100,price:5},plank:{remaining:100,price:6}}},
    rewards:{state:'active',budget:1_000,reserve:1_000,endsAt:now+28*DAY,allocations:[],closedAt:null},
    creditFees:0,creditSinks:0,incidents:[],
  };
}

function fail(message:string,status=400):never { throw new MvpError(message,status); }
function integer(value:unknown,label:string,min=1,max=1_000_000):number {
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max) fail(`${label}: usa un entero entre ${min} y ${max}.`);
  return value;
}
function text(value:unknown,label:string,max=80):string {
  if(typeof value!=='string'||value.trim().length<2||value.length>max||/[\u0000-\u001f]/.test(value)) fail(`${label} no es válido.`);
  return value.trim();
}
function item(value:unknown):ItemId {
  if(typeof value!=='string'||!Object.hasOwn(ITEM_CATALOG,value)) fail('Objeto desconocido.');
  return value as ItemId;
}
function idOf(value:unknown):string { if(typeof value!=='string'||!value||value.length>180) fail('Identificador inválido.');return value; }
function actor(world:MvpWorld,ctx:Context):Player {
  const player=ctx.actor&&world.players[ctx.actor.id];
  if(!player||player.ownerId!==ctx.ownerId) fail('Este explorador no pertenece a tu cuenta.',403);
  return player;
}
function admin(world:MvpWorld,ctx:Context):void {
  if(world.adminOwnerId!==ctx.ownerId) fail('Esta operación requiere al administrador de la temporada.',403);
}
function nextId(state:SocialState,prefix:string):string {return nextSocialId(state,prefix);}
function account(state:SocialState,playerId:string):Account {
  return state.accounts[playerId]??=( {credits:0,boundCredits:50,simUnits:1_000} );
}
function entry(state:SocialState,now:number,currency:Currency,amount:number,from:string,to:string,reason:string,itemId?:ItemId):void {
  state.ledger.push({id:nextId(state,'ledger'),at:now,currency,amount,from,to,reason,...(itemId?{itemId}:{})});
}
function debit(state:SocialState,playerId:string,amount:number,currency:'credits'|'simUnits'):void {
  const balance=account(state,playerId);
  if(balance[currency]<amount) fail(currency==='credits'?'Créditos transferibles insuficientes. El crédito de tutorial está vinculado.':'Saldo SIMULADO insuficiente.',409);
  balance[currency]-=amount;
}
function creditCurrency(command:MvpCommand):void { if(command.currency!==undefined&&command.currency!=='credits') fail('Esta operación usa exclusivamente créditos del juego.'); }
function simCurrency(command:MvpCommand):void {if(command.currency!==undefined&&command.currency!=='SIM_QRYP') fail('El simulador usa exclusivamente unidades SIM_QRYP; nunca créditos.');}

/** Reserve eligible actual lots; bound tutorial inputs never enter a transfer. */
function take(player:Player,itemId:ItemId,qty:number,now:number,quality=1,expiresAfter=now):InventoryLot[] {
  const eligible=player.inventory.filter(l=>l.itemId===itemId&&!l.bound&&l.quality>=quality&&(l.expiresAt===null||l.expiresAt>expiresAfter));
  if(eligible.reduce((sum,l)=>sum+l.qty,0)<qty) fail('No hay suficientes lotes transferibles con la calidad y vigencia requeridas.',409);
  const eligibleIds=new Set(eligible.map(l=>l.id));
  const holder:Player={...player,inventory:structuredClone(eligible)};
  const reserved=consume(holder,itemId,qty,now,{tradeableOnly:true});
  player.lotSequence=holder.lotSequence;
  player.inventory=[...player.inventory.filter(l=>!eligibleIds.has(l.id)),...holder.inventory];
  return reserved;
}
function split(pool:InventoryLot[],qty:number):InventoryLot[] {
  const result:InventoryLot[]=[];
  while(qty>0){const lot=pool[0];if(!lot)fail('La reserva de productos no concilia.',409);const amount=Math.min(qty,lot.qty);const part=structuredClone(lot);part.qty=amount;part.id=`${lot.id}:allocation:${lot.qty}`;result.push(part);lot.qty-=amount;qty-=amount;if(lot.qty===0)pool.shift();}
  return result;
}
function ownClan(state:SocialState,playerId:string):Clan|undefined {return state.clans.find(c=>Object.hasOwn(c.members,playerId));}
function requireClan(state:SocialState,playerId:string):Clan {const clan=ownClan(state,playerId);if(!clan)fail('Primero únete a un clan.',409);return clan;}
function can(clan:Clan,playerId:string,permission:'materials'|'credits'|'manage'):boolean {
  const role=clan.members[playerId];return role==='founder'||(permission==='materials'?role==='storekeeper':role==='coordinator');
}
function requirePermission(clan:Clan,playerId:string,permission:'materials'|'credits'|'manage'):void {if(!can(clan,playerId,permission))fail('Tu rol no permite esta operación.',403);}
function allianceTerritorySafe(world:MvpWorld,clanIds:string[],now:number):void {
  const current=(world.social.outposts??[]).filter(post=>post.status!=='expired'&&post.expiresAt>now&&clanIds.includes(post.clanId)).length;
  const pending=Object.values(world.jobs).filter(job=>job.kind==='battle'&&(job.status==='running'||job.status==='reserved')&&typeof job.payload.outpostId==='string');
  if(current+pending.filter(job=>clanIds.includes(String(job.payload.attackerClanId))).length>2)fail('La alianza no puede activar más de dos puestos, incluidas capturas pendientes.',409);
  if(pending.some(job=>clanIds.includes(String(job.payload.attackerClanId))&&clanIds.includes(String(job.payload.defenderClanId))))fail('Resuelve la disputa territorial antes de pactar con el adversario.',409);
}
function returnProject(world:MvpWorld,project:CommunityProject):void {for(const contribution of project.contributions)addLots(world.players[contribution.playerId],contribution.lots);project.contributions=[];project.status='cancelled';}
function poolTake(pool:InventoryLot[],itemId:ItemId,qty:number):InventoryLot[] {
  if(pool.filter(l=>l.itemId===itemId).reduce((sum,l)=>sum+l.qty,0)<qty)fail('El almacén del clan no dispone de esa cantidad.',409);
  const taken:InventoryLot[]=[];
  for(let index=0;index<pool.length&&qty>0;index++){
    const lot=pool[index];if(lot.itemId!==itemId)continue;const amount=Math.min(qty,lot.qty);
    taken.push({...structuredClone(lot),qty:amount});lot.qty-=amount;qty-=amount;
    if(lot.qty===0){pool.splice(index,1);index-=1;}
  }
  return taken;
}

function recordActivity(world:MvpWorld,player:Player,now:number):void {
  const state=world.social;
  if(state.rewards.state!=='active')return;
  const activity=state.activity[player.id]??={points:0,snapshot:{gathered:0,crafted:0,explored:0,farms:0},daily:{}};
  const day=new Date(now).toISOString().slice(0,10);
  const daily=activity.daily[day]??={};
  const caps={gathered:5,crafted:3,explored:3,farms:3};
  for(const key of Object.keys(caps) as (keyof typeof caps)[]){
    const delta=Math.max(0,player.stats[key]-activity.snapshot[key]);
    const eligible=Math.min(delta,Math.max(0,caps[key]-(daily[key]??0)));
    activity.points+=eligible;daily[key]=(daily[key]??0)+eligible;activity.snapshot[key]=player.stats[key];
  }
}

export function settleSocial(world:MvpWorld,now:number,playerId?:string):void {
  const state=world.social;
  // Wallet defaults, activity and boost limits share an account boundary. Seed
  // all its profiles together before quoting either village; their private jobs,
  // construction and escrow settlement below remain scoped to the selected one.
  const ownerId=playerId===undefined?undefined:world.players[playerId]?.ownerId;
  for(const player of Object.values(world.players)){if(playerId!==undefined&&(ownerId===undefined||player.ownerId!==ownerId))continue;account(state,player.id);recordActivity(world,player,now);}
  for(const offer of state.offers){if(playerId!==undefined&&offer.makerId!==playerId)continue;if(offer.status==='open'&&(now>=offer.expiresAt||offer.lots.some(l=>l.expiresAt!==null&&l.expiresAt<=now))){addLots(world.players[offer.makerId],offer.lots);offer.lots=[];offer.status='expired';}}
  for(const contract of state.contracts){if(playerId!==undefined&&contract.requesterId!==playerId)continue;if((contract.status==='published'||contract.status==='accepted')&&now>contract.deadline){account(state,contract.requesterId).credits+=contract.escrow;entry(state,now,'credits',contract.escrow,contract.id,contract.requesterId,'Contrato vencido: devolución');contract.escrow=0;addLots(world.players[contract.requesterId],contract.cargo);contract.cargo=[];contract.status='expired';}}
  // Clan stores, communal refunds, treaties and funding span multiple villages.
  // They are settled only with their global/participant transaction authority.
  if(playerId!==undefined)return;
  for(const clan of state.clans){for(const proposal of clan.withdrawals){if(proposal.status==='pending'&&now>proposal.expiresAt){clan.credits+=proposal.amount;clan.lots.push(...proposal.lots);proposal.amount=0;proposal.lots=[];proposal.status='cancelled';}}}
  for(const project of state.projects){if(project.status==='open'&&now>project.deadline)returnProject(world,project);}
  for(const alliance of state.alliances){if(now>alliance.expiresAt){alliance.status='ended';alliance.noAggression=false;}}
  for(const project of state.funding){if((project.status==='open'&&now>=project.fundingDeadline)||((project.status==='funded'||project.status==='delivering')&&now>=project.deliveryDeadline&&project.contributions.some(c=>c.deliveredCoupons<c.coupons))){
    addLots(world.players[project.promoterId],project.reserved);project.reserved=[];project.status='refund-pending';project.lastError='Vencimiento: reembolsos pendientes de confirmación del adaptador simulado.';
  }}
}

export function dispatchSocial(world:MvpWorld,command:MvpCommand,ctx:Context):boolean {
  const prefixes=['market.','npc.','contract.','clan.','alliance.','referral.','mentor.','funding.','reward.','social.','credit.'];
  if(!prefixes.some(prefix=>command.type.startsWith(prefix)))return false;
  const player=actor(world,ctx),state=world.social,now=ctx.now;
  const wallet=account(state,player.id);
  switch(command.type){
    case 'market.publish': {
      creditCurrency(command);
      const itemId=item(command.itemId),qty=integer(command.qty,'Cantidad',1,999);
      if(command.mode!=='barter'&&command.mode!=='credits')fail('Elige trueque o precio en créditos.');
      if(state.offers.filter(o=>o.makerId===player.id&&o.status==='open').length>=10)fail('Máximo diez órdenes abiertas.',409);
      const mode=command.mode;
      const price=mode==='credits'?integer(command.price,'Precio',1,100_000):0;
      const wantItemId=mode==='barter'?item(command.wantItemId):null;
      const wantQty=mode==='barter'?integer(command.wantQty,'Cantidad solicitada',1,999):0;
      if(wantItemId===itemId)fail('Un trueque necesita dos objetos diferentes.');
      const lots=take(player,itemId,qty,now);
      const fee=Math.floor(price*FEE_PERCENT/100);
      state.offers.push({id:nextId(state,'offer'),makerId:player.id,mode,itemId,qty,lots,wantItemId,wantQty,price,fee,status:'open',createdAt:now,expiresAt:now+7*DAY,takerId:null});
      entry(state,now,'item',qty,player.id,'market-escrow','Reserva de orden',itemId);return true;
    }
    case 'market.fill': {
      creditCurrency(command);
      const offer=state.offers.find(o=>o.id===idOf(command.offerId));
      if(!offer||offer.status!=='open'||now>=offer.expiresAt||offer.lots.some(l=>l.expiresAt!==null&&l.expiresAt<=now))fail('La oferta ya no está disponible.',409);
      if(offer.makerId===player.id)fail('Tu propio explorador no puede aceptar su orden.',409);
      const maker=world.players[offer.makerId];
      if(offer.mode==='barter'){
        const payment=take(player,offer.wantItemId!,offer.wantQty,now);
        addLots(maker,payment);entry(state,now,'item',offer.wantQty,player.id,maker.id,'Trueque',offer.wantItemId!);
      }else{
        debit(state,player.id,offer.price,'credits');account(state,maker.id).credits+=offer.price-offer.fee;state.creditFees+=offer.fee;
        entry(state,now,'credits',offer.price-offer.fee,player.id,maker.id,'Compra a precio fijo');entry(state,now,'credits',offer.fee,player.id,'fees','Comisión: 2%, redondeo inferior');
      }
      addLots(player,offer.lots);offer.lots=[];offer.status='filled';offer.takerId=player.id;
      maker.stats.trades+=1;player.stats.trades+=1;entry(state,now,'item',offer.qty,offer.id,player.id,'Entrega de orden',offer.itemId);return true;
    }
    case 'market.cancel': {
      const offer=state.offers.find(o=>o.id===idOf(command.offerId));
      if(!offer||offer.makerId!==player.id)fail('Solo su creador puede cancelar la orden.',403);
      if(offer.status!=='open')fail('La orden ya se cerró.',409);
      addLots(player,offer.lots);offer.lots=[];offer.status='cancelled';return true;
    }
    case 'npc.sell': {
      creditCurrency(command);const itemId=item(command.itemId),qty=integer(command.qty,'Cantidad',1,100);
      const demand=state.npc.demand[itemId];if(!demand||demand.remaining<qty)fail('El encargo NPC agotó su demanda de temporada.',409);
      const payment=demand.price*qty;if(state.npc.remaining<payment)fail('El presupuesto NPC se agotó.',409);
      take(player,itemId,qty,now);state.npc.remaining-=payment;demand.remaining-=qty;wallet.credits+=payment;
      entry(state,now,'item',qty,player.id,'npc-season','Productos entregados al encargo finito',itemId);
      entry(state,now,'credits',payment,'npc-season',player.id,'Encargo NPC con presupuesto limitado');return true;
    }
    case 'credit.service': {
      creditCurrency(command);
      const lot=player.inventory.find(l=>l.id===idOf(command.lotId));
      const durability=lot?ITEM_CATALOG[lot.itemId].durability:undefined;
      if(!lot||!durability||lot.wear>=durability)fail('Selecciona equipo desgastado para el servicio de reparación.',409);
      const amount=10,bound=Math.min(wallet.boundCredits,amount),free=amount-bound;
      if(wallet.credits<free)fail('No hay créditos para el servicio.',409);
      wallet.boundCredits-=bound;wallet.credits-=free;state.creditSinks+=free;
      let repaired=lot;
      if(lot.qty>1){
        lot.qty-=1;repaired={...structuredClone(lot),id:`${lot.id}:service:${ctx.requestId}`,qty:1};
        player.inventory.push(repaired);
      }
      repaired.wear=durability;
      // A tutorial-funded improvement keeps its tutorial binding, including
      // when the original worn tool was acquired from the public market.
      if(bound)repaired.bound=true;
      if(bound)entry(state,now,'bound-credits',bound,player.id,'service','Servicio de estación: crédito vinculado');
      if(free)entry(state,now,'credits',free,player.id,'service','Servicio de estación');return true;
    }
    case 'contract.publish': {
      creditCurrency(command);const itemId=item(command.itemId),qty=integer(command.qty,'Cantidad',1,999),quality=integer(command.quality??1,'Calidad mínima',1,3);
      if(command.kind!=='delivery'&&command.kind!=='transport')fail('Contrato de entrega o transporte requerido.');
      const destination=idOf(command.destination);if(!Object.hasOwn(world.tiles,destination))fail('Destino desconocido.');
      const price=integer(command.price,'Pago',1,100_000),deadline=now+integer(command.deadlineHours??24,'Horas de plazo',1,168)*HOUR;
      if(wallet.credits<price)fail('No hay créditos transferibles para reservar el pago.',409);
      const cargo=command.kind==='transport'?take(player,itemId,qty,now,quality,deadline):[];
      const id=nextId(state,'contract');
      state.contracts.push({id,requesterId:player.id,carrierId:null,kind:command.kind,itemId,qty,quality,destination,price,escrow:0,cargo,deadline,status:'published'});return true;
    }
    case 'contract.accept': {
      const contract=state.contracts.find(c=>c.id===idOf(command.contractId));
      if(!contract||contract.status!=='published'||now>contract.deadline)fail('Contrato no disponible.',409);
      if(contract.requesterId===player.id)fail('Otro explorador debe aceptar el contrato.');
      debit(state,contract.requesterId,contract.price,'credits');contract.escrow=contract.price;
      entry(state,now,'credits',contract.price,contract.requesterId,contract.id,'Pago reservado al aceptar el contrato');
      contract.carrierId=player.id;contract.status='accepted';return true;
    }
    case 'contract.deliver': {
      const contract=state.contracts.find(c=>c.id===idOf(command.contractId));
      if(!contract||contract.carrierId!==player.id)fail('No eres el responsable de esta entrega.',403);
      if(contract.status!=='accepted'||now>contract.deadline)fail('Contrato cerrado o fuera de plazo.',409);
      if(player.position!==contract.destination)fail('Debes llegar al destino pactado.',409);
      const lots=contract.kind==='delivery'?take(player,contract.itemId,contract.qty,now,contract.quality):contract.cargo;
      if(lots.some(l=>l.expiresAt!==null&&l.expiresAt<=now))fail('La carga caducó.',409);
      addLots(world.players[contract.requesterId],lots);contract.cargo=[];wallet.credits+=contract.escrow;
      entry(state,now,'credits',contract.escrow,contract.id,player.id,'Entrega verificada y liquidada');contract.escrow=0;contract.status='settled';return true;
    }
    case 'clan.create': {
      if(ownClan(state,player.id))fail('Ya perteneces a un clan.',409);
      const name=text(command.name,'Nombre de clan',32);if(state.clans.some(c=>c.name.toLocaleLowerCase()===name.toLocaleLowerCase()))fail('Ese nombre de clan ya existe.',409);
      state.clans.push({id:nextId(state,'clan'),name,members:{[player.id]:'founder'},credits:0,lots:[],highCreditAmount:100,highItemAmount:20,withdrawals:[]});return true;
    }
    case 'clan.join': {
      if(ownClan(state,player.id))fail('Ya perteneces a un clan.',409);
      const clan=state.clans.find(c=>c.id===idOf(command.clanId));if(!clan)fail('Clan desconocido.');
      if(Object.keys(clan.members).length>=20)fail('El clan alcanzó veinte miembros.',409);clan.members[player.id]='member';return true;
    }
    case 'clan.leave': {
      const clan=requireClan(state,player.id);if(clan.members[player.id]==='founder')fail('Transfiere la fundación antes de salir.',409);
      if(clan.withdrawals.some(w=>w.requesterId===player.id&&w.status==='pending'))fail('Resuelve tus retiros pendientes antes de salir.',409);
      delete clan.members[player.id];return true;
    }
    case 'clan.role': {
      const clan=requireClan(state,player.id);if(clan.members[player.id]!=='founder')fail('Solo la fundación asigna roles.',403);
      const targetId=idOf(command.targetId);if(!Object.hasOwn(clan.members,targetId)||targetId===player.id)fail('Miembro de destino inválido.');
      if(!['founder','coordinator','storekeeper','member'].includes(String(command.role)))fail('Rol inválido.');
      if(command.role==='founder')clan.members[player.id]='coordinator';clan.members[targetId]=command.role as ClanRole;return true;
    }
    case 'clan.settings': {
      const clan=requireClan(state,player.id);if(clan.members[player.id]!=='founder')fail('Solo la fundación configura límites.',403);
      clan.highCreditAmount=integer(command.highCreditAmount,'Umbral de créditos',1,10_000);
      clan.highItemAmount=integer(command.highItemAmount,'Umbral de objetos',1,999);return true;
    }
    case 'clan.deposit': {
      const clan=requireClan(state,player.id);
      if(command.currency!==undefined){creditCurrency(command);const amount=integer(command.amount,'Aporte');debit(state,player.id,amount,'credits');clan.credits+=amount;entry(state,now,'credits',amount,player.id,clan.id,'Aporte al clan');}
      else{const itemId=item(command.itemId),qty=integer(command.qty,'Cantidad',1,999);clan.lots.push(...take(player,itemId,qty,now));entry(state,now,'item',qty,player.id,clan.id,'Aporte al almacén',itemId);}return true;
    }
    case 'clan.withdraw': {
      const clan=requireClan(state,player.id),isCredits=command.currency!==undefined;
      requirePermission(clan,player.id,isCredits?'credits':'materials');
      let amount=0,lots:InventoryLot[]=[],itemId:ItemId|null=null;
      if(isCredits){creditCurrency(command);amount=integer(command.amount,'Retiro');if(clan.credits<amount)fail('Tesorería insuficiente.',409);clan.credits-=amount;}
      else{itemId=item(command.itemId);lots=poolTake(clan.lots,itemId,integer(command.qty,'Cantidad',1,999));}
      const high=isCredits?amount>=clan.highCreditAmount:lots.reduce((sum,l)=>sum+l.qty,0)>=clan.highItemAmount;
      if(high){clan.withdrawals.push({id:nextId(state,'withdrawal'),requesterId:player.id,currency:isCredits?'credits':'item',amount,itemId,lots,approvals:[ctx.ownerId],status:'pending',expiresAt:now+DAY});}
      else{wallet.credits+=amount;addLots(player,lots);entry(state,now,isCredits?'credits':'item',isCredits?amount:lots.reduce((sum,l)=>sum+l.qty,0),clan.id,player.id,'Retiro autorizado',itemId??undefined);}return true;
    }
    case 'clan.approve': {
      const clan=requireClan(state,player.id),proposal=clan.withdrawals.find(w=>w.id===idOf(command.proposalId));
      if(!proposal||proposal.status!=='pending'||now>proposal.expiresAt)fail('Retiro no disponible.',409);
      requirePermission(clan,player.id,proposal.currency==='credits'?'credits':'materials');
      if(proposal.approvals.includes(ctx.ownerId))fail('La segunda aprobación necesita otra cuenta responsable.',403);
      proposal.approvals.push(ctx.ownerId);account(state,proposal.requesterId).credits+=proposal.amount;addLots(world.players[proposal.requesterId],proposal.lots);
      entry(state,now,proposal.currency==='credits'?'credits':'item',proposal.currency==='credits'?proposal.amount:proposal.lots.reduce((sum,l)=>sum+l.qty,0),clan.id,proposal.requesterId,'Retiro con dos responsables',proposal.itemId??undefined);
      proposal.amount=0;proposal.lots=[];proposal.status='released';return true;
    }
    case 'clan.project.open': {
      const clan=requireClan(state,player.id);requirePermission(clan,player.id,'manage');const tileId=idOf(command.tileId),tile=world.tiles[tileId];
      if(!tile||tile.terrain!=='water'||tile.bridge)fail('Elige un paso de agua sin puente.',409);
      if(state.projects.some(p=>p.tileId===tileId&&p.status==='open'))fail('Ya hay un proyecto para este paso.',409);
      state.projects.push({id:nextId(state,'community'),clanId:clan.id,tileId,requirements:[{itemId:'plank',qty:4},{itemId:'iron_ingot',qty:2},{itemId:'stone',qty:2}],contributions:[],deadline:now+7*DAY,status:'open'});return true;
    }
    case 'clan.project.contribute': {
      const clan=requireClan(state,player.id),project=state.projects.find(p=>p.id===idOf(command.projectId));
      if(!project||project.clanId!==clan.id||project.status!=='open'||now>project.deadline)fail('Proyecto no disponible.',409);
      const itemId=item(command.itemId),qty=integer(command.qty,'Cantidad',1,999),required=project.requirements.find(r=>r.itemId===itemId);
      const already=project.contributions.flatMap(c=>c.lots).filter(l=>l.itemId===itemId).reduce((sum,l)=>sum+l.qty,0);
      if(!required||already+qty>required.qty)fail('El aporte excede los insumos publicados.',409);
      project.contributions.push({playerId:player.id,lots:take(player,itemId,qty,now)});return true;
    }
    case 'clan.project.complete':case 'clan.project.cancel': {
      const clan=requireClan(state,player.id);requirePermission(clan,player.id,'manage');const project=state.projects.find(p=>p.id===idOf(command.projectId));
      if(!project||project.clanId!==clan.id||project.status!=='open')fail('Proyecto no disponible.',409);
      if(command.type==='clan.project.cancel'){returnProject(world,project);return true;}
      const lots=project.contributions.flatMap(c=>c.lots);
      if(!project.requirements.every(r=>lots.filter(l=>l.itemId===r.itemId).reduce((sum,l)=>sum+l.qty,0)>=r.qty))fail('Aún faltan insumos reservados.',409);
      world.tiles[project.tileId].bridge=true;project.contributions=[];project.status='completed';return true;
    }
    case 'alliance.propose': {
      const clan=requireClan(state,player.id);requirePermission(clan,player.id,'manage');
      if(!Array.isArray(command.clanIds)||command.clanIds.length<2||command.clanIds.length>3)fail('Una alianza requiere entre dos y tres clanes.');
      const clanIds=[...new Set(command.clanIds.map(idOf))];if(clanIds.length!==command.clanIds.length||!clanIds.includes(clan.id)||clanIds.some(id=>!state.clans.some(c=>c.id===id)))fail('Lista de clanes inválida.');
      if(state.alliances.some(a=>a.status!=='ended'&&a.clanIds.some(id=>clanIds.includes(id))))fail('Un clan ya tiene un pacto o propuesta pendiente.',409);
      allianceTerritorySafe(world,clanIds,now);
      state.alliances.push({id:nextId(state,'alliance'),name:text(command.name,'Nombre de alianza',40),clanIds,acceptedClanIds:[clan.id],status:'proposed',expiresAt:now+7*DAY,noAggression:false});return true;
    }
    case 'alliance.accept':case 'alliance.leave': {
      const clan=requireClan(state,player.id);requirePermission(clan,player.id,'manage');const alliance=state.alliances.find(a=>a.id===idOf(command.allianceId));
      if(!alliance||alliance.status==='ended'||!alliance.clanIds.includes(clan.id))fail('Pacto no disponible.',409);
      if(command.type==='alliance.leave'){alliance.clanIds=alliance.clanIds.filter(id=>id!==clan.id);alliance.acceptedClanIds=alliance.acceptedClanIds.filter(id=>id!==clan.id);if(alliance.clanIds.length<2){alliance.status='ended';alliance.noAggression=false;}return true;}
      allianceTerritorySafe(world,alliance.clanIds,now);
      if(!alliance.acceptedClanIds.includes(clan.id))alliance.acceptedClanIds.push(clan.id);
      if(alliance.acceptedClanIds.length===alliance.clanIds.length){alliance.status='active';alliance.noAggression=true;}return true;
    }
    case 'referral.bind': {
      if(state.referrals.some(r=>r.childId===player.id))fail('El referente es único e inmutable.',409);
      if(now>player.createdAt+DAY||player.stats.gathered+player.stats.crafted+player.stats.explored>0)fail('La atribución se fija antes de comenzar el recorrido.',409);
      const parentId=resolveInvitationPlayerId(world,idOf(command.parentId)),parent=parentId?world.players[parentId]:null;
      if(!parent||parentId===player.id||parent.ownerId===player.ownerId)fail('No se permiten autorreferidos ni perfiles de la misma cuenta.',403);
      let cursor:string|undefined=parent.id;const seen=new Set<string>();while(cursor){if(cursor===player.id||seen.has(cursor))fail('El vínculo produciría un ciclo.');seen.add(cursor);cursor=state.referrals.find(r=>r.childId===cursor)?.parentId;}
      state.referrals.push({childId:player.id,parentId:parent.id,linkedAt:now,status:'progressing',validatedAt:null});return true;
    }
    case 'referral.validate': {
      admin(world,ctx);const referral=state.referrals.find(r=>r.childId===idOf(command.targetId));if(!referral||referral.status!=='progressing')fail('Referido no disponible.',409);
      const target=world.players[referral.childId],firstWeekEnd=target.createdAt+7*DAY;
      const eligibleDays=new Set(target.activityDays.filter(day=>{const date=Date.parse(`${day}T00:00:00Z`);return date+DAY>target.createdAt&&date<firstWeekEnd;}));
      const tutorialDone=target.milestones.includes('tutorial')||target.milestones.includes('tutorial-complete')||(target.stats.gathered>0&&target.stats.explored>0&&target.stats.crafted>0);
      if(!tutorialDone||eligibleDays.size<3||target.visitedRegions.length<2||target.stats.crafted<1)fail('Falta tutorial, tres días de la primera semana, dos regiones o una fabricación.',409);
      if(state.referrals.filter(r=>r.parentId===referral.parentId&&r.status==='valid').length>=5)fail('El referente ya alcanzó cinco invitados válidos en la temporada.',409);
      referral.status='valid';referral.validatedAt=now;return true;
    }
    case 'mentor.assign': {
      const targetId=idOf(command.targetId),target=Object.hasOwn(world.players,targetId)?world.players[targetId]:null;if(!target||target.ownerId===player.ownerId)fail('El aprendiz debe pertenecer a otra cuenta.',403);
      if(state.mentors[targetId])fail('El aprendiz ya tiene mentor.',409);
      if(Object.values(state.mentors).filter(id=>id===player.id).length>=3)fail('Máximo tres aprendices activos.',409);
      state.mentors[targetId]=player.id;return true;
    }
    case 'mentor.release': {
      const targetId=idOf(command.targetId);if(!state.mentors[targetId]||(state.mentors[targetId]!==player.id&&targetId!==player.id))fail('No puedes cerrar esta mentoría.',403);
      delete state.mentors[targetId];return true;
    }
    case 'funding.open': {
      simCurrency(command);const itemId=item(command.itemId),qty=integer(command.qty,'Productos',1,999),unitsPerCoupon=integer(command.unitsPerCoupon,'Productos por cupón',1,999);
      if(qty%unitsPerCoupon!==0)fail('La reserva debe contener cupones completos.');
      const pricePerCoupon=integer(command.pricePerCoupon,'Precio SIM por cupón',1,100_000),fundingDeadline=now+integer(command.deadlineHours??24,'Plazo de financiación',1,72)*HOUR;
      const deliveryDeadline=fundingDeadline+integer(command.deliveryHours??24,'Plazo adicional de entrega',1,168)*HOUR;
      const reserved=take(player,itemId,qty,now,1,deliveryDeadline);
      state.funding.push({id:nextId(state,'funding'),promoterId:player.id,itemId,qty,unitsPerCoupon,couponCount:qty/unitsPerCoupon,pricePerCoupon,reserved,contributions:[],heldUnits:0,fundingDeadline,deliveryDeadline,status:'open',lastError:null});return true;
    }
    case 'funding.contribute': {
      simCurrency(command);const project=state.funding.find(p=>p.id===idOf(command.projectId));if(!project||project.status!=='open'||now>=project.fundingDeadline)fail('Financiación no disponible.',409);
      if(project.promoterId===player.id)fail('El promotor no compra sus propios cupones.');
      const coupons=integer(command.coupons,'Cupones',1,999),sold=project.contributions.reduce((sum,c)=>sum+c.coupons,0);
      if(sold+coupons>project.couponCount)fail('No quedan suficientes productos reservados.',409);
      const payment=coupons*project.pricePerCoupon;debit(state,player.id,payment,'simUnits');project.heldUnits+=payment;
      project.contributions.push({playerId:player.id,coupons,paid:payment,deliveredCoupons:0,releasedUnits:0,refundedUnits:0,delivered:false,released:false,refunded:false});
      entry(state,now,'sim',payment,player.id,project.id,'SIMULACIÓN: aporte respaldado por productos');
      if(sold+coupons===project.couponCount)project.status='funded';return true;
    }
    case 'funding.deliver': {
      const project=state.funding.find(p=>p.id===idOf(command.projectId));if(!project||project.promoterId!==player.id)fail('Solo el promotor entrega los productos.',403);
      if((project.status!=='funded'&&project.status!=='delivering')||now>=project.deliveryDeadline)fail('Proyecto sin financiar o fuera de plazo.',409);
      if(project.reserved.some(l=>l.expiresAt!==null&&l.expiresAt<=now))fail('Los productos reservados caducaron.',409);
      const buyerId=command.buyerId===undefined?null:idOf(command.buyerId);
      const selected=project.contributions.filter(c=>buyerId===null||c.playerId===buyerId);
      const availableCoupons=selected.reduce((sum,c)=>sum+c.coupons-c.deliveredCoupons,0);
      let remaining=command.coupons===undefined?availableCoupons:integer(command.coupons,'Cupones a entregar',1,999);
      if(remaining<1||remaining>availableCoupons)fail('No existen esos cupones pendientes de entrega.',409);
      for(const contribution of selected){
        const count=Math.min(remaining,contribution.coupons-contribution.deliveredCoupons);if(count===0)continue;
        addLots(world.players[contribution.playerId],split(project.reserved,count*project.unitsPerCoupon));
        contribution.deliveredCoupons+=count;contribution.delivered=contribution.deliveredCoupons===contribution.coupons;contribution.released=false;remaining-=count;
      }
      project.status='delivering';return true;
    }
    case 'funding.release': {
      simCurrency(command);const project=state.funding.find(p=>p.id===idOf(command.projectId));if(!project||(project.promoterId!==player.id&&world.adminOwnerId!==ctx.ownerId))fail('No puedes conciliar este release.',403);
      if(project.status==='settled'||project.status==='refunded')return true;if(project.status!=='delivering'&&project.status!=='refund-pending')fail('Primero confirma la entrega de productos.',409);
      if(!project.contributions.some(c=>c.deliveredCoupons*project.pricePerCoupon>c.releasedUnits))fail('No hay una entrega pendiente de release.',409);
      if(command.simulateFailure===true){project.lastError='Adaptador SIMULADO falló: release pendiente, fondos conservados.';return true;}
      for(const contribution of project.contributions){const due=contribution.deliveredCoupons*project.pricePerCoupon-contribution.releasedUnits;if(due>0){account(state,project.promoterId).simUnits+=due;project.heldUnits-=due;contribution.releasedUnits+=due;contribution.released=true;entry(state,now,'sim',due,project.id,project.promoterId,'SIMULACIÓN: release confirmado');}}
      project.lastError=null;
      if(project.heldUnits===0)project.status=project.contributions.every(c=>c.delivered)?'settled':'refunded';return true;
    }
    case 'funding.refund': {
      simCurrency(command);const project=state.funding.find(p=>p.id===idOf(command.projectId));
      if(!project||!(project.promoterId===player.id||project.contributions.some(c=>c.playerId===player.id)||world.adminOwnerId===ctx.ownerId))fail('No puedes conciliar estos reembolsos.',403);
      if(project.status==='refunded')return true;if(project.status!=='refund-pending')fail('El proyecto no tiene reembolsos pendientes.',409);
      if(command.simulateFailure===true){project.lastError='Adaptador SIMULADO falló: obligación de reembolso conservada.';return true;}
      for(const contribution of project.contributions){const due=(contribution.coupons-contribution.deliveredCoupons)*project.pricePerCoupon-contribution.refundedUnits;if(due>0){account(state,contribution.playerId).simUnits+=due;project.heldUnits-=due;contribution.refundedUnits+=due;contribution.refunded=true;entry(state,now,'sim',due,project.id,contribution.playerId,'SIMULACIÓN: reembolso confirmado');}}
      project.lastError=project.heldUnits>0?'Los reembolsos se confirmaron; sigue pendiente el release de productos entregados.':null;
      if(project.heldUnits===0)project.status='refunded';return true;
    }
    case 'reward.close': {
      admin(world,ctx);if(state.rewards.state!=='active')fail('La temporada ya fue liquidada.',409);
      for(const candidate of Object.values(world.players))recordActivity(world,candidate,now);
      const weighted=Object.values(world.players).map(candidate=>{
        const points=state.activity[candidate.id]?.points??0;
        const validReferrals=Math.min(5,state.referrals.filter(r=>r.parentId===candidate.id&&r.status==='valid').length);
        const constancy=Math.min(0.3,new Set(candidate.activityDays.filter(day=>Date.parse(`${day}T00:00:00Z`)+DAY>world.createdAt&&Date.parse(`${day}T00:00:00Z`)<=now)).size*0.01);
        const ownedLots=[...candidate.inventory,...(candidate.habitable?.land?.demolished?.flatMap(d=>d.recoveryCargo??[])??[]),...(candidate.habitable?.daily?.journey.cargo??[]),...(candidate.habitable?.commerce?.contracts.flatMap(contract=>contract.cargo)??[]),...(candidate.habitable?.buildings.flatMap(building=>[...(building.storage??[]),...(building.pending??[]),...(building.shipment?.cargo??[]),...(building.supply?.cargo??[]),...(building.construction?.cargo??[])])??[])];
        const quality=Math.min(0.4,new Set(ownedLots.filter(l=>l.quality>=2&&l.provenance.creatorId===candidate.id&&(!l.expiresAt||l.expiresAt>now)).map(l=>l.originLotId??l.id)).size*0.05);
        const multiplier=Math.min(1.8,1+constancy+quality+validReferrals*0.02);
        return {playerId:candidate.id,points,multiplier:Math.round(multiplier*1000)/1000,weight:Math.floor(points*multiplier*1000)};
      });
      const total=weighted.reduce((sum,value)=>sum+value.weight,0),cap=Math.floor(state.rewards.budget*0.02);
      state.rewards.allocations=weighted.filter(v=>v.weight>0).map(value=>({...value,amount:Math.min(cap,Math.floor(state.rewards.budget*value.weight/total)),status:'pending',lastError:null}));
      state.rewards.reserve=state.rewards.budget-state.rewards.allocations.reduce((sum,r)=>sum+r.amount,0);
      state.rewards.state='closed';state.rewards.closedAt=now;return true;
    }
    case 'reward.claim': {
      const reward=state.rewards.allocations.find(r=>r.playerId===player.id);if(!reward)fail('No hay un premio liquidado para este explorador.',409);
      if(reward.status==='paid')return true;if(command.simulateFailure===true){reward.lastError='Entrega SIMULADA pendiente; obligación conservada.';return true;}
      wallet.simUnits+=reward.amount;reward.status='paid';reward.lastError=null;entry(state,now,'sim',reward.amount,'reward-prefunded-season',player.id,'SIMULACIÓN: premio entregado');return true;
    }
    case 'social.incident': {
      admin(world,ctx);const hours=integer(command.hours,'Horas de compensación',1,24),reason=text(command.reason,'Motivo de incidencia',160),extension=hours*HOUR;
      for(const contract of state.contracts){if(contract.status==='published'||contract.status==='accepted')contract.deadline+=extension;}
      for(const project of state.funding){
        const latestSafeDelivery=Math.min(...project.reserved.map(l=>l.expiresAt===null?Infinity:l.expiresAt-1));
        if(project.status==='open'){project.deliveryDeadline=Math.min(project.deliveryDeadline+extension,latestSafeDelivery);project.fundingDeadline=Math.min(project.fundingDeadline+extension,project.deliveryDeadline-HOUR);}
        else if(project.status==='funded')project.deliveryDeadline=Math.min(project.deliveryDeadline+extension,latestSafeDelivery);
      }
      state.incidents.push({at:now,hours,reason});return true;
    }
    default:fail('Acción social desconocida.');
  }
}

export function areAllied(world:MvpWorld,firstPlayerId:string,secondPlayerId:string):boolean {
  const first=ownClan(world.social,firstPlayerId),second=ownClan(world.social,secondPlayerId);
  if(!first||!second)return false;if(first.id===second.id)return true;
  return world.social.alliances.some(a=>a.status==='active'&&a.noAggression&&a.clanIds.includes(first.id)&&a.clanIds.includes(second.id));
}

export function getSocialView(world:MvpWorld,selected:Player|null,ownerId:string) {
  const state=world.social,playerId=selected?.ownerId===ownerId?selected.id:null,clan=playerId?ownClan(state,playerId):undefined;
  const publicClans=state.clans.map(c=>({id:c.id,name:c.name,members:Object.entries(c.members).map(([id,role])=>({playerId:id,name:playerIdentity(world,id)?.name??'Explorador',role})),highCreditAmount:c.highCreditAmount,highItemAmount:c.highItemAmount}));
  const myAccount=playerId?state.accounts[playerId]??{credits:0,boundCredits:50,simUnits:1000}:null;
  const admin=world.adminOwnerId===ownerId?(()=>{
  const habitatEscrow=Object.values(world.players).reduce((sum,player)=>sum+(player.habitable?.job?.escrow??0)+(player.habitable?.commerce?.contracts.reduce((reserved,contract)=>reserved+contract.escrow,0)??0),0);
  const creditCirculation=habitatEscrow+(world.royalHarbor?.credits??0)+Object.values(state.accounts).reduce((sum,a)=>sum+a.credits,0)+state.contracts.reduce((sum,c)=>sum+c.escrow,0)+state.clans.reduce((sum,c)=>sum+c.credits+c.withdrawals.filter(w=>w.status==='pending'&&w.currency==='credits').reduce((part,w)=>part+w.amount,0),0)+state.creditFees+state.creditSinks;
  const simulationSource=Object.keys(state.accounts).length*1_000+state.rewards.budget;
  const simulationLiabilities=Object.values(state.accounts).reduce((sum,a)=>sum+a.simUnits,0)+state.funding.reduce((sum,p)=>sum+p.heldUnits,0)+state.rewards.reserve+state.rewards.allocations.filter(r=>r.status==='pending').reduce((sum,r)=>sum+r.amount,0);
  const simulationSinks=state.ledger.filter(l=>l.currency==='sim'&&l.to==='land-permits-sim'&&Object.hasOwn(state.accounts,l.from)&&l.reason==='Permiso territorial de alfa con QRYP exclusivamente simulado'&&Number.isSafeInteger(l.amount)&&l.amount>0).reduce((sum,l)=>sum+l.amount,0);
    return {creditSourceBudget:state.npc.budget,creditNpcRemaining:state.npc.remaining,creditCirculation,creditDiscrepancy:state.npc.budget-state.npc.remaining-creditCirculation,simulationSource,simulationLiabilities,simulationDiscrepancy:simulationSource-simulationLiabilities-simulationSinks,fees:state.creditFees,incidents:structuredClone(state.incidents),pendingReleases:state.funding.filter(p=>p.status==='delivering').length,pendingRefunds:state.funding.filter(p=>p.status==='refund-pending').length};
  })():null;
  return {
    account:myAccount?{...myAccount}:null,
    offers:state.offers.map(({lots:_lots,...offer})=>({...offer,makerName:playerIdentity(world,offer.makerId)?.name??'Explorador'})),
    npc:structuredClone(state.npc),
    contracts:state.contracts.map(({cargo:_cargo,...contract})=>({...contract,requesterName:playerIdentity(world,contract.requesterId)?.name??'Explorador'})),
    clans:publicClans,
    clan:clan?{...publicClans.find(c=>c.id===clan.id)!,credits:clan.credits,inventory:structuredClone(clan.lots),withdrawals:clan.withdrawals.map(({lots,approvals,...proposal})=>({...proposal,approvalCount:approvals.length,qty:lots.reduce((sum,l)=>sum+l.qty,0)}))}:null,
    projects:state.projects.map(({contributions,...project})=>({...project,contributions:contributions.map(c=>({playerId:c.playerId,items:c.lots.map(l=>({itemId:l.itemId,qty:l.qty}))}))})),
    alliances:structuredClone(state.alliances),
    outposts:structuredClone(state.outposts??[]),
    referrals:playerId?state.referrals.filter(r=>r.childId===playerId||r.parentId===playerId).map(r=>({...r})):[],
    invitationCode:playerId?invitationCodeForPlayer(playerId)??playerId:null,
    mentors:playerId?Object.entries(state.mentors).filter(([child,parent])=>child===playerId||parent===playerId).map(([childId,mentorId])=>({childId,mentorId})):[],
    funding:state.funding.map(({reserved,contributions,...project})=>({...project,reservedQty:reserved.reduce((sum,l)=>sum+l.qty,0),soldCoupons:contributions.reduce((sum,c)=>sum+c.coupons,0),myContributions:contributions.filter(c=>c.playerId===playerId).map(c=>({...c}))})),
    rewards:{...state.rewards,allocations:state.rewards.allocations.filter(r=>r.playerId===playerId).map(r=>({...r}))},
    activity:playerId?structuredClone(state.activity[playerId]??{points:0,snapshot:{gathered:0,crafted:0,explored:0,farms:0},daily:{}}):null,
    ledger:state.ledger.filter(l=>l.from===playerId||l.to===playerId||l.from===clan?.id||l.to===clan?.id).map(l=>({...l})),
    parameters:{marketFeePercent:FEE_PERCENT,feeRounding:'floor',clanMemberLimit:20,allianceClanLimit:3,mentorLimit:3,referralBonusLimit:0.1,referralCountLimit:5,rewardCapPercent:2,simulatedOnly:true,startingSimUnits:1000,startingBoundCredits:50,contractReservation:'El pago se reserva al aceptar; se devuelve si vence.',communityBridgeInputs:[{itemId:'plank',qty:4},{itemId:'iron_ingot',qty:2},{itemId:'stone',qty:2}],outposts:TERRITORY_PARAMETERS},
    admin,
  };
}
export type SocialView=ReturnType<typeof getSocialView>;

