"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Axe, Check, CheckCircle2, CircleHelp, Clock3, Coins, Factory, Footprints, Hammer, Home, LockKeyhole, MapPin, MousePointer2, Package, Palette, Route, RotateCw, ShieldCheck, Sprout, TreePine, UserRound, Users, Warehouse, X } from "lucide-react";
import {explorationHoldAt} from "../lib/mvp/exploration-data";
import type {DistrictManualNavigationIntent} from "../lib/client/district-controls";
import type { MvpCommand } from "../lib/mvp/types";
import type { MvpView, PublicPlayer } from "../lib/mvp/view";
import type { SceneInput } from "../lib/graphics/scene-data";
import { ITEM_CATALOG } from "../lib/mvp/catalog";
import { HABITABLE_APPEARANCES, HABITABLE_BUILDING_TEMPLATES, HABITABLE_INTERACTION_RADIUS, HABITABLE_MAX_BUILDINGS, HABITABLE_POINTS, HABITABLE_PROFESSIONS, habitableCanPlace, habitablePlacementError, habitablePositionAt, type HabitableAppearance, type HabitablePoint, type HabitableProfession, type HabitableState, type HabitableTemplateId } from "../lib/mvp/habitable-data";
import { islandContains, SETTLEMENT_HALF_DEPTH, SETTLEMENT_HALF_WIDTH } from "../lib/graphics/settlement-layout";
import HabitableScene from "./graphics/habitable-scene";
import HabitableFacilities from "./habitable-facilities";
import HabitableResidents from "./habitable-residents";
import HabitableCommerce from "./habitable-commerce";
import HabitablePlacementCoordinates from "./habitable-placement";
import LandExpansion, {type LandPane} from "./land-expansion";
import HabitableNetwork from "./habitable-network";
import ConstructionMaterials from "./construction-materials";
import ProductionManager from "./production-manager";
import ManagerBuildApproval from "./manager-build-approval";
import ExplorationPanel from "./exploration-panel";
import "./habitable.css";

type Action = (command: MvpCommand) => void | Promise<void>;
export interface HabitableClientProps { view: MvpView; player: PublicPlayer; busy: boolean; act: Action; quickAct: Action; manualAct?:(command:MvpCommand)=>void; clock: number;panel?:HabitablePanel;facilityId?:string;onNavigate?:(panel:HabitablePanel,facilityId?:string)=>void }
export type HabitablePanel = "job" | "build" | "land" | "network" | "production" | "residents" | "economy" | "profile";
type Skin = "light" | "warm" | "deep";
type Hair = "brown" | "black" | "silver";
type ProfileDraft = { appearance: HabitableAppearance; profession: HabitableProfession; skin: Skin; hair: Hair };
type Placement = { templateId: HabitableTemplateId; rotation: 0 | 1 | 2 | 3; point?: HabitablePoint };
const SKINS: {id: Skin; label: string; color: string}[] = [{id:"light",label:"Clara",color:"#d9b18a"},{id:"warm",label:"Cálida",color:"#c99a73"},{id:"deep",label:"Profunda",color:"#94674d"}];
const HAIRS: {id: Hair; label: string; color: string}[] = [{id:"brown",label:"Castaño",color:"#574331"},{id:"black",label:"Negro",color:"#282c2b"},{id:"silver",label:"Plateado",color:"#c9cbc1"}];
const COATS: Record<HabitableAppearance, string> = {amber:"#ae8550",pine:"#68814e",frost:"#6f98a5"};
const templateIcons = {shed: Warehouse, workbench: Hammer, planter: Sprout, house: Home,woodlot:TreePine,sawmill:Factory};
const templateDescriptions = {shed:"Un almacén propio que suministra insumos y recibe las entregas de tus habitantes con lotes trazables.",workbench:"Una mesa donde un habitante fabrica y lleva los productos al cobertizo.",planter:"Un habitante atiende el cultivo y transporta la cosecha al cobertizo usando insumos y cuotas reales.",house:"Una vivienda terminada habilita dos plazas adicionales. Después podés incorporar habitantes desde su panel.",woodlot:"Un puesto forestal para extraer madera de reservas existentes, con existencias y cuota limitadas.",sawmill:"Un aserradero que recoge dos maderas del cobertizo y produce un tablón por ciclo de 60 segundos."};
const timeLabel = (seconds: number) => {
  const total=Math.max(0,Math.ceil(seconds));
  if(total<60)return `${total} s`;
  if(total<3600)return `${Math.floor(total/60)} min${total%60?` ${total%60} s`:""}`;
  return `${Math.floor(total/3600)} h${Math.floor(total%3600/60)?` ${Math.floor(total%3600/60)} min`:""}`;
};
const coords = (point: HabitablePoint) => `X ${point.x.toFixed(1)} · Y ${point.y.toFixed(1)}`;
const itemLabel = (id: string) => ITEM_CATALOG[id as keyof typeof ITEM_CATALOG]?.name ?? id;

/** The portrait is a preview only; the world always renders the saved server appearance. */
function Portrait({appearance, skin, hair}: Pick<ProfileDraft,"appearance"|"skin"|"hair">) {
  const face=SKINS.find(item=>item.id===skin)!.color, crown=HAIRS.find(item=>item.id===hair)!.color, coat=COATS[appearance];
  return <svg viewBox="0 0 48 64" fill="none" aria-hidden="true" shapeRendering="crispEdges">
    <path fill="#10251c" d="M13 58h23v4H13z"/>
    <path fill="#3f493b" d="M15 42h8v16h-8zm11 0h8v16h-8z"/>
    <path fill="#2e342c" d="M13 56h11v5H13zm12 0h11v5H25z"/>
    <path fill={coat} d="M13 26h22v20H13zm-5 4h6v15H8zm27 0h6v15h-6z"/>
    <path fill="#d9c89a" d="M13 27h5v5h-5zm17 0h5v5h-5z"/>
    <path fill="#e0b96f" d="M23 31h2v11h-2z"/>
    <path fill="#705139" d="M13 41h22v4H13z"/>
    <path fill="#dabd7d" d="M22 40h5v5h-5z"/>
    <path fill={face} d="M8 44h6v5H8zm27 0h6v5h-6zM21 22h7v7h-7zM15 9h20v15H15zm-3 5h3v6h-3zm23 0h3v6h-3z"/>
    <path fill={crown} d="M15 5h17v3h4v7h-5v-4H17v5h-3V9h1zm-1 9h3v7h-3zm19 0h3v6h-3z"/>
    <path fill="#202e26" d="M20 16h2v2h-2zm9 0h2v2h-2z"/>
    <path fill="#9d6e4d" d="M24 21h4v1h-4z"/>
    <path fill="#f0d597" opacity=".35" d="M15 30h3v10h-3z"/>
  </svg>;
}

function Wardrobe({state, playerName, busy, onSave}: {state:HabitableState;playerName:string;busy:boolean;onSave:(draft:ProfileDraft)=>void}) {
  const [draft,setDraft]=useState<ProfileDraft>(()=>({appearance:state.appearance,profession:state.profession,skin:state.skin??"warm",hair:state.hair??"brown"}));
  const dirty=draft.appearance!==state.appearance||draft.profession!==state.profession||draft.skin!==(state.skin??"warm")||draft.hair!==(state.hair??"brown");
  return <form className="h-wardrobe" onSubmit={event=>{event.preventDefault();onSave(draft);}}>
    <div className="h-profile-portrait large"><Portrait {...draft}/></div>
    <p className="h-inline-note"><UserRound size={15}/><span>{playerName} · La apariencia se guarda para tus próximas visitas.</span></p>
    <fieldset className="h-swatch-field" disabled={busy}><legend>Conjunto</legend><div className="h-wardrobe-preset">{HABITABLE_APPEARANCES.map(item=><button type="button" className={`h-preset ${draft.appearance===item.id?"active":""}`} aria-pressed={draft.appearance===item.id} onClick={()=>setDraft(value=>({...value,appearance:item.id}))} key={item.id}>{item.label}</button>)}</div></fieldset>
    <fieldset className="h-swatch-field" disabled={busy}><legend>Tono de piel</legend><div className="h-swatches">{SKINS.map(item=><button type="button" className="h-swatch" style={{background:item.color}} aria-label={`Piel ${item.label.toLocaleLowerCase("es")}`} title={item.label} aria-pressed={draft.skin===item.id} key={item.id} onClick={()=>setDraft(value=>({...value,skin:item.id}))}>{draft.skin===item.id&&<Check/>}</button>)}</div></fieldset>
    <fieldset className="h-swatch-field" disabled={busy}><legend>Cabello</legend><div className="h-swatches">{HAIRS.map(item=><button type="button" className="h-swatch" style={{background:item.color}} aria-label={`Cabello ${item.label.toLocaleLowerCase("es")}`} title={item.label} aria-pressed={draft.hair===item.id} key={item.id} onClick={()=>setDraft(value=>({...value,hair:item.id}))}>{draft.hair===item.id&&<Check/>}</button>)}</div></fieldset>
    <label>Oficio preferido<select value={draft.profession} disabled={busy} onChange={event=>setDraft(value=>({...value,profession:event.target.value as HabitableProfession}))}>{HABITABLE_PROFESSIONS.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    <p className="h-inline-note"><CircleHelp size={15}/><span>El oficio expresa tu preferencia. Podés cambiarlo y realizar el encargo con cualquiera de ellos.</span></p>
    <button className="h-button full" type="submit" disabled={busy||!dirty}><CheckCircle2/>{busy?"Guardando…":dirty?"Guardar personaje":"Personaje guardado"}</button>
  </form>;
}

export default function HabitableClient(props:HabitableClientProps) {
  const state=props.player.habitable;
  if(!state)return <section className="q-habitable"><header className="h-heading"><div><div className="h-eyebrow">QFrontier · Vida en la frontera</div><h1>Un lugar para empezar</h1><p>Tu personaje, una parcela propia y un primer trabajo en el distrito.</p></div></header><div className="h-empty"><h2>Entrá al distrito</h2><p>Conservás tu aldea y tus recursos. Elegí tu personaje y comenzá a recorrer tu parcela.</p><div className="h-button-row"><button className="h-button" disabled={props.busy} onClick={()=>void props.quickAct({type:"habitat.profile",playerId:props.player.id,appearance:"amber",profession:"carpenter",skin:"warm",hair:"brown"})}><Footprints/>Entrar al distrito<ArrowRight/></button></div></div></section>;
  return <HabitableDistrict key={props.player.id} {...props} state={state}/>;
}

function HabitableDistrict({view,player,busy,act,quickAct,manualAct,clock,state,panel:controlledPanel,facilityId,onNavigate}:HabitableClientProps&{state:HabitableState}) {
  const [localPanel,setLocalPanel]=useState<HabitablePanel>("job");
  const [landSelection,setLandSelection]=useState<string[]>([]);
  const [landPane,setLandPane]=useState<LandPane>('plots');
  const buildingCapacity=view.land?.playerId===player.id?view.land.capacity.max:HABITABLE_MAX_BUILDINGS;
  const panel=controlledPanel??localPanel;
  const [quality,setQuality]=useState<SceneInput["quality"]>("auto");
  const [reducedMotion,setReducedMotion]=useState(false);
  const [placementDraft,setPlacement]=useState<Placement>();
  const [placementNotice,setPlacementNotice]=useState("");
  const [explorationNotice,setExplorationNotice]=useState("");
  const [buildSupplyId,setBuildSupplyId]=useState("");
  const [constructorId,setConstructorId]=useState("");
  const [selectedPoint,setSelectedPoint]=useState<string>("contractor");
  const [localFacilityId,setLocalFacilityId]=useState<string>();
  const selectedFacilityId=onNavigate?facilityId:localFacilityId;
  const setPanel=(next:HabitablePanel)=>onNavigate?onNavigate(next,selectedFacilityId):setLocalPanel(next);
  const setSelectedFacilityId=(id:string)=>onNavigate?onNavigate(panel,id):setLocalFacilityId(id);
  useEffect(()=>{const media=window.matchMedia("(prefers-reduced-motion: reduce)");const update=()=>setReducedMotion(media.matches);update();media.addEventListener("change",update);return()=>media.removeEventListener("change",update);},[]);
  const exploration=view.habitable.exploration;
  const outside=!!state.exploration;
  const position=outside?exploration.position:habitablePositionAt(state,clock);
  const moving=outside?!!state.exploration?.movement&&state.exploration.movement.endsAt>clock:!!state.movement&&state.movement.endsAt>clock;
  const explorationMovement=outside&&moving&&!state.exploration?.movement?.manualSessionId?state.exploration?.movement:undefined;
  const transportLeg=explorationMovement?.legs?.find(leg=>clock>=leg.startsAt&&clock<leg.endsAt);
  const trafficHold=explorationHoldAt(explorationMovement,clock);
  const journey=explorationMovement?{waiting:!!trafficHold,mode:transportLeg?.mode??'walk' as const,remainingLabel:timeLabel(((trafficHold?.endsAt??explorationMovement.endsAt)-clock)/1000),canStop:exploration.canStop&&transportLeg?.mode!=='boat'}:undefined;
  const placement=!outside&&placementDraft&& !state.buildings.some(building=>building.templateId===placementDraft.templateId&&placementDraft.point&&building.x===placementDraft.point.x&&building.y===placementDraft.point.y)?placementDraft:undefined;
  const input=useMemo<SceneInput>(()=>({view,player,selected:player.position,mode:"settlement",quality,reducedMotion}),[view,player,quality,reducedMotion]);
  const command=useCallback((type:string,fields:Record<string,unknown>={})=>void act({type,playerId:player.id,...fields}),[act,player.id]);
  const manualNavigation=useCallback((intent:DistrictManualNavigationIntent)=>{manualAct?.({type:"habitat.walk.input",playerId:player.id,...intent});},[manualAct,player.id]);
  const move=useCallback((point:HabitablePoint)=>{if(!busy)void quickAct({type:outside?"habitat.explore.walk":"habitat.walk",playerId:player.id,x:point.x,y:point.y});},[busy,quickAct,player.id,outside]);
  const exploreCommand=(type:string,fields:Record<string,unknown>={})=>{if(busy)return;setPlacement(undefined);setExplorationNotice("");if(type==="habitat.explore.leave")setPanel("job");void quickAct({type,playerId:player.id,...fields});};
  const nearby=(id:string)=>{const point=HABITABLE_POINTS.find(item=>item.id===id);return !outside&&!!point&&Math.hypot(point.x-position.x,point.y-position.y)<=HABITABLE_INTERACTION_RADIUS&&!moving;};
  const goTo=(id:string)=>{const point=HABITABLE_POINTS.find(item=>item.id===id);if(point){setPlacement(undefined);setSelectedPoint(id);move(point);}};
  const openFacility=(id:string)=>{if(onNavigate)onNavigate('production',id);else{setLocalFacilityId(id);setLocalPanel('production');}setPlacement(undefined);};
  const openResidents=()=>{setPanel("residents");setPlacement(undefined);};
  const openNetwork=(id?:string)=>{if(onNavigate)onNavigate("network",id);else{setLocalFacilityId(id);setLocalPanel("network");}setPlacement(undefined);};
  const buildFromShed=(id:string)=>{setBuildSupplyId(id);setPanel("build");setPlacement(undefined);};
  const openEconomy=(id:string)=>{if(onNavigate)onNavigate('economy',id);else{setLocalFacilityId(id);setLocalPanel('economy');}setPlacement(undefined);};
  const interact=(id:string)=>{if(outside){const destination=exploration.destinations.find(item=>id===`exploration:${item.id}`);if(destination)setExplorationNotice(`Estás en ${destination.name}. Podés recorrer sus calles con tu personaje; sus comercios se habilitarán en una fase posterior.`);return;}const buildingId=id.startsWith("building:")?id.slice("building:".length):id;if(state.buildings.some(building=>building.id===buildingId)){openFacility(buildingId);return;}if(HABITABLE_POINTS.some(item=>item.id===id)){setSelectedPoint(id);setPanel("job");setPlacement(undefined);}};
  const total=(itemId:string,transferable=false)=>player.inventory.filter(lot=>lot.itemId===itemId&&(!transferable||!lot.bound)&&(!lot.expiresAt||lot.expiresAt>clock)).reduce((sum,lot)=>sum+lot.qty,0);
  const buildingAccess=(id:HabitableTemplateId)=>view.unlocks?.playerId===player.id?view.unlocks.buildings.find(item=>item.id===id):undefined;
  const buildingLocked=(id:HabitableTemplateId)=>buildingAccess(id)?.unlocked===false;
  const beginPlacement=(id:HabitableTemplateId)=>{setPanel("build");setPlacement(buildingLocked(id)?undefined:{templateId:id,rotation:0});setPlacementNotice("");};
  const template=placement&&HABITABLE_BUILDING_TEMPLATES.find(item=>item.id===placement.templateId);
  const placementAccess=placement&&buildingAccess(placement.templateId);
  const placementLocked=placementAccess?.unlocked===false;
  const managerPlan=view.habitable.manager?.plan??null;
  const buildShed=state.buildings.find(b=>b.id===buildSupplyId&&b.templateId==="shed"&&b.endsAt<=clock&&!b.demolition);
  const buildSourceMissing=!!buildSupplyId&&!buildShed;
  const buildStock=(id:string)=>buildSourceMissing?0:buildShed?(buildShed.storage??[]).filter(l=>l.itemId===id&&(!l.expiresAt||l.expiresAt>clock)).reduce((n,l)=>n+l.qty,0):total(id);
  const builders=view.habitable.residents.residents.filter(r=>!r.busy&&!r.assignmentBuildingId);
  const selectedBuilder=constructorId?builders.find(r=>r.id===constructorId):builders[0];
  const constructorMissing=!!constructorId&&!selectedBuilder;
  const enough=!buildSourceMissing&&!!template&&template.costs.every(cost=>buildStock(cost.itemId)>=cost.qty)&&(!buildShed||!view.habitable.residents.initialized||!!selectedBuilder);
  const placementError=placement?.point?habitablePlacementError(state,{templateId:placement.templateId,rotation:placement.rotation,...placement.point},clock):null;
  // One bounded search on demand. A suggestion never submits or spends anything.
  const suggestPlacement=()=>{
    if(!placement||busy||moving||placementLocked)return;
    const candidates:HabitablePoint[]=[{x:-2,y:-8},{x:-3,y:1},{x:7,y:3},{x:-2,y:-8.5},{x:1,y:-9},{x:0,y:-8},{x:7,y:-1.5}];
    for(let ring=0;ring<=Math.ceil(SETTLEMENT_HALF_WIDTH*2);ring++)for(let x=-ring;x<=ring;x++)for(let y=-ring;y<=ring;y++){
      if(Math.max(Math.abs(x),Math.abs(y))!==ring)continue;
      const point={x:x/2,y:y/2};
      if(Math.abs(point.x)>=SETTLEMENT_HALF_WIDTH||Math.abs(point.y)>=SETTLEMENT_HALF_DEPTH||!islandContains(point.x,point.y))continue;
      candidates.push(point);
    }
    const available=candidates.find(point=>islandContains(point.x,point.y)&&habitableCanPlace(state,{templateId:placement.templateId,rotation:placement.rotation,...point},clock));
    if(available){setPlacement({...placement,point:available});setPlacementNotice("Ubicación sugerida. Podés cambiarla antes de revisar la construcción.");}
    else setPlacementNotice("No encontramos espacio libre para este plano y giro. Probá otra orientación o una obra más pequeña.");
  };
  const currentPoint=HABITABLE_POINTS.find(item=>item.id===selectedPoint);
  const credits=view.social.account?.credits??0;

  return <section className="q-habitable" aria-label="Distrito habitable">
    <header className="h-heading"><div><div className="h-eyebrow">QFrontier · Vida en la frontera</div><h1>{outside?"Recorré la frontera":"Tu historia empieza acá"}</h1><p>{outside?"Caminá por el mundo, seguí una ruta y descubrí otras comunidades con tu personaje.":"Recorré tu parcela, construí tu espacio y completá tu primer encargo del distrito."}</p></div><span className="h-heading-status"><ShieldCheck size={18}/>{outside?"Mundo compartido · A pie":"Parcela propia · Zona segura"}</span></header>
    <div className="h-main">
      <div className="h-stage-column">
        <div className="h-scene-frame"><HabitableScene input={input} state={state} placement={placement} navigationDisabled={busy} journey={journey} onStopJourney={()=>exploreCommand("habitat.explore.stop")} onMove={move} onManualNavigation={manualAct?manualNavigation:undefined} onInteract={interact} onPlace={point=>setPlacement(current=>current?{...current,point}:undefined)} landMode={!outside&&panel==="land"&&landPane!=="demolish"} landSelection={landSelection} selectedBuildingId={panel==="network"||panel==="production"?selectedFacilityId??state.buildings[0]?.id:undefined} onLandCell={id=>setLandSelection([id])}/><div className="h-scene-caption"><div><strong>{outside?(exploration.destinations.find(item=>item.id===exploration.destinationId)?.name??"Exploración de la frontera"):player.stationName}</strong><small><Footprints size={12}/>{outside?"Mundo abierto · Coordenadas globales":panel==="land"?landPane==="demolish"?"Desmontaje · Acercate al acceso de tu obra":"Planificación del terreno · Seleccioná casillas":placement?"Elegí un lugar para tu obra":"Distrito habitable · Tu parcela"}</small></div></div></div>
        <div className="h-controls"><p><MousePointer2 size={15}/>{outside?<>Flechas o joystick para caminar. Mirá alrededor y trazá una ruta desde Viajar. Detené la ruta antes de tomar el control.</>:panel==="land"?landPane==="demolish"?"Caminá hasta el acceso de tu construcción para revisar su desmontaje.":"Tocá una casilla del suelo para seleccionarla. Las acciones se revisan en Terreno.":placement?"Tocá el suelo para fijar el plano. Después revisá la construcción.":<>Usá las flechas o WASD para caminar y arrastrá para mirar. En móvil, usá el joystick.</>}</p><label className="h-quality">Calidad<select aria-label="Calidad del distrito" value={quality} onChange={event=>setQuality(event.target.value as SceneInput["quality"])}><option value="auto">Adaptable</option><option value="performance">Rendimiento</option><option value="fullhd">Full HD</option><option value="4k">Ultra · 4K</option></select></label></div>
        <ExplorationPanel exploration={exploration} busy={busy} clock={clock} stationName={player.stationName} onCommand={exploreCommand}/>
        {outside&&explorationNotice&&<p className="h-inline-note" role="status"><MapPin size={15}/>{explorationNotice}</p>}
        <div className="h-stock-grid"><div className="h-stock"><TreePine/><div><strong>{total("timber")}</strong><span>Madera · {total("timber",true)} transferible</span></div></div><div className="h-stock"><Package/><div><strong>{total("plank")}</strong><span>Tablones · {total("plank",true)} transferibles</span></div></div><div className="h-stock"><Coins/><div><strong>{credits}</strong><span>Créditos del juego</span></div></div></div>
        <div className="h-scope"><CircleHelp size={17}/><p>Conectá tus oficios: el puesto forestal extrae madera de reservas reales, el aserradero recoge sus insumos del cobertizo y produce tablones. Desde Economía podés preparar contratos y seguir la carga hasta su pago confirmado. Habitantes organiza los puestos y las viviendas amplían la comunidad.</p></div>
      </div>
      <aside className="h-sidebar" aria-label="Tu personaje y actividades">
        <section className="h-card h-profile-card"><div className="h-profile"><div className="h-profile-portrait"><Portrait appearance={state.appearance} skin={state.skin??"warm"} hair={state.hair??"brown"}/></div><div><h2 className="h-profile-name">{player.name}</h2><p className="h-profile-meta">{HABITABLE_PROFESSIONS.find(item=>item.id===state.profession)?.label} · {moving?"En camino":`${outside?"Mundo · ":""}${coords(position)}`}</p><button className="h-profile-edit" onClick={()=>{setPanel("profile");setPlacement(undefined);}}><Palette size={13}/>Personalizar personaje</button></div></div><nav className="h-tabs h-tabs-six" aria-label="Actividades del distrito">{([{id:"job",label:"Encargo",icon:Axe},{id:"build",label:"Construir",icon:Hammer},{id:"land",label:"Terreno",icon:MapPin},{id:"network",label:"Circuito",icon:Route},{id:"production",label:"Producción",icon:Warehouse},{id:"residents",label:"Habitantes",icon:Users},{id:"economy",label:"Economía",icon:Coins},{id:"profile",label:"Personaje",icon:UserRound}]as const).map(({id,label,icon:Icon})=><button key={id} className={panel===id?"active":""} aria-pressed={panel===id} disabled={outside&&id!=="profile"} title={outside&&id!=="profile"?"Regresá a tu aldea para gestionar sus instalaciones.":undefined} onClick={()=>{setPanel(id);if(id!=="build")setPlacement(undefined);}}><Icon size={14}/>{label}</button>)}</nav></section>
        {outside&&panel!=="profile"?<section className="h-card"><div className="h-card-head"><h2><Home/>Tu aldea sigue en pie</h2></div><div className="h-card-body"><p>Las tareas que ya aprobaste siguen su curso. Regresá a casa para construir, fabricar o usar las instalaciones del distrito.</p><p>Tu inventario y tu progreso se conservan durante el viaje.</p></div></section>:panel==="profile"?<section className="h-card"><Wardrobe state={state} playerName={player.name} busy={busy} onSave={draft=>void quickAct({type:"habitat.profile",playerId:player.id,...draft})}/></section>:panel==="land"?<LandExpansion view={view} player={player} busy={busy} clock={clock} selected={landSelection} onSelect={setLandSelection} pane={landPane} onPaneChange={setLandPane} act={act} onFacility={openFacility} onResidents={openResidents} onBuild={point=>{setPanel("build");setPlacement({templateId:"shed",rotation:0,point});setPlacementNotice("");}}/>:panel==="network"?<HabitableNetwork view={view} player={player} state={state} clock={clock} busy={busy} selectedId={selectedFacilityId} onSelect={setSelectedFacilityId} onFacility={openFacility} onResidents={openResidents} onLand={()=>{setLandPane("works");setPanel("land");}} onBuild={buildFromShed} manager={<ProductionManager manager={view.habitable.manager} playerId={player.id} clock={clock} busy={busy} act={act} onFacility={openFacility} onResidents={openResidents} onLand={()=>{setLandPane("works");setPanel("land");}} onBuild={buildFromShed}/>}/>:panel==="production"?<HabitableFacilities view={view} player={player} state={state} clock={clock} busy={busy} act={act} quickAct={quickAct} selectedId={selectedFacilityId} onSelect={setSelectedFacilityId} onBuild={()=>{setPanel("build");setPlacement(undefined);}} onResidents={openResidents} onEconomy={openEconomy} onNetwork={openNetwork}/>:panel==="residents"?<HabitableResidents view={view} player={player} state={state} clock={clock} busy={busy} act={act} quickAct={quickAct} onFacility={openFacility} onBuildHouse={()=>beginPlacement("house")}/>:panel==="economy"?<HabitableCommerce view={view} player={player} state={state} clock={clock} busy={busy} act={act} quickAct={quickAct} preferredShedId={selectedFacilityId} onFacility={openFacility} onResidents={openResidents} onBuildShed={()=>beginPlacement("shed")}/>:panel==="build"?<section className="h-card"><div className="h-card-head"><h2><Hammer/>Construí tu espacio</h2><span>{state.buildings.length} / {buildingCapacity}</span></div><div className="h-card-body"><p>Elegí un plano, ubicá su huella en el suelo y revisá los materiales antes de confirmar.</p><div className="h-template-list">{HABITABLE_BUILDING_TEMPLATES.map(item=>{const Icon=templateIcons[item.id],access=buildingAccess(item.id),locked=access?.unlocked===false;return <button className={`h-template ${placement?.templateId===item.id?"selected":""}`} aria-pressed={placement?.templateId===item.id} disabled={busy||locked||state.buildings.length>=buildingCapacity} title={locked?`Explorador nivel ${access.requiredLevel}`:undefined} key={item.id} onClick={()=>beginPlacement(item.id)}><Icon/><span><strong>{item.label}</strong><small>{item.width} × {item.depth} · {timeLabel(item.seconds)}</small>{locked&&<small><LockKeyhole size={12}/>Explorador nivel {access.requiredLevel}</small>}</span>{locked?<LockKeyhole/>:placement?.templateId===item.id?<Check/>:<ArrowRight/>}</button>;})}</div>{placement&&template&&<div className="h-placement"><div className="h-placement-title"><strong>{template.label}</strong><button className="h-button secondary small" disabled={busy} aria-label="Girar plano 90 grados" onClick={()=>setPlacement(current=>current?{...current,rotation:((current.rotation+1)%4)as Placement["rotation"]}:undefined)}><RotateCw/>{placement.rotation*90}°</button></div><p className="h-placement-point">{placement.point?coords(placement.point):"Tocá un espacio libre de tu parcela."}</p><HabitablePlacementCoordinates key={placement.templateId} point={placement.point} disabled={busy||moving} halfWidth={17.4} halfDepth={17.4} onChange={point=>{setPlacement(current=>current?{...current,point}:undefined);setPlacementNotice("");}}/><button type="button" className="h-button secondary small full" disabled={busy||moving||placementLocked} onClick={suggestPlacement}><MapPin/>Sugerir espacio libre</button>{placementNotice&&<p className="h-inline-note" role="status">{placementNotice}</p>}<p className="h-inline-note">{templateDescriptions[template.id]}</p><ConstructionMaterials state={state} template={template} clock={clock} busy={busy} sourceId={buildSupplyId} onSource={setBuildSupplyId} residentId={constructorId||selectedBuilder?.id||""} onResident={setConstructorId} residents={view.habitable.residents} onResidents={openResidents}/><div className="h-costs">{template.costs.map(cost=><span className={`h-cost ${buildStock(cost.itemId)<cost.qty?"missing":""}`} key={cost.itemId}><Package/>{cost.qty} {itemLabel(cost.itemId)} · {buildStock(cost.itemId)} disponibles</span>)}</div><ManagerBuildApproval planId={managerPlan?.id??null} planSourceId={managerPlan?.supplyShedId??null} sourceId={buildSupplyId} queued={managerPlan?.approvals.filter(a=>a.status==="approved").length??0} template={template} point={placement.point} busy={busy} invalidReason={placementLocked?`Explorador nivel ${placementAccess?.requiredLevel} requerido.`:buildSourceMissing?"El cobertizo elegido dejó de estar disponible.":moving?"Esperá a que termine el paseo.":placementError??(managerPlan&&!managerPlan.canApprove?"El encargado no admite nuevos planos ahora. Revisá su estado en Circuito.":null)} onConfigure={()=>openNetwork()} onSource={setBuildSupplyId} onReview={()=>{if(placement.point&&managerPlan)command("habitat.manager.approve-build",{planId:managerPlan.id,templateId:placement.templateId,rotation:placement.rotation,...placement.point,...((constructorId||selectedBuilder?.id)?{residentId:constructorId||selectedBuilder?.id}:{})});}}/><div className="h-button-row"><button className="h-button" disabled={busy||placementLocked||!placement.point||!enough||moving||!!placementError} onClick={()=>{if(placement.point&&!placementLocked)command("habitat.build",{templateId:placement.templateId,rotation:placement.rotation,...placement.point,...(buildShed?{supplyShedId:buildShed.id,...(selectedBuilder?{residentId:selectedBuilder.id}:{})}:{})});}}><Hammer/>Revisar construcción</button><button className="h-button secondary" disabled={busy} onClick={()=>setPlacement(undefined)} aria-label="Cancelar colocación"><X/>Cancelar</button></div><p className="h-inline-note" role={placementError||placementLocked?"status":undefined}><ShieldCheck size={14}/><span>{placementLocked?`Explorador nivel ${placementAccess.requiredLevel} requerido para construir este plano.`:buildSourceMissing?"El origen seleccionado dejó de estar disponible. Elegí otro antes de revisar.":moving?"Esperá a que tu personaje termine de caminar.":placementError??(!placement.point?"Ubicá el plano en suelo libre para comprobarlo.":!enough?buildShed&&constructorMissing?"El constructor seleccionado ya no está disponible. Elegí otro.":buildShed&&view.habitable.residents.initialized&&!selectedBuilder?"Liberá un habitante para construir y esperá a que termine su traslado.":"Necesitás los materiales indicados en el origen seleccionado para levantar esta obra.":"El plano respeta caminos, agua, edificios y el límite de tu parcela.")}</span></p></div>}{state.buildings.length>0&&<div className="h-buildings">{state.buildings.map(building=>{const plan=HABITABLE_BUILDING_TEMPLATES.find(item=>item.id===building.templateId)!,Icon=templateIcons[building.templateId],remaining=Math.max(0,(building.endsAt-clock)/1000);return <button type="button" className="h-built h-built-button" key={building.id} aria-label={`Abrir ${plan.label} en X ${building.x}, Y ${building.y}`} onClick={()=>openFacility(building.id)}><Icon size={18}/><div>{plan.label}<small>{remaining>0?`${building.constructionVisual&&clock<building.startsAt?"Abasteciendo":"En construcción"} · ${timeLabel(remaining)}`:"Abrir producción"} · {coords(building)}</small></div><ArrowRight/></button>;})}</div>}</div></section>:<section className="h-card"><div className="h-card-head"><h2><Axe/>Un encargo para empezar</h2></div><div className="h-card-body"><p>Cuatro unidades de madera de una reserva real se transforman en dos tablones para el distrito.</p>{currentPoint&&<div className="h-nearby"><MapPin size={16}/><span>{currentPoint.label} · {nearby(currentPoint.id)?"Estás cerca":`${Math.hypot(currentPoint.x-position.x,currentPoint.y-position.y).toFixed(1)} m`}</span></div>}<JobPanel view={view} state={state} clock={clock} busy={busy} moving={moving} nearby={nearby} goTo={goTo} command={command}/></div></section>}
        <section className="h-card"><div className="h-card-head"><h2><Warehouse/>Existencias de la estación</h2><span>Inventario real</span></div><div className="h-card-body"><div className="h-stock-ledger">{["timber","plank","stone","fiber"].map(id=><div className="h-stock-row" key={id}><span>{id==="timber"?<TreePine size={14}/>:<Package size={14}/>} {itemLabel(id)}</span><strong>{total(id)}<small>{total(id,true)} transf.</small></strong></div>)}</div></div><p className="h-stock-help"><ShieldCheck size={14}/><span>Los insumos del tutorial y sus productos siguen vinculados. El encargo utiliza recursos transferibles.</span></p></section>
      </aside>
    </div>
  </section>;
}

function JobPanel({view,state,clock,busy,moving,nearby,goTo,command}:{view:MvpView;state:HabitableState;clock:number;busy:boolean;moving:boolean;nearby:(id:string)=>boolean;goTo:(id:string)=>void;command:(type:string,fields?:Record<string,unknown>)=>void}) {
  const summary=view.habitable.job,step=summary.step;
  const index=step==="accepted"||step==="extracting"?1:step==="timber"||step==="crafting"?2:step==="planks"?3:step==="completed"?4:0;
  const runningId=step==="crafting"?state.job?.craftJobId:step==="extracting"?state.job?.extractionJobId:undefined;
  const running=view.jobs.find(job=>job.id===runningId);
  const remaining=running?Math.max(0,Math.ceil((running.endsAt-clock)/1000)):summary.remainingSeconds;
  const progress=running?Math.max(0,Math.min(100,(clock-running.startsAt)/Math.max(1,running.endsAt-running.startsAt)*100)):0;
  const queued=!!running&&running.startsAt>clock;
  const sameAccountJob=view.players.some(other=>other.id!==view.player?.id&&!!other.habitable?.job);
  const steps=[
    {id:"contractor" as const,title:"Aceptá el encargo",description:`El distrito reserva ${summary.rewardCredits} créditos y cuatro maderas de un yacimiento existente.`,action:"habitat.job.accept",label:"Revisar encargo",go:"Ir a la encargada"},
    {id:"wood" as const,title:"Retirá cuatro maderas",description:"El puesto forestal entrega la reserva con su origen registrado.",action:"habitat.job.extract",label:"Retirar madera",go:"Ir al puesto forestal"},
    {id:"sawmill" as const,title:"Prepará dos tablones",description:"El aserradero usa la receta original y consume las cuatro maderas del encargo.",action:"habitat.job.craft",label:"Fabricar tablones",go:"Ir al aserradero"},
    {id:"delivery" as const,title:"Entregá y cobrá",description:"La recepción verifica los dos tablones y libera el pago reservado.",action:"habitat.job.deliver",label:"Entregar y cobrar",go:"Ir a recepción"},
  ];
  return <>
    <ol className="h-steps" aria-label="Pasos del encargo">{steps.map((item,i)=>{const waiting=i===index&&(step==="extracting"||step==="crafting"),atPoint=summary.near[item.id]&&!moving;return <li key={item.id} className={i<index?"done":i===index?"current":""} aria-current={i===index?"step":undefined}><span className="h-step-index">{i<index?<Check size={13}/>:i+1}</span><div><h3>{item.title}</h3><p>{item.description}</p>{i===index&&<div className="h-step-action">{waiting?<div className="h-progress" role="status"><div className="h-progress-top"><span>{queued?"En la cola del taller":step==="extracting"?"Retirando la reserva":"Fabricando tablones"}</span><strong>{remaining?timeLabel(remaining):"Actualizando…"}</strong></div><div className="h-progress-track" role="progressbar" aria-label={step==="extracting"?"Progreso de extracción":"Progreso de fabricación"} aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${progress}%`}}/></div><small>{queued?"La fabricación empezará al liberarse el taller.":remaining?"Podés recorrer la parcela mientras termina esta orden.":"Esperando la confirmación del servidor."}</small></div>:<button className={`h-button ${atPoint?"":"secondary"} full`} disabled={busy||moving||(i===0&&!summary.canAccept)||(!atPoint&&nearby(item.id))} onClick={()=>atPoint?command(item.action):goTo(item.id)}>{atPoint?(i===3?<Coins/>:<Hammer/>):<Footprints/>}{moving?"En camino…":!atPoint&&nearby(item.id)?"Confirmando llegada…":atPoint?item.label:item.go}{!atPoint&&!moving&&<ArrowRight/>}</button>}</div>}</div></li>;})}</ol>
    {summary.sourceTileId&&<p className="h-inline-note"><TreePine size={14}/><span>Reserva forestal del distrito · {summary.sourceName??summary.sourceTileId} ({summary.sourceTileId}). La extracción conserva ese origen; tu expedición no cambia de sector.</span></p>}
    {index===0&&!summary.canAccept&&<p className="h-inline-note" role="status"><CircleHelp size={14}/><span>{sameAccountJob?"El encargo inicial ya está registrado en otro explorador de tu cuenta.":"El encargo no está disponible con el presupuesto actual del distrito."}</span></p>}
    {step==="cancelled"&&<p className="h-inline-note"><CircleHelp size={14}/><span>El encargo se cerró. La madera ya extraída conserva su procedencia; revisá la oferta para continuar según el estado guardado.</span></p>}
    <div className="h-reward"><Coins size={26}/><div><strong>{summary.rewardCredits} créditos</strong><span>{step==="completed"?"Entrega completada · Cobro confirmado en tu saldo":state.job?.status==="active"?`${state.job.escrow} créditos reservados para tu entrega`:"Pago al completar el encargo · Una vez por cuenta"}</span></div></div>
    {view.boosts?.passes&&<p className="h-inline-note"><ShieldCheck size={14}/><span>La entrega pagada del distrito también concede un pase de potenciador, una sola vez por cuenta. Se suma automáticamente; aceptar o cancelar el encargo no lo concede.</span></p>}
    {state.job?.status==="active"&&<><p className="h-inline-note"><Clock3 size={14}/><span>Plazo restante: {timeLabel(Math.max(0,(state.job.expiresAt-clock)/1000))}. El plazo y las órdenes se conservan al salir.</span></p><button className="h-profile-edit" disabled={busy} onClick={()=>command("habitat.job.cancel")}><X size={13}/>Revisar cancelación del encargo</button></>}
    {step==="completed"&&<p className="h-inline-note" role="status"><CheckCircle2 size={15}/><span>El distrito recibió tus tablones. Podés construir, recorrer tu espacio y seguir usando las actividades de Estación.</span></p>}
  </>;
}
