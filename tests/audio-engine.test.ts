import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FrontierAudio} from '../lib/audio/engine.ts';
import type {SoundFrame} from '../lib/audio/model.ts';

class Parameter {value=0;setTargetAtTime(v:number){this.value=v;}setValueAtTime(v:number){this.value=v;}linearRampToValueAtTime(v:number){this.value=v;}exponentialRampToValueAtTime(v:number){this.value=v;}cancelScheduledValues(){}}
class AudioNodeFake {gain=new Parameter();pan=new Parameter();frequency=new Parameter();threshold=new Parameter();knee=new Parameter();ratio=new Parameter();attack=new Parameter();release=new Parameter();playbackRate=new Parameter();loop=false;onended:(()=>void)|null=null;buffer:unknown;type='';started=false;connect<T>(node:T):T{return node;}disconnect(){}start(){this.started=true;}stop(){if(this.started){this.started=false;this.onended?.();}}}
class ContextFake {
  static count=0;state='suspended';sampleRate=8000;currentTime=1;destination=new AudioNodeFake();sources:AudioNodeFake[]=[];
  constructor(){ContextFake.count++;}createGain(){return new AudioNodeFake();}createDynamicsCompressor(){return new AudioNodeFake();}createBiquadFilter(){return new AudioNodeFake();}createConvolver(){return new AudioNodeFake();}createStereoPanner(){return new AudioNodeFake();}createMediaElementSource(){return new AudioNodeFake();}createOscillator(){return new AudioNodeFake();}
  createBuffer(channels:number,length:number){return {length,numberOfChannels:channels,duration:length/this.sampleRate,getChannelData:()=>new Float32Array(length)};}
  createBufferSource(){const node=new AudioNodeFake();this.sources.push(node);return node;}
  async decodeAudioData(){return this.createBuffer(1,8000);}async resume(){this.state='running';}async suspend(){this.state='suspended';}
}
test('shared mixer unlock, culling, mute, hidden-tab pause and teardown do not touch the game server',async t=>{
  const windowFake=new EventTarget(),documentFake=Object.assign(new EventTarget(),{hidden:false,body:{appendChild(){}}}),media:MediaFake[]=[],requests:string[]=[],timer:{callback:(()=>void)|null}={callback:null};let clock=1000;
  class MediaFake extends EventTarget {paused=true;loop=false;preload='none';src:string;hidden=false;constructor(src:string){super();this.src=src;media.push(this);}setAttribute(){}async play(){this.paused=false;}pause(){this.paused=true;}}
  t.mock.method(performance,'now',()=>clock);
  const replace=(name:string,value:unknown)=>{const descriptor=Object.getOwnPropertyDescriptor(globalThis,name);Object.defineProperty(globalThis,name,{value,configurable:true,writable:true});t.after(()=>{if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);});};
  replace('window',Object.assign(windowFake,{AudioContext:ContextFake,matchMedia:()=>({matches:true})}));replace('document',documentFake);replace('Audio',MediaFake);replace('BroadcastChannel',undefined);replace('localStorage',{getItem:()=>null,setItem:()=>{}});
  replace('setInterval',(fn:()=>void)=>{timer.callback=fn;return 1;});replace('clearInterval',()=>{timer.callback=null;});replace('fetch',async(url:string)=>{requests.push(url);return {ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};});
  const engine=new FrontierAudio(),unmount=engine.mount(),scene=engine.scene(2),frame:SoundFrame={listener:{x:0,y:1,z:0},yaw:0,inside:false,aerial:false,biome:'forest',label:'Aldea',water:.4,emitters:Array.from({length:50},(_,i)=>({id:'mill'+i,kind:'saw',x:i/10,y:1,z:0}))};
  assert.equal(ContextFake.count,0);assert.equal(requests.length,0);
  await engine.activate();await engine.activate();assert.equal(ContextFake.count,1);assert.equal(engine.getSnapshot().ready,true);
  const tick=async()=>{clock+=100;scene.update(frame);timer.callback?.();await new Promise(resolve=>setImmediate(resolve));};
  for(let i=0;i<5;i++)await tick();
  assert.ok(engine.getSnapshot().voices>0);assert.ok(engine.getSnapshot().voices<=9,'mobile: six emitters plus three ambient loops');assert.ok(requests.every(url=>url.startsWith('/audio/v1/')));assert.equal(requests.filter(s=>s.endsWith('/saw.mp3')).length,1,'one decode shared by all saws');
  scene.setActive(false);assert.ok(media.length>0);timer.callback?.();assert.equal(media[0].paused,true);
  scene.setActive(true);await tick();documentFake.hidden=true;documentFake.dispatchEvent(new Event('visibilitychange'));assert.equal(media[0].paused,true);
  documentFake.hidden=false;documentFake.dispatchEvent(new Event('visibilitychange'));await tick();
  engine.settings({enabled:false});assert.equal(media[0].paused,true);engine.settings({enabled:true});await tick();
  scene.dispose();unmount();assert.equal(timer.callback,null);assert.equal(media[0].paused,true);assert.ok(requests.length<8);
});
