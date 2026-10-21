import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createMvpWorld,createPlayer} from '../lib/mvp/world.ts';
import {buildMvpView} from '../lib/mvp/engine.ts';

const require=createRequire(import.meta.url);
function component(path:string){const file=fileURLToPath(new URL(path,import.meta.url)),exports:{default?:React.ComponentType<Record<string,unknown>>}={},output=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;const load=(id:string)=>{if(id.endsWith('.css'))return{};if(id.startsWith('.')){let target=resolve(dirname(file),id);if(!existsSync(target))target+=existsSync(`${target}.ts`)?'.ts':'.tsx';return require(target);}return require(id);};new Function('require','exports',output)(load,exports);return exports.default!;}
const FrontierWorld=component('../app/graphics/frontier-world.tsx'),ItemArt=component('../app/graphics/item-art.tsx'),Protection=component('../app/graphics/starter-protection.tsx');
function view(){const now=1_780_000_000_000,world=createMvpWorld('owner',now),player=createPlayer(world,{ownerId:'owner',requestId:'ssr-graphics',now,actor:null},{type:'player.create',name:'Ana',stationName:'Alba',faction:'cartographers'});return buildMvpView(world,0,'owner',now,player.id);}

test('the compact station is useful SSR content with an explicit 3D launch and no loading overlay or canvas',()=>{
  const current=view(),html=renderToStaticMarkup(React.createElement(FrontierWorld,{view:current,player:current.player,mode:'station',compact:true}));assert.ok(html.includes('Abrir vista 3D'));assert.ok(!html.includes('<canvas'));assert.ok(!html.includes('Construyendo el horizonte'));assert.ok(html.includes('Alba'));
});
test('world panels render their own content instead of mounting every planet, port, city and sector directory together',()=>{
  const current=view(),render=(worldPanel:string)=>renderToStaticMarkup(React.createElement(FrontierWorld,{view:current,player:current.player,mode:'world',worldPanel,onSelect:()=>{}})),planet=render('planet'),settlements=render('settlements'),sectors=render('sectors');assert.ok(planet.includes('g-planet-scales'));assert.ok(!planet.includes('g-atlas-panel'));assert.ok(!planet.includes('g-settlement-list'));assert.ok(!planet.includes('g-sector-picker'));assert.ok(settlements.includes('g-settlement-list'));assert.ok(settlements.includes('Puertos de Frontera'));assert.ok(!settlements.includes('g-planet-scales'));assert.ok(sectors.includes('g-sector-picker'));assert.ok(!sectors.includes('g-atlas-panel'));assert.ok(!sectors.includes('g-planet-scales'));assert.ok((planet.match(/<button/g)??[]).length<50,'the principal scene no longer carries all settlement cards');
});
test('distinct inventory items have meaningful SSR silhouettes and stable dimensions before any WebGL atlas exists',()=>{
  for(const[id,icon]of[['timber','tree-pine'],['water','droplets'],['ration','utensils']]){const html=renderToStaticMarkup(React.createElement(ItemArt,{id,size:36}));assert.ok(html.includes(`lucide-${icon}`));assert.ok(html.includes('width:36px'));assert.ok(html.includes('height:36px'));assert.ok(!html.includes('<canvas'));}
});
test('the compact protection summary is collapsed, accessible and deterministic during SSR',()=>{
  const current=view(),html=renderToStaticMarkup(React.createElement(Protection,{protection:current.player!.starterProtection,clock:current.now,compact:true}));assert.ok(html.startsWith('<details'));assert.ok(html.includes('<summary>'));assert.ok(html.includes('Ver detalles'));assert.ok(!html.includes('<details open'));assert.ok(html.includes('hora de Costa Rica'));assert.ok(!html.includes('hora de tu dispositivo'));
});
