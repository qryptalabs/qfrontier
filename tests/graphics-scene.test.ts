import test from 'node:test';
import assert from 'node:assert/strict';
import { jobProgress, projectTiles, resolutionFor, routePoint, stableSeed } from '../lib/graphics/scene-data.ts';
import type { SceneInput } from '../lib/graphics/scene-data.ts';
import { createMvpWorld, createPlayer } from '../lib/mvp/world.ts';
import { buildMvpView } from '../lib/mvp/engine.ts';

function input():SceneInput {
 const now=1_780_000_000_000,world=createMvpWorld('owner',now);
 const player=createPlayer(world,{ownerId:'owner',requestId:'graphics',now,actor:null},{type:'player.create',name:'Ari',stationName:'Alba',faction:'cartographers'});
 const view=buildMvpView(world,0,'owner',now,player.id);
 // Give the projection the full fixture deposits to verify that its own
 // discovery filter still hides them independently of server-side redaction.
 return{view:{...view,tiles:Object.values(world.tiles)},player:view.player,selected:player.position,mode:'world',quality:'auto',reducedMotion:false};
}
test('graphics never adds hidden resources or decor to the projection',()=>{
 const scene=input(),tiles=projectTiles(scene);
 assert.equal(tiles.length,81);assert.equal(tiles.filter(tile=>tile.visible).length,5);
 assert.ok(tiles.every(tile=>tile.deposits.length===0));
 assert.ok(tiles.filter(tile=>!tile.visible).every(tile=>tile.terrain===null&&tile.biome===null));
 scene.player!.surveyed.push('t_4_4');
 assert.deepEqual(projectTiles(scene).find(tile=>tile.id==='t_4_4')!.deposits,['water','grain','biomass']);
});
test('the demonstration never reveals real deposits',()=>{
 const scene=input();scene.mode='showcase';scene.player=null;
 const tiles=projectTiles(scene);assert.equal(tiles.filter(tile=>tile.visible).length,9);assert.ok(tiles.every(tile=>tile.deposits.length===0));
});
test('route interpolation clamps real job timestamps and respects tile positions',()=>{
 const tiles=projectTiles(input()),job={startsAt:100,endsAt:200};
 assert.equal(jobProgress(job,0),0);assert.equal(jobProgress(job,150),.5);assert.equal(jobProgress(job,300),1);
 assert.deepEqual(routePoint(['t_4_4','t_4_5'],tiles,.5),{x:1.6,y:0,z:0});
 assert.equal(routePoint(['missing'],tiles,0),null);
});
test('quality budgets cap physical pixels at advertised long edges',()=>{
 assert.equal(resolutionFor(2400,1800,2,'fullhd').width,1920);
 assert.equal(resolutionFor(3200,1800,2,'4k').width,3840);
 assert.equal(resolutionFor(1600,900,3,'performance').width,1280);
 assert.equal(stableSeed('t_4_4'),stableSeed('t_4_4'));
});
