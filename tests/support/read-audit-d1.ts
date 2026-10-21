import type {PartitionD1Database,PartitionD1Result,PartitionD1Statement} from '../../lib/mvp/partitioned-store.ts';

export interface AuditedRead {
  sql:string;
  bindingCount:number;
  returnedRows:number;
  returnedCellBytes:number;
  partitionKeys:{collection:string;entityId:string}[];
  sentinelMatches:string[];
  failed:boolean;
}
const cellBytes=(value:unknown):number=>typeof value==='string'?Buffer.byteLength(value,'utf8'):value instanceof Uint8Array?value.byteLength:value instanceof ArrayBuffer?value.byteLength:value===null||value===undefined?0:typeof value==='number'||typeof value==='bigint'?8:Buffer.byteLength(JSON.stringify(value),'utf8');

/** Executes the real binding. Records returned data, not proposed SQL filters.
 * No response body or binding value is copied into the externally reportable audit.
 * All statements must originate from this wrapper, so a raw statement cannot hide
 * a whole-world read from its observation. */
export function auditReadD1(binding:PartitionD1Database,sentinels:readonly string[]=[]){
  const traces:AuditedRead[]=[];
  const statements=new WeakMap<PartitionD1Statement,{raw:PartitionD1Statement;sql:string;bindingCount:number}>();
  const record=(sql:string,bindingCount:number,rows:unknown[],failed=false)=>{
    const keys:{collection:string;entityId:string}[]=[],matches=new Set<string>();let bytes=0;
    for(const value of rows){
      const row=value&&typeof value==='object'?value as Record<string,unknown>:{value};
      for(const cell of Object.values(row)){bytes+=cellBytes(cell);if(typeof cell==='string')for(const marker of sentinels)if(cell.includes(marker))matches.add(marker);}
      // Membership/index rows may expose public keys without returning the
      // corresponding private record. Count payload keys only with a body.
      if(typeof row.body==='string'&&typeof row.collection==='string'&&typeof row.entity_id==='string')keys.push({collection:row.collection,entityId:row.entity_id});
    }
    traces.push({sql,bindingCount,returnedRows:rows.length,returnedCellBytes:bytes,partitionKeys:keys,sentinelMatches:[...matches],failed});
  };
  const wrap=(raw:PartitionD1Statement,sql:string,bindingCount:number):PartitionD1Statement=>{
    const statement:PartitionD1Statement={
      bind(...values:unknown[]){return wrap(raw.bind(...values),sql,values.length);},
      async first<T>(){try{const value=await raw.first<T>();record(sql,bindingCount,value===null?[]:[value]);return value;}catch(error){record(sql,bindingCount,[],true);throw error;}},
      async all<T>(){try{const value=await raw.all<T>();record(sql,bindingCount,value.results??[]);return value;}catch(error){record(sql,bindingCount,[],true);throw error;}},
      async run<T>(){try{const value=await raw.run<T>();record(sql,bindingCount,value.results??[]);return value;}catch(error){record(sql,bindingCount,[],true);throw error;}},
    };
    statements.set(statement,{raw,sql,bindingCount});return statement;
  };
  const database:PartitionD1Database={
    prepare(sql){return wrap(binding.prepare(sql),sql,0);},
    async batch<T>(items:PartitionD1Statement[]):Promise<PartitionD1Result<T>[]>{
      const mapped=items.map(item=>{const found=statements.get(item);if(!found)throw new Error('An unaudited statement cannot enter the read audit.');return found;});
      try{const results=await binding.batch<T>(mapped.map(item=>item.raw));for(let index=0;index<mapped.length;index++)record(mapped[index].sql,mapped[index].bindingCount,results[index]?.results??[]);return results;}
      catch(error){for(const item of mapped)record(item.sql,item.bindingCount,[],true);throw error;}
    },
  };
  return{database,traces,reset(){traces.length=0;},summary(){return{statements:traces.length,failed:traces.filter(trace=>trace.failed).length,returnedRows:traces.reduce((sum,trace)=>sum+trace.returnedRows,0),returnedCellBytes:traces.reduce((sum,trace)=>sum+trace.returnedCellBytes,0),partitionKeys:traces.flatMap(trace=>trace.partitionKeys),sentinelMatches:[...new Set(traces.flatMap(trace=>trace.sentinelMatches))]};}};
}
