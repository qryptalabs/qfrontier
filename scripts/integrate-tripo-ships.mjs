import fs from 'node:fs';
function edit(path,from,to){const source=fs.readFileSync(path,'utf8');if(!source.includes(from))throw Error('Missing integration anchor '+path+' / '+from.slice(0,60));fs.writeFileSync(path,source.replace(from,to));}
const layer='lib/graphics/royal-world-layer.ts',renderer='lib/graphics/royal-harbor-renderer.ts',ui='app/graphics/royal-harbor.tsx';
edit(layer,'return {group,obstacles,surface,shop,northShop,loadPalace,metrics:','return {group,obstacles,surface,shop,northShop,loadPalace,activity,setCommerce(snapshot:RoyalHarborSnapshot){commerce=snapshot;commerceAnchor=performance.now();},metrics:');
edit(layer,'ships:fleet.length','ships:fleet.length+2');
edit(layer,'context.setView(focus,performance,level,streamed);','context.setView(focus,performance,level,streamed);galleon.setNear(Math.hypot(focus.x-site.x-9,focus.y-site.y-OFFSET-185)<480);activity.setFocus(focus.x-site.x,0,focus.y-site.y-OFFSET);');
edit(layer,'const t=reduced?0:seconds;shop.update','const t=reduced?0:seconds;galleon.update(t);activity.update(commerce?(commerce.now+performance.now()-commerceAnchor)/1000:0,commerce);shop.update');
edit(layer,'disposed=true;pinePilot.dispose();','disposed=true;galleon.dispose();activity.dispose();pinePilot.dispose();');
edit(renderer,"import {royalHarborFleetPose} from './royal-harbor-activity.ts';","import {royalWorkingFleetPose as royalHarborFleetPose,royalMaritimeLocation,ROYAL_GALLEON_WALK_ROUTE} from './royal-maritime-layout.ts';");
edit(renderer,"|'shop-stable-inside';","|'shop-stable-inside'|'ship-quay'|'ship-deck'|'ship-cabin'|'fish-quay';");
edit(renderer,'const activity=createRoyalWorldActivity(district.surface.ground);scene.add(activity.group);','const activity=district.activity;');
edit(renderer,'activity.update(commerce?(commerce.now+performance.now()-commerceAnchor)/1000:0,commerce);','');
edit(renderer,'setCommerce(snapshot){commerce=snapshot;commerceAnchor=performance.now();}','setCommerce(snapshot){commerce=snapshot;commerceAnchor=performance.now();district.setCommerce(snapshot);}');
edit(renderer,"walker=area==='shop-stable'?","walker=area==='ship-quay'?{x:28,y:district.surface.walk(28,185)!,z:185}:area==='ship-deck'?{x:11,y:1.55,z:185}:area==='ship-cabin'?{x:9,y:1.55,z:196}:area==='fish-quay'?{x:28,y:district.surface.walk(28,224)!,z:224}:area==='shop-stable'?");
edit(renderer,"yaw=area==='lookout'?0:Math.PI;","yaw=area==='ship-quay'||area==='fish-quay'?-Math.PI/2:area==='ship-deck'||area==='ship-cabin'?0:area==='lookout'?0:Math.PI;");
edit(renderer,"walkMode==='aerial'?'':stableInside", "walkMode==='aerial'?'':royalMaritimeLocation(walker.x,walker.y,walker.z)??(stableInside");
edit(renderer,'royalInteriorLocation(walker.x,walker.y,walker.z),shopCity:','royalInteriorLocation(walker.x,walker.y,walker.z)),shopCity:');
edit(renderer,"surface:shopInside(walker.x,walker.z)?'wood'", "surface:royalMaritimeLocation(walker.x,walker.y,walker.z)||shopInside(walker.x,walker.z)?'wood'");
edit(renderer,'visitStream.dispose();activity.dispose();district.dispose();','visitStream.dispose();district.dispose();');
edit(ui,'  <CityShopPanel key={playerId}',`  <div className="rh-controls"><div className="rh-interior-tools" role="group" aria-label="Barcos medievales de Tripo"><span>FLOTA DEL ALBA · TRIPO 3D</span><button disabled={!ready||kingdom.playing} onClick={()=>visit('ship-quay')}>Pasarela del galeón</button><button disabled={!ready||kingdom.playing} onClick={()=>visit('ship-deck')}>Recorrer el galeón</button><button disabled={!ready||kingdom.playing} onClick={()=>visit('ship-cabin')}>Cámara del capitán</button><button disabled={!ready||kingdom.playing} onClick={()=>visit('fish-quay')}>Muelle pesquero</button><small>Galeón atracado y transitable · Pesquero, descarga y transporte sincronizados.</small></div></div>
  <CityShopPanel key={playerId}`);
console.log('Integrated two Tripo ships in the shared district.');
