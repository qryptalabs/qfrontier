import type { Battle, BuildingType, Convoy, Faction, Job, MvpEvent, Player, Region, SettlementPlot, StarterProtection, Tile, WeatherSnapshot } from './types.ts';
import type { SocialView } from './social.ts';
import type { HabitableView } from './habitable.ts';
import type { StationUpgradeVisual } from './station-upgrades.ts';
import type { PlayerProgressView, PlayerReportView } from './player-progress.ts';
import type { FirstTradeView } from './first-trade.ts';
import type { ActivityProgressionView } from './activity-progression.ts';
import type { LevelUnlockView } from './level-unlocks.ts';
import type { TestBoostView, TestBoostQuote } from './test-boosts.ts';
import type { BoostPassRewardQuote } from './boost-passes.ts';
import type { LandView } from './land-grid.ts';
import type { ManagerForecast } from './habitable-manager-forecast.ts';

export type PublicPlayer = Omit<Player, 'ownerId'> & {starterProtection:StarterProtection};
export interface PublicSettlement { id:string;playerId:string;name:string;ownerName:string;faction:Faction;clanName:string|null;plot:SettlementPlot;buildings:Record<BuildingType,number>;own:boolean;protectionUntil:number;construction?:StationUpgradeVisual[] }
export interface AdminView {
  players: number;
  pendingJobs: number;
  completedJobs: number;
  receipts: number;
  deposits: { itemId: string; budget: number; remaining: number; reserved: number; extracted: number }[];
  farm: { budget: number; remaining: number };
  rulesVersion: string;
}
export interface MvpView {
  publicWorks?:{granaryDelivered:number};
  revision: number;
  now: number;
  player: PublicPlayer | null;
  players: PublicPlayer[];
  people: { id: string; name: string; stationName: string; faction: Player['faction'] }[];
  settlements:PublicSettlement[];
  tiles: Tile[];
  regions: Region[];
  jobs: Job[];
  battles: Battle[];
  convoys: Convoy[];
  events: MvpEvent[];
  weather: WeatherSnapshot[];
  forecast: WeatherSnapshot[];
  social: SocialView;
  habitable:HabitableView;
  progress:PlayerProgressView|null;
  reports:PlayerReportView[];
  firstTrade:FirstTradeView;
  activity:ActivityProgressionView|null;
  unlocks:LevelUnlockView|null;
  boosts:TestBoostView;
  land:LandView|null;
  admin: AdminView | null;
  seasonId: string;
  rulesVersion: string;
}
export interface ActionQuote {
  managerForecast?:ManagerForecast;
  boost:TestBoostQuote|null;
  boostReward:BoostPassRewardQuote|null;
  revision: number;
  requestId: string;
  command: import('./types.ts').MvpCommand;
  changes: { itemId: string; delta: number }[];
  expectedOutputs: { itemId: string; qty: number }[];
  durationSeconds: number;
  summary: string;
  creditDelta: number;
  boundCreditDelta: number;
  simDelta: number;
  warnings: string[];
  expiresAt: number;
  token: string;
}

