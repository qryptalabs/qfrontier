import type {InventoryLot,Player} from './types.ts';
import {royalLocalToWorld} from '../graphics/royal-world-location.ts';
import {explorationPositionAt} from './exploration-data.ts';
import type {RoyalPose} from '../graphics/royal-navigation.ts';
import type {HabitableState} from './habitable-data.ts';
export const ROYAL_SUPPLY=Object.freeze({quantity:2,credits:12,xp:25,workMs:45_000});
export function royalCharacterPresent(p:Player,now:number){const pose=p.royal?.pose,e=p.habitable?.exploration;if(!pose||!e||pose.savedAt>now||e.movement&&e.movement.endsAt>now)return false;const a=explorationPositionAt(e,now),b=royalLocalToWorld(pose.x,pose.z);return Math.hypot(a.x-b.x,a.y-b.y)<1;}
export interface RoyalSupplyContract{id:string;seasonId:string;acceptedAt:number;escrow:number;cargo:InventoryLot[];deliveredLotIds?:string[];deliveredAt?:number;cancelledAt?:number}
export interface RoyalPlayerState{schema:1;version:number;pose?:RoyalPose&{yaw:number;camera:'first'|'third';savedAt:number};sequence:number;movementBudget?:{at:number;remaining:number};lastMoves?:{id:string;hash:string}[];contracts:RoyalSupplyContract[];journey?:{direction:'inbound'|'outbound';startsAt:number;endsAt:number}}
export interface RoyalKingdomState{schema:1;claims:Record<string,string>;deliveries:{id:string;playerId:string;at:number;lots:InventoryLot[]}[]}
export interface RoyalKingdomSnapshot{
 granaryDelivered?:number;revision:number;now:number;version:number;playerId:string;present:boolean;home:boolean;traveling:boolean;canReturn:boolean;remainingSeconds:number;direction:'inbound'|'outbound'|null;
 pose:(RoyalPose&{yaw:number;camera:'first'|'third';savedAt:number})|null;sequence:number;hasCharacter:boolean;credits:number;transferablePlanks:number;nearReception:boolean;
 contract:{id:string;status:'accepted'|'loaded'|'delivered'|'cancelled';quantity:number;cargo:number;credits:number;xp:number;deliveredAt:number|null}|null;
 accountClaimed:boolean;budgetAvailable:boolean;work:{id:string;at:number;phase:'unloading'|'building'|'completed';progress:number}|null;
 appearance:Pick<HabitableState,'appearance'|'profession'|'skin'|'hair'>|null;
 transport?:{kind:'cart'|'carriage'|'wagon';animalKind:'horse'|'mule';speed:number;capacity:number}|null;
}
