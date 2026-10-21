import test from 'node:test';
import assert from 'node:assert/strict';
import {shopPackerMotion} from '../lib/graphics/shop-packer-motion.ts';

test('packing pauses at the table, carries only on the outward leg and faces its direction of travel',()=>{
 const pick=shopPackerMotion(1,true),carry=shopPackerMotion(5,true),pack=shopPackerMotion(12,true),back=shopPackerMotion(19,true);
 assert(pick.working&&!pick.walking&&!pick.carrying);
 assert(carry.walking&&carry.carrying&&!carry.working);assert.equal(carry.yaw,0);
 assert(pack.working&&!pack.walking&&!pack.carrying);assert.equal(pack.z,155.1);
 assert(back.walking&&!back.working&&!back.carrying);assert.equal(back.yaw,Math.PI);
 for(const t of[0,2,8,16,22,24])assert(Math.abs(shopPackerMotion(t-1e-6,true).z-shopPackerMotion(t,true).z)<1e-5,'no position jump at '+t);
});
test('no imaginary orders, animal crates, replayed collections or indefinite work cycles',()=>{
 for(const age of[-1,24,250,NaN,Infinity])assert.equal(shopPackerMotion(age,true).phase,'idle');
 assert.equal(shopPackerMotion(5,false).phase,'idle');
 for(let t=0;t<24;t+=.25){const pose=shopPackerMotion(t,true);assert(pose.z>=153&&pose.z<=155.1);assert(!(pose.walking&&pose.working));}
});
