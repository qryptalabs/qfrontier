import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {ExplorationView} from '../lib/mvp/exploration-data.ts';

const require=createRequire(import.meta.url),exports:{default?:React.ComponentType<Record<string,unknown>>}={};
const source=readFileSync(fileURLToPath(new URL('../app/exploration-panel.tsx',import.meta.url)),'utf8');
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('require','exports',output)((id:string)=>id.endsWith('.css')?{}:require(id==='../lib/mvp/exploration-timing'?'../lib/mvp/exploration-timing.ts':id),exports);
const Panel=exports.default!;
const clock=1_790_000_000_000;
function view(overrides:Partial<ExplorationView>={}):ExplorationView{return{status:'home',isOutside:false,position:{x:0,y:0},home:{x:0,y:0},movement:null,destinationId:null,remainingSeconds:0,destinations:[{id:'city',name:'Costa Ámbar',kind:'city',biome:'forest',position:{x:-408,y:-312},distance:514,reachable:true,blockedReason:null,seconds:240},{id:'ice',name:'Reino del Hielo',kind:'city',biome:'ice',position:{x:120,y:-12000},distance:12001,reachable:false,blockedReason:'No existe un camino terrestre en esta primera zona.',seconds:null}],canLeave:true,canStop:false,canReturn:false,blockedReason:null,speed:2.2,maxWalkDistance:8,...overrides};}
function render(current:ExplorationView){return renderToStaticMarkup(React.createElement(Panel,{exploration:current,busy:false,clock,onCommand:()=>{}}));}

test('the departure panel renders saved coordinates and an honest blocked route without mounting 3D',()=>{
  const html=render(view());assert.ok(html.includes('Salir de la aldea'));assert.ok(html.includes('X 0 · Y 0'));assert.ok(html.includes('Salí de la aldea primero'));assert.ok(html.includes('No existe un camino terrestre en esta primera zona.'));assert.ok(!html.includes('<canvas'));assert.ok(html.includes('El comercio y la construcción en los destinos se incorporarán después.'));
});
test('an active server movement exposes progress, remaining time and the stop control',()=>{
  const html=render(view({status:'traveling',isOutside:true,destinationId:'city',canReturn:true,canStop:true,movement:{points:[{x:0,y:0},{x:-408,y:-312}],startsAt:clock-5000,endsAt:clock+5000}}));assert.ok(html.includes('aria-valuenow="50"'));assert.ok(html.includes('5 s'));assert.ok(html.includes('Detenerme'));assert.ok(html.includes('Camino a Costa Ámbar'));assert.ok(html.includes('Volver a casa'));
});
test('the destination directory initially limits cards instead of rendering the whole world',()=>{
  const destinations=Array.from({length:35},(_,i)=>({...view().destinations[0],id:`place-${i}`,name:`Destino ${i}`,distance:i}));
  const html=render(view({destinations}));assert.equal((html.match(/class="e-destination(?: selected| unavailable)?"/g)??[]).length,8);assert.ok(html.includes('Ver 8 destinos más'));assert.ok(html.includes('8 de 35'));
});

test('a sea leg identifies the vessel and next disembarkation instead of offering a walking stop',()=>{
  const html=render(view({status:'traveling',isOutside:true,destinationId:'ice',canReturn:false,canStop:false,movement:{points:[{x:0,y:0},{x:0,y:8},{x:0,y:108},{x:10,y:108}],startsAt:clock-10000,endsAt:clock+10000,legs:[{mode:'walk',fromIndex:0,toIndex:1,startsAt:clock-10000,endsAt:clock-6000},{mode:'boat',fromIndex:1,toIndex:2,startsAt:clock-6000,endsAt:clock+6000},{mode:'carriage',fromIndex:2,toIndex:3,startsAt:clock+6000,endsAt:clock+10000}]}}));
  assert.ok(html.includes('En barco'));assert.ok(html.includes('Tramo 2 de 3'));assert.ok(html.includes('próximo desembarque'));assert.ok(!html.includes('Detenerme'));assert.ok(html.includes('aria-valuenow="50"'));
});

test('a land transport leg keeps the same navigation controls and labels its current transport',()=>{
  const html=render(view({status:'traveling',isOutside:true,canReturn:true,canStop:true,movement:{points:[{x:0,y:0},{x:80,y:0}],startsAt:clock-5000,endsAt:clock+5000,legs:[{mode:'carriage',fromIndex:0,toIndex:1,startsAt:clock-5000,endsAt:clock+5000}]}}));
  assert.ok(html.includes('En carreta'));assert.ok(html.includes('Tramo 1 de 1'));assert.ok(html.includes('Detenerme'));assert.ok(!html.includes('El barco te llevará'));
});

test('a confirmed land traffic hold is labeled as waiting and retains the safe stop control',()=>{
 const html=render(view({status:'traveling',isOutside:true,canReturn:true,canStop:true,movement:{points:[{x:0,y:0},{x:8,y:0},{x:16,y:0}],startsAt:clock-5000,endsAt:clock+10000,legs:[{mode:'carriage',fromIndex:0,toIndex:2,startsAt:clock-5000,endsAt:clock+10000}],holds:[{pointIndex:1,startsAt:clock-1000,endsAt:clock+3000,resourceId:'traffic-yield:road'}]}}));
 assert.ok(html.includes('Cediendo el paso'));assert.ok(html.includes('3 s'));assert.ok(html.includes('posición segura'));assert.ok(html.includes('Detenerme'));assert.ok(!html.includes('<canvas'));
});
