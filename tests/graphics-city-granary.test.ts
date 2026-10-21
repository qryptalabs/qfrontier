import test from 'node:test';
import assert from 'node:assert/strict';
import {createCityGranary} from '../lib/graphics/city-granary.ts';
import {createMvpWorld,createPlayer} from '../lib/mvp/world.ts';
import {newCityShop,shopSnapshot} from '../lib/mvp/city-shop.ts';
import {royalKingdomSnapshot} from '../lib/mvp/royal-kingdom-service.ts';
import {buildMvpView} from '../lib/mvp/engine.ts';
import {deriveClosedEntityValues} from '../lib/mvp/entity-values.ts';

test('each accepted two-plank delivery restores a distinct granary section, without changing its physical footprint',()=>{const g=createCityGranary();try{const stages=g.group.children.filter(o=>o.name.startsWith('granary-repair-stage-')),scaffold=g.group.getObjectByName('granary-active-repair-scaffold')!;assert.equal(stages.length,10);for(let n=0;n<=20;n+=2){g.setDelivered(n);assert.equal(stages.filter(o=>o.visible).length,n/2);assert.equal(scaffold.visible,n<20);}g.setDelivered(100);assert.equal(stages.filter(o=>o.visible).length,10);assert.equal(g.group.position.y,1.14);}finally{g.dispose();}});
test('the shop, walking city and planet expose the same confirmed public work and invalidate shared cached views',()=>{const now=Date.parse('2026-10-19T21:30:00Z'),w=createMvpWorld('owner',now),p=createPlayer(w,{ownerId:'owner',actor:null,now,requestId:crypto.randomUUID()},{type:'player.create',name:'Sol',stationName:'Alameda',faction:'cartographers'}),before=deriveClosedEntityValues(w)['lectura:social'];w.cityShops={'paso-del-norte':newCityShop(now,w.seasonId,'paso-del-norte')};w.cityShops['paso-del-norte'].granary={delivered:6};const encoded=JSON.stringify(w);assert.equal(shopSnapshot(w,p,1,now).granary.delivered,6);assert.equal(royalKingdomSnapshot(w,p,1,now).granaryDelivered,6);assert.equal(buildMvpView(w,1,'owner',now,p.id).publicWorks?.granaryDelivered,6);assert.notEqual(deriveClosedEntityValues(w)['lectura:social'],before);assert.equal(JSON.stringify(w),encoded);});
