import {DatabaseSync} from 'node:sqlite';
import type {SQLInputValue,SQLOutputValue} from 'node:sqlite';

export interface SqliteQueryTrace {sql:string;bindings:readonly unknown[];batch:number|null;index:number;changes:number;rolledBack:boolean}
export interface SqliteCall {method:'first'|'all'|'run'|'batch';sql:readonly string[];returnedRows?:number;returnedCellBytes?:number}
export interface SqliteFault {phase:'before-statement'|'after-statement'|'after-commit';match?:RegExp;statementIndex?:number;error?:Error}
export interface SqliteD1Options {path?:string;enforceD1Limits?:boolean;rowLimitBytes?:number;ioLatencyMs?:number;retainTrace?:boolean}
type Row=Record<string,SQLOutputValue>;
interface Result<T> {success:true;results:T[];meta:{changes:number;duration:number;last_row_id:number;changed_db:boolean;rows_read:number;rows_written:number;size_after:number}}

const bytes=(value:unknown)=>typeof value==='string'?Buffer.byteLength(value,'utf8'):value instanceof Uint8Array?value.byteLength:value instanceof ArrayBuffer?value.byteLength:8;
function bindValue(value:unknown):SQLInputValue {
  if(value===null||typeof value==='string'||typeof value==='number'||typeof value==='bigint'||value instanceof Uint8Array)return value;
  if(value instanceof ArrayBuffer)return new Uint8Array(value);
  throw new Error('D1_TYPE_ERROR: unsupported binding type');
}

/** Local SQL execution, not a mock of the application's CAS or codec logic.
 * batch is one real SQLite transaction, matching D1's documented rollback rule.
 */
export class SqliteD1 {
  readonly sqlite:DatabaseSync;
  readonly calls:SqliteCall[]=[];
  readonly queries:SqliteQueryTrace[]=[];
  afterCall?: (call:SqliteCall)=>void|Promise<void>;
  private readonly enforceLimits:boolean;
  private readonly rowLimit:number;
  private readonly latency:number;
  private readonly retainTrace:boolean;
  private callCount=0;
  private statementCount=0;
  private writtenRows=0;
  private boundBytes=0;
  private readonly faults:SqliteFault[]=[];
  private batchSequence=0;
  private commits=0;
  private rollbacks=0;
  private readBytes=0;
  private sqlMilliseconds=0;
  private closed=false;
  constructor(options:SqliteD1Options={}){this.sqlite=new DatabaseSync(options.path??':memory:');this.enforceLimits=options.enforceD1Limits!==false;this.rowLimit=options.rowLimitBytes??2000000;this.latency=options.ioLatencyMs??0;this.retainTrace=options.retainTrace!==false;this.sqlite.exec('PRAGMA foreign_keys = ON;');}
  get metrics(){return{calls:this.callCount,statements:this.statementCount,batches:this.batchSequence,commits:this.commits,rollbacks:this.rollbacks,rowsWritten:this.writtenRows,bytesBound:this.boundBytes,bytesRead:this.readBytes,sqlMilliseconds:this.sqlMilliseconds};}
  prepare(sql:string){if(this.enforceLimits&&Buffer.byteLength(sql,'utf8')>100000)throw new Error('D1_ERROR: SQL statement exceeds 100000 bytes');return new SqliteD1Statement(this,sql,[]);}
  failNext(fault:SqliteFault){this.faults.push(fault);}
  clearTrace(){this.calls.length=0;this.queries.length=0;this.callCount=0;this.statementCount=0;this.writtenRows=0;this.boundBytes=0;}
  private fail(phase:SqliteFault['phase'],sql:string,index:number){const found=this.faults.findIndex(f=>f.phase===phase&&(f.statementIndex===undefined||f.statementIndex===index)&&(!f.match||f.match.test(sql)));if(found<0)return;const[fault]=this.faults.splice(found,1);throw fault.error??new Error('D1_ERROR: injected test failure');}
  private execute(statement:SqliteD1Statement,batch:number|null,index:number):Result<Row>{
    if(statement.database!==this)throw new Error('Prepared statement belongs to another database');
    if(this.enforceLimits&&(statement.values.length>100||statement.values.some(v=>bytes(v)>this.rowLimit)))throw new Error('D1_ERROR: binding exceeds D1 limits');
    const trace:SqliteQueryTrace={sql:statement.sql,bindings:statement.values,batch,index,changes:0,rolledBack:false};if(this.retainTrace)this.queries.push(trace);this.statementCount++;this.boundBytes+=statement.values.reduce<number>((sum,value)=>sum+bytes(value),0);this.fail('before-statement',statement.sql,index);
    const started=performance.now(),prepared=this.sqlite.prepare(statement.sql),values=statement.values.map(bindValue),readOnly=/^\s*(?:SELECT|PRAGMA|EXPLAIN)\b/i.test(statement.sql),rows=prepared.all(...values);this.sqlMilliseconds+=performance.now()-started;
    for(const row of rows){const size=Object.values(row).reduce<number>((n,value)=>n+bytes(value),0);if(this.enforceLimits&&size>this.rowLimit)throw new Error('D1_ERROR: row exceeds D1 limits');this.readBytes+=size;}
    const meta=this.sqlite.prepare('SELECT changes() AS changes, last_insert_rowid() AS row_id').get()!;
    const changes=readOnly?0:Number(meta.changes);trace.changes=changes;this.writtenRows+=changes;this.fail('after-statement',statement.sql,index);
    return{success:true,results:rows,meta:{changes,duration:0,last_row_id:Number(meta.row_id),changed_db:changes>0,rows_read:rows.length,rows_written:changes,size_after:0}};
  }
  async single<T>(statement:SqliteD1Statement,method:'first'|'all'|'run'):Promise<Result<T>>{
    if(this.latency>0)await new Promise(resolve=>setTimeout(resolve,this.latency));
    const call:SqliteCall={method,sql:[statement.sql]};this.callCount++;if(this.retainTrace)this.calls.push(call);const bytesBefore=this.readBytes,result=this.execute(statement,null,0);this.fail('after-commit',statement.sql,0);call.returnedRows=result.results.length;call.returnedCellBytes=this.readBytes-bytesBefore;await this.afterCall?.(call);return result as Result<T>;
  }
  async batch<T=unknown>(statements:SqliteD1Statement[]):Promise<Result<T>[]> {
    if(this.latency>0)await new Promise(resolve=>setTimeout(resolve,this.latency));
    const call:SqliteCall={method:'batch',sql:statements.map(s=>s.sql)},batch=++this.batchSequence,writtenBefore=this.writtenRows,readBytesBefore=this.readBytes;this.callCount++;if(this.retainTrace)this.calls.push(call);this.sqlite.exec('BEGIN IMMEDIATE');
    let results:Result<Row>[];
    try{results=statements.map((statement,index)=>this.execute(statement,batch,index));this.sqlite.exec('COMMIT');this.commits++;}
    catch(error){this.sqlite.exec('ROLLBACK');this.rollbacks++;this.writtenRows=writtenBefore;for(const query of this.queries)if(query.batch===batch)query.rolledBack=true;throw error;}
    this.fail('after-commit',call.sql.join('\n'),-1);call.returnedRows=results.reduce((sum,result)=>sum+result.results.length,0);call.returnedCellBytes=this.readBytes-readBytesBefore;await this.afterCall?.(call);return results as Result<T>[];
  }
  async exec(sql:string){this.sqlite.exec(sql);return{count:1,duration:0};}
  close(){if(this.closed)return;this.closed=true;this.sqlite.close();}
}

export class SqliteD1Statement {
  readonly database:SqliteD1;
  readonly sql:string;
  readonly values:readonly unknown[];
  constructor(database:SqliteD1,sql:string,values:readonly unknown[]){this.database=database;this.sql=sql;this.values=values;}
  bind(...values:unknown[]){return new SqliteD1Statement(this.database,this.sql,values);}
  async first<T=Row>(column?:string):Promise<T|null>{const result=await this.database.single<Row>(this,'first'),row=result.results[0];return(row?(column===undefined?row:row[column]):null)as T|null;}
  all<T=Row>():Promise<Result<T>>{return this.database.single<T>(this,'all');}
  run<T=Row>():Promise<Result<T>>{return this.database.single<T>(this,'run');}
}

export function createSqliteD1(options:SqliteD1Options={}){return new SqliteD1(options);}
