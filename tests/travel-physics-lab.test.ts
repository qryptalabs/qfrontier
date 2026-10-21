import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import ts from 'typescript';
import {createMvpWorld,createPlayer} from '../lib/mvp/world.ts';
import {compareExplorationSaveStates} from '../scripts/private-pc-exploration-save-check.mjs';
import {explorationHoldAt,explorationPositionAt} from '../lib/mvp/exploration-data.ts';
import type * as Lab from '../app/ensayos/viajes/travel-physics-lab';

const require=createRequire(import.meta.url),file=new URL('../app/ensayos/viajes/travel-physics-lab.tsx',import.meta.url),exports:Partial<typeof Lab>={},source=readFileSync(file,'utf8'),code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
new Function('require','exports',code)((id:string)=>{if(id==='../../graphics/habitable-scene')return{default:()=>null};if(!id.startsWith('.'))return require(id);const resolved=fileURLToPath(new URL(id,file));return require(existsSync(`${resolved}.ts`)?`${resolved}.ts`:resolved);},exports);
const{createTravelLabMemory,applyTravelLabManual,travelLabPosition}=exports as typeof Lab;
function seed(){const now=1000,world=createMvpWorld('visual-lab',now),player=createPlayer(world,{ownerId:'visual-lab',requestId:'visual-lab',now,actor:null},{type:'player.create',name:'Ensayo',stationName:'Sin guardar',faction:'cartographers'});player.habitable={version:1,appearance:'pine',profession:'carrier',position:{x:0,y:1.5},buildings:[]};return{world,player};}

test('five seconds of real RAM control renewals remain continuous and stop without economic or source-world changes',()=>{
  const{world,player}=seed(),original=JSON.stringify(world),start=1000,sessionId='f0010000-0000-4000-8000-000000000001';let memory=createTravelLabMemory(world,player.id,'city',start);const before=structuredClone(memory.world),position=travelLabPosition(memory,start);
  for(let i=0;i<20;i++){const now=start+i*250,prior=travelLabPosition(memory,now);memory=applyTravelLabManual(memory,{sessionId,sequence:i+1,directionX:1,directionY:0,stop:false},now);assert.deepEqual(travelLabPosition(memory,now),prior);const metadata=memory.world.players[player.id].habitable!.manualNavigation!;assert.equal(metadata.expiresAt,now+900);assert.equal(metadata.sequence,i+1);}
  memory=applyTravelLabManual(memory,{sessionId,sequence:21,directionX:0,directionY:0,stop:true},start+5000);const end=travelLabPosition(memory,start+5000);assert.ok(Math.hypot(end.x-position.x,end.y-position.y)>1);assert.deepEqual(travelLabPosition(memory,start+8000),end);assert.equal(memory.world.players[player.id].habitable!.manualNavigation!.stopped,true);assert.equal(memory.world.players[player.id].habitable!.exploration!.movement,undefined);assert.equal(memory.manualCommands,21);assert.equal(Object.keys(memory.world.receipts).length,Object.keys(before.receipts).length);assert.equal(compareExplorationSaveStates(before,memory.world,{allowExploration:true}).allPassed,true);assert.equal(JSON.stringify(world),original);
});

test('the RAM traffic scene uses the real scheduler and exposes a carriage hold beside a confirmed walking actor',()=>{
  const{world,player}=seed(),original=JSON.stringify(world),memory=createTravelLabMemory(world,player.id,'traffic',1000),state=memory.world.players[player.id].habitable!.exploration!,move=state.movement!,hold=move.holds?.[0];assert.ok(hold);assert.equal(Object.keys(memory.world.players).length,2);assert.equal(move.legs![0].mode,'carriage');assert.equal(explorationHoldAt(move,hold.startsAt+1),hold);const a=explorationPositionAt(state,hold.startsAt+1),b=explorationPositionAt(state,hold.endsAt-1);assert.deepEqual(a,b);assert.equal(JSON.stringify(world),original);assert.equal(Object.keys(memory.world.receipts).length,0);
});

test('lab dispatch cannot receive a real profile or access a persistent game store or network endpoint',()=>{
  const{world,player}=seed();player.ownerId='actual-user';assert.throws(()=>createTravelLabMemory(world,player.id,'city',1000),/perfiles ficticios/);for(const text of[source,readFileSync(new URL('../app/ensayos/viajes/page.tsx',import.meta.url),'utf8')])assert.doesNotMatch(text,/getMvpStore\s*\(|executeMvp\s*\(|\bfetch\s*\(/);
});
