import test from 'node:test';
import assert from 'node:assert/strict';
import {shopHandlingSchedule,shopHandlingPose,shopDriverSeatBlend} from '../lib/graphics/shop-handling-motion.ts';
import {ROYAL_SHOP} from '../lib/graphics/city-shop-layout.ts';
import {SHOP_SITES,sitePoint,type ShopCity} from '../lib/graphics/city-shop-sites.ts';
import {royalNavigation} from '../lib/graphics/royal-navigation.ts';

test('both yards use walkable aisles and reach a cart side without crossing fences or the vehicle',()=>{
 for(const city of Object.keys(SHOP_SITES)as ShopCity[])for(const kind of ['collect','deliver']as const){
  const cart={...sitePoint(city,ROYAL_SHOP.pickup),yaw:Math.PI},s=shopHandlingSchedule('test',kind,city,cart,4,1000),n=royalNavigation([{x:cart.x,z:cart.z,halfWidth:1.15,halfDepth:1.6,minY:cart.y,maxY:cart.y+2.5}]);
  for(const l of s.legs)for(let i=1;i<l.points.length;i++)assert(n.line(l.points[i-1],l.points[i],l.points[i].y,.35),city+': '+l.phase);
  for(let now=s.startsAt;now<s.endsAt;now+=100){const p=shopHandlingPose(s,now);assert(Math.hypot(p.x-cart.x,p.z-cart.z)>=1.9);if(p.carrying)assert(p.phase==='carry'||p.phase==='put');}
  assert.equal(shopHandlingPose(s,s.endsAt).walking,false);assert.equal(shopHandlingPose(s,s.endsAt).carrying,false);
 }
});
test('the driver steps aside while loading and boards after handoff, while time does not move the vehicle',()=>{
 const cart={...ROYAL_SHOP.pickup,yaw:Math.PI},s=shopHandlingSchedule('test','collect','corona-del-alba',cart,4,1000),original=structuredClone(s.cart);
 assert.equal(shopDriverSeatBlend(s,s.startsAt).seated,1);assert.equal(shopDriverSeatBlend(s,s.startsAt+1600).seated,0);assert.equal(shopDriverSeatBlend(s,s.transfersAt).seated,0);assert(shopDriverSeatBlend(s,s.endsAt-900).seated>0);assert.equal(shopDriverSeatBlend(s,s.endsAt).seated,1);assert.deepEqual(s.cart,original);
});
