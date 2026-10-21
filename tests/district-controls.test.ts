import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {districtJoystickInput,createDistrictManualNavigation,createDistrictManualQueue,sendDistrictManualCommand,type DistrictManualNavigationCommand,type DistrictManualNavigationIntent} from '../lib/client/district-controls.ts';

test('the joystick stops at rest and within its dead zone',()=>{
  assert.deepEqual(districtJoystickInput(0,0),{forward:0,strafe:0,x:0,y:0});
  const small=districtJoystickInput(2,-2);assert.equal(small.forward,0);assert.equal(small.strafe,0);
});
test('the joystick maps up to forward and right to strafe',()=>{
  assert.equal(districtJoystickInput(0,-42).forward,1);assert.equal(districtJoystickInput(42,0).strafe,1);
  assert.equal(districtJoystickInput(0,42).forward,-1);assert.equal(districtJoystickInput(-42,0).strafe,-1);
});
test('diagonal and out-of-bounds movement are capped at unit speed',()=>{
  const input=districtJoystickInput(400,-400);assert.ok(Math.abs(Math.hypot(input.forward,input.strafe)-1)<1e-12);assert.ok(Math.abs(Math.hypot(input.x,input.y)-1)<1e-12);
});
test('invalid touch coordinates never propagate non-finite movement',()=>{
  assert.deepEqual(districtJoystickInput(Infinity,0),{forward:0,strafe:0,x:0,y:0});assert.deepEqual(districtJoystickInput(1,1,0),{forward:0,strafe:0,x:0,y:0});
  assert.equal(districtJoystickInput(0,-42,42,NaN).forward,1);
});

test('held navigation renews before its finite lease and releasing while pending emits one higher stop sequence',()=>{const sent:DistrictManualNavigationIntent[]=[],control=createDistrictManualNavigation(intent=>sent.push(intent),'session');for(let clock=0;clock<1000;clock+=10)control.sample({x:1,y:1},clock);assert.equal(sent.length,4);assert.deepEqual(sent.map(p=>p.sequence),[1,2,3,4]);assert.ok(sent.every(p=>Math.abs(Math.hypot(p.directionX,p.directionY)-1)<1e-12));control.sample({x:1,y:0},1000,true);assert.equal(sent.length,4);control.sample({x:0,y:0},1010,true);assert.equal(sent.length,5);assert.deepEqual(sent.at(-1),{sessionId:'session',sequence:5,directionX:0,directionY:0,stop:true});control.stop();assert.equal(sent.length,5);control.sample({x:-.5,y:0},1020);assert.equal(sent.at(-1)!.sequence,6);assert.equal(sent.at(-1)!.directionX,-.5);});

test('single-flight movement coalesces held packets and sends release before a newer resumed direction',async()=>{const sent:DistrictManualNavigationCommand[]=[],resolves:((ok:boolean)=>void)[]=[],queue=createDistrictManualQueue(command=>{sent.push(command);return new Promise(resolve=>resolves.push(resolve));}),command=(sequence:number,stop=false):DistrictManualNavigationCommand=>({type:'habitat.walk.input',playerId:'p',sessionId:'s',sequence,directionX:stop?0:1,directionY:0,stop}),tick=()=>new Promise<void>(resolve=>setTimeout(resolve,0));queue.enqueue(command(1));queue.enqueue(command(2));queue.enqueue(command(3));assert.equal(sent.length,1);assert.equal(queue.pendingCount,1);queue.enqueue(command(4,true));queue.enqueue(command(5));assert.equal(queue.pendingCount,2);resolves.shift()!(true);await tick();assert.deepEqual(sent.map(p=>p.sequence),[1,4]);resolves.shift()!(true);await tick();assert.deepEqual(sent.map(p=>p.sequence),[1,4,5]);resolves.shift()!(true);await tick();assert.equal(queue.inFlight,false);assert.equal(queue.pendingCount,0);queue.enqueue(command(3));assert.equal(sent.length,3);});

test('busy transport retains only the newest unsent intent without a request loop',async()=>{let available=false;const sent:number[]=[],queue=createDistrictManualQueue(async command=>{if(!available)return false;sent.push(command.sequence);return true;}),command=(sequence:number):DistrictManualNavigationCommand=>({type:'habitat.walk.input',playerId:'p',sessionId:'s',sequence,directionX:1,directionY:0,stop:false});queue.enqueue(command(1));await queue.flush();queue.enqueue(command(2));await queue.flush();assert.equal(queue.pendingCount,1);assert.deepEqual(sent,[]);available=true;await queue.flush();assert.deepEqual(sent,[2]);assert.equal(queue.pendingCount,0);});

test('the independent movement sender keeps signed revisions and coalesces a held key and release while a response is pending',async()=>{
 const command=(sequence:number,stop=false):DistrictManualNavigationCommand=>({type:'habitat.walk.input',playerId:'p',sessionId:'s',sequence,directionX:stop?0:1,directionY:0,stop}),updates:number[]=[],quoted:number[]=[],committed:number[]=[];
 let finish:(()=>void)|undefined,revision=12;
 const queue=createDistrictManualQueue(async input=>{await sendDistrictManualCommand(input,{requestId:`request-${input.sequence}`,quote:async body=>{quoted.push(body.command.sequence);return{revision,token:`signature-${revision}`,expiresAt:9000,changes:[],creditDelta:0,boundCreditDelta:0,simDelta:0,expectedOutputs:[]};},commit:async body=>{assert.equal(body.requestId,`request-${input.sequence}`);assert.equal(body.expectedRevision,revision);assert.equal(body.quoteToken,`signature-${revision}`);assert.equal(body.quoteExpiresAt,9000);committed.push(body.command.sequence);if(input.sequence===1)await new Promise<void>(resolve=>{finish=resolve;});return{ok:true,view:++revision};},update:value=>updates.push(value)});return true;});
 queue.enqueue(command(1));await new Promise(resolve=>setTimeout(resolve,0));queue.enqueue(command(2));queue.enqueue(command(3));queue.enqueue(command(4,true));assert.deepEqual(committed,[1]);assert.equal(queue.pendingCount,1);finish!();await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(quoted,[1,4]);assert.deepEqual(committed,[1,4]);assert.deepEqual(updates,[13,14]);assert.equal(queue.pendingCount,0);
});

test('movement retries a revision conflict at most once, and propagates connection or resource failures',async()=>{
 const command:DistrictManualNavigationCommand={type:'habitat.walk.input',playerId:'p',sessionId:'s',sequence:9,directionX:1,directionY:0,stop:false},quote={revision:7,token:'signature',expiresAt:9000,changes:[],creditDelta:0,boundCreditDelta:0,simDelta:0,expectedOutputs:[]};
 let quotes=0,commits=0,updates=0;
 await sendDistrictManualCommand(command,{requestId:'same-request',quote:async body=>{assert.equal(body.requestId,'same-request');quotes++;return{...quote,revision:quotes};},commit:async body=>{commits++;assert.equal(body.expectedRevision,commits);return commits===1?{ok:false,status:409}:{ok:true,view:'confirmed'};},update:()=>{updates++;}});assert.deepEqual([quotes,commits,updates],[2,2,1]);
 quotes=0;commits=0;
 await assert.rejects(sendDistrictManualCommand(command,{requestId:'conflict',quote:async()=>{quotes++;return quote;},commit:async()=>{commits++;return{ok:false,status:409};},update:()=>assert.fail('not committed')}),/guardar el movimiento/);assert.deepEqual([quotes,commits],[2,2]);
 await assert.rejects(sendDistrictManualCommand(command,{requestId:'economic',quote:async()=>({...quote,creditDelta:-1}),commit:async()=>{assert.fail('economic quote must not commit');},update:()=>assert.fail('not committed')}),/recursos/);
 const failure=new TypeError('Disconnected');await assert.rejects(sendDistrictManualCommand(command,{requestId:'network',quote:async()=>{throw failure;},commit:async()=>{assert.fail('no quote');},update:()=>assert.fail('not committed')}),error=>error===failure);
});

test('the real manual sender has no global busy dialog, pending economic order or quickAct heartbeat',()=>{
 const source=readFileSync(new URL('../app/mvp-client.tsx',import.meta.url),'utf8'),start=source.indexOf('useEffect(()=>{manualSender.current='),end=source.indexOf('const manualAct=',start),sender=source.slice(start,end);
 assert.ok(start>0&&end>start);assert.ok(sender.includes('sendDistrictManualCommand(command'));assert.ok(sender.includes('postReply(\'/api/mvp/quote\''));assert.ok(sender.includes('postReply(\'/api/mvp\''));assert.ok(sender.includes('handleFailure(error'));assert.ok(sender.includes('busyRef.current=false'));assert.doesNotMatch(sender,/\b(?:quickAct|setBusy|rememberOrder|savePendingOrder|setToast)\s*\(/);
});
