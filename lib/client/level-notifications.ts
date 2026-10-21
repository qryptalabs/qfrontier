export interface LevelNotificationStorage {getItem(key:string):string|null;setItem(key:string,value:string):void}
export interface LevelNotificationOptions {storage?:LevelNotificationStorage|null;memory?:Map<string,string>}
export interface LevelNotificationRange {fromLevel:number;toLevel:number}
export interface LevelNotificationSnapshot {profileId:string|null;pending:Readonly<LevelNotificationRange>|null;highestLevel:number}
export interface LevelNotificationStore {
  readonly storageKey:string|null;
  subscribe(listener:()=>void):()=>void;
  getSnapshot():LevelNotificationSnapshot;
  getServerSnapshot():LevelNotificationSnapshot;
  observe(level:number,revision?:number):void;
  reload():void;
  acknowledge():void;
}
interface Marks {initialized:boolean;highestLevel:number;acknowledgedLevel:number}
interface StoredMarks extends Marks {version:1;profileId:string}
const prefix='qfrontier.level.v1:',MAX_RECORD_LENGTH=4096,MAX_MEMORY_PROFILES=8;
const browserMemory=new Map<string,string>();
const validProfile=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/.test(value);
const validLevel=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=1;
const emptyMarks=():Marks=>({initialized:false,highestLevel:1,acknowledgedLevel:1});
function parse(raw:string|null|undefined,profileId:string):Marks|null {
  if(!raw||raw.length>MAX_RECORD_LENGTH)return null;
  try {
    const value=JSON.parse(raw) as Partial<StoredMarks>;
    if(!value||value.version!==1||value.profileId!==profileId||typeof value.initialized!=='boolean'||!validLevel(value.highestLevel)||!validLevel(value.acknowledgedLevel)||value.acknowledgedLevel>value.highestLevel)return null;
    if(!value.initialized)return emptyMarks();
    return {initialized:true,highestLevel:value.highestLevel,acknowledgedLevel:value.acknowledgedLevel};
  }catch{return null;}
}
function merge(a:Marks,b:Marks|null):Marks {
  if(!b?.initialized)return a;
  if(!a.initialized)return b;
  return {initialized:true,highestLevel:Math.max(a.highestLevel,b.highestLevel),acknowledgedLevel:Math.max(a.acknowledgedLevel,b.acknowledgedLevel)};
}
function presentation(profileId:string|null,marks:Marks):LevelNotificationSnapshot {
  const pending=marks.initialized&&marks.highestLevel>marks.acknowledgedLevel?Object.freeze({fromLevel:marks.acknowledgedLevel,toLevel:marks.highestLevel}):null;
  return Object.freeze({profileId,pending,highestLevel:marks.highestLevel});
}
/** Presentation acknowledgment only: no XP, level grants or game state is stored here.
 * Construct during render and observe the server level from an effect. The first
 * observation is a silent baseline; later offline jumps form one range. A range
 * remains pending until acknowledged, including while another modal is open. */
export function createLevelNotificationStore(requestedProfileId:string|null|undefined,options:LevelNotificationOptions={}):LevelNotificationStore {
  const profileId=validProfile(requestedProfileId)?requestedProfileId:null,storageKey=profileId?`${prefix}${encodeURIComponent(profileId)}`:null;
  const memory=options.memory??(typeof window==='undefined'?new Map<string,string>():browserMemory),listeners=new Set<()=>void>();
  let marks=emptyMarks(),lastRevision=-Infinity,snapshot=presentation(profileId,marks);
  const serverSnapshot=snapshot;
  const storage=():LevelNotificationStorage|null=>{if(Object.hasOwn(options,'storage'))return options.storage??null;try{return typeof window==='undefined'?null:window.localStorage;}catch{return null;}};
  function read(){
    if(!profileId||!storageKey)return;
    marks=merge(marks,parse(memory.get(storageKey),profileId));
    try{marks=merge(marks,parse(storage()?.getItem(storageKey),profileId));}catch{/* Restricted storage keeps this profile's memory fallback. */}
  }
  function persist(){
    if(!profileId||!storageKey||!marks.initialized)return;
    const raw=JSON.stringify({version:1,profileId,...marks} satisfies StoredMarks);
    memory.delete(storageKey);memory.set(storageKey,raw);
    const keys=[...memory.keys()].filter(key=>key.startsWith(prefix));
    for(const key of keys.slice(0,Math.max(0,keys.length-MAX_MEMORY_PROFILES)))memory.delete(key);
    try{const target=storage();if(target&&target.getItem(storageKey)!==raw)target.setItem(storageKey,raw);}catch{/* Private browsing/quota errors do not block the game. */}
  }
  function publish(){
    const next=presentation(profileId,marks);
    if(next.highestLevel===snapshot.highestLevel&&next.pending?.fromLevel===snapshot.pending?.fromLevel&&next.pending?.toLevel===snapshot.pending?.toLevel)return;
    snapshot=next;for(const listener of [...listeners])listener();
  }
  return {storageKey,subscribe(listener){listeners.add(listener);return()=>{listeners.delete(listener);};},getSnapshot:()=>snapshot,getServerSnapshot:()=>serverSnapshot,
    observe(level,revision){
      if(!profileId||!validLevel(level)||revision!==undefined&&(!Number.isSafeInteger(revision)||revision<lastRevision))return;
      read();if(revision!==undefined)lastRevision=revision;
      marks=marks.initialized?{...marks,highestLevel:Math.max(marks.highestLevel,level)}:{initialized:true,highestLevel:level,acknowledgedLevel:level};
      persist();publish();
    },
    reload(){if(!profileId)return;read();publish();},
    acknowledge(){if(!profileId)return;read();if(!marks.initialized)return;marks={...marks,acknowledgedLevel:marks.highestLevel};persist();publish();},
  };
}
