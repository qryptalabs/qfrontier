import { activityProgressionForXp, getActivityXpTimeline } from './activity-progression.ts';
import { jobTestBoost } from './boost-reservations.ts';
import { ITEM_CATALOG } from './catalog.ts';
import type { MvpWorld } from './types.ts';
import {ledgerEntriesAdjacent} from './village-evidence.ts';

export interface BoostPassReward {id:string;kind:'welcome'|'level'|'district'|'fair'|'forestry';playerId:string;earnedAt:number;charges:number;title:string;activityId?:string;level?:number}
export interface BoostPassWallet {available:number;earned:number;spent:number;welcomeGranted:number;levelEarned:number;contractEarned:number;highestAccountLevel:number;history:BoostPassReward[]}
export interface BoostPassRewardQuote {charges:number;rewards:BoostPassReward[]}
export const BOOST_PASS_HISTORY_LIMIT=20;
const validAt=(at:unknown,now:number):at is number=>typeof at==='number'&&Number.isFinite(at)&&at>=0&&at<=now;
const positive=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0;
const order=(a:{earnedAt:number;id:string},b:{earnedAt:number;id:string})=>a.earnedAt-b.earnedAt||a.id.localeCompare(b.id,undefined,{numeric:true});

/** Read-only, claimless account wallet. No inventory, credits, XP or saved profile is modified. */
export function getBoostPassWallet(world:MvpWorld,ownerId:string,now:number):BoostPassWallet {
  const own=Object.values(world.players).filter(p=>p.ownerId===ownerId&&validAt(p.createdAt,now)).sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id)),ownIds=new Set(own.map(p=>p.id)),history:BoostPassReward[]=[],seen=new Set<string>();
  const keep=(reward:BoostPassReward)=>{history.push(reward);history.sort((a,b)=>-order(a,b));if(history.length>BOOST_PASS_HISTORY_LIMIT)history.length=BOOST_PASS_HISTORY_LIMIT;};
  const welcomeGranted=own.length?3:0;if(own.length)keep({id:`boost-welcome:${own[0].id}`,kind:'welcome',playerId:own[0].id,earnedAt:own[0].createdAt,charges:3,title:'Tres pases de bienvenida para tu cuenta'});
  const timeline=own.flatMap(p=>getActivityXpTimeline(world,p,now)).sort((a,b)=>a.completedAt-b.completedAt||a.id.localeCompare(b.id,undefined,{numeric:true})||a.playerId.localeCompare(b.playerId));
  const xpByPlayer=new Map<string,number>();let highestAccountLevel=1,levelEarned=0;
  for(const event of timeline){
    const xp=Math.min(Number.MAX_SAFE_INTEGER,(xpByPlayer.get(event.playerId)??0)+event.xp);xpByPlayer.set(event.playerId,xp);const level=activityProgressionForXp(xp).level;if(level<=highestAccountLevel)continue;
    levelEarned=Math.min(Number.MAX_SAFE_INTEGER,levelEarned+2*(level-highestAccountLevel));
    // The balance uses the full interval; only the last twenty levels can enter the public history.
    for(let n=Math.max(highestAccountLevel+1,level-BOOST_PASS_HISTORY_LIMIT+1);n<=level;n++)keep({id:`boost-level:${world.seasonId}:${n}`,kind:'level',playerId:event.playerId,earnedAt:event.completedAt,charges:2,title:`Primer nivel ${n} de la cuenta`,activityId:`level:${event.playerId}:${n}`,level:n});
    highestAccountLevel=level;
  }
  const candidates:BoostPassReward[]=[];
  // npc.sell appends its item debit immediately followed by its canonical credit payment.
  for(let i=0;i<world.social.ledger.length-1;i++){
    const debit=world.social.ledger[i],paid=world.social.ledger[i+1],demand=debit.itemId?world.social.npc.demand[debit.itemId]:undefined;
    if(!ledgerEntriesAdjacent(world,debit,paid))continue;
    if(debit.currency!=='item'||!ownIds.has(debit.from)||debit.to!=='npc-season'||debit.reason!=='Productos entregados al encargo finito'||!debit.itemId||!positive(debit.amount)||!demand||!validAt(debit.at,now))continue;
    if(paid.currency!=='credits'||paid.from!=='npc-season'||paid.to!==debit.from||paid.reason!=='Encargo NPC con presupuesto limitado'||paid.at!==debit.at||!positive(paid.amount)||paid.amount!==debit.amount*demand.price)continue;
    candidates.push({id:`boost-fair:${world.seasonId}:${debit.itemId}`,kind:'fair',playerId:debit.from,earnedAt:paid.at,charges:1,title:`Primera entrega pagada de ${ITEM_CATALOG[debit.itemId].name} en la Feria`,activityId:`npc-sale:${paid.id}`});
  }
  for(const p of own){
    const d=p.habitable?.job;
    if(d?.status==='completed'&&d.escrow===0&&d.plankQty===2&&positive(d.rewardCredits)&&validAt(d.deliveredAt,now)&&world.social.ledger.some(l=>l.currency==='credits'&&l.from===d.id&&l.to===p.id&&l.at===d.deliveredAt&&l.amount===d.rewardCredits&&l.reason==='Entrega verificada de dos tablones para el distrito'))candidates.push({id:`boost-district:${world.seasonId}`,kind:'district',playerId:p.id,earnedAt:d.deliveredAt,charges:1,title:'Encargo del distrito entregado y pagado',activityId:`district-contract:${d.id}:paid`});
    for(const c of p.habitable?.commerce?.contracts??[]){
      if(c.status!=='completed'||c.escrow!==0||c.quantity!==2||c.deliveredUnits!==2||c.price!==12||!validAt(c.paidAt,now)||c.caravan.delivery?.unloadsAt!==c.paidAt)continue;
      const lots=c.deliveredLots??[];if(lots.reduce((n,l)=>n+l.qty,0)!==2||lots.some(l=>l.itemId!=='plank'||l.bound||l.quality<1||!positive(l.qty)||l.expiresAt!==null&&l.expiresAt<=c.paidAt!))continue;
      if(!world.social.ledger.some(l=>l.currency==='credits'&&l.from==='npc'&&l.to===p.id&&l.at===c.paidAt&&l.amount===12&&l.reason===`Entrega forestal ${c.id}`))continue;
      candidates.push({id:`boost-forestry:${c.id}`,kind:'forestry',playerId:p.id,earnedAt:c.paidAt,charges:1,title:'Dos tablones entregados y pagados en Valleverde',activityId:`npc-delivery:${c.id}`});
    }
  }
  let contractEarned=0;
  for(const reward of candidates.sort(order)){if(seen.has(reward.id))continue;seen.add(reward.id);contractEarned+=reward.charges;keep(reward);}
  let spent=0;const reservations=new Set<string>();
  for(const job of Object.values(world.jobs)){
    if(!ownIds.has(job.playerId)||!validAt(job.createdAt,now)||reservations.has(job.id))continue;
    const boost=jobTestBoost(job);if(boost?.version!==2)continue;reservations.add(job.id);spent++;
  }
  const earned=Math.min(Number.MAX_SAFE_INTEGER,welcomeGranted+levelEarned+contractEarned);
  return{available:Math.max(0,earned-spent),earned,spent,welcomeGranted,levelEarned,contractEarned,highestAccountLevel,history};
}
