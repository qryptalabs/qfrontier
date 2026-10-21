import assert from 'node:assert/strict';
import test from 'node:test';
import { GAME_NAVIGATION_ROUTES, defaultGameNavigation, formatGameNavigation, isGamePathname, normalizeGameNavigation, parseGameNavigation, resolveOwnedProfileId, sameGameNavigation, type GameNavigation, type GameTab } from '../lib/client/navigation.ts';
import { geographicWorldBounds } from '../lib/graphics/world-navigation.ts';

const profiles=[{id:'p_alba',habitable:{buildings:[{id:'house_alba'}]}},{id:'p_luna',habitable:{buildings:[{id:'shed_luna'}]}}];
const access={profiles,selectedProfileId:'p_alba',isAdmin:false};

test('every screen and subsection has a stable Spanish URL that survives reload',()=>{
  let sections=0;
  for(const tab of Object.keys(GAME_NAVIGATION_ROUTES) as GameTab[]){
    const route=GAME_NAVIGATION_ROUTES[tab];
    assert.deepEqual(parseGameNavigation(`/${route.path}`),defaultGameNavigation(tab));
    for(const [section,path] of Object.entries(route.sections)){
      const navigation={tab,section,profileId:'p_alba'},url=formatGameNavigation(navigation);
      assert.equal(url,`/${route.path}/${path}?profile=p_alba`);
      assert.deepEqual(parseGameNavigation(url),navigation);
      assert.equal(formatGameNavigation(parseGameNavigation(url)),url);
      assert.ok(isGamePathname(`/${route.path}/${path}`));sections++;
    }
  }
  assert.equal(sections,35);
});

test('the authored kingdom has its own reloadable route while preserving the selected explorer',()=>{
  const url='/mundo/reino?profile=p_luna';
  const route=parseGameNavigation(url);
  assert.deepEqual(route,{tab:'world',section:'kingdom',profileId:'p_luna'});
  assert.equal(formatGameNavigation(normalizeGameNavigation(route,access)),url);
  assert.equal(isGamePathname('/mundo/reino'),true);
});

test('canonical paths take precedence over legacy view and section query parameters',()=>{
  assert.deepEqual(parseGameNavigation('/estacion/fabricacion?view=recorrer&section=profile'),{tab:'station',section:'craft'});
  assert.deepEqual(parseGameNavigation('/comercio/feria?view=world&section=market'),{tab:'trade',section:'npc'});
  assert.deepEqual(parseGameNavigation('/mundo/aldeas?view=regional'),{tab:'world',section:'settlements'});
  assert.equal(parseGameNavigation('/ESTACION/FABRICACION/').section,'craft');
});

test('legacy query and hash links preserve their subsection, while canonical paths and search take priority',()=>{
  assert.deepEqual(parseGameNavigation('/?view=recorrer'),{tab:'roam',section:'job'});
  assert.deepEqual(parseGameNavigation('/?view=station&section=inventory'),{tab:'station',section:'inventory'});
  assert.deepEqual(parseGameNavigation('/#/estacion/fabricacion?profile=p_luna'),{tab:'station',section:'craft',profileId:'p_luna'});
  assert.deepEqual(parseGameNavigation('/#view=recorrer&section=build'),{tab:'roam',section:'build'});
  assert.deepEqual(parseGameNavigation('/#?view=trade&section=npc'),{tab:'trade',section:'npc'});
  assert.equal(parseGameNavigation('/?profile=p_alba#/recorrer/produccion?profile=p_luna').profileId,'p_alba');
  assert.equal(parseGameNavigation('/estacion/inventario#/comercio/feria').tab,'station');
  assert.deepEqual(parseGameNavigation('/#https://foreign.invalid/estacion/fabricacion'),defaultGameNavigation());
});

test('map links retain public location, ten zoom levels and regional compatibility',()=>{
  const nav:GameNavigation={tab:'world',section:'planet',profileId:'p_alba',tileId:'t_4_4',world:{x:-408,y:-312,placeId:'city_amber',settlementId:'settlement_42',zoom:9,camera:'3d',tilt:55}};
  const url=formatGameNavigation(nav);
  assert.equal(url,'/mundo/planeta?profile=p_alba&view=regional&x=-408&y=-312&settlement=settlement_42&place=city_amber&zoom=9&camera=3d&tilt=55&tile=t_4_4');
  assert.deepEqual(parseGameNavigation(url),nav);
  assert.deepEqual(parseGameNavigation('/?view=regional&x=1152&y=6723&place=port_amber').world,{x:1152,y:6723,placeId:'port_amber'});
  assert.deepEqual(parseGameNavigation({pathname:'/mundo/sectores',search:'?x=0&y=1.5&camera=2d&zoom=10'}).world,{x:0,y:1.5,zoom:10,camera:'2d'});
});

test('coordinates are finite and constrained to the actual navigable planet',()=>{
  for(const [x,y] of [[geographicWorldBounds.minX,geographicWorldBounds.minY],[geographicWorldBounds.maxX,geographicWorldBounds.maxY]])assert.deepEqual(parseGameNavigation(`/?view=regional&x=${x}&y=${y}`).world,{x,y});
  for(const query of ['x=&y=0','x=0','x=NaN&y=0','x=Infinity&y=0','x=1e999&y=0','x=0x10&y=0','x=0&y=null',`x=${geographicWorldBounds.maxX+1}&y=0`,`x=0&y=${geographicWorldBounds.minY-1}`])assert.equal(parseGameNavigation(`/?view=regional&${query}`).world,undefined,query);
  assert.deepEqual(parseGameNavigation('/?view=regional&x=-0&y=0&zoom=11&camera=vr&tilt=29').world,{x:0,y:0});
  assert.deepEqual(parseGameNavigation('/?view=regional&x=1&y=2&zoom=1.5&tilt=76').world,{x:1,y:2});
});

test('shared links cannot select another account or derive a financial profile from a village',()=>{
  const shared=parseGameNavigation('/mundo/aldeas?profile=p_other_owner&view=regional&x=168&y=120&settlement=settlement_foreign'),normalized=normalizeGameNavigation(shared,access);
  assert.equal(normalized.profileId,'p_alba');
  assert.deepEqual(normalized.world,{x:168,y:120,settlementId:'settlement_foreign'});
  assert.equal(normalizeGameNavigation(shared,{profiles:[],isAdmin:false}).profileId,undefined);
  assert.equal(resolveOwnedProfileId('p_luna',profiles,'p_alba'),'p_luna');
  assert.equal(resolveOwnedProfileId('p_foreign',profiles,'p_luna'),'p_luna');
  assert.equal(resolveOwnedProfileId('p_foreign',profiles,'p_removed'),'p_alba');
  assert.equal(resolveOwnedProfileId(undefined,[]),undefined);
});

test('facility selection is restricted to the selected own profile and administration stays restricted',()=>{
  assert.equal(normalizeGameNavigation(parseGameNavigation('/recorrer/produccion?profile=p_luna&building=shed_luna'),access).facilityId,'shed_luna');
  assert.equal(normalizeGameNavigation(parseGameNavigation('/recorrer/produccion?profile=p_alba&building=shed_luna'),access).facilityId,undefined);
  assert.equal(normalizeGameNavigation(parseGameNavigation('/temporada/administracion'),access).section,'rewards');
  assert.equal(normalizeGameNavigation(parseGameNavigation('/temporada/administracion'),{...access,isAdmin:true}).section,'admin');
});

test('URLs omit unrelated payloads and unsafe identifiers instead of propagating private data',()=>{
  const nav=parseGameNavigation('/?view=recorrer&section=production&playerId=p_luna&facility=shed_luna&ownerId=foreign&token=secret&action=buy&redirect=https://foreign.invalid');
  assert.equal(formatGameNavigation(nav),'/recorrer/produccion?profile=p_luna&building=shed_luna');
  assert.equal(parseGameNavigation('/?profile=%3Cscript%3E').profileId,undefined);
  assert.equal(parseGameNavigation(`/?profile=${'x'.repeat(161)}`).profileId,undefined);
  assert.equal(parseGameNavigation('/?tile=t_9_1').tileId,undefined);
  assert.equal(parseGameNavigation('/estacion/resumen?building=shed_luna&x=1&y=2&tile=t_4_4').world,undefined);
});

test('unknown catch-all paths stay 404 candidates and malformed input falls back safely',()=>{
  for(const path of ['/api/unknown','/estacion/no-existe','/comercio/feria/extra','/foreign','/%ZZ','/recorrer%2fconstruir'])assert.equal(isGamePathname(path),false,path);
  assert.ok(isGamePathname('/'));
  assert.deepEqual(parseGameNavigation('http://['),defaultGameNavigation());
  assert.deepEqual(parseGameNavigation('/%ZZ'),defaultGameNavigation());
  assert.deepEqual(parseGameNavigation('/#///foreign.invalid/estacion/fabricacion'),defaultGameNavigation());
});

test('normalization does not mutate inputs and equality compares canonical destinations',()=>{
  const nav=parseGameNavigation('/?view=regional&profile=p_luna&x=1.5&y=-2&place=port_amber&tile=t_1_2'),before=JSON.stringify(nav),profileBefore=JSON.stringify(profiles),normalized=normalizeGameNavigation(nav,access);
  assert.equal(JSON.stringify(nav),before);assert.equal(JSON.stringify(profiles),profileBefore);
  assert.ok(sameGameNavigation(normalized,parseGameNavigation(formatGameNavigation(normalized))));
  assert.ok(!sameGameNavigation(normalized,{...normalized,section:'sectors'}));
});
