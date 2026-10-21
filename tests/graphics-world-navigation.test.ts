import assert from 'node:assert/strict';
import test from 'node:test';
import { geoToVector, geoToWorld, PLANET_ANCHOR, type PlanetVector, UNITS_PER_DEGREE, worldToGeo, worldToPlanet } from '../lib/graphics/planet-data.ts';
import { clampWorldPoint, geographicWorldBounds, planetVectorToGeo, planetVectorToWorld } from '../lib/graphics/world-navigation.ts';
import { plotForIndex } from '../lib/mvp/settlements.ts';

function close(actual:number,expected:number,epsilon=1e-8){assert.ok(Math.abs(actual-expected)<=epsilon,`${actual} differs from ${expected}`);}

test('surface-to-world inverse preserves more than 2000 global samples across distant continents, ocean and polar latitudes',()=>{
  for(let row=0;row<=40;row++)for(let col=0;col<=50;col++){
    const lat=-89.5+row/40*179,lon=-179.8+col/50*359.6,radius=[.000001,1,100,1e100][(row+col)%4];
    const vector=geoToVector(lat,lon,radius),back=planetVectorToGeo(vector),world=planetVectorToWorld(vector),expected=geoToWorld(lat,lon);
    close(back.lat,lat);close(back.lon,lon);close(world.x,expected.x);close(world.y,expected.y);
    const clamped=clampWorldPoint(world.x,world.y);close(clamped.x,expected.x);close(clamped.y,expected.y);
  }
});

test('existing permanent parcel coordinates survive sphere picking without rounding or population-dependent shifts',()=>{
  for(let index=0;index<1200;index++){
    const plot=plotForIndex(index),before=JSON.stringify(plot),point=planetVectorToWorld(worldToPlanet(plot.x,plot.y));
    close(point.x,plot.x);close(point.y,plot.y);assert.equal(JSON.stringify(plot),before);
  }
  const origin=planetVectorToGeo(worldToPlanet(0,0));close(origin.lat,PLANET_ANCHOR.lat);close(origin.lon,PLANET_ANCHOR.lon);
});

test('cardinal axes, longitude seam and exact poles use the established Three sphere convention',()=>{
  assert.deepEqual(planetVectorToGeo({x:1,y:0,z:0}),{lat:0,lon:0});
  assert.deepEqual(planetVectorToGeo({x:0,y:0,z:-1}),{lat:0,lon:90});
  assert.deepEqual(planetVectorToGeo({x:0,y:0,z:1}),{lat:0,lon:-90});
  assert.deepEqual(planetVectorToGeo({x:-1,y:0,z:-0}),{lat:0,lon:180});
  assert.deepEqual(planetVectorToGeo({x:-1,y:0,z:0}),{lat:0,lon:-180});
  assert.deepEqual(planetVectorToGeo({x:0,y:1,z:0}),{lat:90,lon:0});
  assert.deepEqual(planetVectorToGeo({x:0,y:-1,z:0}),{lat:-90,lon:0});
  for(const lat of [-90,-89.999999,0,89.999999,90])for(const lon of [-180,-179.999999,179.999999,180]){
    const vector=geoToVector(lat,lon),back=planetVectorToGeo(vector),reconstructed=geoToVector(back.lat,back.lon);
    close(back.lat,lat);close(reconstructed.x,vector.x);close(reconstructed.y,vector.y);close(reconstructed.z,vector.z);
    if(Math.abs(lat)<90)close(back.lon,lon);
  }
});

test('finite vector magnitudes cannot overflow or underflow normalization',()=>{
  for(const magnitude of [Number.MIN_VALUE,1e-300,1,1e300,Number.MAX_VALUE]){
    const result=planetVectorToGeo({x:magnitude,y:magnitude,z:-magnitude});
    close(result.lat,Math.atan(1/Math.sqrt(2))*180/Math.PI);close(result.lon,45);
  }
  assert.deepEqual(planetVectorToGeo({x:-0,y:-0,z:-1}),{lat:0,lon:90});
});

test('geographic world bounds use the whole longitude extent and a camera-only half-degree polar margin',()=>{
  assert.deepEqual(geographicWorldBounds,{minX:(-180-PLANET_ANCHOR.lon)*UNITS_PER_DEGREE,maxX:(180-PLANET_ANCHOR.lon)*UNITS_PER_DEGREE,minY:(PLANET_ANCHOR.lat-89.5)*UNITS_PER_DEGREE,maxY:(PLANET_ANCHOR.lat+89.5)*UNITS_PER_DEGREE});
  assert.ok(Object.isFrozen(geographicWorldBounds));
  assert.deepEqual(clampWorldPoint(-1e9,-1e9),{x:geographicWorldBounds.minX,y:geographicWorldBounds.minY});
  assert.deepEqual(clampWorldPoint(1e9,1e9),{x:geographicWorldBounds.maxX,y:geographicWorldBounds.maxY});
  assert.deepEqual(clampWorldPoint(9216.125,-7421.75),{x:9216.125,y:-7421.75});
  assert.deepEqual(clampWorldPoint(-0,-0),{x:0,y:0});
  for(const [lat,lon]of [[89.5,-180],[-89.5,180],[35,87],[-25,105],[35,-143],[8,-156],[-20,-133],[58,138]]){
    const point=planetVectorToWorld(geoToVector(lat,lon)),result=clampWorldPoint(point.x,point.y),back=worldToGeo(result.x,result.y);
    close(back.lat,lat);close(back.lon,lon);
  }
  const north=planetVectorToWorld({x:0,y:1,z:0}),south=planetVectorToWorld({x:0,y:-1,z:0});
  assert.equal(worldToGeo(north.x,north.y).lat,90);assert.equal(worldToGeo(south.x,south.y).lat,-90);
  assert.equal(clampWorldPoint(north.x,north.y).y,geographicWorldBounds.minY);assert.equal(clampWorldPoint(south.x,south.y).y,geographicWorldBounds.maxY);
});

test('malformed, nonfinite and zero vectors fail explicitly without mutating inputs or accepting coercion',()=>{
  for(const point of [null,undefined,1,'1',{},[],{x:0,y:0,z:0},{x:1,y:0,z:NaN},{x:Infinity,y:1,z:0},{x:1,y:'0',z:1}] as unknown as PlanetVector[]){
    assert.throws(()=>planetVectorToGeo(point),RangeError);assert.throws(()=>planetVectorToWorld(point),RangeError);
  }
  for(const value of [NaN,Infinity,-Infinity,'1',null,undefined] as unknown as number[]){assert.throws(()=>clampWorldPoint(value,0),RangeError);assert.throws(()=>clampWorldPoint(0,value),RangeError);}
  const point=Object.freeze({x:27,y:-4,z:15}),before=JSON.stringify(point);planetVectorToGeo(point);planetVectorToWorld(point);assert.equal(JSON.stringify(point),before);
});
