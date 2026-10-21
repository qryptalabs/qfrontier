import type {ActivityCompletion} from '../mvp/activity-progression.ts';
import {GAME_NAVIGATION_ROUTES,normalizeGameNavigation,type GameNavigation,type GameTab,type NavigationAccess} from './navigation.ts';

export const ACTIVITY_NOTIFICATION_LIMIT=512;
const MAX_INPUT=200,MAX_RECORD_LENGTH=340_000,MAX_MEMORY_PROFILES=8;
const prefix='qfrontier.activity.v1:';
export interface ActivityNotificationStorage {getItem(key:string):string|null;setItem(key:string,value:string):void}
export interface ActivityNotificationOptions {storage?:ActivityNotificationStorage|null;memory?:Map<string,string>}
export interface ActivityNotificationSnapshot {
  profileId:string|null;
  unread:readonly ActivityCompletion[];
  unreadCount:number;
  byTab:Readonly<Partial<Record<GameTab,number>>>;
  pending:readonly ActivityCompletion[];
}
interface Marks {initialized:boolean;seen:string[];read:string[];announced:string[]}
interface StoredMarks extends Marks {version:1;profileId:string}
export interface ActivityNotificationStore {
  readonly storageKey:string|null;
  subscribe(listener:()=>void):()=>void;
  getSnapshot():ActivityNotificationSnapshot;
  getServerSnapshot():ActivityNotificationSnapshot;
  update(completions:readonly ActivityCompletion[],revision?:number):void;
  reload():void;
  markRead(ids:readonly string[]):void;
  markAllRead(tab?:GameTab):void;
  takeAlerts():readonly ActivityCompletion[];
}
const browserMemory=new Map<string,string>();
const validId=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/.test(value);
const emptyMarks=():Marks=>({initialized:false,seen:[],read:[],announced:[]});
function parseMarks(raw:string|null|undefined,profileId:string):Marks|null{
  if(!raw||raw.length>MAX_RECORD_LENGTH)return null;
  try{const value=JSON.parse(raw) as Partial<StoredMarks>;
    if(!value||value.version!==1||value.profileId!==profileId||typeof value.initialized!=='boolean')return null;
    const list=(data:unknown):string[]|null=>Array.isArray(data)&&data.length<=ACTIVITY_NOTIFICATION_LIMIT&&data.every(validId)?[...new Set(data)]:null;
    const seen=list(value.seen),read=list(value.read),announced=list(value.announced);
    return seen&&read&&announced?{initialized:value.initialized,seen,read,announced}:null;
  }catch{return null;}
}
function mergeMarks(a:Marks,b:Marks|null):Marks{return b?{initialized:a.initialized||b.initialized,seen:[...new Set([...a.seen,...b.seen])],read:[...new Set([...a.read,...b.read])],announced:[...new Set([...a.announced,...b.announced])]}:a;}
function bounded(ids:readonly string[],pins:ReadonlySet<string>):string[]{const unique=[...new Set(ids)],current=unique.filter(id=>pins.has(id)),past=unique.filter(id=>!pins.has(id));return[...past.slice(-Math.max(0,ACTIVITY_NOTIFICATION_LIMIT-current.length)),...current].slice(-ACTIVITY_NOTIFICATION_LIMIT);}
function boundedMarks(value:Marks,pins:ReadonlySet<string>):Marks{return{initialized:value.initialized,seen:bounded(value.seen,pins),read:bounded(value.read,pins),announced:bounded(value.announced,pins)};}
function inbox(profileId:string|null,items:readonly ActivityCompletion[],marks:Marks):ActivityNotificationSnapshot{
  const read=new Set(marks.read),announced=new Set(marks.announced),unread=items.filter(item=>!read.has(item.id)),pending=items.filter(item=>!read.has(item.id)&&!announced.has(item.id)),byTab:Partial<Record<GameTab,number>>={};
  for(const item of unread)byTab[item.target.tab]=(byTab[item.target.tab]??0)+1;
  return Object.freeze({profileId,unread:Object.freeze(unread),unreadCount:unread.length,byTab:Object.freeze(byTab),pending:Object.freeze(pending)});
}
/** Client presentation metadata only. Local marks never grant XP, products or authority.
 * Construct during render, update from an effect. No browser storage is read during SSR.
 * The bounded history pins the server's current 200-entry inbox, retaining 512 IDs per set. */
export function createActivityNotificationStore(requestedProfileId:string|null|undefined,options:ActivityNotificationOptions={}):ActivityNotificationStore{
  const profileId=validId(requestedProfileId)?requestedProfileId:null,storageKey=profileId?`${prefix}${encodeURIComponent(profileId)}`:null;
  const memory=options.memory??(typeof window==='undefined'?new Map<string,string>():browserMemory),listeners=new Set<()=>void>();
  let marks=emptyMarks(),items:readonly ActivityCompletion[]=[],lastRevision=-Infinity,signature='';
  let snapshot=inbox(profileId,items,marks);const serverSnapshot=snapshot;
  const storage=():ActivityNotificationStorage|null=>{if(Object.hasOwn(options,'storage'))return options.storage??null;try{return typeof window==='undefined'?null:window.localStorage;}catch{return null;}};
  const pins=()=>new Set(items.map(item=>item.id));
  function read(){if(!profileId||!storageKey)return;marks=mergeMarks(marks,parseMarks(memory.get(storageKey),profileId));try{marks=mergeMarks(marks,parseMarks(storage()?.getItem(storageKey),profileId));}catch{/* Restricted storage keeps this profile's in-memory marks. */}marks=boundedMarks(marks,pins());}
  function persist(){if(!profileId||!storageKey)return;marks=boundedMarks(marks,pins());const raw=JSON.stringify({version:1,profileId,...marks} satisfies StoredMarks);memory.delete(storageKey);memory.set(storageKey,raw);while(memory.size>MAX_MEMORY_PROFILES)memory.delete(memory.keys().next().value!);
    try{const target=storage();if(target&&target.getItem(storageKey)!==raw)target.setItem(storageKey,raw);}catch{/* Quota/private browsing never blocks reading the game or acknowledging an alert. */}
  }
  function publish(){const next=inbox(profileId,items,marks),key=JSON.stringify([next.unread,next.pending]);if(key===signature)return;signature=key;snapshot=next;for(const listener of [...listeners])listener();}
  const store:ActivityNotificationStore={storageKey,
    subscribe(listener){listeners.add(listener);return()=>{listeners.delete(listener);};},getSnapshot:()=>snapshot,getServerSnapshot:()=>serverSnapshot,
    update(completions,revision){
      if(!profileId)return;if(revision!==undefined&&(!Number.isSafeInteger(revision)||revision<lastRevision))return;
      if(completions.some(item=>item&&item.playerId!==profileId))return;
      read();
      if(revision!==undefined)lastRevision=revision;
      const unique=new Map<string,ActivityCompletion>();
      for(const item of completions){if(!item||item.playerId!==profileId||!validId(item.id)||!Number.isFinite(item.completedAt)||item.completedAt<0||!item.target||!Object.hasOwn(GAME_NAVIGATION_ROUTES,item.target.tab))continue;if(!unique.has(item.id))unique.set(item.id,item);}
      items=[...unique.values()].sort((a,b)=>b.completedAt-a.completedAt||a.id.localeCompare(b.id)).slice(0,MAX_INPUT);
      const seen=new Set(marks.seen),announced=new Set(marks.announced);for(const item of items){seen.add(item.id);if(!marks.initialized)announced.add(item.id);}
      marks={...marks,initialized:true,seen:[...seen],announced:[...announced]};persist();publish();
    },
    reload(){if(!profileId)return;read();publish();},
    markRead(ids){if(!profileId)return;read();const current=pins(),readIds=new Set(marks.read),announced=new Set(marks.announced);for(const id of ids)if(current.has(id)){readIds.add(id);announced.add(id);}marks={...marks,read:[...readIds],announced:[...announced]};persist();publish();},
    markAllRead(tab){store.markRead(items.filter(item=>!tab||item.target.tab===tab).map(item=>item.id));},
    takeAlerts(){if(!profileId)return[];read();const pending=inbox(profileId,items,marks).pending;if(!pending.length){publish();return pending;}marks={...marks,announced:[...new Set([...marks.announced,...pending.map(item=>item.id)])]};persist();publish();return pending;},
  };
  return store;
}
/** A completion can inspect only an owned profile. All destinations pass the app's canonical route validation. */
export function activityNotificationNavigation(completion:ActivityCompletion,profileId:string|null|undefined,access:NavigationAccess):GameNavigation|null{
  if(!profileId||completion.playerId!==profileId||!access.profiles.some(profile=>profile.id===profileId)||!completion.target||typeof completion.target!=='object')return null;
  return normalizeGameNavigation({...completion.target,profileId},{...access,selectedProfileId:profileId});
}
