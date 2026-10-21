/** Public availability errors contain no provider messages, SQL, identities or state. */
export class MvpStorageUnavailableError extends Error {
  readonly status=503;
  readonly code='MVP_STORAGE_UNAVAILABLE';
  readonly retryable=true;
  readonly retryAfterSeconds=5;
  constructor(){super('El guardado no está disponible temporalmente. No podemos confirmar nuevas órdenes; vuelve a intentarlo en unos segundos.');this.name='MvpStorageUnavailableError';}
}
export function isMvpStorageUnavailableError(error:unknown):error is MvpStorageUnavailableError{return error instanceof MvpStorageUnavailableError;}

function messages(error:unknown):string {
  const seen=new Set<object>(),parts:string[]=[];let current:unknown=error;
  for(let depth=0;depth<5&&current!==null&&current!==undefined;depth++){
    if(typeof current==='string'){parts.push(current);break;}
    if(typeof current!=='object'||seen.has(current))break;seen.add(current);
    const record=current as {message?:unknown;code?:unknown;cause?:unknown};if(typeof record.message==='string')parts.push(record.message);if(typeof record.code==='string'||typeof record.code==='number')parts.push(`code:${record.code}`);current=record.cause;
  }
  return parts.join(' ').toLowerCase();
}
/** Match documented D1 transport/reset failures, not every D1/SQL exception.
 * https://developers.cloudflare.com/d1/observability/debug-d1/
 */
export function isTransientD1Error(error:unknown):boolean {
  if(isMvpStorageUnavailableError(error))return true;
  const message=messages(error);
  if(/syntax error|no such (?:table|column)|d1_type_error|d1_column_notfound|sqlite_(?:error|constraint|mismatch|toobig)|constraint failed|datatype mismatch|unsupported (?:type|value)|too many sql variables|no sql statements|free tier|daily row (?:read|write) limit|maximum (?:account )?(?:storage|database|db) (?:size|limit)|memory limit|cpu time limit|database disk image is malformed/.test(message))return false;
  if(/network connection lost|replica disconnected from primary|storage caused object to be reset|reset because its code was updated|cannot resolve d1 db due to transient issue|d1 db is overloaded|\b(?:econnreset|eai_again|etimedout)\b/.test(message))return true;
  return /\bd1(?:_error| db)?\b/.test(message)&&/\binternal error\b/.test(message)||/\bcode:\s*7500\b/.test(message)&&/\binternal\b/.test(message);
}

export const D1_READ_RETRY_DELAYS_MS=Object.freeze([100,300]);
export interface D1ReadRetryOptions {sleep?:(milliseconds:number)=>Promise<void>;random?:()=>number}
/** SELECT only. D1 also has its own bounded read retry; no mutation belongs here.
 * https://developers.cloudflare.com/d1/best-practices/retry-queries/
 */
export async function readD1WithRetry<T>(operation:()=>Promise<T>,options:D1ReadRetryOptions={}):Promise<T>{
  const sleep=options.sleep??(milliseconds=>new Promise<void>(resolve=>setTimeout(resolve,milliseconds))),random=options.random??Math.random;
  for(let attempt=0;;attempt++){
    try{return await operation();}catch(error){
      if(!isTransientD1Error(error))throw error;
      if(attempt>=D1_READ_RETRY_DELAYS_MS.length){console.warn('QFrontier storage unavailable',{operation:'read',attempts:attempt+1});throw new MvpStorageUnavailableError();}
      console.warn('QFrontier storage read retry',{attempt:attempt+1,maxAttempts:D1_READ_RETRY_DELAYS_MS.length+1});
      await sleep(D1_READ_RETRY_DELAYS_MS[attempt]+Math.floor(Math.max(0,Math.min(1,random()))*25));
    }
  }
}
/** A failed write may already have committed. Surface it without replaying it. */
export async function writeD1Once<T>(operation:'insert'|'compareAndSwap',write:()=>Promise<T>):Promise<T>{
  try{return await write();}catch(error){if(!isTransientD1Error(error))throw error;console.warn('QFrontier storage unavailable',{operation,attempts:1});throw new MvpStorageUnavailableError();}
}
