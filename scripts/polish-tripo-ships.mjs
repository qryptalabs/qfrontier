import fs from 'node:fs';
const path='lib/graphics/royal-harbor-renderer.ts';let s=fs.readFileSync(path,'utf8');
function replace(a,b){if(!s.includes(a))throw Error('Missing anchor '+a.slice(0,60));s=s.replace(a,b);}
replace('export interface RoyalHarborController {','export interface RoyalHarborController {watchFishing():void;');
replace('const ROYAL_HARBOR_CAMERAS:',"const royalMaritimeCabin=(x:number,y:number,z:number)=>Math.abs(x-9)<2.2&&z>=193.7&&z<198.3&&y<4.6;\nconst ROYAL_HARBOR_CAMERAS:");
s=s.replaceAll('!!royalInteriorLocation(walker.x,walker.y,walker.z)','royalMaritimeCabin(walker.x,walker.y,walker.z)||!!royalInteriorLocation(walker.x,walker.y,walker.z)');
replace('let commerce:RoyalHarborSnapshot|null=null','let watchingFishing=false;let commerce:RoyalHarborSnapshot|null=null');
replace('quays:{position:[-30,23,286],target:[120,17,130]}','quays:{position:[43,15,217],target:[9,8,185]}');
replace("area==='ship-cabin'?{x:9,y:1.55,z:196}","area==='ship-cabin'?{x:9,y:1.55,z:194.8}");
replace("setView(view){previewHandlingKind=", "setView(view){watchingFishing=false;previewHandlingKind=");
replace('visitDistrict(area){movementEnabled=true;','visitDistrict(area){watchingFishing=false;movementEnabled=true;');
replace('setWalkMode(mode){walkMode=mode;','setWalkMode(mode){watchingFishing=false;walkMode=mode;');
replace('  renderer.render(scene,camera);',`  if(watchingFishing){const p=royalHarborFleetPose(commerce,commerce?(commerce.now+now-commerceAnchor)/1000:0).boat;camera.position.lerp(new THREE.Vector3(p.x+15,12,p.z+19),1-Math.exp(-delta*2));controls.target.set(p.x,.8,p.z);camera.lookAt(controls.target);}
  renderer.render(scene,camera);`);
replace('return{watchShopHandling()',"return{watchFishing(){watchingFishing=true;watchingShopTrip=false;ownedControl=false;previewTransport=false;walkMode='aerial';route=null;flight=null;clearInput();controls.enabled=false;visitor.group.visible=false;camera.near=.1;camera.fov=48;camera.updateProjectionMatrix();const p=royalHarborFleetPose(commerce,commerce?(commerce.now+performance.now()-commerceAnchor)/1000:0).boat;camera.position.set(p.x+15,12,p.z+19);},watchShopHandling()");
fs.writeFileSync(path,s);
const ui='app/graphics/royal-harbor.tsx';let u=fs.readFileSync(ui,'utf8');const start=u.indexOf('  <div className="rh-controls"><div className="rh-interior-tools" role="group" aria-label="Barcos medievales de Tripo">'),end=u.indexOf('  <CityShopPanel key={playerId}',start);if(start<0||end<0)throw Error('Ship UI block missing');let block=u.slice(start,end).replace('Barcos medievales de Tripo','Flota del Alba').replace('FLOTA DEL ALBA · TRIPO 3D','FLOTA DEL ALBA').replace('<button disabled={!ready||kingdom.playing} onClick={()=>visit(\'ship-quay\')}>','<button disabled={!ready||kingdom.playing} onClick={()=>camera(\'quays\')}>Ver galeón</button><button disabled={!ready||kingdom.playing} onClick={()=>{setWalk(\'aerial\');controller.current?.watchFishing();}}>Seguir pesquero</button><button disabled={!ready||kingdom.playing} onClick={()=>visit(\'ship-quay\')}>');u=u.slice(0,start)+u.slice(end);const before=u.indexOf('  </div>\n  <CityShopPanel key={playerId}');if(before<0)throw Error('Control deck boundary missing');u=u.slice(0,before)+block+u.slice(before);fs.writeFileSync(ui,u);console.log('Polished cabin lighting, ship cameras and scrolling controls.');
