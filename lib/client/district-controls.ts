export interface DistrictJoystickInput {forward:number;strafe:number;x:number;y:number}
export interface DistrictManualNavigationIntent {sessionId:string;sequence:number;directionX:number;directionY:number;stop:boolean}
export interface DistrictManualNavigationCommand extends DistrictManualNavigationIntent {type:'habitat.walk.input';playerId:string;[key:string]:unknown}
export const DISTRICT_MANUAL_RENEW_MS=250;

export interface DistrictManualQuote {revision:number;token:string;expiresAt:number;changes:{delta:number}[];creditDelta:number;boundCreditDelta:number;simDelta:number;expectedOutputs:unknown[]}
export interface DistrictManualCommit {requestId:string;command:DistrictManualNavigationCommand;expectedRevision:number;quoteToken:string;quoteExpiresAt:number}

/** The signed movement channel never owns a dialog, UI busy state or a persistent economic order. */
export async function sendDistrictManualCommand<View>(command:DistrictManualNavigationCommand,options:{
 requestId:string;
 quote(body:{requestId:string;command:DistrictManualNavigationCommand}):Promise<DistrictManualQuote>;
 commit(body:DistrictManualCommit):Promise<{ok:true;view:View}|{ok:false;status:number}>;
 update(view:View):void;
}):Promise<void>{
 for(let attempt=0;attempt<2;attempt++){
  const quote=await options.quote({requestId:options.requestId,command});
  if(quote.changes.some(change=>change.delta!==0)||quote.creditDelta||quote.boundCreditDelta||quote.simDelta||quote.expectedOutputs.length)throw new Error('Esta acción necesita revisar sus recursos antes de confirmarla.');
  const result=await options.commit({requestId:options.requestId,command,expectedRevision:quote.revision,quoteToken:quote.token,quoteExpiresAt:quote.expiresAt});
  if(result.ok){options.update(result.view);return;}
  if(result.status!==409||attempt===1)throw new Error('No se pudo guardar el movimiento. Volvé a intentarlo.');
 }
}

/** No timer or local position: the active renderer supplies time and the server supplies motion. */
export function createDistrictManualNavigation(emit:(intent:DistrictManualNavigationIntent)=>void,sessionId:string){let sequence=0,lastSent=-Infinity,active=false;
 return{
  sample(direction:{x:number;y:number},clock:number,blocked=false){const length=Math.hypot(direction.x,direction.y);if(!Number.isFinite(length)||length<.05){this.stop();return;}if(blocked||clock-lastSent<DISTRICT_MANUAL_RENEW_MS)return;lastSent=clock;active=true;const divisor=Math.max(1,length);emit({sessionId,sequence:++sequence,directionX:direction.x/divisor,directionY:direction.y/divisor,stop:false});},
  stop(){if(!active)return;active=false;lastSent=-Infinity;emit({sessionId,sequence:++sequence,directionX:0,directionY:0,stop:true});},
  get active(){return active;},
 };
}

/** One request in flight. Release is delivered before any newer held intention. */
export function createDistrictManualQueue(send:(command:DistrictManualNavigationCommand)=>Promise<boolean>){let running=false,pending:DistrictManualNavigationCommand|null=null,stopping:DistrictManualNavigationCommand|null=null;const sequences=new Map<string,number>();
 const restore=(command:DistrictManualNavigationCommand)=>{if(command.stop){if(!stopping||stopping.sequence<command.sequence)stopping=command;}else if(!pending||pending.sequence<command.sequence)pending=command;};
 const flush=async()=>{if(running)return;running=true;try{while(stopping||pending){const next=stopping??pending!;if(stopping)stopping=null;else pending=null;let sent=false;try{sent=await send(next);}catch{/* The finite server lease still expires if transport fails. */}if(!sent){restore(next);break;}}}finally{running=false;}};
 return{
  enqueue(command:DistrictManualNavigationCommand){const key=`${command.playerId}:${command.sessionId}`,last=sequences.get(key)??0;if(command.sequence<=last)return;sequences.set(key,command.sequence);if(sequences.size>16)sequences.delete(sequences.keys().next().value!);if(command.stop){stopping=command;if(pending?.sessionId===command.sessionId&&pending.sequence<command.sequence)pending=null;}else pending=command;void flush();},
  flush(){return flush();},
  clear(){pending=null;stopping=null;sequences.clear();},
  get pendingCount(){return Number(!!pending)+Number(!!stopping);},
  get inFlight(){return running;},
 };
}

/** The visual thumb stays inside the pad; its dead zone prevents accidental walking. */
export function districtJoystickInput(dx:number,dy:number,radius=42,deadZone=.14):DistrictJoystickInput{
  if(!Number.isFinite(dx)||!Number.isFinite(dy)||!Number.isFinite(radius)||radius<=0)return {forward:0,strafe:0,x:0,y:0};
  const magnitude=Math.hypot(dx,dy),clamped=Math.min(1,magnitude/radius),x=magnitude?dx/magnitude*clamped:0,y=magnitude?dy/magnitude*clamped:0;
  const threshold=Number.isFinite(deadZone)?Math.min(.95,Math.max(0,deadZone)):.14,strength=clamped<=threshold?0:(clamped-threshold)/(1-threshold);
  return {forward:magnitude?-dy/magnitude*strength:0,strafe:magnitude?dx/magnitude*strength:0,x,y};
}
