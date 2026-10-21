import type { SocialState } from './social.ts';
import type { HabitableState } from './habitable-data.ts';
import type { RoyalPlayerState,RoyalKingdomState } from './royal-kingdom.ts';
import type { RoyalHarborState } from './royal-harbor.ts';
import type {PlayerShopState,CityShopState} from './city-shop.ts';

export type ItemId = 'iron_ore'|'copper_ore'|'silica'|'timber'|'stone'|'fiber'|'water'|'grain'|'herbs'|'biomass'|'crystal_shard'|'data_fragment'|'iron_ingot'|'copper_wire'|'alloy'|'cloth'|'nutrient'|'seed'|'glass'|'plank'|'ration'|'bread'|'preserved_food'|'medkit'|'repair_kit'|'drill_module_i'|'drill_module_ii'|'pickaxe'|'scanner'|'cart'|'weather_cloak'|'camp_kit'|'guard_armor'|'spear'|'arrow_bundle'|'bridge_kit'|'memory_core'|'ancient_map'|'artifact_frame'|'season_relic';
export type Faction = 'cartographers'|'forgers'|'custodians';
export type Biome = 'forest'|'plains'|'desert'|'mountain'|'swamp';
export type Terrain = 'firm'|'rocky'|'sandy'|'muddy'|'slope'|'water';
export type Weather = 'clear'|'rain'|'heat'|'storm';
export type BuildingType = 'workshop'|'garden'|'kitchen'|'laboratory'|'barracks'|'warehouse'|'logistics';
export interface ItemAmount { itemId: ItemId; qty: number }
export interface InventoryLot {
  id: string; originLotId?:string; itemId: ItemId; qty: number; bound: boolean; quality: number;
  expiresAt: number|null; wear: number; location: string;
  provenance: { source: string; creatorId: string; seasonId: string; inputs: ItemAmount[] };
}
export interface Unit { id: string; type: 'scout'|'guard'|'ranged'|'engineer'; health: number; busy: boolean; trainedAt: number }
export interface SettlementPlot { id:string; index:number; x:number; y:number; width:number; depth:number; homeTileId:string }
export interface StarterProtection { startsAt:number; endsAt:number; active:boolean }
export interface Player {
  id: string; ownerId: string; name: string; stationName: string; faction: Faction; createdAt: number;
  position: string; discovered: string[]; surveyed: string[]; inventory: InventoryLot[];
  buildings: Record<BuildingType,number>; farmCycles: number; basicTool: true;
  units: Unit[]; pvpEnabled: boolean; pvpCooldownUntil: number;
  stats: { gathered: number; crafted: number; explored: number; trades: number; battles: number; farms: number };
  milestones: string[]; activityDays: string[]; visitedRegions: string[]; lotSequence: number;
  settlement?:SettlementPlot;
  habitable?:HabitableState;
  royal?:RoyalPlayerState;
  shop?:PlayerShopState;
}
export interface DepositLayer { id: string; budget: number; remaining: number; reserved: number; extracted: number; unlocked: boolean; promoterId?:string; promoterQuota?:number; promoterExpiresAt?:number }
export interface Deposit { itemId: ItemId; layers: DepositLayer[] }
export interface Tile {
  id: string; row: number; col: number; regionId: string; name: string; biome: Biome; terrain: Terrain;
  protected: boolean; dangerous: boolean; bridge: boolean; deposits: Deposit[];
}
export interface Region {
  id: string; name: string; farmBudget: number; farmRemaining: number;
  waterBudget: number; waterUnassigned: number; expeditionBudget: Partial<Record<ItemId,number>>;
  expeditionRemaining: Partial<Record<ItemId,number>>; lastRainWindow?:number;
}
export interface Recipe { id: ItemId; name: string; inputs: ItemAmount[]; output: ItemAmount[]; seconds: number; building: BuildingType; level: number }
export interface WeatherSnapshot { regionId: string; state: Weather; startsAt: number; endsAt: number; movementFactor: number; waterFactor: number }
export interface Job {
  id: string; playerId: string; kind: 'survey'|'travel'|'extract'|'craft'|'farm'|'expedition'|'battle'|'convoy'|'upgrade'|'land';
  status: 'reserved'|'running'|'completed'|'cancelled'; createdAt: number; startsAt: number; endsAt: number;
  ruleVersion: string; weather: WeatherSnapshot; route: string[]; costs: InventoryLot[];
  payload: Record<string,unknown>; report: string[];
}
export interface Battle {
  targetOutpostId?: string;
  id: string; attackerId: string; targetId: string|null; npc: boolean; convoyId: string|null;
  status: 'scheduled'|'resolved'; jobId: string; rounds: {round:number;attack:number;defense:number}[];
  winnerId: string|null; loot: ItemAmount[]; report: string[]; resolvedAt: number|null;
}
export interface Convoy { id: string; playerId: string; jobId: string; destination: string; cargo: InventoryLot[]; exposed: boolean; status: 'traveling'|'arrived'; attacked: boolean }
export interface MvpEvent { id: string; playerId: string; playerName: string; text: string; at: number }
export interface MvpWorld {
  cityShops?:Record<string,CityShopState>;
  /** Optional district extension. Legacy saves are unchanged until a confirmed trade. */
  royalHarbor?: RoyalHarborState;
  royalKingdom?:RoyalKingdomState;
  schemaVersion: 2; seasonId: string; createdAt: number; adminOwnerId:string; rngSeed:string; players: Record<string,Player>; tiles: Record<string,Tile>;
  regions: Record<string,Region>; jobs: Record<string,Job>; battles: Record<string,Battle>; convoys: Record<string,Convoy>;
  events: MvpEvent[]; receipts: Record<string,string>; social: SocialState;
  counters: {lot:number;job:number;event:number;unit:number}; rulesVersion: string;
}
export interface MvpCommand { type: string; playerId?: string; [key:string]: unknown }
export interface Context { ownerId: string; requestId: string; now: number; actor: Player|null; manager?:{planId:string;turnId:string;sequence:number;approvalId?:string;shopContractId?:string} }
export interface ItemDefinition { id: ItemId; name: string; group: 'raw'|'intermediate'|'product'|'rare'; description: string; expiresInHours?: number; durability?: number }

