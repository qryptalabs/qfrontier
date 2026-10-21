"use client";

import {ROYAL_WORLD_LOCATION} from "../../lib/graphics/royal-world-location";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Anchor, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Camera, ChevronDown, Compass, Copy, Expand, Flag, Focus, Globe2, LoaderCircle, LocateFixed, MapPin, Minus, Pause, Play, Plus, RotateCcw, RotateCw, Search, ShieldCheck, Ship, Truck, Users } from "lucide-react";
import type { MvpView, PublicPlayer } from "../../lib/mvp/view";
import type { FrontierController, RenderStats, SceneInput } from "../../lib/graphics/renderer";
import type { PlanetController, ObservedLocation, CameraMode } from "../../lib/graphics/planet-renderer";
import { PLANET_ZOOM_LEVELS, worldToGeo } from "../../lib/graphics/planet-data";
import { geographicWorldBounds } from "../../lib/graphics/world-navigation";
import { WORLD_LANDMARKS, WORLD_SETTLEMENTS, getBiomeStyle, sampleWorld } from "../../lib/graphics/world-geography";
import { INHABITED_PLACES } from "../../lib/graphics/inhabited-world-data";
import { LIVING_ZONE, LIVING_BUILDINGS, LIVING_RESIDENTS } from "../../lib/graphics/living-zone-data";
import { FISHING_COMMUNITIES, FISHING_NETWORK_PLACES, FISHING_NETWORK_STRUCTURES } from "../../lib/graphics/fishing-network-data";
import type { FishingState } from "../../lib/graphics/fishing-community";
import { globalToTile, tileToGlobal } from "../../lib/mvp/settlements";
import { BUILDING_LABELS } from "../../lib/mvp/catalog";
import type { BuildingType } from "../../lib/mvp/types";
import {viewerNeedsConsent} from "../../lib/graphics/viewer-lifecycle";
import {useViewerVisibility,useEffectiveGraphicsQuality} from "./use-viewer-lifecycle";
import "./graphics.css";
import "./living-zone.css";
import "./fishing-community.css";

type Quality = SceneInput["quality"];
interface Props {
  onVisitKingdom?:()=>void;
  view: MvpView;
  player: PublicPlayer | null;
  selected?: string;
  onSelect?: (id: string) => void;
  mode?: SceneInput["mode"];
  compact?: boolean;
  activation?: "auto" | "manual";
  worldPanel?: "planet" | "settlements" | "sectors";
  onWorldPanelChange?: (panel:"planet"|"settlements"|"sectors")=>void;
}
const qualities: { id: Quality; name: string }[] = [
  { id: "auto", name: "Adaptable" }, { id: "performance", name: "Rendimiento" },
  { id: "fullhd", name: "Full HD" }, { id: "4k", name: "Ultra · 4K" },
];
const factionNames = { cartographers: "Cartógrafos", forgers: "Forjadores", custodians: "Custodios" };
const searchable = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
const atlasPlaces = [...WORLD_LANDMARKS, ...FISHING_NETWORK_PLACES, ROYAL_WORLD_LOCATION];
const atlasSettlements = [...WORLD_SETTLEMENTS, ...FISHING_NETWORK_PLACES, ROYAL_WORLD_LOCATION];
const featuredCities = atlasSettlements.filter(place => place.kind === "city");
const transportNames = {cart: "Carretas", sled: "Trineos", camel: "Caravanas"};
const settlementLife = new Map([
  ...[LIVING_ZONE.city, LIVING_ZONE.village].map(place => [place.id, {
    buildingCount: LIVING_BUILDINGS.filter(building => building.owner === place.id).length,
    residentCount: LIVING_RESIDENTS.filter(resident => resident.owner === place.id).length,
    industry: "Carpintería, cultivos y mercado local", transport: "Carretas",
  }] as const),
  ...INHABITED_PLACES.map(place => [place.id, {
    buildingCount: place.buildingCount, residentCount: place.residentCount,
    industry: place.profile.industry, transport: transportNames[place.profile.transport],
  }] as const),
  ...FISHING_NETWORK_PLACES.map(place => [place.id, {
    buildingCount: FISHING_NETWORK_STRUCTURES.filter(building => building.owner === place.id).length,
    residentCount: place.kind === "city" ? 2 : 10,
    industry: place.kind === "city" ? "Recepción de pescado, almacén y mercado" : "Pesca, descarga, secado de redes y transporte hacia la ciudad",
    transport: place.biome === "ice" || place.biome === "forest" ? "Bueyes y carretas" : "Caballos y carretas",
  }] as const),
]);
type AtlasFocus = { id?: string; x: number; y: number };

export default function FrontierWorld({ onVisitKingdom, view, player, selected = player?.position ?? "t_4_4", onSelect, mode = "world", compact = false, activation, worldPanel="planet", onWorldPanelChange }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLElement>(null);
  const controller = useRef<FrontierController | PlanetController | null>(null);
  const initializing=useRef(false),loadAbort=useRef<AbortController|null>(null);
  const selectRef = useRef(onSelect);
  useLayoutEffect(()=>{selectRef.current=onSelect;},[onSelect]);
  const [quality, setQuality] = useState<Quality>("auto");
  const effectiveQuality=useEffectiveGraphicsQuality(quality),visibility=useViewerVisibility(mount),needsConsent=viewerNeedsConsent(mode,compact,activation),showingScene=mode!=="world"||worldPanel==="planet";
  const[requested,setRequested]=useState(false);
  const enabled=!needsConsent||requested,activated=enabled&&visibility.entered,activeRef=useRef(false);useLayoutEffect(()=>{activeRef.current=visibility.visible&&showingScene;},[visibility.visible,showingScene]);
  const [planetState, setPlanetState] = useState({ level: 2, flying: false, label: "Planeta" });
  const [cameraState, setCameraState] = useState<{mode: CameraMode; tilt: number}>({ mode: "3d", tilt: 53 });
  const [fishingState, setFishingState] = useState<FishingState | null>(null);
  const [selectedNpcId, setSelectedNpcId] = useState<string>();
  const [selectedSettlementId, setSelectedSettlementId] = useState<string>();
  const [directorySearch, setDirectorySearch] = useState("");
  const [coordinateX, setCoordinateX] = useState("0");
  const [coordinateY, setCoordinateY] = useState("0");
  const [coordinateError, setCoordinateError] = useState("");
  const [focusVersion, setFocusVersion] = useState(0);
  const [atlasPoint, setAtlasPoint] = useState<{ x: number; y: number } | null>(null);
  const [biomeFilter, setBiomeFilter] = useState("all");
  const pendingFocus = useRef<AtlasFocus | null>(null);
  const settlementSelectRef = useRef<(id: string) => void>(() => {});
  const npcSelectRef=useRef<(id:string)=>void>(()=>{}),revealWorldRef=useRef<()=>void>(()=>{});
  const previousPlayer = useRef(player?.id);
  const [motion, setMotion] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [notice, setNotice] = useState("");
  const [stats, setStats] = useState<RenderStats | null>(null);
  const [attempt, setAttempt] = useState(0);
  const renderMode = mode === "station" ? "settlement" : mode;
  const settlements = view.settlements ?? [];
  const ownSettlement = settlements.find(item => item.playerId === player?.id);
  const selectedSettlement = settlements.find(item => item.id === selectedSettlementId);
  const selectedNpc = atlasPlaces.find(item => item.id === selectedNpcId);
  const selectedLife = selectedNpcId ? settlementLife.get(selectedNpcId) : undefined;
  const coordinateBounds = geographicWorldBounds;
  const currentCoordinate = tileToGlobal(selected);
  const input = useRef<SceneInput>({ view, player, selected, selectedSettlementId, mode: renderMode, quality, reducedMotion: false });
  useLayoutEffect(()=>{input.current={view,player,selected,selectedSettlementId,mode:renderMode,quality:effectiveQuality,reducedMotion:reducedMotion||!motion};});
  const planetController = () => { const current = controller.current; return current && "setZoomLevel" in current ? current : null; };
  const revealWorld = () => { if (mode === "world") {setRequested(true);onWorldPanelChange?.("planet");frame.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });} };
  const focusLocation = (focus: AtlasFocus) => {
    pendingFocus.current = focus;
    setSelectedSettlementId(focus.id);
    setAtlasPoint({ x: focus.x, y: focus.y });
    setCoordinateX(String(Math.round(focus.x))); setCoordinateY(String(Math.round(focus.y)));
    setCoordinateError(""); setSelectedNpcId(undefined);
    if (Math.abs(focus.x) <= 864 && Math.abs(focus.y) <= 864) onSelect?.(globalToTile(focus.x, focus.y));
    setFocusVersion(value => value + 1);
    revealWorld();
  };
  const selectSettlement = (id: string) => {
    const settlement = settlements.find(item => item.id === id);
    if (settlement) focusLocation({ id, x: settlement.plot.x, y: settlement.plot.y });
  };
  useLayoutEffect(()=>{settlementSelectRef.current=selectSettlement;});
  const flyHome = () => {
    if (!ownSettlement) return;
    setSelectedNpcId(undefined); setSelectedSettlementId(ownSettlement.id);
    setAtlasPoint({ x: ownSettlement.plot.x, y: ownSettlement.plot.y });
    setCoordinateX(String(ownSettlement.plot.x)); setCoordinateY(String(ownSettlement.plot.y));
    setCoordinateError("");
    pendingFocus.current={id:ownSettlement.id,x:ownSettlement.plot.x,y:ownSettlement.plot.y};setFocusVersion(value=>value+1);
    revealWorld();
  };
  const locateNpc = (id: string) => {
    const npc = atlasPlaces.find(item => item.id === id); if (!npc) return;
    setSelectedSettlementId(undefined); setSelectedNpcId(npc.id); setAtlasPoint({ x: npc.x, y: npc.y });
    setCoordinateX(String(npc.x)); setCoordinateY(String(npc.y));
    pendingFocus.current={id:npc.id,x:npc.x,y:npc.y};setFocusVersion(value=>value+1);
    revealWorld();
  };
  useLayoutEffect(()=>{npcSelectRef.current=locateNpc;revealWorldRef.current=revealWorld;});

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let active=true;queueMicrotask(()=>{if(active)setReducedMotion(media.matches);});
    const change = () => setReducedMotion(media.matches);
    media.addEventListener("change", change);
    try {
      const saved = localStorage.getItem("qfrontier.graphics.quality");
      if(qualities.some(option=>option.id===saved))queueMicrotask(()=>{if(active)setQuality(saved as Quality);});
    } catch { /* Storage may be unavailable in a private browser. */ }
    return()=>{active=false;media.removeEventListener("change",change);};
  }, []);

  useEffect(() => {
    let active=true;queueMicrotask(()=>{if(!active||mode!=="world")return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("view") !== "regional") return;
    const x = Number(params.get("x")), y = Number(params.get("y"));
    if (!params.has("x") || !params.has("y") || !Number.isSafeInteger(x) || !Number.isSafeInteger(y) || Math.abs(x) > 2_000_000 || Math.abs(y) > 2_000_000) return;
    const found = settlements.find(item => item.id === params.get("settlement") && item.plot.x === x && item.plot.y === y);
    const ambient = !found ? atlasPlaces.find(item => item.id === params.get("place") && item.x === x && item.y === y) : undefined;
    const focus = found ? { id: found.id, x: found.plot.x, y: found.plot.y } : ambient ? { id: ambient.id, x: ambient.x, y: ambient.y } : { x, y };
    const bounds = geographicWorldBounds;
    if (focus.x < bounds.minX || focus.x > bounds.maxX || focus.y < bounds.minY || focus.y > bounds.maxY) return;
    pendingFocus.current = focus;
    setAtlasPoint({ x: focus.x, y: focus.y });
    setSelectedSettlementId(found?.id); setSelectedNpcId(ambient?.id); setCoordinateX(String(focus.x)); setCoordinateY(String(focus.y));
    if (Math.abs(focus.x) <= 864 && Math.abs(focus.y) <= 864) selectRef.current?.(globalToTile(focus.x, focus.y));
    setFocusVersion(value => value + 1);
    });return()=>{active=false;};
    // A shared location is applied once when the component first opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active=true;queueMicrotask(()=>{if(!active)return;
    if (previousPlayer.current !== player?.id) {
      setSelectedSettlementId(undefined); setSelectedNpcId(undefined); pendingFocus.current = null;
      const point = ownSettlement?.plot ?? tileToGlobal(player?.position ?? "t_4_4");
      setAtlasPoint({ x: point.x, y: point.y }); setCoordinateX(String(point.x)); setCoordinateY(String(point.y)); setCoordinateError("");
    }
    previousPlayer.current=player?.id;});return()=>{active=false;};
  }, [player?.id,player?.position,ownSettlement?.plot]);

  useEffect(() => {
    if (!activated || !mount.current || !activeRef.current) return;
    let cancelled = false;const loading=new AbortController();loadAbort.current=loading;
    initializing.current=true;
    queueMicrotask(()=>{if(!cancelled){setReady(false);setError("");}});
    let instance: FrontierController | PlanetController | null = null;
    void (async () => {
      const createRenderer = mode === "world" ? (await import("../../lib/graphics/planet-renderer")).createPlanetRendererAsync : (await import("../../lib/graphics/renderer")).createFrontierRendererAsync;
      if (cancelled || !mount.current) return;
      if(!activeRef.current){initializing.current=false;return;}
      instance = await createRenderer(mount.current, input.current, {
        onSelect: (id: string) => { setSelectedSettlementId(undefined); setSelectedNpcId(undefined); const point = tileToGlobal(id); setAtlasPoint(point); setCoordinateX(String(point.x)); setCoordinateY(String(point.y)); selectRef.current?.(id); },
        onSelectSettlement: (id: string) => settlementSelectRef.current(id),
        onSelectNpc: (id: string) => npcSelectRef.current(id),
        onLocation: (point: ObservedLocation) => {
          if (cancelled) return;
          setAtlasPoint({ x: point.x, y: point.y }); setSelectedSettlementId(point.settlementId); setSelectedNpcId(point.placeId);
          const focused = document.activeElement?.getAttribute("aria-label");
          if (focused !== "Coordenada X" && focused !== "Coordenada Y") { setCoordinateX(String(Math.round(point.x))); setCoordinateY(String(Math.round(point.y))); }
        },
        onStats: (value: RenderStats) => { if (!cancelled) setStats(value); },
        onError: (message: string) => { if (!cancelled) setError(message); },
        onPlanetState: (state: { level: number; flying: boolean; label: string }) => { if (!cancelled) setPlanetState(state); },
        onCameraState: (state: { mode: CameraMode; tilt: number }) => { if (!cancelled) setCameraState(state); },
        onFishingState: (state: FishingState) => { if (!cancelled) setFishingState(state); },
      },{signal:loading.signal});
      if(cancelled||loading.signal.aborted||!activeRef.current){instance.dispose();initializing.current=false;return;}
      controller.current = instance;
      initializing.current=false;
      instance.setActive(activeRef.current);
      setReady(true);
    })().catch(() => {
      if(loading.signal.aborted){initializing.current=false;if(!cancelled&&activeRef.current)setAttempt(value=>value+1);return;}
      if (!cancelled){initializing.current=false;setError("No se pudo iniciar el mundo 3D. Puedes seleccionar un sector abajo y seguir jugando.");}
    });
    return () => { cancelled = true;loading.abort();if(loadAbort.current===loading)loadAbort.current=null;initializing.current=false;instance?.dispose();controller.current=null; };
  }, [attempt, mode, activated]);

  useEffect(() => {if(activeRef.current)controller.current?.update(input.current);}, [view, player, selected, selectedSettlementId, renderMode, effectiveQuality, reducedMotion, motion]);
  useEffect(()=>{const current=controller.current;if(!current){if(!activeRef.current)loadAbort.current?.abort();let cancelled=false;if(activated&&activeRef.current&&!initializing.current)queueMicrotask(()=>{if(!cancelled&&!controller.current)setAttempt(value=>value+1);});return()=>{cancelled=true;};}current.setActive(activeRef.current);if(activeRef.current)current.update(input.current);},[ready,visibility.visible,showingScene,activated]);
  useEffect(() => {
    if (!ready || !showingScene || renderMode !== "world" || !pendingFocus.current || !controller.current) return;
    const focus = pendingFocus.current; pendingFocus.current = null;
    if (focus.id) controller.current.focusSettlement(focus.id);
    else controller.current.centerCoordinate(focus.x, focus.y);
    revealWorldRef.current();
  }, [ready, renderMode, focusVersion, showingScene]);

  const findCoordinates = (event: React.FormEvent) => {
    event.preventDefault();
    const x = Number(coordinateX), y = Number(coordinateY);
    if (!coordinateX.trim() || !coordinateY.trim() || !Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < coordinateBounds.minX || x > coordinateBounds.maxX || y < coordinateBounds.minY || y > coordinateBounds.maxY) {
      setCoordinateError(`Elegí coordenadas enteras entre X ${Math.ceil(coordinateBounds.minX)} y ${Math.floor(coordinateBounds.maxX)}, Y ${Math.ceil(coordinateBounds.minY)} y ${Math.floor(coordinateBounds.maxY)}.`); return;
    }
    const found = settlements.find(item => Math.abs(item.plot.x - x) <= item.plot.width / 2 && Math.abs(item.plot.y - y) <= item.plot.depth / 2);
    focusLocation({ id: found?.id, x, y });
  };
  const copyLocation = async () => {
    const location = renderMode === "settlement" && ownSettlement ? ownSettlement.plot : atlasPoint ?? selectedSettlement?.plot ?? currentCoordinate;
    const x = Number.isFinite(location.x) ? Math.round(location.x) : currentCoordinate.x;
    const y = Number.isFinite(location.y) ? Math.round(location.y) : currentCoordinate.y;
    const url = new URL(window.location.pathname, window.location.origin);
    url.searchParams.set("view", "regional"); url.searchParams.set("x", String(x)); url.searchParams.set("y", String(y));
    const id = renderMode === "settlement" ? ownSettlement?.id : selectedSettlement?.id;
    if (id) url.searchParams.set("settlement", id);
    if (mode === "world" && selectedNpc) url.searchParams.set("place", selectedNpc.id);
    try { await navigator.clipboard.writeText(url.href); setNotice(`Ubicación copiada · X: ${x} · Y: ${y}. El enlace conserva el acceso privado del juego.`); }
    catch { setNotice(`Ubicación: X: ${x} · Y: ${y}. No se pudo copiar el enlace; podés buscar esas coordenadas en el mapa regional.`); }
  };

  const chooseQuality = (value: Quality) => {
    setQuality(value);
    if (error) setAttempt(value => value + 1);
    try { localStorage.setItem("qfrontier.graphics.quality", value); } catch { /* Optional preference. */ }
  };
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (frame.current?.requestFullscreen) await frame.current.requestFullscreen();
      else setNotice("Tu navegador no ofrece pantalla completa. Puedes ampliar la vista con el zoom.");
    } catch { setNotice("No se pudo activar la pantalla completa en este navegador."); }
  };
  const capture = async () => {
    if (!controller.current || capturing) return;
    setCapturing(true); setNotice("");
    try {
      const blob = await controller.current.capture(3840, 2160);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `QFrontier-${mode}-3840x2160.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      setNotice("Captura 4K preparada · 3840 × 2160 píxeles.");
    } catch { setNotice("No se pudo crear la captura 4K. Prueba una calidad gráfica más baja y vuelve a intentarlo."); }
    finally { setCapturing(false); }
  };
  const tile = view.tiles.find(item => item.id === selected);
  const label = renderMode === "settlement" ? player?.stationName ?? "Refugio del Alba" : mode === "showcase" ? "Refugio del Alba" : mode === "world" ? "Planeta Frontera" : "Atlas de Frontera Cero";
  const query = searchable(directorySearch.trim());
  const directory = settlements.filter(item => searchable(`${item.name} ${item.ownerName} ${item.clanName ?? ""} ${factionNames[item.faction]} ${item.plot.x} ${item.plot.y}`).includes(query));
  const ambientDirectory = atlasSettlements.filter(item => (biomeFilter === "all" || item.biome === biomeFilter) && searchable(`${item.name} ${item.alias} ${getBiomeStyle(item.biome).label} ${item.x} ${item.y}`).includes(query));
  const naturalPlaces = WORLD_LANDMARKS.filter(item => item.kind === "cave" || item.kind === "landmark");
  const observedPoint = atlasPoint ?? currentCoordinate;
  const observedBiome = sampleWorld(observedPoint.x, observedPoint.y).biome;
  const geographicPoint = worldToGeo(observedPoint.x, observedPoint.y);
  const fishingCommunity = FISHING_COMMUNITIES.find(site => site.id === fishingState?.communityId) ?? FISHING_COMMUNITIES[0];
  const fishingActivities = fishingState?.available ? fishingState.activities.filter(activity => activity.kind !== "worker") : [];
  const followedFishing = fishingState?.activities.find(activity => activity.id === fishingState.followedId);
  const followFishing = (id: string | null) => { planetController()?.followActivity(id); revealWorld(); };
  return <>
    {mode==="world"&&<section className="g-fishing-community" aria-label="Ubicación del Reino del Alba"><span className="g-eyebrow">CAPITAL DEL REINO · UBICACIÓN PERMANENTE</span><h3>Corona del Alba</h3><p>Castillo real, ciudad, puentes y puerto en el bosque del norte. X: {ROYAL_WORLD_LOCATION.x} · Y: {ROYAL_WORLD_LOCATION.y}. El puerto está al sur del palacio.</p><button className="m-button" onClick={()=>locateNpc(ROYAL_WORLD_LOCATION.id)}>Localizar castillo en el planeta</button> {onVisitKingdom&&<button className="m-button" onClick={onVisitKingdom}>Entrar al reino y al castillo</button>}</section>}
  <section ref={frame} className={`g-world ${compact ? "g-compact" : ""} g-mode-${mode} g-view-${renderMode}`} aria-label={mode==="world"&&worldPanel!=="planet"?worldPanel==="settlements"?"Aldeas y ciudades de Frontera":"Sectores de exploración":`${label} en 3D`}>

    <div className="g-world-heading">
      <div><span className="g-eyebrow"><i />QFRONTIER · FRONTERA CERO</span><h2>{mode==="world"&&worldPanel!=="planet"?worldPanel==="settlements"?"Aldeas y ciudades":"Sectores de Frontera":label}<span>{renderMode === "settlement" ? "TU PARCELA" : mode === "showcase" ? "TEMPORADA 01" : "MUNDO COMPARTIDO"}</span></h2></div>
      <div className="g-resolution" style={showingScene?undefined:{display:"none"}} title={stats ? `Fluidez de la vista: ${stats.fps} fps. Podés ajustar la calidad en los controles.` : undefined}><span className="g-live" />{!activated&&needsConsent?"VISTA OPCIONAL":stats ? `${stats.width.toLocaleString("en-US")} × ${stats.height.toLocaleString("en-US")}` : "PREPARANDO ESCENA"}</div>
    </div>
    <div className="g-viewport" ref={mount} style={showingScene?undefined:{display:"none"}} role="group" aria-label={mode === "world" ? "Planeta ficticio navegable con vistas aéreas 2D y 3D. Diez escalas de zoom y coordenadas virtuales del juego." : "Escenario 3D isométrico. Usa los controles de cámara para explorar."} >
      {mode === "world" && <div className="g-planet-hud"><span className="g-planet-orbit"><Globe2 size={15}/>{planetState.flying ? "DESCENDIENDO A TU DESTINO" : "FRONTERA · ATLAS PLANETARIO"}</span><strong>{planetState.label}<small>ESCALA {planetState.level} / 10</small></strong><button className="g-my-position" type="button" disabled={!ready || !!error || !ownSettlement} onClick={flyHome}><LocateFixed size={17}/>{planetState.flying ? "Volver a mi aldea" : "Mi posición"}</button></div>}
      {mode === "world" && followedFishing && <aside className="g-fishing-follow" aria-label="Actividad en seguimiento"><span>{followedFishing.kind === "boat" ? <Ship size={16}/> : <Truck size={16}/>}SIGUIENDO</span><strong>{followedFishing.label}</strong><small>{followedFishing.state} · {followedFishing.cargo} cajas de pescado</small><button type="button" onClick={() => followFishing(null)} aria-label="Dejar de seguir actividad">Explorar libremente</button></aside>}
      {!enabled&&<div className="g-scene-launch"><Globe2 size={32}/><strong>{renderMode==="settlement"?"Tu aldea, con todos sus detalles.":mode==="showcase"?"Descubrí Frontera.":"Explorá el escenario en 3D."}</strong><p>La vista se carga cuando elegís abrirla. Podés seguir usando las opciones del juego.</p><button type="button" onClick={()=>setRequested(true)}><Play size={17}/>Abrir vista 3D</button></div>}
      <div className="g-scene-caption"><span className="g-caption-rule" />{mode === "showcase" ? "UN VALLE CONTINUO · TU HISTORIA EMPIEZA AQUÍ" : renderMode === "settlement" ? "TU PARCELA · CÁMARA LIMITADA A TU TERRITORIO" : `${settlements.length} ALDEAS REALES · ${atlasSettlements.length} LOCALIDADES · TERRENO CONTINUO`}<span className="g-camera-tip">{mode === "world" && planetState.level >= 6 ? "Arrastra para recorrer · Botón derecho para girar" : "Arrastra para girar · Rueda para acercar"}</span></div>
    </div>
    {showingScene && mode !== "showcase" && <div className="g-location-strip" aria-label="Ubicación de la vista"><span><MapPin size={14}/>{renderMode === "settlement" ? "Tu aldea" : selectedSettlement?.name ?? selectedNpc?.name ?? (mode === "world" ? getBiomeStyle(observedBiome).label : "Sector seleccionado")}</span><strong>X: {renderMode === "settlement" ? ownSettlement?.plot.x ?? 0 : Math.round(observedPoint.x)}</strong><strong>Y: {renderMode === "settlement" ? ownSettlement?.plot.y ?? 0 : Math.round(observedPoint.y)}</strong>{mode === "world" && <span className="g-geographic-coordinate" aria-label="Coordenadas geográficas virtuales">Lat. {geographicPoint.lat.toFixed(3)}° · Lon. {geographicPoint.lon.toFixed(3)}°</span>}<span className="g-location-state"><ShieldCheck size={13}/>{renderMode === "settlement" ? "Gestión exclusiva de tu parcela" : selectedNpc ? "Lugar de ambientación" : selectedSettlement?.own ? "Tu parcela · terreno continuo" : "Exploración visual · coordenadas del planeta"}</span><button type="button" onClick={() => void copyLocation()} aria-label="Copiar ubicación"><Copy size={13}/>Copiar ubicación</button></div>}
    {showingScene && enabled && !ready && !error && <div className="g-loading" role="status"><LoaderCircle className="m-spin" size={28} /><strong>Construyendo el horizonte…</strong><span>Terreno, luz y pequeñas historias.</span></div>}
    {showingScene && error && <div className="g-unavailable" role="status"><Compass size={30} /><strong>La vista 3D necesita WebGL 2.</strong><p>{error}</p><button className="m-button" style={{ pointerEvents: "auto" }} onClick={() => setAttempt(value => value + 1)}>Reiniciar vista 3D</button></div>}
    <div className="g-toolbar" style={showingScene?undefined:{display:"none"}} aria-label="Controles del mundo 3D">
      {mode === "world" && <div className="g-scene-tabs" aria-label="Vistas del mundo"><button disabled={!ready || !!error} aria-pressed={planetState.level < 6} className={planetState.level < 6 ? "active" : ""} onClick={() => planetController()?.setZoomLevel(2)}><Globe2 size={15}/>Planeta</button><button disabled={!ready || !!error} aria-pressed={planetState.level >= 6} className={planetState.level >= 6 ? "active" : ""} onClick={() => planetController()?.setZoomLevel(7)}>Mapa regional</button></div>}
      {mode === "world" && <div className="g-view-projection" role="group" aria-label="Vista aérea"><button type="button" aria-label="Vista aérea 2D" aria-pressed={cameraState.mode === "2d" && planetState.level >= 6} disabled={!ready || !!error} onClick={() => planetController()?.setCameraMode("2d")}>2D</button><button type="button" aria-label="Vista aérea 3D" aria-pressed={cameraState.mode === "3d" || planetState.level < 6} disabled={!ready || !!error} onClick={() => planetController()?.setCameraMode("3d")}>3D</button></div>}
      <div className="g-camera-controls">
        <button title="Girar a la izquierda" aria-label="Girar cámara a la izquierda" disabled={!ready || !!error} onClick={() => controller.current?.rotate(-1)}><RotateCcw size={16} /></button>
        <button title="Girar a la derecha" aria-label="Girar cámara a la derecha" disabled={!ready || !!error} onClick={() => controller.current?.rotate(1)}><RotateCw size={16} /></button>
        <span className="g-separator" />
        <button title="Alejar" aria-label="Alejar cámara" disabled={!ready || !!error} onClick={() => controller.current?.zoom(-1)}><Minus size={16} /></button>
        <button title="Acercar" aria-label="Acercar cámara" disabled={!ready || !!error} onClick={() => controller.current?.zoom(1)}><Plus size={16} /></button>
        <button title="Centrar selección" aria-label="Centrar cámara en selección" disabled={!ready || !!error} onClick={() => controller.current?.focusSelected()}><Focus size={16} /></button>
        <button title="Restablecer cámara" aria-label="Restablecer cámara" disabled={!ready || !!error} onClick={() => controller.current?.reset()}><Compass size={16} /></button>
      </div>
      {mode === "world" && planetState.level >= 6 && <div className="g-terrain-navigation" role="group" aria-label="Recorrer el terreno"><button aria-label="Desplazar mapa al oeste" title="Oeste" onClick={() => planetController()?.pan(-64,0)}><ArrowLeft size={15}/></button><button aria-label="Desplazar mapa al norte" title="Norte" onClick={() => planetController()?.pan(0,-64)}><ArrowUp size={15}/></button><button aria-label="Desplazar mapa al sur" title="Sur" onClick={() => planetController()?.pan(0,64)}><ArrowDown size={15}/></button><button aria-label="Desplazar mapa al este" title="Este" onClick={() => planetController()?.pan(64,0)}><ArrowRight size={15}/></button></div>}
      {mode === "world" && planetState.level >= 6 && cameraState.mode === "3d" && <label className="g-camera-tilt"><span>Inclinación</span><input type="range" aria-label="Inclinación de la vista 3D" min="30" max="75" step="1" value={Math.round(cameraState.tilt)} onChange={event => planetController()?.setTilt(Number(event.target.value))}/><output>{Math.round(cameraState.tilt)}°</output></label>}
      <div className="g-display-controls">
        <label className="g-quality"><span>Calidad</span><select aria-label="Calidad gráfica" value={quality} onChange={event => chooseQuality(event.target.value as Quality)}>{qualities.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select><ChevronDown size={12} /></label>
        <button title={motion ? "Pausar animaciones" : "Activar animaciones"} aria-label={motion ? "Pausar animaciones" : "Activar animaciones"} onClick={() => setMotion(value => !value)}>{motion ? <Pause size={15} /> : <Play size={15} />}</button>
        <button title="Capturar imagen 4K" aria-label="Descargar captura 4K" disabled={!ready || !!error || capturing} onClick={() => void capture()}>{capturing ? <LoaderCircle className="m-spin" size={16} /> : <Camera size={16} />}<span className="g-capture-label">4K</span></button>
        <button title="Pantalla completa" aria-label="Pantalla completa" onClick={() => void fullscreen()}><Expand size={16} /></button>
      </div>
    </div>
    {mode === "world" && worldPanel === "planet" && <nav className="g-planet-scales" aria-label="Diez capas de zoom">{PLANET_ZOOM_LEVELS.map(scale => <button key={scale.level} type="button" aria-label={`Zoom ${scale.level}: ${scale.label}`} aria-current={planetState.level === scale.level ? "step" : undefined} disabled={!ready || !!error} onClick={() => planetController()?.setZoomLevel(scale.level)}><span>{String(scale.level).padStart(2, "0")}</span><strong>{scale.label}</strong></button>)}</nav>}
    {mode === "world" && worldPanel === "settlements" && <div className="g-atlas-panel">
      <section className="g-fishing-community" aria-label="Comunidad pesquera">
        <header><span className="g-eyebrow"><Anchor size={14}/>DE LA BAHÍA AL MERCADO</span><h3>Puertos de Frontera</h3><p>{FISHING_COMMUNITIES.length} comunidades, distintas costas y una jornada que podés seguir. Elegí un puerto para descubrir sus barcos, habitantes y rutas de pescado hacia la ciudad.</p></header>
        <nav className="g-fishing-network" aria-label="Puertos pesqueros del planeta">{FISHING_COMMUNITIES.map(site => <button type="button" key={site.id} data-biome={site.biome} aria-label={`Visitar puerto ${site.name}`} aria-current={fishingState?.available && fishingCommunity.id === site.id ? "location" : undefined} disabled={!!error} onClick={() => focusLocation({x:site.dock.x,y:site.dock.y})}><Anchor size={17}/><span><strong>{site.name}</strong><small>{getBiomeStyle(site.biome).label} · {site.city.name}</small><em>X: {site.dock.x} · Y: {site.dock.y}</em></span><ArrowRight size={15}/></button>)}</nav>
        <div className="g-fishing-active"><span className="g-eyebrow">{getBiomeStyle(fishingCommunity.biome).label.toLocaleUpperCase("es")} · RUTA PESQUERA</span><h4>{fishingCommunity.name}</h4><p>Del caladero al muelle y del muelle a {fishingCommunity.city.name}, con tripulaciones, estibadores y carretas con animales de tiro.</p></div>
        <div className="g-fishing-destinations">
          <button type="button" disabled={!!error} onClick={() => focusLocation({x:fishingCommunity.dock.x,y:fishingCommunity.dock.y})} aria-label="Visitar muelles pesqueros"><Anchor size={19}/><span><strong>Ver los muelles</strong><small>Barcos, tripulación y descarga</small></span><ArrowRight size={16}/></button>
          <button type="button" disabled={!!error} onClick={() => locateNpc(fishingCommunity.id)} aria-label={`Visitar comunidad ${fishingCommunity.name}`}><Flag size={19}/><span><strong>Recorrer la comunidad</strong><small>Viviendas, redes y talleres</small></span><ArrowRight size={16}/></button>
          <button type="button" disabled={!!error} onClick={() => locateNpc(fishingCommunity.city.id)} aria-label={`Visitar ciudad ${fishingCommunity.city.name}`}><Truck size={19}/><span><strong>{fishingCommunity.city.name}</strong><small>Mercado y entrega de pescado</small></span><ArrowRight size={16}/></button>
        </div>
        <ol className="g-fishing-chain" aria-label="Ciclo de la pesca"><li>Preparar</li><li>Zarpar</li><li>Pescar</li><li>Regresar</li><li>Descargar</li><li>Entregar</li></ol>
        {fishingActivities.length > 0 ? <div className="g-fishing-fleet" aria-label="Flota y transportes pesqueros">{fishingActivities.map(activity => <button type="button" key={activity.id} disabled={!ready || !!error} aria-label={`Seguir ${activity.label}`} aria-pressed={fishingState?.followedId === activity.id} onClick={() => followFishing(activity.id)}>{activity.kind === "boat" ? <Ship size={22}/> : <Truck size={22}/>}<span><strong>{activity.label}</strong><small>{activity.state}</small><em>{activity.cargo} cajas de pescado</em></span><span className="g-fishing-track"><LocateFixed size={14}/>Seguir</span></button>)}</div> : <p className="g-fishing-note">Visitá los muelles para localizar los barcos y acompañar los cargamentos.</p>}
        <p className="g-fishing-note">La pesca y los transportes de esta comunidad son actividad del mundo. Tus recursos y las reservas de tu aldea se conservan.</p>
      </section>
      <section className="g-living-zone g-settlements-world" aria-label="Aldeas y ciudades habitadas">
        <div><span className="g-eyebrow">LOS PUEBLOS DE FRONTERA</span><h3>Cada bioma, su propia forma de vivir.</h3><p>Aldeas y ciudades con habitantes, oficios y caminos. Descubrí barrios entre la nieve, mercados del desierto, cultivos tropicales y poblados de montaña.</p></div>
        <div className="g-living-zone-actions">
          {featuredCities.map(city => <button type="button" key={city.id} data-biome={city.biome} disabled={!!error} onClick={() => locateNpc(city.id)} aria-label={`Explorar ciudad ${city.name}`}><Flag size={17}/><span><strong>{city.name}</strong><small>{getBiomeStyle(city.biome).label} · Ciudad</small></span><ArrowRight size={16}/></button>)}
          <button type="button" disabled={!!error} onClick={() => locateNpc("npc-las-brumas")} aria-label="Explorar aldea Las Brumas"><MapPin size={17}/><span><strong>Las Brumas</strong><small>La Ruta del Ámbar · Aldea</small></span><ArrowRight size={16}/></button>
        </div>
        <p className="g-living-zone-note">Elegí 2D para orientarte o incliná la vista 3D hacia el horizonte. Acercate para ver a los habitantes trabajando. Los poblados son ambientación; las aldeas de jugadores conservan sus construcciones y partidas.</p>
      </section>
      {selectedNpc && selectedLife && <section className="g-selected-settlement" aria-label="Vida del asentamiento"><span className="g-eyebrow">{getBiomeStyle(selectedNpc.biome).label.toLocaleUpperCase("es")}</span><h3>{selectedNpc.name}</h3><div className="g-settlement-life"><span><strong>{selectedLife.buildingCount}</strong>Construcciones</span><span><strong>{selectedLife.residentCount}</strong>Habitantes del poblado</span><span><strong>{selectedLife.transport}</strong>Transporte local</span></div><p>{selectedLife.industry}. {selectedNpc.stage === "construction" ? "Las obras y sus constructores forman parte del desarrollo del poblado. " : ""}La cantidad de habitantes visibles se adapta al acercamiento y a la calidad gráfica.</p></section>}
      <div className="g-atlas-intro"><span className="g-eyebrow"><Users size={13}/>UN PLANETA · MUCHAS HISTORIAS</span><h3>Tu lugar en Frontera.</h3><p>Volá desde el espacio hasta tu aldea. Cada asentamiento real conserva su posición y muestra el progreso de sus edificios, incluso cuando su propietario se desconecta.</p><button className="g-atlas-home" onClick={flyHome} disabled={!ownSettlement}><LocateFixed size={14}/>Volar a mi aldea</button><button className="g-atlas-home secondary" onClick={() => player && focusLocation(tileToGlobal(player.position))} disabled={!player}><Compass size={14}/>Localizar mi explorador</button><p className="g-planet-footnote">La ubicación pertenece al juego. Mover el mapa no mueve tu expedición. El terreno se puede recorrer libremente. Construís en tu parcela y las operaciones de tu explorador conservan sus 81 sectores actuales.</p></div>
      <div className="g-atlas-navigation">
        <form className="g-coordinate-form" onSubmit={findCoordinates}><span className="g-atlas-label"><MapPin size={14}/>Localizar un punto</span><div className="g-coordinate-fields"><label>Coordenada X<input aria-label="Coordenada X" type="number" step="1" required value={coordinateX} onChange={event => setCoordinateX(event.target.value)}/></label><label>Coordenada Y<input aria-label="Coordenada Y" type="number" step="1" required value={coordinateY} onChange={event => setCoordinateY(event.target.value)}/></label><button type="submit"><Focus size={15}/>Localizar coordenadas</button></div>{coordinateError && <p className="g-coordinate-error" role="alert">{coordinateError}</p>}</form>
        <div className="g-atlas-directory"><label htmlFor={`g-aldea-search-${mode}`} className="g-atlas-label"><Search size={14}/>Buscar aldea o explorador</label><input id={`g-aldea-search-${mode}`} type="search" value={directorySearch} onChange={event => setDirectorySearch(event.target.value)} placeholder="Nombre de aldea, jugador o clan"/><div className="g-directory-meta"><span>{directory.length} {directory.length === 1 ? "aldea encontrada" : "aldeas encontradas"}</span><span>Coordenadas permanentes · X / Y</span></div><div className="g-settlement-list" role="group" aria-label="Aldeas del mundo">{directory.map(settlement => <button className={selectedSettlementId === settlement.id ? "selected" : ""} key={settlement.id} onClick={() => selectSettlement(settlement.id)} aria-label={`Localizar ${settlement.name}, ${settlement.ownerName}`}><span className={`g-settlement-emblem g-faction-${settlement.faction}`}><Flag size={18}/></span><span><strong>{settlement.name}{settlement.own && <small>Tu cuenta</small>}</strong><span>{settlement.ownerName} · {factionNames[settlement.faction]}</span></span><span className="g-settlement-coordinates">X: {settlement.plot.x}<br/>Y: {settlement.plot.y}</span></button>)}</div>{!directory.length && !ambientDirectory.length && <p className="g-directory-empty">No encontramos una aldea con ese nombre. Probá otro nombre o usá sus coordenadas.</p>}</div>
      </div>
      {selectedSettlement && <section className="g-settlement-detail" aria-label="Aldea seleccionada"><div className="g-settlement-detail-header"><div><span className="g-eyebrow">{selectedSettlement.own ? "ASENTAMIENTO DE TU CUENTA" : "ALDEA VECINA · SOLO CONSULTA"}</span><h3>{selectedSettlement.name}</h3><p>{selectedSettlement.ownerName} · {factionNames[selectedSettlement.faction]}{selectedSettlement.clanName ? ` · ${selectedSettlement.clanName}` : ""}</p></div><span className="g-settlement-shield"><ShieldCheck size={17}/>{selectedSettlement.protectionUntil > view.now ? "Escudo inicial activo" : "Aldea protegida"}</span></div><div className="g-settlement-building-list">{Object.entries(selectedSettlement.buildings).map(([building, level]) => <span key={building}>{BUILDING_LABELS[building as BuildingType]}<strong>Nv. {level}</strong></span>)}</div><p className="g-settlement-readonly">Parcela {selectedSettlement.plot.id.replace("plot_", "")} · X: {selectedSettlement.plot.x} · Y: {selectedSettlement.plot.y} · La construcción y el almacén los administra su propietario. Los recursos del sector se rigen por las reglas de exploración.</p></section>}
      <section className="g-planet-npcs" aria-label="Asentamientos del planeta"><div><span className="g-eyebrow">HISTORIAS DEL PLANETA</span><h3>{atlasSettlements.filter(place => place.kind === "village").length} aldeas. {featuredCities.length} ciudades. Un mundo por descubrir.</h3><p>Recorré poblados de ambientación con alias ficticios y distintos niveles de desarrollo. Cada lugar tiene su arquitectura y su entorno.</p><label className="g-biome-filter">Explorar por bioma<select aria-label="Filtrar lugares por bioma" value={biomeFilter} onChange={event=>setBiomeFilter(event.target.value)}><option value="all">Todos los biomas</option>{(["ice","desert","forest","tropical","mountain","coast","plains"] as const).map(biome=><option key={biome} value={biome}>{getBiomeStyle(biome).label}</option>)}</select></label></div><div className="g-planet-npc-list">{ambientDirectory.map(npc => <button type="button" key={npc.id} className={selectedNpcId === npc.id ? "selected" : ""} onClick={() => locateNpc(npc.id)} aria-label={`Visitar ${npc.name}, ${npc.alias}`}><Flag size={15}/><span><strong>{npc.name}</strong><small>{npc.alias} · {npc.stage === "construction" ? "En construcción" : npc.kind === "city" ? "Ciudad" : "Aldea"} · Nv. {npc.tier}</small><small>{getBiomeStyle(npc.biome).label}</small></span><span className="g-npc-coordinate">{Math.round(npc.x)}, {Math.round(npc.y)}</span></button>)}</div>{!ambientDirectory.length&&<p>No encontramos lugares con ese filtro. Probá otro bioma o nombre.</p>}{selectedNpc && <p className="g-npc-selection" role="status">{selectedNpc.name}{selectedNpc.alias ? ` · ${selectedNpc.alias}` : ""} · {getBiomeStyle(selectedNpc.biome).label} · X: {Math.round(selectedNpc.x)} · Y: {Math.round(selectedNpc.y)}.</p>}</section>

    </div>}
    {mode === "world" && worldPanel === "planet" && <section className="g-world-discoveries" aria-label="Lugares naturales"><span className="g-eyebrow">MÁS ALLÁ DE LAS ALDEAS</span><h3>Descubrí el paisaje.</h3><div>{naturalPlaces.map(place=><button key={place.id} type="button" onClick={()=>locateNpc(place.id)} aria-label={`Explorar ${place.name}`}><MapPin size={16}/><span><strong>{place.name}</strong><small>{getBiomeStyle(place.biome).label}{place.kind==="cave"?" · Cueva":""}</small></span></button>)}</div></section>}
    {!!onSelect && (mode !== "world" || worldPanel === "sectors") && renderMode !== "settlement" && mode !== "showcase" && <div className="g-sector-picker"><label htmlFor={`g-sector-${mode}`}><Compass size={14} />Ir a un sector</label><select id={`g-sector-${mode}`} aria-label="Seleccionar sector del mundo 3D" value={selected} onChange={event => { const point = tileToGlobal(event.target.value); if(mode==="world"&&worldPanel==="sectors"){setAtlasPoint(point);selectRef.current?.(event.target.value);}else focusLocation(point); }}>{view.tiles.map(item => <option key={item.id} value={item.id}>{String.fromCharCode(65 + item.row)}{item.col + 1} · {item.name}{player?.discovered.includes(item.id) ? "" : " · Sin descubrir"}</option>)}</select><span>{tile?.protected ? "Estación protegida" : tile?.dangerous ? "Frontera expuesta" : "Zona neutral"}</span></div>}
    {notice && <div className="g-notice" role="status">{notice}<button aria-label="Cerrar aviso gráfico" onClick={() => setNotice("")}>×</button></div>}
  </section></>;
}
