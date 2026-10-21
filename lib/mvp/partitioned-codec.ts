import type { MvpWorld } from './types.ts';

/** Versioned, lossless staging format; it does not change game rules. */
export interface WorldRecord {
  collection: string;
  entityId: string;
  ordinal: number;
  body: string;
}
interface Collection {name: string; path: string[]; kind: 'map'|'array'}
interface RootRecord {format: 1; world: MvpWorld; collections: Collection[]}
const ROOT_COLLECTION = '$root';
export const worldRecordKey = (collection:string,entityId:string):string => JSON.stringify([collection,entityId]);
const object = (value:unknown):value is Record<string,unknown> => !!value && typeof value==='object' && !Array.isArray(value);
const invalid = ():never => {throw new Error('El guardado dividido tiene un formato inválido o incompleto.');};
function own(target:Record<string,unknown>,key:string,value:unknown):void {
  Object.defineProperty(target,key,{value,writable:true,configurable:true,enumerable:true});
}

/** Stable entity boundaries keep a change to one player from rewriting all players.
 * Array ordinals preserve ordering, including ledgers, offers and the chronicle.
 * Oversized individual entities are split into UTF-8 parts by the store.
 */
export function serializeWorldRecords(world:MvpWorld):WorldRecord[] {
  if(!object(world)||world.schemaVersion!==2||!object(world.social))invalid();
  const skeleton={...world,social:{...world.social}} as MvpWorld;
  const root:RootRecord={format:1,world:skeleton,collections:[]};
  const records:WorldRecord[]=[];
  const addCollection=(path:string[],value:unknown):void=>{
    const kind=Array.isArray(value)?'array':'map';
    if(kind==='map'&&!object(value))invalid();
    const name=path.join('/');
    root.collections.push({name,path,kind});
    const parent=path.length===1?skeleton:skeleton.social;
    own(parent as unknown as Record<string,unknown>,path.at(-1)!,kind==='array'?[]:{});
    const entries=kind==='array'?(value as unknown[]).map((entry,index)=>[String(index),entry] as const):Object.entries(value as Record<string,unknown>);
    const used=new Set<string>();
    for(let ordinal=0;ordinal<entries.length;ordinal++){
      const [key,entry]=entries[ordinal];
      const identity=kind==='array'&&object(entry)&&typeof entry.id==='string'?`id:${entry.id}`:kind==='array'?`index:${key}`:key;
      if(used.has(identity)||identity.length>1024)invalid();
      used.add(identity);
      const body=JSON.stringify(entry);
      if(typeof body!=='string')invalid();
      records.push({collection:name,entityId:identity,ordinal,body});
    }
  };
  for(const field of ['players','tiles','regions','jobs','battles','convoys','events','receipts'] as const)addCollection([field],world[field]);
  for(const [field,value] of Object.entries(world.social)){
    if(Array.isArray(value)||['accounts','mentors','activity'].includes(field))addCollection(['social',field],value);
  }
  return [{collection:ROOT_COLLECTION,entityId:'world',ordinal:0,body:JSON.stringify(root)},...records];
}

export function decodeWorldRecords(records:WorldRecord[]):MvpWorld {
  const roots=records.filter(record=>record.collection===ROOT_COLLECTION);
  if(roots.length!==1||roots[0].entityId!=='world'||roots[0].ordinal!==0)invalid();
  const root=JSON.parse(roots[0].body) as RootRecord;
  if(!object(root)||root.format!==1||!object(root.world)||root.world.schemaVersion!==2||!object(root.world.social)||!Array.isArray(root.collections))invalid();
  const names=new Set<string>(),consumed=new Set<WorldRecord>(roots);
  for(const descriptor of root.collections){
    if(!object(descriptor)||typeof descriptor.name!=='string'||!Array.isArray(descriptor.path)||!descriptor.path.every(p=>typeof p==='string')||!['map','array'].includes(descriptor.kind))invalid();
    const path=descriptor.path;
    if(!(path.length===1&&['players','tiles','regions','jobs','battles','convoys','events','receipts'].includes(path[0])||path.length===2&&path[0]==='social')||descriptor.name!==path.join('/')||names.has(descriptor.name))invalid();
    names.add(descriptor.name);
    const parent=(path.length===1?root.world:root.world.social) as unknown as Record<string,unknown>;
    const empty=parent[path.at(-1)!];
    if(descriptor.kind==='array'?!Array.isArray(empty)||empty.length!==0:!object(empty)||Object.keys(empty).length!==0)invalid();
    const children=records.filter(record=>record.collection===descriptor.name).sort((a,b)=>a.ordinal-b.ordinal);
    const keys=new Set<string>();
    const container:unknown[]|Record<string,unknown>=descriptor.kind==='array'?[]:{};
    for(let index=0;index<children.length;index++){
      const child=children[index];
      if(child.ordinal!==index||keys.has(child.entityId))invalid();
      keys.add(child.entityId);consumed.add(child);
      const entry:unknown=JSON.parse(child.body);
      if(Array.isArray(container))container.push(entry);else own(container,child.entityId,entry);
    }
    own(parent,path.at(-1)!,container);
  }
  if(consumed.size!==records.length||!['players','tiles','regions','jobs','battles','convoys','events','receipts'].every(field=>names.has(field)))invalid();
  return root.world;
}

/** Split by encoded bytes, never through a multi-byte Unicode character. */
export function splitUtf8(body:string,limit:number):string[] {
  const bytes=new TextEncoder().encode(body),decoder=new TextDecoder('utf-8',{fatal:true});
  const parts:string[]=[];
  for(let start=0;start<bytes.length;){
    let end=Math.min(start+limit,bytes.length);
    while(end<bytes.length&&(bytes[end]&0xc0)===0x80)end--;
    if(end===start)throw new Error('El tamaño de fragmento no permite representar UTF-8.');
    parts.push(decoder.decode(bytes.subarray(start,end)));start=end;
  }
  return parts.length?parts:[''];
}

export async function hashRecord(body:string):Promise<string> {
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body));
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
