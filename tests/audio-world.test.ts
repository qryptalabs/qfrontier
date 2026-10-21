import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {audioSettings,DEFAULT_AUDIO,advanceFootstep,spatialMix,audibleEmitters,type SoundFrame} from '../lib/audio/model.ts';
import {villageSounds,fishingSounds,tutorialSounds} from '../lib/audio/world-sounds.ts';
import type {HabitableState,HabitableWorkerVisual} from '../lib/mvp/habitable-data.ts';
import {fishingSnapshot} from '../lib/graphics/fishing-community-data.ts';
const frame:SoundFrame={listener:{x:0,y:1,z:0},yaw:0,aerial:false,inside:false,biome:'forest',label:'test',emitters:[]};
test('audio preferences are bounded, default safely, preserve mute, and reject invalid numbers',()=>{
  assert.deepEqual(audioSettings(null),DEFAULT_AUDIO);assert.deepEqual(audioSettings('{broken'),DEFAULT_AUDIO);
  const settings=audioSettings({enabled:false,master:10,music:-2,effects:NaN,ambience:Infinity,interface:.2});
  assert.equal(settings.enabled,false);assert.equal(settings.master,1);assert.equal(settings.music,0);assert.equal(settings.effects,DEFAULT_AUDIO.effects);assert.equal(settings.ambience,DEFAULT_AUDIO.ambience);assert.equal(settings.interface,.2);
});
test('nearby emitters are directional, distant sources silent, rooms and aerial view attenuated',()=>{
  const source={id:'saw',kind:'saw' as const,x:4,y:1,z:0,radius:20,volume:.8};
  assert.ok(spatialMix(frame,source).pan>0);assert.ok(spatialMix(frame,{...source,x:-4}).pan<0);
  assert.equal(spatialMix(frame,{...source,x:100}).gain,0);
  assert.ok(spatialMix({...frame,inside:true},source).gain<spatialMix(frame,source).gain);
  assert.ok(spatialMix({...frame,aerial:true},source).gain<spatialMix(frame,source).gain);
  const sources=Array.from({length:100},(_,i)=>({...source,id:String(i),x:i}));assert.equal(audibleEmitters({...frame,emitters:sources},6).length,6);
});
test('footsteps follow actual continuous distance, and reset for pauses, teleport and missing character',()=>{
  let state:ReturnType<typeof advanceFootstep>['state']=null;let steps=0;
  for(let i=0;i<=20;i++){const next=advanceFootstep(state,{x:i*.1,y:0,z:0,surface:'grass'},i*100);state=next.state;if(next.play)steps++;}
  assert.equal(steps,2);
  assert.equal(advanceFootstep(state,{x:2,y:0,z:0,surface:'grass'},2100).play,false);
  assert.equal(advanceFootstep(state,{x:200,y:0,z:0,surface:'stone'},2200).play,false);
  assert.equal(advanceFootstep(state,{x:2.9,y:0,z:0,surface:'stone'},9999).play,false);
  assert.equal(advanceFootstep(state,undefined,2300).state,null);
});
test('village tools stop when the real work ends and never invent an idle job',()=>{
  const worker:HabitableWorkerVisual={id:'worker',buildingId:'mill',role:'sawyer',stand:{x:2,y:3},yaw:0,startsAt:1000,workEndsAt:5000,pendingUnits:0,blockedReason:null};
  const state:Pick<HabitableState,'buildings'|'workers'>={buildings:[{id:'mill',templateId:'sawmill',x:2,y:3,rotation:0,startsAt:0,endsAt:500,bound:true,visual:{state:'working',operation:'saw',startsAt:1000,endsAt:5000}}],workers:[worker]};
  const before=JSON.stringify(state),running=villageSounds(state,2000,{x:100,y:200},()=>8);
  assert.equal(running[0]?.kind,'saw');assert.equal(running[0]?.x,102);assert.equal(running[0]?.z,203);assert.equal(running[0]?.y,8.7);
  assert.ok(!villageSounds(state,6000).some(s=>s.kind==='saw'));assert.ok(!villageSounds(state,800).some(s=>s.kind==='saw'));assert.equal(JSON.stringify(state),before);
});
test('port transport follows actual fleet phases; stationary carts have no hooves',()=>{
  for(let second=0;second<600;second+=7){const snapshot=fishingSnapshot(second),before=JSON.stringify(snapshot),sounds=fishingSounds(snapshot);
    for(const cart of snapshot.carts){const audible=sounds.some(s=>s.id===cart.id+':animal');assert.equal(audible,cart.speed>.01&&['outbound','inbound','approaching'].includes(cart.state));}
    assert.equal(JSON.stringify(snapshot),before);
  }
});
test('the first wood-to-plank tutorial sounds only during its confirmed extraction and fabrication',()=>{
  assert.equal(tutorialSounds('extracting')[0]?.kind,'axe');assert.equal(tutorialSounds('crafting')[0]?.kind,'saw');
  for(const step of ['available','accepted','timber','ready','delivered','idle',undefined])assert.deepEqual(tutorialSounds(step),[]);
});
test('all shipped audio files match provenance manifest, with a small download and no third-party runtime URLs',()=>{
  const base=new URL('../public/audio/v1/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',base),'utf8'));
  assert.ok(manifest.totalBytes<4_000_000);assert.ok(manifest.files.length>=25);
  for(const entry of manifest.files){const file=readFileSync(new URL(entry.file,base));assert.equal(file.length,entry.bytes);assert.equal(createHash('sha256').update(file).digest('hex'),entry.sha256);}
  assert.match(readFileSync(new URL('credits.txt',base),'utf8'),/RandomMind/);
});
