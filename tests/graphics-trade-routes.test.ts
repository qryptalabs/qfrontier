import test from 'node:test';
import assert from 'node:assert/strict';
import {createMvpWorld,createPlayer} from '../lib/mvp/world.ts';
import {planHabitableTradeRoute,sampleTradePath,tradePathLength,tradeGroundHeight,TRADE_BAY,TRADE_DESTINATION} from '../lib/graphics/trade-routes.ts';
import {habitableTradePoseAt,type HabitableCaravanVisual} from '../lib/mvp/habitable-commerce.ts';
import {sampleWorld} from '../lib/graphics/world-geography.ts';

function fixture(){const world=createMvpWorld('owner',1),player=createPlayer(world,{ownerId:'owner',requestId:'qa',now:1,actor:null},{type:'player.create',name:'Rutas',stationName:'Prueba',faction:'cartographers'});player.settlement={...player.settlement!,x:48,y:48};return{world,player};}

test('the first confirmed trade route has real endpoints, reproducible heights, a bounded land itinerary and a wide dry road',()=>{
 const{world,player}=fixture(),before=JSON.stringify(world),route=planHabitableTradeRoute(world,player);assert.ok(route);assert.deepEqual(planHabitableTradeRoute(world,player),route);assert.equal(JSON.stringify(world),before);assert.equal(route.points[0].x,48+TRADE_BAY.x);assert.equal(route.points[0].y,48+TRADE_BAY.y);assert.equal(route.points.at(-1)!.x,TRADE_DESTINATION.x);assert.equal(route.points.at(-1)!.y,TRADE_DESTINATION.y);assert.equal(route.length,tradePathLength(route.points));assert.ok(route.points.length<=260);assert.ok(route.length>100&&route.length<500);
 for(let i=1;i<route.points.length;i++){const a=route.points[i-1],b=route.points[i],len=Math.hypot(b.x-a.x,b.y-a.y);assert.ok(len<=10);for(let d=0;d<=len;d+=.4){const pose=sampleTradePath([a,b],d);if(Math.abs(pose.x-48)<19&&Math.abs(pose.y-48)<17)continue;for(const offset of[-1.1,0,1.1]){const v=sampleWorld(pose.x+Math.cos(pose.yaw)*offset,pose.y-Math.sin(pose.yaw)*offset);assert.ok(!v.water||v.river&&v.biome!=='ocean','no sea or lake shortcuts');}}}
 for(const p of route.points){if(!route.bridges.some(b=>b.from.x===p.x&&b.from.y===p.y||b.to.x===p.x&&b.to.y===p.y))assert.ok(Math.abs(p.height-tradeGroundHeight(p.x,p.y,player.settlement!)-.045)<1e-10);}
});

test('nearby foreign parcels are respected and distant unsupported origins create no invented road',()=>{
 const{world,player}=fixture(),other=createPlayer(world,{ownerId:'other',requestId:'other',now:1,actor:null},{type:'player.create',name:'Vecina',stationName:'Vecina',faction:'cartographers'});other.settlement={...other.settlement!,x:96,y:48};const route=planHabitableTradeRoute(world,player);assert.ok(route);for(const point of route.points)assert.ok(Math.abs(point.x-96)>=21||Math.abs(point.y-48)>=19);player.settlement={...player.settlement!,x:10000,y:10000};assert.equal(planHabitableTradeRoute(world,player),null);
});

test('the animal stays ahead at endpoint arrival and a cancelled empty cart turns continuously before returning',()=>{
 const{world,player}=fixture(),route=planHabitableTradeRoute(world,player)!;const v:HabitableCaravanVisual={id:'trade',playerId:player.id,plot:{x:48,y:48},destination:{...TRADE_DESTINATION},route,approachStartsAt:1000,approachEndsAt:101000,quantity:2};
 for(const now of[1000,100999,101000,101001]){const pose=habitableTradePoseAt(v,now);assert.ok(Math.hypot(pose.cart.x-pose.animal.x,pose.cart.y-pose.animal.y)>.7);assert.equal(pose.cargoUnits,0);}
 v.returnTrip={points:route.points,startsAt:103000,endsAt:203000};let previous=habitableTradePoseAt(v,102000);for(let now=102050;now<=103100;now+=50){const next=habitableTradePoseAt(v,now);assert.ok(Math.hypot(next.animal.x-previous.animal.x,next.animal.y-previous.animal.y)<.2,'no instant reversal of the animal');assert.equal(next.cargoUnits,0);previous=next;}
});
