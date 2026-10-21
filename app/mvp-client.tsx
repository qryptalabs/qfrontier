"use client";

import {isQuickHabitableCommand} from '../lib/client/quick-command';
import {createDistrictManualQueue,sendDistrictManualCommand,type DistrictManualNavigationCommand} from '../lib/client/district-controls';
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowDownUp, ArrowRight, ArrowUpRight, BookOpen, Boxes, Check, ChevronDown, CircleHelp, ClipboardList, Clock3, Compass, Droplets, Factory, Flag, FlaskConical, Gem, Hammer, Home, Leaf, LoaderCircle, Map, MapPin, Mountain, Package, Pickaxe, Plus, Radio, Search, Shield, ShieldCheck, Sprout, Swords, Telescope, TreePine, Truck, Users, UtensilsCrossed, Wheat, Wind, X } from "lucide-react";
import { BIOME_LABELS, BUILDING_LABELS, ITEMS, ITEM_CATALOG, RECIPES, TERRAIN_LABELS, WEATHER_LABELS } from "../lib/mvp/catalog";
import type { ActionQuote, MvpView, PublicPlayer } from "../lib/mvp/view";
import type { BuildingType, ItemId, Job, MvpCommand, Tile } from "../lib/mvp/types";
import "./mvp.css";
import FrontierWorld from "./graphics/frontier-world";
import RoyalHarbor from "./graphics/royal-harbor";
import ItemArt from "./graphics/item-art";
import GameIcon from "./graphics/game-icons";
import "./graphics/premium.css";
import StarterProtectionBanner from "./graphics/starter-protection";
import HabitableClient from "./habitable-client";
import {ManagerForecastPanel} from "./production-manager";
import SectorPicker from "./sector-picker";
import FirstTradePanel from "./first-trade-panel";
import {ActivityAlerts,ActivityBell,ExperienceBar} from "./activity-hub";
import {GameAudio,useAudioActivity} from './game-audio';
import {useActivityNotifications} from "./use-activity-notifications";
import {useLevelNotifications} from "./use-level-notifications";
import {LevelCelebration,LevelUnlockDialog} from "./level-progression";
import TestBooster from "./test-booster";
import {activityNotificationNavigation} from "../lib/client/activity-notifications";
import type {ActivityCompletion} from "../lib/mvp/activity-progression";
import type {TestBoostReservation} from "../lib/mvp/test-boosts";
import { ownedItemOptions, usableQuantity } from "../lib/client/stock-options";
import { useGameTimestamp } from "./local-time";
import {defaultGameNavigation,formatGameNavigation,normalizeGameNavigation,parseGameNavigation,sameGameNavigation,type GameNavigation,type GameTab} from "../lib/client/navigation";
type Tab = GameTab;
type GameNavigate=(next:GameNavigation|((current:GameNavigation)=>GameNavigation),options?:{replace?:boolean})=>void;
const GameRouteContext=createContext<{navigation:GameNavigation;navigate:GameNavigate}|null>(null);
export function useGameRoute(){const route=useContext(GameRouteContext);if(!route)throw new Error("Game navigation requires its provider.");return route;}
export function useGameSection(fallback:string):[string,(section:string)=>void]{
    const route=useContext(GameRouteContext),[local,setLocal]=useState(fallback);
    return route?[route.navigation.section,section=>route.navigate(current=>({...current,section}))]:[local,setLocal];
}
type Option = {
    value: string;
    label: string;
    available?: number;
};
type Action = (command: MvpCommand) => void;
type ApiReply = {
    view: MvpView;
    quote: ActionQuote;
    error?: string;
    code?: string;
};
const STORAGE_UNAVAILABLE = "MVP_STORAGE_UNAVAILABLE";
const SESSION_REQUIRED = "MVP_SESSION_REQUIRED";
const PENDING_ORDER_KEY = "qfrontier.pending-order.v1";
const subscribeLocation = () => () => {};
type PendingOrder = {
    version: 1;
    requestId: string;
    command: MvpCommand;
    kind: "create" | "quoted" | "quick";
    playerIds: string[];
    durationSeconds: number;
    expectedRevision?: number;
    quoteToken?: string;
    quoteExpiresAt?: number;
};
function connectionError(message: string, code = STORAGE_UNAVAILABLE): Error {
    return Object.assign(new Error(message), { code });
}
function errorCode(error: unknown): unknown {
    return error instanceof Error && "code" in error ? error.code : undefined;
}
function uncertainOutcome(error: unknown): boolean {
    return error instanceof TypeError || errorCode(error) === STORAGE_UNAVAILABLE || errorCode(error) === SESSION_REQUIRED;
}
function savePendingOrder(order: PendingOrder | null) {
    try { if (order) sessionStorage.setItem(PENDING_ORDER_KEY, JSON.stringify(order)); else sessionStorage.removeItem(PENDING_ORDER_KEY); } catch { /* The in-memory identifier remains available when browser storage is disabled. */ }
}
function restorePendingOrder(view: MvpView): PendingOrder | null {
    try {
        const raw = sessionStorage.getItem(PENDING_ORDER_KEY);
        if (!raw) return null;
        if (raw.length > 24000) throw new Error("Invalid pending order");
        const order = JSON.parse(raw) as PendingOrder;
        const owns = (id: string) => view.players.some(player => player.id === id);
        if (order.version !== 1 || !/^[0-9a-f-]{36}$/i.test(order.requestId) || !["create", "quoted", "quick"].includes(order.kind)
            || !order.command || typeof order.command !== "object" || !/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/.test(order.command.type)
            || !Array.isArray(order.playerIds) || !order.playerIds.some(id => typeof id === "string" && owns(id))
            || order.command.playerId !== undefined && !owns(order.command.playerId)
            || !Number.isFinite(order.durationSeconds) || order.durationSeconds < 0
            || (order.kind === "create" ? order.command.type !== "player.create" : order.command.type === "player.create"
                || !Number.isSafeInteger(order.expectedRevision) || order.expectedRevision! < 0
                || typeof order.quoteToken !== "string" || !/^[0-9a-f]{64}$/.test(order.quoteToken)
                || !Number.isSafeInteger(order.quoteExpiresAt) || order.quoteExpiresAt! <= 0)
            || order.kind === "quick" && !isQuickHabitableCommand(order.command.type)) throw new Error("Invalid pending order");
        return order;
    } catch { savePendingOrder(null); return null; }
}
async function readReply(response: Response, expected: "view" | "quote"): Promise<ApiReply> {
    const contentType = response.headers.get("content-type") ?? "";
    if (response.type === "opaqueredirect" || response.status === 401 || response.status === 403 || response.ok && contentType.includes("text/html"))
        throw connectionError("Tu sesión necesita verificarse. Volvé a iniciar sesión para continuar con esta misma partida.", SESSION_REQUIRED);
    if (!contentType.includes("application/json")) throw connectionError("El servidor no devolvió una respuesta de partida válida. Comprobá la conexión antes de repetir la orden.");
    let raw: unknown;
    try { raw = await response.json(); } catch { throw connectionError("No pudimos verificar la respuesta del servidor. Conservamos el identificador de la orden."); }
    if (!raw || typeof raw !== "object")
        throw connectionError("La frontera devolvió una respuesta inválida.");
    const data = raw as Record<string, unknown>;
    if (!response.ok)
        return { error: typeof data.error === "string" ? data.error : "No se pudo completar la solicitud.", code: typeof data.code === "string" ? data.code : response.status >= 500 ? STORAGE_UNAVAILABLE : undefined } as ApiReply;
    const payload = data[expected];
    if (!payload || typeof payload !== "object")
        throw connectionError("La respuesta de la frontera está incompleta.");
    const fields = payload as Record<string, unknown>;
    if (typeof fields.revision !== "number" || (expected === "view" && (!Array.isArray(fields.tiles) || !Array.isArray(fields.players))) || (expected === "quote" && (typeof fields.token !== "string" || typeof fields.expiresAt !== "number")))
        throw connectionError("No pudimos interpretar el estado de la frontera.");
    return data as ApiReply;
}
/** Bound the whole POST, including its body. Aborting never proves a write was undone. */
async function postReply(path: string, expected: "view" | "quote", body: Record<string, unknown>): Promise<{response: Response; data: ApiReply}> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => { controller.abort(); reject(connectionError("La respuesta tardó demasiado. La orden puede haberse guardado; comprobá su resultado antes de enviar otra.")); }, 12000);
    });
    try {
        return await Promise.race([deadline, (async () => {
            const response = await fetch(path, {method: "POST", credentials: "same-origin", redirect: "manual", headers: {"Content-Type": "application/json", Accept: "application/json"}, body: JSON.stringify(body), signal: controller.signal});
            return {response, data: await readReply(response, expected)};
        })()]);
    } catch (error) {
        if (controller.signal.aborted) throw connectionError("La respuesta tardó demasiado. La orden puede haberse guardado; comprobá su resultado antes de enviar otra.");
        throw error;
    } finally { clearTimeout(timeout); }
}
function pendingOrderBody(order: PendingOrder): Record<string, unknown> {
    return {requestId: order.requestId, command: order.command, expectedRevision: order.expectedRevision, quoteToken: order.quoteToken, quoteExpiresAt: order.quoteExpiresAt};
}
function replyError(reply: ApiReply, fallback: string): Error {
    return Object.assign(new Error(reply.error ?? fallback), { code: reply.code });
}
type Field = {
    key: string;
    label: string;
    type?: "text" | "number" | "select" | "checkbox" | "multi" | "sector";
    options?: Option[];
    min?: number;
    max?: number;
    maxFrom?: string;
    value?: string | number | boolean;
    optional?: boolean;
    required?: boolean;
    disabled?: boolean;
    hint?: string;
};
const NAV = [{ id: "world" as const, label: "Mundo", compact: "Mundo" }, { id: "roam" as const, label: "Recorrer", compact: "Recorrer" }, { id: "station" as const, label: "Estación", compact: "Estación" }, { id: "trade" as const, label: "Comercio", compact: "Comercio" }, { id: "community" as const, label: "Comunidad", compact: "Comunidad" }, { id: "expeditions" as const, label: "Expediciones", compact: "Expediciones" }, { id: "season" as const, label: "Temporada", compact: "Temporada" }];
const ICONS: Partial<Record<ItemId, typeof Compass>> = { timber: TreePine, iron_ore: Mountain, copper_ore: Mountain, grain: Wheat, fiber: Leaf, herbs: Sprout, water: Droplets, biomass: Leaf, silica: Gem, stone: Mountain, crystal_shard: Gem, data_fragment: BookOpen, iron_ingot: Boxes, copper_wire: Wind, alloy: Boxes, cloth: Package, nutrient: Sprout, seed: Sprout, glass: Gem, plank: TreePine, ration: UtensilsCrossed, bread: Wheat, preserved_food: Package, medkit: Plus, repair_kit: Hammer, drill_module_i: Factory, drill_module_ii: Factory, pickaxe: Pickaxe, scanner: Telescope, cart: Truck, weather_cloak: Home, camp_kit: Flag, guard_armor: Shield, spear: Swords, arrow_bundle: Boxes, bridge_kit: Hammer };
const FACTIONS = [{ id: "cartographers", name: "Cartógrafos", icon: Compass, bonus: "Prospección un 10 % más rápida y un dato adicional." }, { id: "forgers", name: "Forjadores", icon: Hammer, bonus: "Fabricación un 10 % más rápida, con los mismos insumos." }, { id: "custodians", name: "Custodios", icon: Shield, bonus: "Un 10 % menos de desgaste en equipo defensivo." }];
const itemName = (id: string) => ITEM_CATALOG[id as ItemId]?.name ?? id;
const roleNames: Record<string, string> = { founder: "Fundador", coordinator: "Coordinador", storekeeper: "Almacenista", member: "Miembro" };
const milestoneNames: Record<string, string> = { explorer: "Exploración", "tool-use": "Uso de herramientas", army: "Primeras unidades", research: "Plano investigado", "blueprint-clue": "Pista de plano", expedition: "Expedición completada", "npc-training": "Entrenamiento NPC", extraction: "Primera extracción", "first-craft": "Primera fabricación", farming: "Primera cosecha", convoy: "Convoy entregado" };
const quantity = (player: PublicPlayer, id: ItemId, bound?: boolean) => player.inventory.filter(lot => lot.itemId === id && (bound === undefined || lot.bound === bound)).reduce((sum, lot) => sum + lot.qty, 0);
const duration = (seconds: number) => seconds < 60 ? `${Math.ceil(seconds)} s` : seconds < 3600 ? `${Math.floor(seconds / 60)} min${seconds % 60 ? ` ${Math.ceil(seconds % 60)} s` : ""}` : `${Math.floor(seconds / 3600)} h ${Math.ceil(seconds % 3600 / 60)} min`;
const itemOptions: Option[] = ITEMS.map(item => ({ value: item.id, label: item.name }));
const unitNames = { scout: "Explorador", guard: "Guardia", ranged: "Tirador", engineer: "Ingeniero" };
function ItemIcon({ id, size = 17 }: {
    id: string;
    size?: number;
}) { return <ItemArt id={id} size={Math.max(32, size * 1.5)} />; }
function Empty({ icon: Icon = Compass, title, children }: {
    icon?: typeof Compass;
    title: string;
    children: React.ReactNode;
}) {
    return <div className="m-empty">
  <Icon size={31}/>
  <h3>{title}</h3>
  <p>{children}</p>
    </div>;
}
function Info({ children }: {
    children: React.ReactNode;
}) {
    return <div className="m-info">
  <ShieldCheck size={18}/>
  <p>{children}</p>
    </div>;
}
function Subtabs({ values, value, setValue }: {
    values: Option[];
    value: string;
    setValue: (value: string) => void;
}) { return <nav className="m-subtabs" aria-label="Secciones">{values.map(item => <button key={item.value} className={value === item.value ? "active" : ""} onClick={() => setValue(item.value)}>{item.label}</button>)}</nav>; }
function ActionForm({ title, description, command, fields = [], actor, busy, act, button = "Revisar orden", transform, stock }: {
    title: string;
    description?: string;
    command: string;
    fields?: Field[];
    actor: string;
    busy: boolean;
    act: Action;
    button?: string;
    transform?: (values: Record<string, unknown>) => Record<string, unknown>;
    stock?: Option[];
}) {
    const [values, setValues] = useState<Record<string, unknown>>(() => Object.fromEntries(fields.map(field => [field.key, field.value ?? (field.type === "checkbox" ? false : field.type === "multi" ? [] : field.type === "select" ? field.options?.[0]?.value ?? "" : field.type === "number" ? field.min ?? 1 : "")])));
    const outgoing = ["market.publish", "convoy.start", "funding.open", "clan.deposit"].includes(command) || command === "contract.publish" && values.kind === "transport";
    const productKey = command === "convoy.start" ? "cargoItem" : "itemId";
    const quantityKey = command === "convoy.start" ? "cargoQty" : "qty";
    const preparedFields: Field[] = stock ? fields.map(field => field.key === productKey && field.type === "select" ? {...field, options: outgoing ? stock : [...stock, ...(field.options ?? []).filter(option => !stock.some(owned => owned.value === option.value))]} : outgoing && field.key === quantityKey ? {...field, maxFrom: productKey} : field) : fields;
    const displayFields: Field[] = preparedFields.map(field => field.type === "select" && field.options?.length === 81 && field.options.every(option => /^t_[0-8]_[0-8]$/.test(option.value)) ? {...field, type: "sector"} : field);
    const current = {...values};
    for (const field of displayFields) if (field.type === "select" || field.type === "sector") {
      if (!(field.optional && current[field.key] === "") && !field.options?.some(option => option.value === current[field.key])) current[field.key] = field.options?.find(option => option.value === field.value)?.value ?? field.options?.[0]?.value ?? "";
    }
    const maximum = (field: Field) => field.maxFrom ? Math.min(field.max ?? Infinity, displayFields.find(candidate => candidate.key === field.maxFrom)?.options?.find(option => option.value === current[field.maxFrom!])?.available ?? 0) : field.max;
    const unavailable = displayFields.some(field => !field.optional && (field.type === "select" || field.type === "sector") && !field.options?.length || field.type === "number" && maximum(field) !== undefined && (Number(current[field.key]) > maximum(field)! || maximum(field)! < (field.min ?? 1)));
    return <section className="m-card">
  <div className="m-card-header">
    <h3>{title}</h3>
    <ArrowUpRight size={17} strokeWidth={1.3}/>
  </div>
  {description && <p style={{ marginBottom: 19 }}>{description}</p>}
  <form className="m-form" onSubmit={event => { event.preventDefault(); if (!busy && !unavailable) act({ type: command, playerId: actor, ...(transform ? transform(current) : current) }); }}>
    {displayFields.map(field => field.type === "checkbox" ? <label className="m-checkbox" key={field.key}>
      <input type="checkbox" required={field.required} checked={!!values[field.key]} onChange={event => setValues(previous => ({ ...previous, [field.key]: event.target.checked }))} disabled={busy || field.disabled}/>
      <span>
        {field.label}
        {field.hint && <small className="m-note" style={{ display: "block" }}>{field.hint}</small>}
      </span>
    </label> : field.type === "multi" ? <fieldset key={field.key} disabled={busy || field.disabled} style={{ border: "1px solid #dce4ce", borderRadius: 6, padding: 12 }}>
      <legend className="m-note">{field.label}</legend>
      {field.options?.length ? field.options.map(option => <label key={option.value} className="m-checkbox" style={{ margin: "5px 0" }}>
        <input type="checkbox" checked={(values[field.key] as string[] ?? []).includes(option.value)} disabled={busy || (field.max !== undefined && (values[field.key] as string[] ?? []).length >= field.max && !(values[field.key] as string[] ?? []).includes(option.value))} onChange={event => setValues(previous => ({ ...previous, [field.key]: event.target.checked ? [...previous[field.key] as string[], option.value] : (previous[field.key] as string[]).filter(id => id !== option.value) }))}/>
        {option.label}
      </label>) : <span className="m-note">No hay unidades disponibles.</span>}
      {field.hint && <p className="m-note">{field.hint}</p>}
    </fieldset> : field.type === "sector" ? <SectorPicker key={field.key} label={field.label} value={String(current[field.key] ?? "")} options={field.options ?? []} disabled={busy || field.disabled} onChange={value => setValues(previous => ({...previous, [field.key]: value}))}/> : <label key={field.key}>
      {field.label}
      {field.type === "select" ? <select required={!field.optional} value={String(current[field.key] ?? "")} disabled={busy || field.disabled || !field.options?.length} onChange={event => setValues(previous => ({ ...previous, [field.key]: event.target.value }))}>
        {field.optional && <option value="">Sin selección</option>}
        {!field.optional && !field.options?.length && <option value="">Sin productos disponibles</option>}
        {field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select> : <input type={field.type === "number" ? "number" : "text"} min={field.min} max={maximum(field)} step={field.type === "number" ? 1 : undefined} maxLength={field.type === "text" || !field.type ? 80 : undefined} required={!field.optional} value={String(current[field.key] ?? "")} onChange={event => setValues(previous => ({ ...previous, [field.key]: field.type === "number" ? Number(event.target.value) : event.target.value }))} disabled={busy || field.disabled}/>}
      {field.hint && <span className="m-note">{field.hint}</span>}
    </label>)}
    {unavailable && <p className="m-note" role="status">No hay existencias suficientes para esta cantidad. Revisá los productos disponibles.</p>}
    <button className="m-button full" type="submit" disabled={busy || unavailable}>
      <ClipboardList size={14}/>
      {button}
      <ArrowRight size={13}/>
    </button>
  </form>
    </section>;
}
function Jobs({ jobs, clock, busy, act, actor }: {
    jobs: Job[];
    clock: number;
    busy: boolean;
    act: Action;
    actor: string;
}) {
    const active = jobs.filter(job => job.status === "running" || job.status === "reserved");
    const labels = { survey: "Prospección", travel: "Viaje", extract: "Extracción", craft: "Fabricación", farm: "Cultivo", expedition: "Expedición", battle: "Encuentro", convoy: "Convoy", upgrade: "Mejora en construcción", land:'Trabajo de terreno' };
    const landLabels:Record<string,string>={explore:'Exploración de terreno',clear:'Preparación de terreno',claim:'Expansión de la aldea',center:'Mejora del Centro',road:'Construcción de camino',bridge:'Construcción de puente',demolish:'Desmontaje de construcción'};
    return <section className="m-panel">
  <div className="m-panel-title">
    <h2>
      <Clock3 size={15}/>Órdenes en curso</h2>
    <span>
      {active.length} ACTIVAS</span>
  </div>
  {active.length ? <div className="m-job-list">{active.map(job => {
                const seconds = Math.max(0, Math.ceil((job.endsAt - clock) / 1000));
                const progress = Math.min(100, Math.max(0, (clock - job.startsAt) / Math.max(1, job.endsAt - job.startsAt) * 100));
                const testBoost=job.payload.testBoost as Partial<TestBoostReservation>|undefined;
                return <article className="m-job" key={job.id}>
      <div className="m-job-top">
        <Clock3 size={13}/>
        <span>{job.kind==='land'?landLabels[String(job.payload.landOperation)]??labels.land:labels[job.kind]}</span>
        <strong>{seconds ? duration(seconds) : "Resolviendo…"}</strong>
      </div>
      <div className="m-job-progress"><span style={{ width: `${progress}%` }}/></div>
      <small>Clima fijado: {WEATHER_LABELS[job.weather.state]} · {job.ruleVersion}
      </small>
      {testBoost?.mode==='test'&&typeof testBoost.savedSeconds==='number'&&testBoost.savedSeconds>0&&<small className="m-job-boost"><Clock3 size={11}/>Potenciador de prueba · {duration(testBoost.savedSeconds)} de ahorro reservado</small>}
      {job.kind === "craft" && <div className="m-button-row"><button className="m-link-button" disabled={busy} onClick={() => act({ type: "craft.cancel", playerId: actor, jobId: job.id })}>{job.startsAt <= clock ? "Cancelar sin recuperar insumos" : "Cancelar y devolver la reserva"}<X size={11}/>
        </button></div>}
    </article>;
            })}</div> : <p>Tu estación está en calma. Prepará una orden para aprovechar tu próxima visita.</p>}
    </section>;
}
function StockSummary({ player, openInventory }: {
    player: PublicPlayer;
    openInventory: () => void;
}) {
    const types = new Set(player.inventory.map(lot => lot.itemId)).size;
    const total = player.inventory.reduce((sum, lot) => sum + lot.qty, 0);
    return <section className="m-panel">
  <div className="m-panel-title">
    <h2>
      <Package size={15}/>Almacén de la estación</h2>
    <span>
      {types} TIPOS</span>
  </div>
  <div className="m-inventory-summary">
    <div className="m-summary-value">
      <strong>{total}</strong>
      <span>unidades disponibles</span>
    </div>
    <div className="m-summary-value">
      <strong>{player.inventory.length}</strong>
      <span>lotes con procedencia</span>
    </div>
  </div>
  {["timber", "iron_ore", "water", "grain", "ration"].map(id => <div className="m-item-row" key={id}>
    <ItemIcon id={id}/>
    <div>
      <strong>{itemName(id)}</strong>
      <small>
        {quantity(player, id as ItemId, false)} transferibles</small>
    </div>
    <span>{quantity(player, id as ItemId)}</span>
  </div>)}
  <button className="m-link-button" style={{ marginTop: 15 }} onClick={openInventory}>Ir a mi estación<ArrowUpRight size={12}/>
  </button>
    </section>;
}
function WeatherPanel({ view, player }: {
    view: MvpView;
    player: PublicPlayer;
}) {
    const tile = view.tiles.find(tile => tile.id === player.position);
    const current = view.weather.find(weather => weather.regionId === tile?.regionId);
    const next = view.forecast.find(weather => weather.regionId === tile?.regionId);
    if (!current)
        return null;
    return <section className="m-panel m-weather">
  <div className="m-panel-title">
    <h2>
      <Wind size={15}/>La ventana del clima</h2>
    <span>{view.regions.find(region => region.id === tile?.regionId)?.name}</span>
  </div>
  <div className="m-weather-main">
    <GameIcon name={current.state} size={56}/>
    <div>
      <strong>{WEATHER_LABELS[current.state]}</strong>
      <span>Movimiento ×{current.movementFactor.toFixed(2)} · Agua ×{current.waterFactor.toFixed(2)}
      </span>
    </div>
  </div>
  <p>La orden conserva su previsión y su duración al confirmarse.</p>
  {next && <div className="m-weather-forecast">
    <div>
      <GameIcon name={current.state} size={30}/>Ahora · {WEATHER_LABELS[current.state]}
    </div>
    <div>
      <GameIcon name={next.state} size={30}/>Próxima ventana · {WEATHER_LABELS[next.state]}
    </div>
  </div>}
    </section>;
}
function WorldScreen({ view, player, selected, setSelected, busy, act, onRoyalTrade }: {
    view: MvpView;
    player: PublicPlayer;
    selected: string;
    setSelected: (id: string) => void;
    busy: boolean;
    act: Action;
    onRoyalTrade: () => void;
}) {
    const [section, setSection] = useGameSection("planet");
    const tile = view.tiles.find(tile => tile.id === selected) ?? view.tiles[0];
    const [amount, setAmount] = useState(3);
    if (!tile)
        return null;
    const known = player.discovered.includes(tile.id);
    const surveyed = player.surveyed.includes(tile.id);
    const here = player.position === tile.id;
    return <>
  <Subtabs value={section} setValue={setSection} values={[{value:"planet",label:"Planeta"},{value:"settlements",label:"Aldeas"},{value:"sectors",label:"Sectores"},{value:"kingdom",label:"Reino del Alba"}]}/>
  {section === "kingdom" ? <RoyalHarbor playerId={player.id} onTradeApplied={onRoyalTrade}/> : <FrontierWorld onVisitKingdom={()=>setSection("kingdom")} view={view} player={player} selected={tile.id} onSelect={setSelected} mode="world" worldPanel={section as "planet"|"settlements"|"sectors"} onWorldPanelChange={setSection}/>}
  {section === "sectors" && <><SectorPicker label="Sector de la expedición" value={tile.id} options={view.tiles.map(item=>({value:item.id,label:`${String.fromCharCode(65+item.row)}${item.col+1} · ${item.name}${player.discovered.includes(item.id)?"":" · Sin descubrir"}`}))} disabled={busy} onChange={setSelected}/>
  <section className="m-selection">
    <div className="m-selection-heading">
      <div>
        <div className="m-eyebrow">
          {tile.regionId} · {String.fromCharCode(65 + tile.row)}
          {tile.col + 1}
        </div>
        <h2>{tile.name}</h2>
        <p className="m-selection-info">{known ? `${BIOME_LABELS[tile.biome]} sobre terreno ${TERRAIN_LABELS[tile.terrain].toLowerCase()}. ${here ? "Aquí se encuentra tu expedición." : "Consultá la ruta antes de viajar."}` : "Una parte de la frontera que aún no conocés. La prospección abre rutas y revela reservas."}</p>
      </div>
      <span className={`m-tag ${tile.dangerous ? "warm" : ""}`}>
        {tile.protected ? <ShieldCheck size={12}/> : <Flag size={12}/>}
        {tile.protected ? "Protegida" : tile.dangerous ? "Frontera expuesta" : "Zona neutral"}
      </span>
    </div>
    <div className="m-selection-body">
      <div className="m-tag-row">
        <span className="m-tag">{BIOME_LABELS[tile.biome]}</span>
        <span className="m-tag">{TERRAIN_LABELS[tile.terrain]}</span>
        <span className="m-tag">{surveyed ? "Prospección registrada" : "Prospección pendiente"}</span>
        {tile.bridge && <span className="m-tag">Puente construido</span>}
      </div>
      <div className="m-button-row">
        <button className="m-button secondary" disabled={busy} onClick={() => act({ type: "world.survey", playerId: player.id, tileId: tile.id })}>
          <Telescope size={14}/>Prospectar</button>
        {!here && <button className="m-button" disabled={busy} onClick={() => act({ type: "world.travel", playerId: player.id, tileId: tile.id })}>
          <Compass size={14}/>Viajar<ArrowUpRight size={12}/>
        </button>}
      </div>
    </div>
    {known && <div className="m-deposits">{tile.deposits.map(deposit => {
                const available = deposit.layers.filter(layer => layer.unlocked).reduce((sum, layer) => sum + layer.remaining - layer.reserved, 0);
                const total = deposit.layers.reduce((sum, layer) => sum + layer.budget, 0);
                return <div key={deposit.itemId}>
        <div className="m-deposit">
          <ItemIcon id={deposit.itemId}/>
          <div className="m-deposit-info">
            <strong>{itemName(deposit.itemId)}</strong>
            <small>
              {available} accesibles · Presupuesto total {total} · {deposit.layers.reduce((sum, layer) => sum + layer.extracted, 0)} extraídos</small>
            <div className="m-deposit-meter"><span style={{ width: `${Math.max(0, available / Math.max(1, total) * 100)}%` }}/></div>
          </div>
          <button className="m-button compact" disabled={busy || !here || available <= 0} onClick={() => act({ type: "mining.reserve", playerId: player.id, tileId: tile.id, itemId: deposit.itemId, qty: amount })}>
            <Pickaxe size={12}/>Extraer</button>
        </div>
        {surveyed && deposit.layers.filter(layer => !layer.unlocked).map((layer, i) => <button className="m-link-button" key={layer.id} disabled={busy || !here} onClick={() => act({ type: "deposit.unlock", playerId: player.id, tileId: tile.id, itemId: deposit.itemId, layer: deposit.layers.indexOf(layer) })}>
          <Plus size={10}/>Abrir capa {deposit.layers.indexOf(layer)} · {layer.remaining} unidades existentes{i === 0 ? "" : " · requiere capa previa"}
        </button>)}
      </div>;
            })}</div>}
    {known && tile.deposits.length > 0 && <label className="m-inline" style={{ flexDirection: "row", fontSize: 13 }}>Cantidad por extracción<input type="number" min="1" max="10" value={amount} onChange={event => setAmount(Math.min(10, Math.max(1, Number(event.target.value))))} style={{ width: 74, padding: "8px 10px" }}/>
      <span>El presupuesto se reserva al confirmar. Extraé desde tu ubicación.</span>
    </label>}
  </section></>}
    </>;
}
function InventoryScreen({ player, busy, act, clock }: {
    player: PublicPlayer;
    busy: boolean;
    act: Action;
    clock: number;
}) {
    const [search, setSearch] = useState("");
    const lots = player.inventory.filter(lot => itemName(lot.itemId).toLowerCase().includes(search.toLowerCase()));
    return <section className="m-panel">
  <div className="m-panel-title">
    <h2>
      <Package size={16}/>Cada objeto conserva su historia</h2>
    <span>
      {player.inventory.length} LOTES</span>
  </div>
  <div className="m-search">
    <Search size={14}/>
    <input aria-label="Buscar en inventario" placeholder="Buscar materiales, productos o rarezas…" value={search} onChange={event => setSearch(event.target.value)}/>
  </div>
  {lots.length ? <div className="m-list">{lots.map(lot => <article key={lot.id} className="m-deposit">
      <ItemIcon id={lot.itemId}/>
      <div className="m-deposit-info">
        <strong>
          {lot.qty} × {itemName(lot.itemId)}
        </strong>
        <small>Calidad {lot.quality} · {lot.bound ? "Vinculado al tutorial" : "Transferible"}
          {lot.expiresAt ? ` · Caduca ${duration(Math.max(0, (lot.expiresAt - clock) / 1000))}` : ""}
          {ITEM_CATALOG[lot.itemId].durability ? ` · Durabilidad ${lot.wear}/${ITEM_CATALOG[lot.itemId].durability}` : ""}
        </small>
        <details className="m-trace">
          <summary>Origen y trazabilidad</summary>
          <p className="m-note">Origen: {lot.provenance.source} · Temporada {lot.provenance.seasonId}
            <br />Insumos: {lot.provenance.inputs.map(input => `${input.qty} ${itemName(input.itemId)}`).join(", ") || "Origen natural o kit de incorporación"}
            <br />Lote {lot.id}
          </p>
        </details>
      </div>
      {ITEM_CATALOG[lot.itemId].durability && lot.wear < ITEM_CATALOG[lot.itemId].durability! && <button className="m-button secondary compact" disabled={busy} onClick={() => act({ type: "credit.service", playerId: player.id, lotId: lot.id })}>Reparar · 10 CR</button>}
      {lot.provenance.inputs.length > 0 && <button className="m-button secondary compact" disabled={busy} onClick={() => act({ type: "craft.recycle", playerId: player.id, lotId: lot.id, qty: 1 })}>Reciclar 1</button>}
    </article>)}</div> : <Empty icon={Package} title="Todavía queda espacio.">Recogé materiales y prepará tu próxima receta.</Empty>}
    <Info>Los materiales del tutorial y sus derivados siguen vinculados. La caducidad, calidad y procedencia pertenecen a cada lote.</Info>
    </section>;
}
function StationScreen({ view, player, busy, act, clock }: {
    view: MvpView;
    player: PublicPlayer;
    busy: boolean;
    act: Action;
    clock: number;
}) {
    const [section, setSection] = useGameSection("overview");
    const [recipeGroup, setRecipeGroup] = useState("all");
    const [craftQty, setCraftQty] = useState(1);
    const [craftBoost,setCraftBoost]=useState(false);
    const [farmBoost,setFarmBoost]=useState(false);
    const [transferableOnly, setTransferableOnly] = useState(()=>view.firstTrade?.playerId===player.id&&view.firstTrade.stage!=="complete");
    const stats = view.progress?.playerId === player.id ? view.progress.stats : player.stats;
    const homeRegion = view.tiles.find(tile => tile.id === player.position)?.regionId;
    const region = view.regions.find(region => region.id === homeRegion);
    return <>
  <Subtabs value={section} setValue={setSection} values={[{ value: "overview", label: "Mi estación" }, { value: "inventory", label: "Inventario" }, { value: "craft", label: "Fabricación" }, { value: "farm", label: "Agricultura" }, { value: "buildings", label: "Edificios" }, { value: "army", label: "Unidades" }]}/>
  {["overview", "buildings", "army"].includes(section) && <div className="g-station-scene"><FrontierWorld view={view} player={player} mode="station" compact /></div>}
  {section === "overview" && <>
    <section className="m-station-hero">
      <div>
        <div className="m-eyebrow">TU HOGAR EN LA FRONTERA</div>
        <h2>{player.stationName}</h2>
        <p>Una estación pequeña. Un horizonte lleno de posibilidades.</p>
      </div>
      <div className="m-tag-row">
        <span className="m-tag">{FACTIONS.find(faction => faction.id === player.faction)?.name}</span>
        <span className="m-tag">
          <ShieldCheck size={11}/>Estación protegida</span>
        <span className="m-tag">Herramienta básica permanente</span>
      </div>

    </section>
    <p className="m-note">Actividad de {player.name} · {player.stationName}. Las órdenes de tus otros exploradores tienen su propio historial.</p>
    <div className="m-stat-grid">{[{ label: "Materiales recogidos", value: stats.gathered, icon: Pickaxe }, { label: "Productos creados", value: stats.crafted, icon: Hammer }, { label: "Regiones visitadas", value: player.visitedRegions.length, icon: Map }, { label: "Intercambios", value: stats.trades, icon: ArrowDownUp }].map(stat => <div className="m-stat" key={stat.label}>
        <stat.icon size={18} strokeWidth={1.4}/>
        <strong>{stat.value}</strong>
        <span>{stat.label}</span>
      </div>)}</div>
    <Info>
      <strong>Tu ausencia no destruye tu estación.</strong> Las unidades descansan y no acumulan deuda de alimentos. Las funciones activas requieren sus suministros al iniciar cada orden.</Info>
    <div className="m-panel" style={{ marginTop: 18 }}>
      <div className="m-panel-title">
        <h2>
          <Flag size={14}/>Hitos registrados</h2>
        <span>{player.milestones.length}</span>
      </div>
      <div className="m-tag-row">{player.milestones.length ? player.milestones.map(milestone => <span key={milestone} className="m-tag">
          <Check size={10}/>
          {milestoneNames[milestone] ?? milestone.replaceAll("_", " ").replaceAll("-", " ")}
        </span>) : <span className="m-note">Tus primeras decisiones irán escribiendo esta historia.</span>}</div>
    </div>
  </>}
  {section === "inventory" && <InventoryScreen player={player} busy={busy} act={act} clock={clock}/>}
  {section === "craft" && <>
    <TestBooster boosts={view.boosts} checked={craftBoost} onChange={setCraftBoost} disabled={busy}/>
    <label className="m-checkbox m-craft-source"><input type="checkbox" checked={transferableOnly} disabled={busy} onChange={event=>setTransferableOnly(event.target.checked)}/><span>Fabricar sólo con insumos transferibles<small className="m-note">Para producir bienes que puedas vender. El servidor reserva únicamente esos lotes.</small></span></label>
    <div className="m-spread" style={{ marginBottom: 17, gap: 15 }}>
      <select value={recipeGroup} onChange={event => setRecipeGroup(event.target.value)} style={{ maxWidth: 210 }} aria-label="Filtrar recetas">
        <option value="all">Todas las recetas · 24</option>
        {Object.entries(BUILDING_LABELS).map(([id, name]) => <option value={id} key={id}>{name}</option>)}
      </select>
      <label className="m-inline" style={{ flexDirection: "row", fontSize: 13 }}>Lotes<input type="number" min="1" max="5" value={craftQty} onChange={event => setCraftQty(Math.max(1, Math.min(5, Number(event.target.value))))} style={{ width: 74, padding: 9 }}/>
      </label>
    </div>
    <div className="m-grid-3">{RECIPES.filter(recipe => recipeGroup === "all" || recipe.building === recipeGroup).map(recipe => {
                const access = view.unlocks?.recipes.find(item=>item.id===recipe.id);
                const levelLocked=access?.unlocked===false;
                const boosted=craftBoost&&view.boosts?.eligibleCommands.includes('craft.start')&&view.boosts.eligibleRecipeIds.includes(recipe.id);
                const ready = player.buildings[recipe.building] >= recipe.level;
                const ingredientsReady = recipe.inputs.every(input => usableQuantity(player.inventory, input.itemId, clock, transferableOnly) >= input.qty * craftQty);
                return <article className={`m-card ${levelLocked?'m-recipe-locked':''}`} key={recipe.id}>
        <div className="m-recipe-art">
          <ItemArt id={recipe.id} size={112} />
          <span>+{recipe.output[0].qty * craftQty} UNIDADES</span>
        </div>
        <div className="m-eyebrow">
          {BUILDING_LABELS[recipe.building]} · NIVEL {recipe.level}
        </div>
        <h3>{recipe.name}</h3>
        {access&&<p className={`m-recipe-level ${levelLocked?'locked':''}`}>{levelLocked?<Shield size={13}/>:<Check size={13}/>} {access.legacy?'Conocimiento conservado':levelLocked?`Explorador nivel ${access.requiredLevel} para desbloquear`:`Disponible · Explorador nivel ${access.requiredLevel}`}</p>}
        <p>{ITEM_CATALOG[recipe.id].description}</p>
        <div className="m-costs">{recipe.inputs.map(input => <span className={`m-cost ${usableQuantity(player.inventory, input.itemId, clock, transferableOnly) < input.qty * craftQty ? "missing" : "available"}`} key={input.itemId}>
            {input.qty * craftQty} {itemName(input.itemId)} · {usableQuantity(player.inventory, input.itemId, clock, transferableOnly)} {transferableOnly ? "transferibles" : "disponibles"}
          </span>)}</div>
        {(recipe.id === "ration" || recipe.id === "bread") && <p className="m-note">{recipe.id === "ration" ? "Ración: suministros de viajes y jornadas · caduca en 72 h." : "Pan: producto civil · caduca en 48 h. Comparte los ingredientes de la ración en esta alfa."}</p>}
        {craftBoost&&<p className="m-note">{boosted?'Potenciador seleccionado: la cotización comprobará su ahorro exacto.':'Esta receta conserva su tiempo normal; no admite potenciadores.'}</p>}
        <button className="m-button full" disabled={busy || levelLocked || !ready || !ingredientsReady} onClick={() => act({ type: "craft.start", playerId: player.id, recipeId: recipe.id, qty: craftQty, transferableOnly,...(boosted?{useTestBoost:true}:{}) })}>
          <Hammer size={13}/>
          {levelLocked?`Requiere explorador nivel ${access.requiredLevel}`:!ready ? "Mejorá el edificio" : ingredientsReady ? "Cotizar fabricación" : "Faltan ingredientes"}
        </button>
      </article>;
            })}</div>
    <Info>Antes de confirmar verás insumos, duración, clima aplicado y política de devolución. Los productos aparecen cuando el servidor completa el trabajo.</Info>
  </>}
  {section === "farm" && <div className="m-grid-2">
    <section className="m-card">
      <div className="m-recipe-art">
        <ItemArt id="building:garden:1" size={140} />
        <span>CULTIVO CONTROLADO</span>
      </div>
      <h3>Una cosecha con límites.</h3>
      <p>Una semilla, dos aguas y un nutriente producen tres granos y una biomasa. Diez ciclos por parcela y temporada.</p>
      <div className="m-costs">
        <span className="m-cost">1 semilla</span>
        <span className="m-cost">2 aguas</span>
        <span className="m-cost">1 nutriente</span>
      </div>
      <div className="m-funded">
        <div className="m-spread">
          <span>Ciclos usados en tu parcela</span>
          <strong>
            {player.farmCycles} / 10</strong>
        </div>
        <div className="m-sparkline"><span style={{ width: `${Math.min(100, player.farmCycles * 10)}%` }}/></div>
      </div>
      <TestBooster boosts={view.boosts} checked={farmBoost} onChange={setFarmBoost} disabled={busy}/>
      <button className="m-button full" disabled={busy} onClick={() => act({ type: "farm.start", playerId: player.id,...(farmBoost&&view.boosts?.eligibleCommands.includes('farm.start')?{useTestBoost:true}:{}) })}>
        <Sprout size={14}/>Cotizar cultivo</button>
    </section>
    <section className="m-card">
      <h3>El suelo también cuenta.</h3>
      <p>La parcela consume una cuota regional. Un huerto mejor no reinicia la fertilidad del mundo.</p>
      <div className="m-admin-list" style={{ marginTop: 22 }}>
        <div>
          <span>Región</span>
          <strong>{region?.name ?? homeRegion}</strong>
        </div>
        <div>
          <span>Fertilidad disponible</span>
          <strong>
            {region?.farmRemaining ?? 0} / {region?.farmBudget ?? 0}
          </strong>
        </div>
        <div>
          <span>Agua regional sin asignar</span>
          <strong>{region?.waterUnassigned ?? 0}</strong>
        </div>
        <div>
          <span>Nivel de huerto</span>
          <strong>{player.buildings.garden}</strong>
        </div>
      </div>
      <button className="m-button secondary full" disabled={busy||player.buildings.garden>=3||view.jobs.some(job=>job.playerId===player.id&&job.kind==='upgrade'&&job.payload.building==='garden'&&(job.status==='running'||job.status==='reserved'))} onClick={() => act({ type: "building.upgrade", playerId: player.id, building: "garden" })}>Mejorar huerto<ArrowUpRight size={13}/>
      </button>
    </section>
  </div>}
  {section === "buildings" && <div className="m-grid-3">{(Object.entries(BUILDING_LABELS) as [
                BuildingType,
                string
            ][]).map(([id, name]) => <article className="m-card" key={id}>
      <div className="m-recipe-art">
        <ItemArt id={`building:${id}:${player.buildings[id]}`} size={140} />
        <span>NIVEL {player.buildings[id]}
        </span>
      </div>
      <h3>{name}</h3>
      <p>La cuadrilla amplía el edificio sin detener su uso actual. El nuevo nivel se activa al terminar la obra.</p>
      {view.jobs.filter(job=>job.playerId===player.id&&job.kind==='upgrade'&&job.payload.building===id&&(job.status==='running'||job.status==='reserved')).map(job=><p className="m-note" role="status" key={job.id}><Clock3 size={13}/>Obra en curso · {job.endsAt>clock?duration((job.endsAt-clock)/1000):"Confirmando finalización…"}</p>)}
      <button className="m-button full" disabled={busy||player.buildings[id]>=3||view.jobs.some(job=>job.playerId===player.id&&job.kind==='upgrade'&&job.payload.building===id&&(job.status==='running'||job.status==='reserved'))} onClick={() => act({ type: "building.upgrade", playerId: player.id, building: id })}>
        <Plus size={13}/>Revisar mejora</button>
    </article>)}</div>}
  {section === "army" && <>
    <div className="m-grid-2">
      <ActionForm title="Preparar una unidad" description="Cada unidad tiene salud y disponibilidad. El entrenamiento reserva equipo y suministros." command="army.prepare" fields={[{ key: "unitType", label: "Especialidad", type: "select", options: Object.entries(unitNames).map(([value, label]) => ({ value, label })) }, { key: "qty", label: "Cantidad", type: "number", min: 1, max: 5 }]} actor={player.id} busy={busy} act={act}/>
      <section className="m-card">
        <h3>Tu destacamento</h3>
        <p>Las unidades estacionadas descansan. Solo las órdenes activas consumen alimentos.</p>
        <div className="m-list" style={{ marginTop: 20 }}>{player.units.length ? player.units.map(unit => <div className="m-deposit" key={unit.id}>
            <ItemArt id={`unit:${unit.type}:${player.faction}`} size={54} />
            <div className="m-deposit-info">
              <strong>{unitNames[unit.type]}</strong>
              <small>Salud {unit.health} · {unit.busy ? "En una orden" : "Disponible"}
              </small>
            </div>
            {unit.health < 100 && <button className="m-button compact secondary" disabled={busy || unit.busy} onClick={() => act({ type: "army.heal", playerId: player.id, unitId: unit.id })}>
              <Plus size={11}/>Curar</button>}
          </div>) : <span className="m-note">Aún no has preparado unidades.</span>}</div>
      </section>
    </div>
    <Info>El PvP es voluntario y tiene enfriamiento. Tu estación permanece protegida; los riesgos se limitan a las acciones y cargas expuestas.</Info>
  </>}
    </>;
}
function Welcome({ view, busy, create }: {
    view: MvpView;
    busy: boolean;
    create: (values: Record<string, unknown>) => void;
}) {
    const [faction, setFaction] = useState("cartographers");
    const [name, setName] = useState("");
    const [stationName, setStationName] = useState("");
    const [referralDraft, setReferralCode] = useState<string|null>(null);
    const invited = useSyncExternalStore(subscribeLocation,()=>{const code=new URLSearchParams(window.location.search).get("invite");return code&&/^(?:QF[0-9A-F]{12}|p_[0-9a-f-]{36})$/i.test(code)?code:"";},()=>"");
    const referralCode = referralDraft ?? invited;
    return <main className="m-welcome">
  <div className="g-welcome-scene"><FrontierWorld view={view} player={null} mode="showcase" /></div>
  <div className="m-welcome-copy">
    <div className="m-eyebrow">UN MUNDO QUE CONSERVA SU HISTORIA</div>
    <h1>La frontera<br />te está <em>esperando.</em>
    </h1>
    <p>Explorá un territorio finito. Construí una estación. Encontrá tu lugar entre quienes están escribiendo un mundo nuevo.</p>

    <div className="m-welcome-footer">
      <span>
        <Compass size={13}/>Explora</span>
      <span>
        <Hammer size={13}/>Produce</span>
      <span>
        <Users size={13}/>Coopera</span>
    </div>
  </div>
  <section className="m-welcome-form">
    <div className="m-eyebrow">QFRONTIER · FRONTERA CERO</div>
    <h2>Comienza tu historia.</h2>
    <p>Una estación, un estandarte y la curiosidad de descubrir lo que hay más allá. No necesitas wallet.</p>
    <form className="m-form" onSubmit={event => { event.preventDefault(); create({ name, stationName, faction, ...(referralCode.trim() ? { referralCode: referralCode.trim() } : {}) }); }}>
      <label>Nombre del explorador<input value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={24} required autoComplete="nickname" placeholder="¿Cómo te llamamos?" disabled={busy}/>
      </label>
      <label>Nombre de tu estación<input value={stationName} onChange={event => setStationName(event.target.value)} minLength={2} maxLength={32} required placeholder="Ej. Refugio del Alba" disabled={busy}/>
      </label>
      <label>Tu facción<span className="m-factions">{FACTIONS.map(item => <button key={item.id} type="button" className={`m-faction ${faction === item.id ? "selected" : ""}`} onClick={() => setFaction(item.id)} disabled={busy} aria-pressed={faction === item.id}>
            <item.icon size={22} strokeWidth={1.4}/>
            {item.name}
          </button>)}</span>
        <small className="m-note">{FACTIONS.find(item => item.id === faction)?.bonus}</small>
      </label>
      <label>Código de invitación · opcional<input value={referralCode} onChange={event => setReferralCode(event.target.value)} maxLength={80} placeholder="Un explorador te invitó…" disabled={busy}/>
      </label>
      <button className="m-button full" disabled={busy} type="submit">
        {busy ? <LoaderCircle size={14} className="m-spin"/> : <Flag size={14}/>}Fundar mi estación<ArrowRight size={14}/>
      </button>
    </form>
    <p className="m-note" style={{ textAlign: "center", marginTop: 20 }}>Mundo de prueba · Créditos y QRYP simulados.<br />Sin dinero real. El progreso puede reiniciarse.</p>
  </section>
    </main>;
}
function AccountPanel({ view }: {
    view: MvpView;
    player: PublicPlayer;
    busy: boolean;
    act: Action;
}) {
    const account = view.social.account;
    return <section className="m-panel">
  <div className="m-panel-title">
    <h2>
      <Boxes size={15}/>Tus contabilidades</h2>
    <ShieldCheck size={14}/>
  </div>
  <div className="m-admin-list">
    <div>
      <span>Créditos transferibles</span>
      <strong>
        {account?.credits ?? 0} CR</strong>
    </div>
    <div>
      <span>Créditos de tutorial</span>
      <strong>
        {account?.boundCredits ?? 0} CR vinculados</strong>
    </div>
    <div>
      <span>QRYP · SIMULADO</span>
      <strong>
        {account?.simUnits ?? 0} SIM</strong>
    </div>
  </div>
  <p style={{ marginTop: 15 }}>Los créditos sirven para comercio. SIM_QRYP es un saldo de prueba separado, sin conversión ni retiro real.</p>
    </section>;
}
function Outposts({ view, player, busy, act }: {
    view: MvpView;
    player: PublicPlayer;
    busy: boolean;
    act: Action;
}) {
    const timestamp = useGameTimestamp();
    const clan = view.social.clan;
    const starterShield = player.starterProtection.active;
    const role = clan?.members.find(member => member.playerId === player.id)?.role;
    const canManage = role === "founder" || role === "coordinator";
    const unitOptions = player.units.filter(unit => !unit.busy && unit.health >= 25).map(unit => ({ value: unit.id, label: `${unitNames[unit.type]} · Salud ${unit.health}` }));
    const utcHour = new Date(view.now).getUTCHours();
    const windowOpen = utcHour >= 18 && utcHour < 22;
    const alliedClans = new Set(view.social.alliances.filter(alliance => alliance.status === "active" && alliance.noAggression && !!clan && alliance.clanIds.includes(clan.id)).flatMap(alliance => alliance.clanIds));
    return <section className="m-panel" style={{ marginTop: 19 }}>
    <div className="m-panel-title">
    <h2>
      <Flag size={15}/>Puestos en la frontera</h2>
    <span>CONCESIONES TEMPORALES</span>
  </div>
    <p>Un puesto sostiene una ruta. Su concesión dura 48 horas y exige suministros cada 24 horas. El mantenimiento conserva el plazo original, sin reiniciar reservas ni prolongar la concesión indefinidamente.</p>
    <div className="m-warning" style={{ marginTop: 16 }}>Las concesiones participan en PvP voluntario. Pueden cambiar de clan tras una disputa; conservan su vencimiento original. La estación, su almacén y los saldos quedan fuera del botín territorial.</div>
    {starterShield && <p className="m-shield-note">Tu escudo inicial de 72 horas está activo hasta {timestamp(player.starterProtection.endsAt)}. Las concesiones expuestas y las disputas PvP estarán disponibles al finalizar, si decidís activar PvP.</p>}
    {clan && canManage && <div style={{ marginTop: 18 }}>
      {!player.pvpEnabled && <div style={{ marginBottom: 16 }}><p className="m-note">Activá PvP antes de solicitar una concesión. La aceptación del riesgo territorial se confirma por separado.</p><button className="m-button secondary" style={{ marginTop: 10 }} disabled={busy || starterShield} onClick={() => act({ type: "pvp.toggle", playerId: player.id, enabled: true })}><Shield size={13}/>Revisar activación voluntaria de PvP</button></div>}
      <ActionForm title="Preparar un puesto" description="Un puesto logístico ocupa una casilla sin protección inicial. Un observatorio solo puede ocupar una mina completamente agotada. Debes encontrarte en la casilla elegida." command="outpost.claim" actor={player.id} busy={busy || starterShield || !player.pvpEnabled} act={act} fields={[{ key: "tileId", label: "Territorio de la concesión", type: "select", options: view.tiles.filter(tile => !tile.protected).map(tile => ({ value: tile.id, label: `${String.fromCharCode(65 + tile.row)}${tile.col + 1} · ${tile.name}` })), value: player.position }, { key: "purpose", label: "Función del puesto", type: "select", options: [{ value: "logistics", label: "Puesto logístico" }, { value: "observatory", label: "Observatorio sobre mina agotada" }] }, { key: "riskAccepted", label: "Acepto voluntariamente el riesgo de perder esta concesión en una disputa territorial.", type: "checkbox", required: true, hint: "La concesión puede cambiar de clan. Mi estación y sus bienes permanecen protegidos." }]} button="Revisar concesión y suministros"/>
    </div>}
    <p className="m-note" style={{ marginTop: 18 }}>Disputas de 18:00 a 22:00 UTC · 12:00 a 16:00 en Costa Rica. Hasta seis unidades por formación, tres rondas y 24 horas de descanso para el puesto y los responsables. Los alimentos y el agua se cotizan antes de confirmar.</p>
    <div className="m-list" style={{ marginTop: 18 }}>{view.social.outposts.length ? view.social.outposts.map(outpost => <article className="m-deposit" key={outpost.id} style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
      <span className="m-icon-box">{outpost.purpose === "observatory" ? <Telescope size={16}/> : <Flag size={16}/>}</span>
      <div className="m-deposit-info">
        <strong>
          {outpost.purpose === "observatory" ? "Observatorio" : "Puesto logístico"} · {view.tiles.find(tile => tile.id === outpost.tileId)?.name ?? outpost.tileId}
        </strong>
        <small>
          {view.social.clans.find(item => item.id === outpost.clanId)?.name ?? "Clan"} · {outpost.status === "active" ? "Activo" : outpost.status === "suspended" ? "Suspendido por suministros" : "Concesión vencida"}
          <br />Mantenimiento hasta {timestamp(outpost.maintenanceUntil)}
          <br />Concesión hasta {timestamp(outpost.expiresAt)}
          {outpost.cooldownUntil !== undefined && outpost.cooldownUntil > view.now && <><br />En descanso hasta {timestamp(outpost.cooldownUntil)}</>}
          {outpost.pendingBattleId && <><br />Disputa confirmada, pendiente de resolución</>}
          {outpost.defense && <><br />Formación defensiva registrada: {outpost.defense.unitIds.length} unidades</>}
        </small>
        <details className="m-trace" style={{ marginTop: 8 }}>
          <summary>Historia del puesto</summary>
          {outpost.history.map((event, index) => <p className="m-note" key={index}>
            {timestamp(event.at)} · {event.text}
          </p>)}
        </details>
      </div>
      {clan?.id === outpost.clanId && canManage && outpost.status !== "expired" && <div className="m-button-row">
        <button className="m-button compact" disabled={busy || !!outpost.pendingBattleId} onClick={() => act({ type: "outpost.maintain", playerId: player.id, outpostId: outpost.id })}>Revisar mantenimiento</button>
        <button className="m-button secondary compact" disabled={busy || !!outpost.pendingBattleId} onClick={() => act({ type: "outpost.release", playerId: player.id, outpostId: outpost.id })}>Liberar concesión</button>
      </div>}
      {clan?.id === outpost.clanId && canManage && outpost.status !== "expired" && <div style={{ width: "100%" }}><ActionForm key={`defense-${outpost.id}`} title="Organizar la defensa" description={player.position === outpost.tileId ? "Asigna hasta seis unidades propias disponibles, con salud mínima de 25. Una selección vacía retira tu formación." : "Viaja al puesto para configurar su formación defensiva."} command="outpost.defense" actor={player.id} busy={busy || !!outpost.pendingBattleId || player.position !== outpost.tileId} act={act} fields={[{ key: "unitIds", label: "Formación defensiva · máximo seis", type: "multi", max: 6, options: unitOptions, disabled: starterShield, hint: starterShield ? "El escudo inicial impide asignar unidades a defensa PvP. Podés retirar tu formación enviando la selección vacía." : undefined }]} transform={values => ({ ...values, outpostId: outpost.id })} button="Revisar formación defensiva"/></div>}
      {clan && canManage && clan.id !== outpost.clanId && !alliedClans.has(outpost.clanId) && outpost.status !== "expired" && !view.players.some(own => own.id === outpost.holderId) && <div style={{ width: "100%" }}>
        {!windowOpen && <p className="m-note" style={{ marginBottom: 12 }}>La ventana territorial está cerrada. Próxima franja: 18:00–22:00 UTC.</p>}
        {!player.pvpEnabled && <p className="m-note" style={{ marginBottom: 12 }}>Activá PvP voluntariamente para presentar una disputa.</p>}
        {player.position !== outpost.tileId && <p className="m-note" style={{ marginBottom: 12 }}>Viaja a este puesto antes de presentar la disputa.</p>}
        {player.pvpCooldownUntil > view.now && <p className="m-note" style={{ marginBottom: 12 }}>Tu expedición descansa hasta {timestamp(player.pvpCooldownUntil)}.</p>}
        <ActionForm key={`dispute-${outpost.id}`} title="Disputar la concesión" description="Una victoria táctica puede transferir el puesto si se mantienen los requisitos de capacidad y diplomacia. La fecha final y el mantenimiento restante no se reinician. No hay botín del almacén de la estación." command="battle.outpost" actor={player.id} busy={busy || starterShield || !player.pvpEnabled || !windowOpen || !!outpost.pendingBattleId || player.position !== outpost.tileId || player.pvpCooldownUntil > view.now || (outpost.cooldownUntil ?? 0) > view.now} act={act} fields={[{ key: "unitIds", label: "Formación expedicionaria · de una a seis unidades", type: "multi", max: 6, options: unitOptions }]} transform={values => ({ ...values, outpostId: outpost.id })} button="Cotizar disputa y suministros"/>
      </div>}
    </article>) : <p>La frontera aún no tiene puestos establecidos.</p>}</div>
    <p className="m-note" style={{ marginTop: 16 }}>Límite: un puesto por clan y dos por alianza activa, incluidos los puestos suspendidos. Las concesiones no añaden recursos a los yacimientos.</p>
  </section>;
}
function TradeScreen({ view, player, busy, act }: {
    view: MvpView;
    player: PublicPlayer;
    busy: boolean;
    act: Action;
}) {
    const timestamp = useGameTimestamp();
    const [section, setSection] = useGameSection("market");
    const [showMine, setShowMine] = useState(false);
    const tileOptions = view.tiles.map(tile => ({ value: tile.id, label: `${String.fromCharCode(65 + tile.row)}${tile.col + 1} · ${tile.name}` }));
    const offers = view.social.offers.filter(offer => showMine ? offer.makerId === player.id : offer.status === "open");
    const base = { actor: player.id, busy, act, stock: ownedItemOptions(player.inventory, view.now) };
    return <>
  <Subtabs value={section} setValue={setSection} values={[{ value: "market", label: "Mercado" }, { value: "publish", label: "Publicar oferta" }, { value: "contracts", label: "Contratos" }, { value: "npc", label: "Feria regional" }]}/>
  {section === "market" && <>
    <div className="m-spread" style={{ marginBottom: 17 }}>
      <span className="m-small">
        {offers.length} {showMine ? "ofertas tuyas" : "ofertas disponibles"}
      </span>
      <button className="m-link-button" onClick={() => setShowMine(value => !value)}>
        {showMine ? "Ver todo el mercado" : "Ver mis ofertas"}
        <ArrowRight size={12}/>
      </button>
    </div>
    {offers.length ? <div className="m-grid-2">{offers.map(offer => <article className="m-card" key={offer.id}>
        <div className="m-spread">
          <div className="m-inline">
            <span className="m-avatar" style={{ width: 33, height: 33, fontSize: 13 }}>{offer.makerName.slice(0, 1).toUpperCase()}</span>
            <span className="m-small">{offer.makerName}</span>
          </div>
          <span className="m-badge">{offer.mode === "barter" ? "Trueque" : "Créditos"}</span>
        </div>
        <div className="m-offer-exchange">
          <div className="m-offer-side">
            <ItemIcon id={offer.itemId}/>
            <div>
              <strong className="m-amount">{offer.qty}</strong>
              <span>{itemName(offer.itemId)}</span>
            </div>
          </div>
          <ArrowRight size={19} strokeWidth={1.1}/>
          <div className="m-offer-side">
            {offer.wantItemId && <ItemIcon id={offer.wantItemId}/>}
            <div>
              <strong className="m-amount">{offer.mode === "credits" ? offer.price : offer.wantQty}</strong>
              <span>{offer.wantItemId ? itemName(offer.wantItemId) : "CR · total"}</span>
            </div>
          </div>
        </div>
        {offer.status === "open" ? <button className={`m-button ${offer.makerId === player.id ? "secondary" : ""} full`} disabled={busy} onClick={() => act({ type: offer.makerId === player.id ? "market.cancel" : "market.fill", playerId: player.id, offerId: offer.id })}>
          {offer.makerId === player.id ? "Retirar oferta y recuperar reserva" : "Revisar intercambio"}
          <ArrowUpRight size={12}/>
        </button> : <span className="m-tag">{{ filled: "Intercambio completado", cancelled: "Oferta retirada", expired: "Oferta vencida" }[offer.status]}</span>}
        <p className="m-note">Vence {timestamp(offer.expiresAt)}
          {offer.mode === "credits" ? ` · Comisión vendedor ${offer.fee} CR` : " · Recursos reservados"}
        </p>
      </article>)}</div> : <Empty icon={ArrowDownUp} title="Un mercado empieza con una oferta.">Recogé materiales transferibles y publicá un trueque o una venta en créditos.</Empty>}
    <Info>
      <strong>Los materiales ofrecidos quedan reservados.</strong> Solo se transfieren una vez. Comisión del vendedor: {view.social.parameters.marketFeePercent} %, redondeada según las reglas publicadas de la temporada. El comprador paga el precio anunciado.</Info>
  </>}
  {section === "publish" && <div className="m-grid-2">
    <ActionForm {...base} title="Ofrecer un trueque" description="Los lotes vinculados al tutorial no se pueden intercambiar." command="market.publish" fields={[{ key: "itemId", label: "Yo ofrezco", type: "select", options: itemOptions }, { key: "qty", label: "Cantidad ofrecida", type: "number", min: 1, max: 999 }, { key: "wantItemId", label: "A cambio de", type: "select", options: itemOptions, value: "timber" }, { key: "wantQty", label: "Cantidad solicitada", type: "number", min: 1, max: 999 }]} transform={values => ({ ...values, mode: "barter" })}/>
    <ActionForm {...base} title="Vender en créditos" description="Un precio total para un lote, con comisión publicada y sin dinero real." command="market.publish" fields={[{ key: "itemId", label: "Producto", type: "select", options: itemOptions }, { key: "qty", label: "Cantidad", type: "number", min: 1, max: 999 }, { key: "price", label: "Precio total · créditos", type: "number", min: 1, max: 100000 }]} transform={values => ({ ...values, mode: "credits" })}/>
  </div>}
  {section === "contracts" && <div className="m-list">
    <ActionForm {...base} title="Un encargo con reglas claras." description="El pago se reserva al aceptar el contrato. El destino, calidad y plazo se fijan antes de aceptar." command="contract.publish" fields={[{ key: "kind", label: "Modalidad", type: "select", options: [{ value: "delivery", label: "Entrega de productos" }, { value: "transport", label: "Transporte de una carga" }] }, { key: "itemId", label: "Producto", type: "select", options: itemOptions }, { key: "qty", label: "Cantidad", type: "number", min: 1, max: 999 }, { key: "quality", label: "Calidad mínima", type: "number", min: 1, max: 3 }, { key: "destination", label: "Destino", type: "select", options: tileOptions, value: player.position }, { key: "price", label: "Pago total · créditos", type: "number", min: 1, max: 100000 }, { key: "deadlineHours", label: "Plazo · horas", type: "number", min: 1, max: 168, value: 24 }]}/>
    <div className="m-grid-2">{view.social.contracts.map(contract => <article className="m-card" key={contract.id}>
        <div className="m-eyebrow">
          {contract.kind === "transport" ? "TRANSPORTE" : "ENTREGA"} · {contract.requesterName}
        </div>
        <h3>
          {contract.qty} × {itemName(contract.itemId)}
        </h3>
        <p>Destino {view.tiles.find(tile => tile.id === contract.destination)?.name ?? contract.destination} · Calidad {contract.quality}
          <br />Plazo: {timestamp(contract.deadline)}
        </p>
        <div className="m-spread" style={{ marginTop: 15 }}>
          <strong className="m-amount">
            {contract.price} CR</strong>
          <span className="m-tag">{{ published: "Publicado", accepted: "Aceptado", settled: "Liquidado", expired: "Vencido", cancelled: "Cancelado" }[contract.status]}</span>
        </div>
        <div className="m-button-row">
          {contract.status === "published" && contract.requesterId !== player.id && <button className="m-button full" disabled={busy} onClick={() => act({ type: "contract.accept", playerId: player.id, contractId: contract.id })}>Revisar aceptación</button>}
          {contract.status === "accepted" && contract.carrierId === player.id && <button className="m-button full" disabled={busy} onClick={() => act({ type: "contract.deliver", playerId: player.id, contractId: contract.id })}>Entregar en destino</button>}
        </div>
      </article>)}</div>
  </div>}
  {section === "npc" && <>
    <div className="m-panel" style={{ marginBottom: 18 }}>
      <div className="m-panel-title">
        <h2>
          <Flag size={15}/>Una demanda con presupuesto</h2>
        <span>
          {view.social.npc.remaining} / {view.social.npc.budget} CR</span>
      </div>
      <p>La feria compra cantidades limitadas de productos transferibles. Cuando su presupuesto o demanda se agotan, deja de comprar.</p>
      {view.boosts?.passes&&<p className="m-note">Tu primera entrega pagada de cada producto de la Feria en esta temporada da un pase de potenciador por cuenta. Dividir la venta o cambiar de explorador no repite el premio. Pases disponibles: {view.boosts.passes.available}.</p>}
    </div>
    <div className="m-grid-2">{Object.entries(view.social.npc.demand).map(([id, demand]) => {
      if(!demand)return null;
      const available=usableQuantity(player.inventory,id as ItemId,view.now,true);
      const limit=Math.max(0,Math.min(available,demand.remaining,Math.floor(view.social.npc.remaining/Math.max(1,demand.price))));
      return <ActionForm {...base} key={id} title={itemName(id)} description={`${demand.price} CR por unidad · Demanda pendiente: ${demand.remaining} · Tenés ${available} transferibles.`} command="npc.sell" fields={[{ key: "qty", label: "Unidades para vender", type: "number", min: 1, max: limit }]} transform={values => ({ ...values, itemId: id })} button="Cotizar venta a la feria"/>;
    })}</div>
  </>}
    </>;
}
function CommunityScreen({ view, player, busy, act }: {
    view: MvpView;
    player: PublicPlayer;
    busy: boolean;
    act: Action;
}) {
    const timestamp = useGameTimestamp();
    const [inviteNotice, setInviteNotice] = useState("");
    const [section, setSection] = useGameSection("clan");
    const clan = view.social.clan;
    const base = { actor: player.id, busy, act, stock: ownedItemOptions(player.inventory, view.now) };
    const outsiders = view.people.filter(person => !view.players.some(own => own.id === person.id));
    const personName = (id: string) => view.people.find(person => person.id === id)?.name ?? "Explorador";
    const clanName = (id: string) => view.social.clans.find(clan => clan.id === id)?.name ?? id;
    return <>
  <Subtabs value={section} setValue={setSection} values={[{ value: "clan", label: "Mi clan" }, { value: "treasury", label: "Tesorería" }, { value: "projects", label: "Obras colectivas" }, { value: "alliances", label: "Alianzas" }, { value: "referrals", label: "Invitaciones y mentoría" }]}/>
  {section === "clan" && <>{clan ? <>
      <section className="m-station-hero" style={{ minHeight: 185 }}>
        <div>
          <div className="m-eyebrow">UN PROYECTO ENTRE MUCHOS</div>
          <h2>{clan.name}</h2>
          <p>
            {clan.members.length} miembros · Facciones mixtas · Tesorería con roles</p>
        </div>
        <div className="m-tag-row"><span className="m-tag">Tu rol: {roleNames[clan.members.find(member => member.playerId === player.id)?.role ?? "member"] ?? "Miembro"}
          </span></div>
      </section>
      <div className="m-panel" style={{ marginTop: 18 }}>
        <div className="m-panel-title">
          <h2>
            <Users size={15}/>Quienes construyen contigo</h2>
          <button className="m-link-button" disabled={busy} onClick={() => act({ type: "clan.leave", playerId: player.id })}>Salir del clan<ArrowUpRight size={11}/>
          </button>
        </div>
        {clan.members.map(member => <div className="m-item-row" key={member.playerId}>
          <span className="m-avatar">{member.name.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{member.name}</strong>
            <small>{roleNames[member.role] ?? member.role}</small>
          </div>
        </div>)}
      </div>
      <div style={{ marginTop: 18 }}><ActionForm {...base} title="Delegar responsabilidades" description="La dirección cambia roles. El servidor verifica la autoridad y conserva las reservas." command="clan.role" fields={[{ key: "targetId", label: "Integrante", type: "select", options: clan.members.filter(member => member.playerId !== player.id).map(member => ({ value: member.playerId, label: member.name })) }, { key: "role", label: "Responsabilidad", type: "select", options: [{ value: "coordinator", label: "Coordinador" }, { value: "storekeeper", label: "Almacenista" }, { value: "member", label: "Miembro" }] }]}/></div>
    </> : <div className="m-grid-2">
      <ActionForm {...base} title="Fundar un clan" description="Organiza un grupo con hasta 20 miembros y una tesorería compartida." command="clan.create" fields={[{ key: "name", label: "Nombre del clan", type: "text" }]}/>
      <section className="m-card">
        <h3>Encuentra a tu gente.</h3>
        <p>Unirse es opcional. Tu estación puede completar su progreso básico de forma independiente.</p>
        <div className="m-list" style={{ marginTop: 20 }}>{view.social.clans.length ? view.social.clans.map(item => <div className="m-deposit" key={item.id}>
            <div className="m-deposit-info">
              <strong>{item.name}</strong>
              <small>
                {item.members.length} / 20 integrantes</small>
            </div>
            <button className="m-button compact" disabled={busy} onClick={() => act({ type: "clan.join", playerId: player.id, clanId: item.id })}>Unirme</button>
          </div>) : <span className="m-note">Aún no hay clanes. Podés fundar el primero.</span>}</div>
      </section>
    </div>}</>}
  {section === "treasury" && (clan ? <>
    <div className="m-panel" style={{ marginBottom: 18 }}>
      <div className="m-panel-title">
        <h2>
          <Boxes size={16}/>Tesorería de {clan.name}
        </h2>
        <span>
          {clan.credits} CR</span>
      </div>
      <div className="m-tag-row">{ITEMS.filter(item => clan.inventory.some(lot => lot.itemId === item.id)).map(item => <span key={item.id} className="m-tag">
          {clan.inventory.filter(lot => lot.itemId === item.id).reduce((sum, lot) => sum + lot.qty, 0)} {item.name}
        </span>)}</div>
      <p style={{ marginTop: 15 }}>Los retiros grandes requieren dos responsables de cuentas distintas. Umbrales: {clan.highCreditAmount} CR o {clan.highItemAmount} objetos.</p>
    </div>
    <div className="m-grid-2">
      <ActionForm {...base} title="Aportar créditos" command="clan.deposit" fields={[{ key: "amount", label: "Créditos transferibles", type: "number", min: 1 }]} transform={values => ({ ...values, currency: "credits" })}/>
      <ActionForm {...base} title="Aportar materiales" command="clan.deposit" fields={[{ key: "itemId", label: "Producto", type: "select", options: itemOptions }, { key: "qty", label: "Cantidad", type: "number", min: 1, max: 999 }]}/>
      <ActionForm {...base} title="Solicitar créditos" command="clan.withdraw" fields={[{ key: "amount", label: "Créditos", type: "number", min: 1 }]} transform={values => ({ ...values, currency: "credits" })}/>
      <ActionForm {...base} title="Solicitar materiales" command="clan.withdraw" fields={[{ key: "itemId", label: "Producto", type: "select", options: itemOptions }, { key: "qty", label: "Cantidad", type: "number", min: 1, max: 999 }]}/>
    </div>
    <div className="m-panel" style={{ marginTop: 18 }}>
      <div className="m-panel-title"><h2>Propuestas de retiro</h2></div>
      {clan.withdrawals.length ? clan.withdrawals.map(withdrawal => <div className="m-deposit" key={withdrawal.id}>
        <div className="m-deposit-info">
          <strong>{withdrawal.currency === "credits" ? `${withdrawal.amount} CR` : `${withdrawal.qty} ${itemName(withdrawal.itemId ?? "")}`}</strong>
          <small>
            {personName(withdrawal.requesterId)} · {withdrawal.approvalCount} aprobaciones · {withdrawal.status}
          </small>
        </div>
        {withdrawal.status === "pending" && <button className="m-button compact" disabled={busy} onClick={() => act({ type: "clan.approve", playerId: player.id, proposalId: withdrawal.id })}>Segunda aprobación</button>}
      </div>) : <p>No hay solicitudes pendientes.</p>}
    </div>
  </> : <Empty icon={Users} title="Primero, una comunidad.">Unite a un clan para acceder a su tesorería.</Empty>)}
  {section === "projects" && <div className="m-list">
    <Outposts view={view} player={player} busy={busy} act={act}/>
    {clan && <ActionForm {...base} title="Un puente cambia una ruta." description="Una obra reserva aportes reales: cuatro tablones, dos lingotes y dos piedras." command="clan.project.open" fields={[{ key: "tileId", label: "Paso de agua sin puente", type: "select", options: view.tiles.filter(tile => tile.terrain === "water" && !tile.bridge).map(tile => ({ value: tile.id, label: tile.name })) }]}/>}
    <div className="m-grid-2">{view.social.projects.map(project => <section className="m-card" key={project.id}>
        <div className="m-eyebrow">{clanName(project.clanId)}</div>
        <h3>Puente · {view.tiles.find(tile => tile.id === project.tileId)?.name}
        </h3>
        <p>Vence {timestamp(project.deadline)} · {project.status}
        </p>
        <div className="m-costs">{project.requirements.map(requirement => {
                    const delivered = project.contributions.flatMap(contribution => contribution.items).filter(item => item.itemId === requirement.itemId).reduce((sum, item) => sum + item.qty, 0);
                    return <span className="m-cost" key={requirement.itemId}>
            {delivered}/{requirement.qty} {itemName(requirement.itemId)}
          </span>;
                })}</div>
        {project.status === "open" && clan?.id === project.clanId && <>
          <div style={{ marginTop: 16 }}><ActionForm {...base} title="Aportar a la obra" command="clan.project.contribute" fields={[{ key: "itemId", label: "Material", type: "select", options: project.requirements.map(item => ({ value: item.itemId, label: itemName(item.itemId) })) }, { key: "qty", label: "Cantidad", type: "number", min: 1, max: 4 }]} transform={values => ({ ...values, projectId: project.id })}/></div>
          <div className="m-button-row">
            <button className="m-button" disabled={busy} onClick={() => act({ type: "clan.project.complete", playerId: player.id, projectId: project.id })}>Completar puente</button>
            <button className="m-button secondary" disabled={busy} onClick={() => act({ type: "clan.project.cancel", playerId: player.id, projectId: project.id })}>Cancelar y devolver</button>
          </div>
        </>}
      </section>)}</div>
    {!view.social.projects.length && <Empty icon={Hammer} title="Las rutas también se construyen.">Un clan puede abrir una obra colectiva sobre un paso de agua.</Empty>}
  </div>}
  {section === "alliances" && <div className="m-list">
    {clan && <ActionForm {...base} title="Proponer una alianza" description="De dos a tres clanes, aceptación expresa y pacto temporal de no agresión." command="alliance.propose" fields={[{ key: "name", label: "Nombre del pacto", type: "text" }, { key: "clanIds", label: "Clanes invitados", type: "multi", options: view.social.clans.filter(item => item.id !== clan.id).map(item => ({ value: item.id, label: item.name })) }]} transform={values => ({ ...values, clanIds: [clan.id, ...values.clanIds as string[]] })}/>}
    <div className="m-grid-2">{view.social.alliances.map(alliance => <section className="m-card" key={alliance.id}>
        <div className="m-eyebrow">PACTO DE NO AGRESIÓN</div>
        <h3>{alliance.name}</h3>
        <p>
          {alliance.clanIds.map(clanName).join(" · ")}
          <br />Vence {timestamp(alliance.expiresAt)}
        </p>
        <div className="m-tag-row" style={{ marginTop: 15 }}>
          <span className="m-tag">{alliance.status === "active" ? "Activo" : alliance.status === "proposed" ? "Esperando aceptación" : "Finalizado"}</span>
          <span className="m-tag">
            {alliance.acceptedClanIds.length}/{alliance.clanIds.length} aceptaciones</span>
        </div>
        {clan && alliance.clanIds.includes(clan.id) && alliance.status !== "ended" && <div className="m-button-row">
          {!alliance.acceptedClanIds.includes(clan.id) && <button className="m-button" disabled={busy} onClick={() => act({ type: "alliance.accept", playerId: player.id, allianceId: alliance.id })}>Aceptar pacto</button>}
          <button className="m-button secondary" disabled={busy} onClick={() => act({ type: "alliance.leave", playerId: player.id, allianceId: alliance.id })}>Abandonar pacto</button>
        </div>}
      </section>)}</div>
    {!view.social.alliances.length && <Empty icon={ShieldCheck} title="La diplomacia empieza conversando.">Fundá o unite a un clan para proponer un pacto.</Empty>}
  </div>}
  {section === "referrals" && <>
    <section className="m-panel" style={{ marginBottom: 18 }}>
      <div className="m-panel-title">
        <h2>
          <Users size={16}/>Invita a una expedición</h2>
        <span>UN REFERENTE · SIN MULTINIVEL</span>
      </div>
      <p>Tu código de explorador es <strong className="m-mono">{view.social.invitationCode ?? player.id}</strong>. La invitación puede compartirse por enlace. El bono requiere tutorial, actividad en tres días distintos de su primera semana, una fabricación y una segunda región.</p>
      <button type="button" className="m-button secondary" onClick={async()=>{const code=view.social.invitationCode??player.id;const link=new URL("/",window.location.origin);link.searchParams.set("invite",code);try{await navigator.clipboard.writeText(link.href);setInviteNotice("Enlace de invitación copiado.");}catch{setInviteNotice(`No se pudo copiar. Tu código es ${code}.`);}}}>Copiar enlace de invitación</button>
      {inviteNotice&&<p className="m-note" role="status">{inviteNotice}</p>}
      <div className="m-costs">
        <span className="m-cost">Hasta 5 invitados válidos</span>
        <span className="m-cost">Bono máximo +0,1</span>
        <span className="m-cost">Sin materias transferibles de regalo</span>
      </div>
    </section>
    <div className="m-grid-2">
      <ActionForm {...base} title="Vincular una invitación" description="Solo al comenzar, antes de progresar. La atribución es única y no admite cuentas propias." command="referral.bind" fields={[{ key: "parentId", label: "Código del explorador que te invitó", type: "text" }]}/>
      <ActionForm {...base} title="Acompañar a un aprendiz" description="Hasta tres aprendices, con su propia cuenta y sin acceso a sus saldos." command="mentor.assign" fields={[{ key: "targetId", label: "Explorador", type: "select", options: outsiders.map(person => ({ value: person.id, label: person.name })) }]}/>
    </div>
    <div className="m-panel" style={{ marginTop: 18 }}>
      <div className="m-panel-title"><h2>Tu red de exploradores</h2></div>
      {view.social.referrals.length ? view.social.referrals.map(referral => <div className="m-deposit" key={referral.childId}>
        <Users size={16}/>
        <div className="m-deposit-info">
          <strong>
            {personName(referral.childId)} · invitado por {personName(referral.parentId)}
          </strong>
          <small>{referral.status === "valid" ? "Validado" : referral.status === "rejected" ? "Rechazado" : "En progreso"}</small>
        </div>
        {view.admin && referral.status === "progressing" && <button className="m-button compact" disabled={busy} onClick={() => act({ type: "referral.validate", playerId: player.id, targetId: referral.childId })}>Comprobar hitos</button>}
      </div>) : <p>Aún no tienes invitaciones vinculadas.</p>}
      {view.social.mentors.map(mentor => <p key={mentor.childId} style={{ marginTop: 12 }}>
        {personName(mentor.mentorId)} acompaña a {personName(mentor.childId)}.</p>)}
    </div>
  </>}
  </>;
}
function ExpeditionsScreen({ view, player, busy, act }: {
    view: MvpView;
    player: PublicPlayer;
    busy: boolean;
    act: Action;
}) {
    const timestamp = useGameTimestamp();
    const [section, setSection] = useGameSection("explore");
    const starterShield = player.starterProtection.active;
    const base = { actor: player.id, busy, act, stock: ownedItemOptions(player.inventory, view.now) };
    const tiles = view.tiles.map(tile => ({ value: tile.id, label: `${String.fromCharCode(65 + tile.row)}${tile.col + 1} · ${tile.name}` }));
    const units = player.units.filter(unit => !unit.busy && unit.health > 0).map(unit => ({ value: unit.id, label: `${unitNames[unit.type]} · Salud ${unit.health}` }));
    return <>
  <Subtabs value={section} setValue={setSection} values={[{ value: "explore", label: "Hallazgos" }, { value: "convoys", label: "Convoyes" }, { value: "combat", label: "Encuentros" }, { value: "reports", label: "Informes" }]}/>
  {section !== "reports" && <div className="g-station-scene"><FrontierWorld view={view} player={player} mode="expedition" compact /></div>}
  {section === "explore" && <>
    <ActionForm {...base} title="Lo que queda por descubrir." description="Una expedición interpreta hallazgos de un presupuesto regional finito. Prepará equipo y suministros; el resultado y la procedencia se resuelven en el servidor." command="expedition.start" fields={[{ key: "tileId", label: "Territorio de la expedición", type: "select", options: tiles, value: player.position }]} button="Preparar expedición"/>
    <div className="m-grid-2" style={{ marginTop: 18 }}>{view.regions.filter(region => player.visitedRegions.includes(region.id)).map(region => <section className="m-card" key={region.id}>
        <div className="m-eyebrow">PRESUPUESTO DE HALLAZGOS</div>
        <h3>{region.name}</h3>
        <div className="m-costs">{Object.entries(region.expeditionRemaining).map(([id, qty]) => <span className="m-cost" key={id}>
            {qty} {itemName(id)}
          </span>)}</div>
      </section>)}</div>
    <Info>Las rarezas conservan origen e historia. Su calidad no multiplica premios económicos y no se emiten NFTs en este simulador.</Info>
  </>}
  {section === "convoys" && <div className="m-list">
    <ActionForm {...base} title="Preparar una ruta comercial" description="La carga sale de tu almacén y se reserva durante el viaje. Podés mantenerla protegida o exponerla voluntariamente a disputas." command="convoy.start" fields={[{ key: "tileId", label: "Destino", type: "select", options: tiles }, { key: "cargoItem", label: "Producto de la carga", type: "select", options: itemOptions }, { key: "cargoQty", label: "Cantidad", type: "number", min: 1, max: 999 }, { key: "unitIds", label: "Escolta disponible", type: "multi", options: units }, { key: "exposed", label: "Exponer carga a incursiones PvP", type: "checkbox", disabled: starterShield, hint: starterShield ? "Tu escudo inicial mantiene la carga protegida. Podés enviar convoyes sin exposición." : "Requiere PvP voluntario y respeta el límite de botín anunciado." }]} transform={values => ({ tileId: values.tileId, cargo: [{ itemId: values.cargoItem, qty: values.cargoQty }], unitIds: values.unitIds, exposed: values.exposed })} button="Cotizar ruta y suministros"/>
    <div className="m-grid-2">{view.convoys.map(convoy => <section className="m-card" key={convoy.id}>
        <div className="m-eyebrow">{convoy.playerId === player.id ? "TU CONVOY" : "CARGA EN LA FRONTERA"}</div>
        <h3>{view.tiles.find(tile => tile.id === convoy.destination)?.name ?? convoy.destination}</h3>
        <p>
          {convoy.status === "traveling" ? "En camino" : "Llegó a destino"} · {convoy.exposed ? "Carga expuesta" : "Ruta protegida"}
          {convoy.attacked ? " · Encuentro registrado" : ""}
        </p>
        <div className="m-costs">{convoy.cargo.map((lot, index) => <span className="m-cost" key={`${lot.id}-${index}`}>
            {lot.qty} {itemName(lot.itemId)}
          </span>)}</div>
        {convoy.exposed && convoy.playerId !== player.id && convoy.status === "traveling" && !convoy.attacked && <div style={{ marginTop: 16 }}><ActionForm {...base} busy={busy || starterShield || !player.pvpEnabled} title="Preparar incursión" description={starterShield ? "Tu escudo inicial impide iniciar incursiones contra otros jugadores." : !player.pvpEnabled ? "Activá PvP voluntariamente antes de preparar una incursión." : undefined} command="battle.raid" fields={[{ key: "unitIds", label: "Unidades disponibles", type: "multi", options: units }]} transform={values => ({ ...values, convoyId: convoy.id })}/></div>}
      </section>)}</div>
  </div>}
  {section === "combat" && <>
    <section className="m-panel" style={{ marginBottom: 18 }}>
      <div className="m-panel-title">
        <h2>
          <ShieldCheck size={15}/>Tus reglas de exposición</h2>
        <span className="m-tag">{starterShield ? "Escudo inicial activo" : player.pvpEnabled ? "PvP activado" : "PvP desactivado"}</span>
      </div>
      {starterShield && <p className="m-shield-note">Protección inicial hasta {timestamp(player.starterProtection.endsAt)}. Nadie puede atacarte y vos tampoco podés iniciar ataques contra jugadores durante este plazo.</p>}
      <p>La estación inicial está protegida. El combate NPC permite practicar. Las disputas entre jugadores solo alcanzan cargas expuestas y requieren activación voluntaria.</p>
      <button className={`m-button ${player.pvpEnabled ? "secondary" : ""}`} style={{ marginTop: 17 }} disabled={busy || (starterShield && !player.pvpEnabled)} onClick={() => act({ type: "pvp.toggle", playerId: player.id, enabled: !player.pvpEnabled })}>
        {player.pvpEnabled ? "Revisar desactivación de PvP" : "Revisar activación de PvP"}
        <Shield size={13}/>
      </button>
      {player.pvpCooldownUntil > view.now && <p className="m-note" style={{ marginTop: 11 }}>Enfriamiento hasta {timestamp(player.pvpCooldownUntil)}.</p>}
    </section>
    <ActionForm {...base} title="Entrenar contra la frontera" description="Una orden asíncrona, con alimentos reservados, rondas registradas y pérdidas verificables." command="battle.start" fields={[{ key: "tileId", label: "Territorio NPC", type: "select", options: tiles, value: player.position }, { key: "unitIds", label: "Destacamento", type: "multi", options: units }]} button="Revisar encuentro NPC"/>
  </>}
  {section === "reports" && <div className="m-list">
    <p className="m-note">Historial de {player.name} · Más recientes primero. {view.progress?.orders.active ?? 0} órdenes todavía en curso.</p>
    {view.reports.length ? view.reports.map(report => <section className="m-panel" key={report.id}>
      <div className="m-panel-title">
        <h2>
          <ClipboardList size={14}/>{report.title}</h2>
        <span>{report.dateKind === "created" ? "Creada" : "Finalizada"} · {timestamp(report.at)}</span>
      </div>
      <span className="m-tag">{report.status === "cancelled" ? "Cancelada" : report.source === "battle" ? "Encuentro resuelto" : "Orden completada"}</span>
      {report.lines.map((line, i) => <p key={i}>{line}</p>)}
      {report.battleId && view.battles.find(battle=>battle.id===report.battleId)?.rounds.length ? <details className="m-trace"><summary>Consultar las rondas</summary>{view.battles.find(battle=>battle.id===report.battleId)!.rounds.map(round=><p key={round.round}>Ronda {round.round} · Ataque {round.attack} · Defensa {round.defense}</p>)}</details> : null}
    </section>) : <Empty icon={ClipboardList} title="Tu historial está por comenzar.">Las órdenes de este explorador aparecerán aquí cuando se resuelvan. Las de otros perfiles se consultan al seleccionarlos.</Empty>}
  </div>}
  </>;
}
function SeasonScreen({ view, player, busy, act }: {
    view: MvpView;
    player: PublicPlayer;
    busy: boolean;
    act: Action;
}) {
    const timestamp = useGameTimestamp();
    const [section, setSection] = useGameSection("rewards");
    const base = { actor: player.id, busy, act, stock: ownedItemOptions(player.inventory, view.now) };
    const { rewards, activity } = view.social;
    const personName = (id: string) => view.people.find(person => person.id === id)?.name ?? "Explorador";
    return <>
  <Subtabs value={section} setValue={setSection} values={[{ value: "rewards", label: "Temporada" }, { value: "funding", label: "Proyectos · SIMULADOS" }, { value: "ledger", label: "Movimientos" }, ...(view.admin ? [{ value: "admin", label: "Administración" }] : [])]}/>
  {section === "rewards" && <>
    <section className="m-station-hero">
      <div>
        <div className="m-eyebrow">
          {view.seasonId} · {view.rulesVersion}
        </div>
        <h2>Lo que aportas deja huella.</h2>
        <p>Los puntos reconocen actividad elegible. El fondo está separado de los proyectos.</p>
      </div>
      <div className="m-tag-row">
        <span className="m-tag">SIMULACIÓN · SIN PREMIOS REALES</span>
        <span className="m-tag">{rewards.state === "active" ? "Temporada activa" : "Reparto calculado"}</span>
      </div>
    </section>
    <div className="m-stat-grid">{[{ name: "Puntos válidos", value: activity?.points ?? 0 }, { name: "Fondo simulado", value: rewards.budget }, { name: "Reserva sin asignar", value: rewards.reserve }, { name: "Días de actividad", value: player.activityDays.length }].map(stat => <div className="m-stat" key={stat.name}>
        <Flag size={17}/>
        <strong>{stat.value}</strong>
        <span>{stat.name}</span>
      </div>)}</div>
    <Info>
      <strong>Los puntos no son saldo QRYP.</strong> El multiplicador está limitado a 1,8× y cada persona a un 2 % del fondo. No cuentan compras, volumen de mercado ni transferencias circulares. Las cantidades del simulador no tienen valor real.</Info>
    <section className="m-panel" style={{ marginTop: 18 }}>
      <div className="m-panel-title">
        <h2>Tu asignación de temporada</h2>
        <span>Final previsto {timestamp(rewards.endsAt)}
        </span>
      </div>
      {rewards.allocations.length ? rewards.allocations.map(reward => <div key={reward.playerId}>
        <div className="m-spread">
          <span className="m-note">
            {reward.points} puntos · Multiplicador {reward.multiplier}×</span>
          <strong className="m-amount">
            {reward.amount} SIM</strong>
        </div>
        <p style={{ marginTop: 12 }}>
          {reward.status === "paid" ? "Entrega simulada registrada." : "Obligación pendiente de entrega simulada."}
          {reward.lastError ? ` ${reward.lastError}` : ""}
        </p>
        {reward.status !== "paid" && <button className="m-button" style={{ marginTop: 16 }} disabled={busy} onClick={() => act({ type: "reward.claim", playerId: player.id })}>Confirmar entrega simulada</button>}
      </div>) : <p>El reparto se calcula al cerrar la temporada. Tu participación no garantiza una cantidad concreta.</p>}
    </section>
  </>}
  {section === "funding" && <>
    <div className="m-warning" style={{ marginBottom: 18 }}>
      <strong>ADAPTADOR SIMULADO.</strong> No recibe QRYP real, no conecta wallets y no promete rendimiento. Los cupones representan productos reservados; los fondos de entrega y premios permanecen separados.</div>
    <ActionForm {...base} title="Un proyecto respaldado por productos." description="Reserva bienes transferibles con caducidad suficiente. Cada cupón da derecho a una cantidad explícita del producto." command="funding.open" fields={[{ key: "itemId", label: "Producto para entregar", type: "select", options: itemOptions }, { key: "qty", label: "Reserva total de productos", type: "number", min: 1, max: 999 }, { key: "unitsPerCoupon", label: "Productos por cupón", type: "number", min: 1, max: 999 }, { key: "pricePerCoupon", label: "Precio por cupón · SIM_QRYP", type: "number", min: 1, max: 100000 }, { key: "deadlineHours", label: "Plazo de financiación · horas", type: "number", min: 1, max: 72, value: 24 }, { key: "deliveryHours", label: "Plazo adicional para entregar · horas", type: "number", min: 1, max: 168, value: 24 }]} transform={values => ({ ...values, currency: "SIM_QRYP" })} button="Revisar reserva y proyecto"/>
    <div className="m-grid-2" style={{ marginTop: 19 }}>{view.social.funding.map(project => <section className="m-card" key={project.id}>
        <div className="m-eyebrow">
          {personName(project.promoterId)} · SIMULACIÓN</div>
        <h3>
          {project.qty} × {itemName(project.itemId)}
        </h3>
        <p>
          {project.unitsPerCoupon} productos por cupón · {project.pricePerCoupon} SIM_QRYP por cupón<br />Financiación hasta {timestamp(project.fundingDeadline)}
          <br />Entrega hasta {timestamp(project.deliveryDeadline)}
        </p>
        <div className="m-funded">
          <div className="m-spread">
            <span>
              {project.soldCoupons}/{project.couponCount} cupones</span>
            <strong>
              {project.heldUnits} SIM reservados</strong>
          </div>
          <div className="m-sparkline"><span style={{ width: `${project.soldCoupons / Math.max(1, project.couponCount) * 100}%` }}/></div>
        </div>
        <p className="m-note">Estado: {project.status} · Productos aún reservados: {project.reservedQty}
        </p>
        {project.lastError && <div className="m-warning" style={{ marginTop: 14 }}>{project.lastError}</div>}
        {project.status === "open" && project.promoterId !== player.id && <div style={{ marginTop: 17 }}><ActionForm {...base} title="Aporte simulado" command="funding.contribute" fields={[{ key: "coupons", label: "Cupones", type: "number", min: 1, max: Math.max(1, project.couponCount - project.soldCoupons) }]} transform={values => ({ ...values, projectId: project.id, currency: "SIM_QRYP" })}/></div>}
        <div className="m-button-row">
          {project.status === "funded" && project.promoterId === player.id && <button className="m-button full" disabled={busy} onClick={() => act({ type: "funding.deliver", playerId: player.id, projectId: project.id })}>Entregar productos reservados</button>}
          {project.status === "delivering" && (project.promoterId === player.id || view.admin) && <button className="m-button full" disabled={busy} onClick={() => act({ type: "funding.release", playerId: player.id, projectId: project.id })}>Confirmar liquidación simulada</button>}
          {project.status === "refund-pending" && <button className="m-button secondary full" disabled={busy} onClick={() => act({ type: "funding.refund", playerId: player.id, projectId: project.id })}>Conciliar reembolso simulado</button>}
        </div>
        {project.myContributions.map((contribution, i) => <p className="m-note" key={i}>Tu aporte: {contribution.coupons} cupones · {contribution.paid} SIM · {contribution.refunded ? "Reembolsado" : contribution.delivered ? "Producto entregado" : "En reserva"}
        </p>)}
      </section>)}</div>
  </>}
  {section === "ledger" && <section className="m-panel">
    <div className="m-panel-title">
      <h2>
        <ClipboardList size={15}/>Movimientos de tus cuentas</h2>
      <span>
        {view.social.ledger.length} REGISTROS</span>
    </div>
    {view.social.ledger.length ? <div className="m-list">{view.social.ledger.slice().reverse().map(entry => <article className="m-deposit" key={entry.id}>
        <span className="m-icon-box"><ArrowDownUp size={15}/></span>
        <div className="m-deposit-info">
          <strong>{entry.reason}</strong>
          <small>
            {timestamp(entry.at)} · {entry.currency === "sim" ? "SIM_QRYP · SIMULADO" : entry.currency === "bound-credits" ? "Créditos vinculados" : entry.currency === "credits" ? "Créditos" : itemName(entry.itemId ?? "")}
          </small>
        </div>
        <strong style={{ color: "var(--q-gold)", fontWeight: 600 }}>{entry.amount}</strong>
      </article>)}</div> : <Empty icon={ClipboardList} title="Una contabilidad clara desde el inicio.">Tus movimientos confirmados aparecerán aquí.</Empty>}
  </section>}
  {section === "admin" && view.admin && <div className="m-list">
    <div className="m-warning">Administración de la temporada de prueba. Cada ajuste queda registrado. Cerrar el fondo simulado fija las asignaciones y no se puede repetir.</div>
    <div className="m-grid-3">{[{ name: "Exploradores", value: view.admin.players }, { name: "Órdenes pendientes", value: view.admin.pendingJobs }, { name: "Órdenes completadas", value: view.admin.completedJobs }, { name: "Acciones únicas", value: view.admin.receipts }, { name: "Fertilidad restante", value: view.admin.farm.remaining }, { name: "Discrepancia de créditos", value: view.social.admin?.creditDiscrepancy ?? 0 }].map(stat => <div className="m-stat" key={stat.name}>
        <strong>{stat.value}</strong>
        <span>{stat.name}</span>
      </div>)}</div>
    <section className="m-panel">
      <div className="m-panel-title">
        <h2>
          <Pickaxe size={15}/>Conservación de las reservas</h2>
        <span>{view.admin.rulesVersion}</span>
      </div>
      <div className="m-admin-list">{view.admin.deposits.map(deposit => <div key={deposit.itemId}>
          <span>{itemName(deposit.itemId)}</span>
          <strong>
            {deposit.remaining} libres + {deposit.reserved} reservadas + {deposit.extracted} extraídas / {deposit.budget}
          </strong>
        </div>)}</div>
    </section>
    <div className="m-grid-2">
      <ActionForm {...base} title="Registrar una incidencia" description="Extiende contratos y proyectos vigentes con motivo y plazo publicados. No imprime saldos ni reinicia reservas." command="social.incident" fields={[{ key: "hours", label: "Compensación de plazo · horas", type: "number", min: 1, max: 24 }, { key: "reason", label: "Motivo", type: "text" }]}/>
      <section className="m-card">
        <h3>Cierre del fondo simulado</h3>
        <p>Reparto proporcional con unidades enteras, techo individual del 2 % y remanente en reserva.</p>
        <button className="m-button full" disabled={busy || rewards.state !== "active"} onClick={() => act({ type: "reward.close", playerId: player.id })}>Revisar cierre de temporada</button>
        <div className="m-admin-list" style={{ marginTop: 19 }}>
          <div>
            <span>Liquidaciones de proyecto pendientes</span>
            <strong>{view.social.admin?.pendingReleases ?? 0}</strong>
          </div>
          <div>
            <span>Reembolsos pendientes</span>
            <strong>{view.social.admin?.pendingRefunds ?? 0}</strong>
          </div>
          <div>
            <span>Comisiones de créditos</span>
            <strong>{view.social.admin?.fees ?? 0}</strong>
          </div>
        </div>
      </section>
    </div>
    <section className="m-panel">
      <div className="m-panel-title"><h2>Incidencias registradas</h2></div>
      {view.social.admin?.incidents.length ? view.social.admin.incidents.map((incident, i) => <p key={i} style={{ marginBottom: 9 }}>
        {timestamp(incident.at)} · +{incident.hours} h · {incident.reason}
      </p>) : <p>Sin incidencias de temporada registradas.</p>}
    </section>
  </div>}
  </>;
}
const ORDER_LABELS: Record<string, string> = { "habitat.build": "Construir dentro de tu parcela", "habitat.job.accept": "Aceptar el encargo del distrito", "habitat.job.extract": "Extraer la madera reservada", "habitat.job.craft": "Transformar madera en tablones", "habitat.job.deliver": "Entregar los tablones y cobrar", "habitat.job.cancel": "Cancelar el encargo y liberar su pago", "outpost.defense": "Configurar defensa de un puesto", "battle.outpost": "Disputa voluntaria de una concesión", "outpost.claim": "Concesión temporal de un puesto", "outpost.maintain": "Mantenimiento de un puesto", "outpost.release": "Liberar una concesión", "world.survey": "Prospección de territorio", "world.travel": "Viaje a otro territorio", "mining.reserve": "Reserva de extracción", "deposit.unlock": "Apertura de una capa existente", "craft.start": "Fabricación por lotes", "craft.cancel": "Cancelar una fabricación", "craft.recycle": "Reciclaje con devolución limitada", "farm.start": "Nuevo ciclo de cultivo", "building.upgrade": "Mejora de edificio", "expedition.start": "Expedición de hallazgos", "army.prepare": "Preparar unidades", "army.heal": "Recuperar una unidad", "convoy.start": "Enviar un convoy", "battle.start": "Encuentro NPC", "pvp.toggle": "Cambiar exposición PvP", "battle.raid": "Incursión a una carga expuesta", "market.publish": "Publicar una oferta", "market.fill": "Aceptar un intercambio", "market.cancel": "Retirar una oferta", "npc.sell": "Venta a la feria regional", "contract.publish": "Publicar un contrato", "contract.accept": "Aceptar un contrato", "contract.deliver": "Entregar un contrato", "clan.create": "Fundar un clan", "clan.join": "Unirse a un clan", "clan.leave": "Salir de un clan", "clan.role": "Cambiar una responsabilidad", "clan.deposit": "Aportar a la tesorería", "clan.withdraw": "Solicitar un retiro", "clan.approve": "Segunda aprobación de retiro", "clan.project.open": "Abrir una obra colectiva", "clan.project.contribute": "Aportar a la obra", "clan.project.complete": "Completar el puente", "clan.project.cancel": "Cancelar y devolver aportes", "alliance.propose": "Proponer una alianza", "alliance.accept": "Aceptar un pacto", "alliance.leave": "Abandonar un pacto", "referral.bind": "Vincular una invitación", "referral.validate": "Validar hitos de una invitación", "mentor.assign": "Acompañar a un aprendiz", "funding.open": "Abrir proyecto SIMULADO", "funding.contribute": "Aporte SIMULADO a un proyecto", "funding.deliver": "Entregar productos del proyecto", "funding.release": "Liquidación financiera SIMULADA", "funding.refund": "Reembolso SIMULADO", "reward.close": "Cerrar el reparto SIMULADO", "reward.claim": "Entrega de premio SIMULADO", "social.incident": "Registrar incidencia de temporada", "credit.service": "Reparación de equipo" };
const FACILITY_ORDER_LABELS: Record<string, string> = {
    "habitat.manager.start": "Autorizar turno del encargado de producción",
    "habitat.manager.resume": "Autorizar otro turno del encargado",
    "habitat.manager.pause": "Pausar nuevas órdenes del encargado",
    "habitat.manager.approve-build": "Aprobar un plano para el encargado",
    "habitat.manager.revoke-build": "Retirar un plano pendiente",
    "habitat.land.road": "Construir tramos de camino en tu parcela",
    "habitat.land.bridge": "Construir el puente entre las orillas",
    "habitat.building.demolish": "Desmontar una construcción propia y recuperar materiales",
    "habitat.land.explore": "Explorar casillas de tu parcela",
    "habitat.land.clear": "Preparar terreno y retirar vegetación",
    "habitat.land.claim": "Reclamar casillas preparadas",
    "habitat.land.center.upgrade": "Mejorar el Centro de la aldea",
    "habitat.storage.deposit": "Guardar recursos en el cobertizo",
    "habitat.storage.withdraw": "Retirar recursos del cobertizo",
    "habitat.workbench.start": "Fabricar en la mesa de trabajo",
    "habitat.planter.start": "Sembrar el bancal",
    "habitat.facility.cancel": "Cancelar la producción de esta construcción",
    "habitat.logistics.retry": "Reintentar el traslado al cobertizo",
    "habitat.residents.initialize": "Registrar a los habitantes iniciales",
    "habitat.resident.assign": "Asignar un habitante a su puesto",
    "habitat.resident.unassign": "Retirar al habitante de su puesto",
    "habitat.resident.recruit": "Incorporar un habitante a la vivienda",
    "habitat.woodlot.start": "Reservar una extracción forestal",
    "habitat.sawmill.order": "Planificar un pedido de tablones",
    "habitat.sawmill.stop": "Detener los siguientes ciclos del aserradero",
    "habitat.sawmill.resume": "Reanudar el pedido del aserradero",
    "habitat.trade.accept": "Aceptar el encargo de Valleverde",
    "habitat.trade.dispatch": "Cargar tablones y enviar la carreta",
    "habitat.trade.cancel": "Cancelar el encargo antes de cargar",
    "habitat.daily.start": "Preparar alimentos y mantenimiento de una jornada",
    "habitat.shed.upgrade": "Ampliar el cobertizo al nivel dos",
};
function QuoteDialog({ quote, clock, busy, unavailable = false, uncertain = false, sessionRequired = false, refreshing = false, reconnect, confirm, close }: {
    quote: ActionQuote;
    clock: number;
    busy: boolean;
    unavailable?: boolean;
    uncertain?: boolean;
    sessionRequired?: boolean;
    refreshing?: boolean;
    reconnect: () => void;
    confirm: () => void;
    close: () => void;
}) {
    const expired = clock >= quote.expiresAt;
    const storageTransfer = quote.command.type === "habitat.storage.deposit" || quote.command.type === "habitat.storage.withdraw";
    return <div className="m-overlay"><section className="m-dialog" role="dialog" aria-modal="true" aria-labelledby="m-quote-title">
    <div className="m-dialog-header">
      <h2 id="m-quote-title">Una decisión informada.</h2>
      <button aria-label="Cerrar cotización" onClick={close} disabled={busy}><X size={19}/></button>
    </div>
    <div className="m-eyebrow">COTIZACIÓN DEL SERVIDOR</div>
    <p>{FACILITY_ORDER_LABELS[quote.command.type] ?? ORDER_LABELS[quote.command.type] ?? "Revisar tu orden"}</p>
    {storageTransfer && <p className="m-note">{quote.command.type === "habitat.storage.deposit" ? "Estas unidades pasarán de tu inventario de Estación al cobertizo. No se consumen." : "Estas unidades volverán del cobertizo a tu inventario de Estación."} Conservan su procedencia, vinculación y fecha de caducidad.</p>}
    <div className="m-quote-main">
      <div className="m-quote-duration">
        <Clock3 size={29} strokeWidth={1.3}/>
        <div>
          <strong>{quote.durationSeconds > 0 ? duration(quote.durationSeconds) : "Inmediato"}</strong>
          <small>{quote.durationSeconds > 0 ? "Duración fijada al confirmar" : "Se aplica al confirmar"}</small>
        </div>
      </div>
      {quote.boost&&<section className="m-quote-boost" aria-label="Ahorro del potenciador de prueba"><div><Clock3 size={16}/><strong>Potenciador de prueba · Sin cobros</strong></div><dl><div><dt>Trabajo normal</dt><dd>{duration(quote.boost.baseSeconds)}</dd></div><div><dt>Con potenciador</dt><dd>{duration(quote.boost.durationSeconds)}</dd></div><div><dt>Ahorro reservado al confirmar</dt><dd>{duration(quote.boost.savedSeconds)}</dd></div><div><dt>Cupo restante de la cuenta</dt><dd>{duration(quote.boost.remainingSecondsAfter)}</dd></div>{typeof quote.boost.passesAfter==='number'&&<><div><dt>Pases consumidos al confirmar</dt><dd>{quote.boost.passCost}</dd></div><div><dt>Pases restantes de la cuenta</dt><dd>{quote.boost.passesAfter}</dd></div></>}</dl>{quote.boost.partial&&<p>Se aplicará un ahorro parcial para respetar el cupo disponible de tu cuenta.</p>}<p>El ahorro afecta al trabajo, sin reducir colas ni traslados. Cancelar después de confirmar no devuelve el pase ni el cupo reservado.</p></section>}
      {quote.boostReward&&quote.boostReward.charges>0&&<section className="m-quote-boost" aria-label="Recompensa de potenciadores"><div><FlaskConical size={16}/><strong>+{quote.boostReward.charges} {quote.boostReward.charges===1?'pase de potenciador':'pases de potenciador'}</strong></div><p>Este premio se sumará automáticamente al confirmar esta acción verificada. No requiere reclamarlo ni hacer un pago real.</p><p>Los pases se comparten entre tus exploradores y conservan los límites de uso de la cuenta.</p></section>}
      {quote.changes.length || quote.creditDelta || quote.boundCreditDelta || quote.simDelta ? <>
        <span className="m-note">{storageTransfer ? "Movimiento en el inventario de Estación" : "Cambios al confirmar · consumos o reservas"}</span>
        <div className="m-list" style={{ marginTop: 12 }}>
          {quote.changes.map(change => <div className="m-spread" key={change.itemId}>
            <span>{itemName(change.itemId)}</span>
            <strong style={{ fontWeight: 600, color: change.delta < 0 ? "#e8bb8a" : "#c1d594" }}>
              {change.delta > 0 ? "+" : ""}
              {change.delta}
            </strong>
          </div>)}
          {quote.creditDelta !== 0 && <div className="m-spread m-small">
            <span>Créditos transferibles</span>
            <strong>
              {quote.creditDelta > 0 ? "+" : ""}
              {quote.creditDelta} CR</strong>
          </div>}
          {quote.boundCreditDelta !== 0 && <div className="m-spread m-small"><span>Créditos de tutorial vinculados</span><strong>{quote.boundCreditDelta} CR</strong></div>}
          {quote.simDelta !== 0 && <div className="m-spread m-small">
            <span>QRYP · SIMULADO</span>
            <strong>
              {quote.simDelta > 0 ? "+" : ""}
              {quote.simDelta} SIM</strong>
          </div>}
        </div>
      </> : <p>No hay cambios inmediatos en tu inventario disponible.</p>}
      {!!quote.expectedOutputs?.length && <p style={{ marginTop: 14 }}>{quote.command.type === "habitat.sawmill.order" || quote.command.type === "habitat.sawmill.resume" ? "Al completar este ciclo" : "Al completar"}: {quote.expectedOutputs.map(output => `${output.qty} ${itemName(output.itemId)}`).join(", ")}.</p>}
    </div>
    {quote.managerForecast&&<ManagerForecastPanel forecast={quote.managerForecast}/>}
    {quote.warnings.map((warning, i) => <p className="m-note" key={i} style={{ marginBottom: 8 }}>{warning}</p>)}
    {unavailable && <p className="m-warning" role="alert">{sessionRequired ? "Tu sesión necesita verificarse. Conservamos el identificador de la orden para comprobarlo después de entrar." : "El guardado no responde. Conservamos esta cotización y su identificador; no volveremos a enviar la orden automáticamente."}</p>}
    <p className="m-note" style={{ margin: "12px 0 18px" }}>{uncertain ? "No conocemos el resultado del envío anterior. Al comprobarlo usamos el mismo identificador: recuperamos su resultado o completamos la orden una sola vez si la cotización sigue vigente." : expired ? "Esta cotización venció. Cierra y vuelve a revisar la orden." : `Cotización válida durante ${duration(Math.max(0, (quote.expiresAt - clock) / 1000))}. Si cambia el mundo, se pedirá una nueva revisión.`}</p>
    <div className="m-button-row">
      <button className="m-button secondary" onClick={close} disabled={busy}>Volver</button>
      <button className="m-button" style={{ flex: 1 }} disabled={busy || (unavailable ? refreshing : expired && !uncertain)} onClick={unavailable ? reconnect : confirm}>
        {busy || refreshing ? <LoaderCircle size={14} className="m-spin"/> : <Check size={14}/>} {sessionRequired ? "Volver a iniciar sesión" : unavailable ? "Comprobar conexión" : uncertain ? "Comprobar o completar orden" : "Confirmar orden"}</button>
    </div>
  </section></div>;
}
// Clock ticks belong to countdowns; map geometry and large commerce forms need not reconcile every second.
const StableWorldScreen=memo(WorldScreen),StableTradeScreen=memo(TradeScreen),StableCommunityScreen=memo(CommunityScreen),StableExpeditionsScreen=memo(ExpeditionsScreen),StableSeasonScreen=memo(SeasonScreen);
export default function MvpClient({ initialView, initialTab = "world",initialNavigation }: {
    initialView: MvpView;
    initialTab?: GameTab;
    initialNavigation?: GameNavigation;
}) {
    const [view, setView] = useState(initialView);
    const timestamp=useGameTimestamp();
    const viewRef=useRef(initialView);
    const [clock, setClock] = useState(initialView.now);
    const clockAnchor=useRef({server:initialView.now,local:0});
    useEffect(()=>{clockAnchor.current={server:initialView.now,local:performance.now()};},[initialView.now]);
    const currentClock=useCallback(()=>clockAnchor.current.server+Math.max(0,performance.now()-clockAnchor.current.local),[]);
    const clockRef=useRef(clock);useEffect(()=>{clockRef.current=clock;},[clock]);
    const [navigation,setNavigation]=useState(()=>normalizeGameNavigation(initialNavigation??defaultGameNavigation(initialTab),{profiles:initialView.players,selectedProfileId:initialView.player?.id,isAdmin:!!initialView.admin}));
    const navigationRef=useRef(navigation);
    const tab=navigation.tab;
    const selectedTile=navigation.tileId??view.player?.position??"t_4_4";
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    const quoteRef = useRef(false);
    const sequenceRef = useRef(0);
    const [quote, setQuote] = useState<ActionQuote | null>(null);
    const [toast, setToast] = useState<{
        message: string;
        error?: boolean;
    } | null>(null);
    useEffect(()=>{if(!toast||toast.error)return;const timer=window.setTimeout(()=>setToast(null),6000);return()=>window.clearTimeout(timer);},[toast]);
    const [profilesOpen, setProfilesOpen] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [helpOpen, setHelpOpen] = useState(false);
    const [worldChronicle,setWorldChronicle]=useState(false);
    const [protectionExpanded,setProtectionExpanded]=useState(initialNavigation?.tab==='world'||!initialNavigation&&initialTab==='world');
    const protectionSeen=useRef(initialNavigation?.tab==='world'||!initialNavigation&&initialTab==='world');
    const [storageUnavailable, setStorageUnavailable] = useState(false);
    const [sessionRequired, setSessionRequired] = useState(false);
    const [pendingOrder, setPendingOrder] = useState<PendingOrder | null>(null);
    const pendingOrderRef = useRef<PendingOrder | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const refreshInFlight = useRef(false);
    const refreshAbort = useRef<AbortController | null>(null);
    const refreshTarget=useRef<string|undefined>(undefined);
    const player = view.player;
    const profilePending=!!navigation.profileId&&navigation.profileId!==player?.id;
    const notifications=useActivityNotifications(view.activity,view.revision,profilePending);
    useAudioActivity(view.activity,profilePending);
    const levelNotifications=useLevelNotifications(view.activity,view.revision,profilePending);
    const [progressionProfile,setProgressionProfile]=useState<string|null>(null);
    const closeProgression=useCallback(()=>setProgressionProfile(null),[]);
    const [notificationProfile,setNotificationProfile]=useState<string|null>(null);
    const setNotificationsOpen=useCallback((open:boolean)=>setNotificationProfile(open?player?.id??null:null),[player?.id]);
    const navigate:GameNavigate=useCallback((next,options)=>{
        const current=navigationRef.current,requested=typeof next==='function'?next(current):next,currentView=viewRef.current;
        const normalized=normalizeGameNavigation(requested,{profiles:currentView.players,selectedProfileId:currentView.player?.id,isAdmin:!!currentView.admin});
        if(normalized.tab==='world'&&!protectionSeen.current){protectionSeen.current=true;setProtectionExpanded(true);}
        else if(current.tab==='world'&&normalized.tab!=='world')setProtectionExpanded(false);
        if(refreshAbort.current&&refreshTarget.current!==normalized.profileId){sequenceRef.current++;refreshAbort.current.abort('navigation');}
        if(normalized.profileId!==current.profileId&&!busyRef.current&&!pendingOrderRef.current){setQuote(null);quoteRef.current=false;}
        navigationRef.current=normalized;
        setNavigation(previous=>sameGameNavigation(previous,normalized)?previous:normalized);
        let url=formatGameNavigation(normalized);
        // Welcome reads this invitation from the original URL before the first profile exists.
        const invite=!currentView.player?new URLSearchParams(window.location.search).get('invite'):null;
        if(invite&&/^QF[a-f0-9]{12}$/i.test(invite))url+=`${url.includes('?')?'&':'?'}invite=${encodeURIComponent(invite)}`;
        if(`${window.location.pathname}${window.location.search}${window.location.hash}`!==url)window.history[options?.replace?'replaceState':'pushState'](null,'',url);
    },[]);
    const setTab=(next:Tab)=>navigate(current=>current.tab===next?current:{...defaultGameNavigation(next),profileId:current.profileId});
    const setSelectedTile=useCallback((tileId:string)=>navigate(current=>({...current,tileId})),[navigate]);
    const routeContext=useMemo(()=>({navigation,navigate}),[navigation,navigate]);
    useEffect(()=>{
        const restore=()=>navigate(parseGameNavigation(window.location.href),{replace:true});
        restore();window.addEventListener('popstate',restore);window.addEventListener('hashchange',restore);
        return()=>{window.removeEventListener('popstate',restore);window.removeEventListener('hashchange',restore);};
    },[navigate]);
    const rememberOrder = useCallback((order: PendingOrder | null) => { pendingOrderRef.current = order; setPendingOrder(order); savePendingOrder(order); }, []);
    useEffect(() => {
        const restored = restorePendingOrder(initialView);
        if (!restored) return;
        pendingOrderRef.current = restored;
        const timer = window.setTimeout(() => setPendingOrder(restored), 0);
        return () => window.clearTimeout(timer);
    }, [initialView]);
    const handleFailure = useCallback((error: unknown, fallback: string, quiet = false) => {
        if (uncertainOutcome(error)) setStorageUnavailable(true);
        if (errorCode(error) === SESSION_REQUIRED) setSessionRequired(true);
        if (!quiet) setToast({ message: error instanceof Error ? error.message : fallback, error: true });
    }, []);
    const updateView = useCallback((next: MvpView) => { if(next.revision<viewRef.current.revision)return;viewRef.current=next;clockAnchor.current={server:next.now,local:performance.now()};setView(next);setClock(next.now);setStorageUnavailable(false);setSessionRequired(false); }, []);
    const refresh = useCallback(async (id?: string, quiet = false,force=false) => { if (sessionRequired || busyRef.current || quoteRef.current && !storageUnavailable && !pendingOrderRef.current)
        return;
        const target=id&&viewRef.current.players.some(profile=>profile.id===id)?id:navigationRef.current.profileId;
        if(refreshInFlight.current){if(!force&&target===refreshTarget.current)return;refreshAbort.current?.abort('navigation');}
        refreshInFlight.current = true; setRefreshing(true);
        const controller = new AbortController(); refreshAbort.current = controller;refreshTarget.current=target;
        const timeout = window.setTimeout(() => controller.abort(), 8000);
        const sequence = ++sequenceRef.current; try {
        const response = await fetch(`/api/mvp${target ? `?playerId=${encodeURIComponent(target)}` : ""}`, { cache: "no-store", credentials: "same-origin", redirect: "manual", headers: {Accept: "application/json"}, signal: controller.signal });
        const data = await readReply(response, "view");
        if (!response.ok)
            throw replyError(data, "No pudimos leer la frontera.");
        if (sequence === sequenceRef.current&&refreshAbort.current===controller&&(!navigationRef.current.profileId||data.view.player?.id===navigationRef.current.profileId)){
            updateView(data.view);
            navigate(current=>current,{replace:true});
        }
    }
    catch (error) {
        if (sequence === sequenceRef.current&&refreshAbort.current===controller&&!['navigation','unmount'].includes(String(controller.signal.reason))) handleFailure(error instanceof Error && error.name === "AbortError" ? Object.assign(new Error("La conexión con el guardado tarda demasiado. Volvé a intentarlo."), {code:"MVP_STORAGE_UNAVAILABLE"}) : error, "No pudimos actualizar el mundo.", quiet);
    } finally {
        window.clearTimeout(timeout);if(refreshAbort.current===controller){refreshInFlight.current=false;refreshAbort.current=null;refreshTarget.current=undefined;setRefreshing(false);}
    } }, [updateView, handleFailure, storageUnavailable, sessionRequired,navigate]);
    const onRoyalTrade = useCallback(()=>{void refresh(navigationRef.current.profileId,true,true);},[refresh]);
    useEffect(() => () => {const controller=refreshAbort.current;refreshAbort.current=null;refreshInFlight.current=false;sequenceRef.current++;controller?.abort('unmount');}, []);
    useEffect(()=>{if(profilePending&&!busy&&!quote&&!pendingOrder)void refresh(navigation.profileId,false,true);},[profilePending,navigation.profileId,busy,quote,pendingOrder,refresh]);
    useEffect(() => { const timer = window.setInterval(() => {if(document.visibilityState==='visible')setClock(currentClock());}, 1000); return () => window.clearInterval(timer); }, [currentClock]);
    useEffect(() => { if (sessionRequired) return; const timer = window.setInterval(() => { if (document.visibilityState === "visible")
        void refresh(navigation.profileId, true); }, storageUnavailable ? 30000 : tab === "roam" ? 3500 : 12000); return () => window.clearInterval(timer); }, [navigation.profileId, refresh, tab, storageUnavailable, sessionRequired]);
    const knownDeadlines=[view.habitable.state?.exploration?.movement?.endsAt,view.habitable.manager?.nextChangeAt,view.habitable.network.nextChangeAt,view.activity?.nextCompletionAt,view.firstTrade?.job?.endsAt,view.boosts?.nextReleaseAt,...(view.land?.jobs.filter(job=>job.status==='running'||job.status==='reserved').flatMap(job=>job.crew?.legs.map(leg=>leg.endsAt)??[])??[])].filter((value):value is number=>typeof value==='number'&&value>view.now);
    const firstTradeDeadline=knownDeadlines.length?Math.min(...knownDeadlines):undefined;
    useEffect(()=>{
        if(!firstTradeDeadline||firstTradeDeadline<=view.now||profilePending||busy||quote||pendingOrder||storageUnavailable||sessionRequired)return;
        const timer=window.setTimeout(()=>{if(document.visibilityState==='visible')void refresh(navigation.profileId,true);},Math.max(250,Math.min(2147483000,firstTradeDeadline-clockRef.current+150)));
        return()=>window.clearTimeout(timer);
    // One refresh at the known deadline; an overdue server result never creates a zero-delay polling loop.
    },[firstTradeDeadline,view.now,profilePending,busy,quote,pendingOrder,storageUnavailable,sessionRequired,navigation.profileId,refresh]);
    useEffect(()=>{
        const visible=()=>{if(document.visibilityState==='visible'){setClock(currentClock());void refresh(navigation.profileId,true);}};
        document.addEventListener('visibilitychange',visible);return()=>document.removeEventListener('visibilitychange',visible);
    },[navigation.profileId,refresh,currentClock]);
    useEffect(() => { const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !busyRef.current) {
        setProfilesOpen(false);
        setCreateOpen(false);
        setHelpOpen(false);
        setNotificationProfile(null);
        setProgressionProfile(null);
        setQuote(null);
        quoteRef.current = false;
    } }; window.addEventListener("keydown", onEscape); return () => window.removeEventListener("keydown", onEscape); }, []);
    const sendOrder = useCallback(async (order: PendingOrder) => {
        if (busyRef.current || storageUnavailable || sessionRequired || navigationRef.current.profileId!==viewRef.current.player?.id&&pendingOrderRef.current?.requestId!==order.requestId) return;
        busyRef.current = true; sequenceRef.current += 1; setBusy(true); setToast(null);
        // Persist before sending so reloads never silently create a new request identity.
        rememberOrder(order);
        try {
            const {response, data} = await postReply("/api/mvp", "view", pendingOrderBody(order));
            if (!response.ok) throw replyError(data, "No se pudo confirmar la orden.");
            updateView(data.view); rememberOrder(null);
            setQuote(null); quoteRef.current = false;
            if (order.kind === "create") {
                navigate({...defaultGameNavigation('world'),profileId:data.view.player?.id,tileId:data.view.player?.position});setCreateOpen(false);
                setToast({message: "Tu estación está lista. La frontera te espera."});
            } else setToast({message: order.kind === "quick" ? "Tu recorrido y tu personaje quedaron comprobados." : order.durationSeconds > 0 ? "Orden confirmada. Los recursos están reservados y el trabajo está en marcha." : "Decisión confirmada y guardada en la frontera."});
        } catch (error) {
            if (!uncertainOutcome(error)) { rememberOrder(null); setQuote(null); quoteRef.current = false; }
            handleFailure(error, "No pudimos comprobar el resultado de la orden.");
        } finally { busyRef.current = false; setBusy(false); }
    }, [rememberOrder, updateView, handleFailure, storageUnavailable, sessionRequired,navigate]);
    const submitCreate = useCallback(async (values: Record<string, unknown>) => {
        if (busyRef.current || storageUnavailable || sessionRequired || pendingOrderRef.current || navigationRef.current.profileId!==viewRef.current.player?.id) return;
        const requestId = crypto.randomUUID();
        await sendOrder({version: 1, kind: "create", requestId, command: {type: "player.create", ...values}, durationSeconds: 0, playerIds: [...view.players.map(profile => profile.id), `p_${requestId}`]});
    }, [sendOrder, storageUnavailable, sessionRequired, view.players]);
    const act = useCallback(async (command: MvpCommand) => { if (command.type === "player.create") {
        const { type: _type, playerId: _id, ...values } = command;
        await submitCreate(values);
        return;
    } if (busyRef.current || quoteRef.current || storageUnavailable || sessionRequired || pendingOrderRef.current || navigationRef.current.profileId!==viewRef.current.player?.id)
        return; busyRef.current = true; quoteRef.current = true; sequenceRef.current += 1; setBusy(true); setToast(null); let reconcile=false; try {
        const {response, data} = await postReply("/api/mvp/quote", "quote", { requestId: crypto.randomUUID(), command });
        if (!response.ok)
            throw replyError(data, "Esta orden no está disponible.");
        if(command.playerId&&command.playerId!==navigationRef.current.profileId){quoteRef.current=false;return;}
        setQuote(data.quote);
    }
    catch (error) {
        quoteRef.current = false;
        reconcile=!uncertainOutcome(error);
        handleFailure(error, "No pudimos cotizar esta orden.");
    }
    finally {
        busyRef.current = false;
        setBusy(false);
        if(reconcile)void refresh(navigationRef.current.profileId,true);
    } }, [submitCreate, handleFailure, storageUnavailable, sessionRequired,refresh]);
    // Free movement and wardrobe still use signed, revision-checked transactions.
    // Orders that spend materials or credits retain the confirmation dialog.
    const quickAct = useCallback(async (command: MvpCommand) => {
        if (!isQuickHabitableCommand(command.type) || busyRef.current || quoteRef.current || storageUnavailable || sessionRequired || pendingOrderRef.current || navigationRef.current.profileId!==viewRef.current.player?.id) return;
        busyRef.current = true; sequenceRef.current += 1; setBusy(true); setToast(null);
        const requestId = crypto.randomUUID();
        try {
            for (let attempt = 0; attempt < 2; attempt++) {
                const {response: quoted, data: reply} = await postReply("/api/mvp/quote", "quote", { requestId, command });
                if (!quoted.ok) throw replyError(reply, "No se pudo preparar el recorrido.");
                const actionQuote = reply.quote;
                if (actionQuote.changes.some(change => change.delta !== 0) || actionQuote.creditDelta || actionQuote.boundCreditDelta || actionQuote.simDelta || actionQuote.expectedOutputs.length) throw new Error("Esta acción necesita revisar sus recursos antes de confirmarla.");
                const order: PendingOrder = {version: 1, kind: "quick", requestId, command, expectedRevision: actionQuote.revision, quoteToken: actionQuote.token, quoteExpiresAt: actionQuote.expiresAt, durationSeconds: 0, playerIds: view.players.map(profile => profile.id)};
                rememberOrder(order);
                const {response: committed, data: result} = await postReply("/api/mvp", "view", pendingOrderBody(order));
                if (committed.status === 409 && attempt === 0) { rememberOrder(null); continue; }
                if (!committed.ok) throw replyError(result, "No se pudo guardar tu recorrido.");
                updateView(result.view); rememberOrder(null);
                if (command.type === "habitat.profile") setToast({ message: "Tu personaje quedó guardado." });
                return;
            }
        } catch (error) {
            if (!uncertainOutcome(error)) rememberOrder(null);
            handleFailure(error, "No pudimos guardar el recorrido.");
        } finally { busyRef.current = false; setBusy(false); }
    }, [updateView, handleFailure, rememberOrder, storageUnavailable, sessionRequired, view.players]);
    const manualSender=useRef<(command:DistrictManualNavigationCommand)=>Promise<boolean>>(async()=>false);
    const manualQueue=useRef<ReturnType<typeof createDistrictManualQueue>|null>(null);
    manualQueue.current??=createDistrictManualQueue(command=>manualSender.current(command));
    useEffect(()=>{manualSender.current=async command=>{
        // A previous profile's queued lease must not block the newly selected profile's release.
        if(navigationRef.current.profileId!==command.playerId)return true;
        if(busyRef.current||quoteRef.current||storageUnavailable||sessionRequired||pendingOrderRef.current)return false;
        // Serialize writes without disabling controls or persisting an economic order for each lease.
        busyRef.current=true;sequenceRef.current++;
        try{
            await sendDistrictManualCommand(command,{
                requestId:crypto.randomUUID(),
                quote:async body=>{const {response,data}=await postReply('/api/mvp/quote','quote',body);if(!response.ok)throw replyError(data,'No se pudo preparar el movimiento.');return data.quote;},
                commit:async body=>{const {response,data}=await postReply('/api/mvp','view',{...body});if(!response.ok&&response.status!==409)throw replyError(data,'No se pudo guardar el movimiento.');return response.ok?{ok:true,view:data.view}:{ok:false,status:response.status};},
                update:next=>{if(navigationRef.current.profileId===command.playerId)updateView(next);},
            });
            return true;
        }catch(error){handleFailure(error,'No pudimos guardar el movimiento.');return !uncertainOutcome(error);}
        finally{busyRef.current=false;}
    };},[updateView,handleFailure,storageUnavailable,sessionRequired]);
    const manualAct=useCallback((command:MvpCommand)=>{
        if(command.type!=="habitat.walk.input"||typeof command.playerId!=="string")return;
        manualQueue.current?.enqueue(command as DistrictManualNavigationCommand);
    },[]);
    useEffect(()=>{if(!busy&&!quote&&!storageUnavailable&&!sessionRequired&&!pendingOrder)void manualQueue.current?.flush();},[busy,quote,storageUnavailable,sessionRequired,pendingOrder]);
    useEffect(()=>()=>{manualQueue.current?.clear();},[]);
    const closeQuote = () => { if (busyRef.current)
        return; setQuote(null); quoteRef.current = false; };
    const confirm = async () => {
        if (!quote || busyRef.current || storageUnavailable || sessionRequired) return;
        const pending = pendingOrderRef.current;
        if (pending) { if (pending.requestId === quote.requestId) await sendOrder(pending); return; }
        if(navigationRef.current.profileId!==viewRef.current.player?.id||quote.command.playerId&&quote.command.playerId!==navigationRef.current.profileId)return;
        if (clock >= quote.expiresAt) return;
        await sendOrder({version: 1, kind: "quoted", requestId: quote.requestId, command: quote.command, expectedRevision: quote.revision, quoteToken: quote.token, quoteExpiresAt: quote.expiresAt, durationSeconds: quote.durationSeconds, playerIds: view.players.map(profile => profile.id)});
    };
    const reconnect = () => { if (sessionRequired) window.location.reload(); else void refresh(navigation.profileId); };
    const locked = busy || !!quote || storageUnavailable || sessionRequired || !!pendingOrder || profilePending;
    const levelPending=levelNotifications.snapshot.pending;
    const showCelebration=!!levelPending&&!!view.unlocks&&view.unlocks.playerId===player?.id&&levelPending.toLevel<=view.unlocks.level&&!locked&&!toast&&!profilesOpen&&!helpOpen&&!createOpen&&notificationProfile!==player?.id&&progressionProfile!==player?.id;
    const dismissLevel=()=>{
        if(!levelPending)return;
        levelNotifications.store.acknowledge();
        notifications.store.markRead((view.activity?.completions??[]).filter(item=>item.kind==='level-up'&&Number(item.id.split(':').at(-1))>levelPending.fromLevel&&Number(item.id.split(':').at(-1))<=levelPending.toLevel).map(item=>item.id));
    };
    const openActivity=(item:ActivityCompletion)=>{
        if(locked)return;
        const target=activityNotificationNavigation(item,player?.id,{profiles:view.players,selectedProfileId:player?.id,isAdmin:!!view.admin});
        if(!target)return;
        notifications.store.markRead([item.id]);notifications.store.takeAlerts();setNotificationsOpen(false);navigate(target);
    };
    const pages: Record<Tab, [
        string,
        string,
        string
    ]> = { roam: ["TU HISTORIA SE CONSTRUYE PASO A PASO", "Recorrer la frontera", "Tu personaje, tu parcela y tu primer oficio. Caminá, construí y cumplí encargos."], world: ["TU HISTORIA TIENE UN LUGAR EN EL UNIVERSO", "El mundo de Frontera", "Del espacio a tu aldea. Encontrá a tu gente y descubrí nuevos horizontes."], station: ["TU REFUGIO EN LA FRONTERA", "La estación", "Fabricá, cultivá y prepará todo lo que necesita tu expedición."], trade: ["EL INTERCAMBIO CONSTRUYE CAMINOS", "El mercado", "Materiales, encargos y acuerdos entre exploradores."], community: ["UNA FRONTERA COMPARTIDA", "Los clanes", "Reuní a tu gente. Construí rutas y pactos que perduren."], expeditions: ["MÁS ALLÁ DEL REFUGIO", "Las expediciones", "Prepará la formación, protegé tus convoyes y descubrí nuevos horizontes."], season: ["LA CRÓNICA DE TU VIAJE", "La temporada", "Tus hitos, proyectos y aportes al mundo de prueba."] };
    const chronicle=[...(worldChronicle?view.events:view.events.filter(event=>event.playerId===player?.id))].sort((a,b)=>b.at-a.at);
    const openFoundation=(id:string)=>navigate(current=>({...defaultGameNavigation(id==='trade'?'trade':id==='survey'||id==='region'?'world':'station'),profileId:current.profileId,section:id==='trade'?'npc':id==='survey'||id==='region'?'sectors':id==='craft'?'craft':'overview',...(id==='survey'||id==='region'?{tileId:player?.position}:{})}));
    return <GameRouteContext.Provider value={routeContext}><div className="m-shell">
  <aside className="m-sidebar">
    <a className="m-brand-icon" href="#" aria-label="QFrontier, ir al mundo" onClick={event => { event.preventDefault(); setTab("world"); }}><GameIcon name="emblem" size={58}/></a>
    <nav className="m-nav" aria-label="Navegación principal">{NAV.map(item => <button className={item.id === tab ? "active" : ""} key={item.id} onClick={() => setTab(item.id)} aria-label={item.label} aria-current={item.id === tab ? "page" : undefined}>
        <GameIcon name={item.id} size={34}/>
        <span className="m-nav-label">{item.label}</span><span className="m-nav-label-compact" aria-hidden="true">{item.compact}</span>
        {!!notifications.snapshot.byTab[item.id]&&<span className="m-nav-ready" aria-label={`${notifications.snapshot.byTab[item.id]} novedades sin leer`} title={`${notifications.snapshot.byTab[item.id]} actividades terminadas sin leer`}>{notifications.snapshot.byTab[item.id]!>99?'99+':notifications.snapshot.byTab[item.id]}</span>}
      </button>)}</nav>
    <div className="m-sidebar-bottom">
      <button aria-label="Cómo jugar" onClick={() => setHelpOpen(true)}><CircleHelp size={21}/></button>
      <span>FRONTERA CERO</span>
    </div>
  </aside>
  <div className="m-app">
    <header className="m-header">
      <a href="#" className="m-wordmark" aria-label="QFrontier, ir al mundo" onClick={event => { event.preventDefault(); setTab("world"); }}>
        <GameIcon name="emblem" size={38}/><span>QFrontier<small>Frontera Cero</small></span>
      </a>
      {player && <div className="m-resource-pouch" aria-label="Suministros disponibles">{(["timber", "water", "ration"] as ItemId[]).map(id => <span key={id} title={`${itemName(id)}: ${quantity(player, id)}`}><ItemArt id={id} size={30}/><span>{quantity(player, id)}</span></span>)}</div>}
      <div className="m-header-meta"><GameAudio/>
        <span className="m-connection">
          <i className="m-dot"/>{sessionRequired ? "Sesión por verificar" : storageUnavailable ? "Conexión interrumpida" : "Alfa · Mundo vivo"}</span>
        <span className="m-badge m-sim">QRYP SIMULADO · SIN DINERO REAL</span>
        {player&&view.activity?.playerId===player.id&&<ActivityBell key={player.id} activity={view.activity} snapshot={notifications.snapshot} store={notifications.store} open={notificationProfile===player.id&&!locked} setOpen={setNotificationsOpen} disabled={locked} onSelect={openActivity}/>}
        <div className="m-profile">{player ? <>
            <button className="m-profile-trigger" onClick={() => setProfilesOpen(value => !value)} aria-expanded={profilesOpen} aria-label="Seleccionar explorador">
              <span className="m-avatar">{player.name.slice(0, 2).toUpperCase()}</span>
              <span className="m-profile-name">
                {player.name}
                <small>{player.stationName}</small>
              </span>
              <ChevronDown size={13}/>
            </button>
            {profilesOpen && <div className="m-profile-menu">
              {view.players.map(profile => <button className={profile.id === player.id ? "active" : ""} disabled={locked} key={profile.id} onClick={() => { setProfilesOpen(false);navigate(current=>({...current,profileId:profile.id,tileId:profile.position,facilityId:undefined,world:undefined})); }}>
                <span className="m-avatar">{profile.name.slice(0, 1).toUpperCase()}</span>
                {profile.name}
                {profile.id === player.id && <Check size={12} style={{ marginLeft: "auto" }}/>}
              </button>)}
              {view.players.length < 2 && <button disabled={locked} onClick={() => { setProfilesOpen(false); setCreateOpen(true); }}>
                <Plus size={14}/>Explorador de prueba</button>}
              <button onClick={() => { setProfilesOpen(false); setHelpOpen(true); }}>
                <CircleHelp size={14}/>Cómo jugar</button>
              <button disabled={locked} onClick={() => { setProfilesOpen(false); void refresh(player.id); }}>
                <Radio size={14}/>Actualizar la frontera</button>
            </div>}
          </> : <button aria-label="Cómo jugar" onClick={() => setHelpOpen(true)}><CircleHelp size={20}/></button>}</div>
      </div>
    </header>
    {player&&view.activity?.playerId===player.id&&!profilePending&&<ExperienceBar activity={view.activity} onOpenUnlocks={!locked&&view.unlocks?()=>setProgressionProfile(player.id):undefined}/>}
    {(storageUnavailable || sessionRequired || pendingOrder && !busy) && <section className="m-storage-banner" role="alert" aria-label="Conexión y órdenes pendientes"><Radio size={22}/><div><strong>{sessionRequired ? "Verificá tu sesión para continuar" : storageUnavailable ? "Esperando conexión con tu partida" : "Una orden necesita comprobarse"}</strong><p>{sessionRequired ? "Mostramos la última lectura confirmada. Volvé a entrar para verificar el acceso; las órdenes pendientes no se envían automáticamente." : pendingOrder ? "Conservamos el identificador del envío anterior y pausamos nuevas órdenes. Podés comprobar o completar esa misma orden una sola vez; nunca la reenviamos automáticamente." : "Mostramos la última lectura confirmada. Las órdenes están en pausa hasta volver a consultar el guardado; no repetimos envíos automáticamente."}</p></div><button disabled={busy || refreshing} className="m-button secondary" onClick={sessionRequired || storageUnavailable || !pendingOrder ? reconnect : () => void sendOrder(pendingOrder)}>{refreshing ? "Comprobando…" : sessionRequired ? "Volver a iniciar sesión" : storageUnavailable ? "Volver a conectar" : "Comprobar o completar orden"}</button></section>}
    {profilePending&&<section className="m-note" role="status"><LoaderCircle size={15} className={refreshing?'m-spin':undefined}/> {refreshing?'Cargando el explorador de esta dirección…':'Esperando la lectura del explorador seleccionado. Las órdenes están en pausa.'}{!refreshing&&!busy&&!quote&&!pendingOrder&&<button className="m-link-button" onClick={()=>void refresh(navigation.profileId,false,true)}>Volver a cargar explorador</button>}</section>}
    {!player ? <Welcome view={view} busy={locked} create={submitCreate}/> : <main className={`m-content ${tab === "world" ? "g-full-width-world" : ""}`}>
      <div className="m-page-title">
        <div>
          <div className="m-eyebrow">{pages[tab][0]}</div>
          <h1>{pages[tab][1]}</h1>
          <p>{pages[tab][2]}</p>
        </div>
        <span className="m-page-meta">{busy ? <>
            <LoaderCircle size={12} className="m-spin"/>Consultando…</> : tab === "world" ? <>
            <MapPin size={13}/>
            {player.discovered.length}/81 territorios</> : <>
            <ShieldCheck size={13}/>Estado guardado</>}</span>
      </div>
      <StarterProtectionBanner protection={player.starterProtection} clock={clock} compact={tab!=='world'||!protectionExpanded}/>
      {tab==='world'&&protectionExpanded&&<button className="m-link-button" onClick={()=>setProtectionExpanded(false)}>Resumir protección de la aldea</button>}
      {view.firstTrade?.playerId===player.id&&['world','station','trade'].includes(tab)&&<FirstTradePanel guide={view.firstTrade} clock={clock} busy={locked||refreshing} showReceipt act={act} navigate={navigate} refresh={()=>void refresh(player.id)}/>}
      <div className="m-layout" style={tab === "roam" ? { gridTemplateColumns: "minmax(0,1fr)" } : undefined}>
        <div>
          {tab === "world" && <StableWorldScreen key={`${player.id}:${JSON.stringify(navigation.world??null)}`} view={view} player={player} selected={selectedTile} setSelected={setSelectedTile} busy={locked} act={act} onRoyalTrade={onRoyalTrade}/>}
          {tab === "roam" && <HabitableClient key={player.id} view={view} player={player} busy={locked} act={act} quickAct={quickAct} manualAct={manualAct} clock={clock} panel={navigation.section as import('./habitable-client').HabitablePanel} facilityId={navigation.facilityId} onNavigate={(section,facilityId)=>navigate(current=>({...current,section,facilityId}))}/>}
          {tab === "station" && <StationScreen key={player.id} view={view} player={player} busy={locked} act={act} clock={clock}/>}
          {tab === "trade" && <StableTradeScreen key={player.id} view={view} player={player} busy={locked} act={act}/>}
          {tab === "community" && <StableCommunityScreen key={player.id} view={view} player={player} busy={locked} act={act}/>}
          {tab === "expeditions" && <StableExpeditionsScreen key={player.id} view={view} player={player} busy={locked} act={act}/>}
          {tab === "season" && <StableSeasonScreen key={player.id} view={view} player={player} busy={locked} act={act}/>}
        </div>
        {tab !== "roam" && <aside className="m-stack">
          {tab === "world" && <WeatherPanel view={view} player={player}/>}
          <Jobs jobs={view.jobs.filter(job => job.playerId === player.id)} clock={clock} busy={locked} act={act} actor={player.id}/>
          {tab === "trade" || tab === "season" ? <AccountPanel view={view} player={player} busy={locked} act={act}/> : <StockSummary player={player} openInventory={() => navigate(current=>({...defaultGameNavigation('station'),section:'inventory',profileId:current.profileId}))}/>}
          {tab !== "world" && tab !== "season" && <WeatherPanel view={view} player={player}/>}
          {tab === "world" && <section className="m-panel">
            <div className="m-panel-title"><h2>
                <Flag size={15}/>Tu primer recorrido</h2></div>
            <div className="m-list">{view.progress?.foundation.map(step => <div className={`m-inline m-small ${step.done ? "m-step-complete" : "m-step-pending"}`} key={step.id} title={step.detail}>
                {step.done ? <Check size={15}/> : <span className="m-step-marker"/>}
                <button className="m-link-button" onClick={()=>openFoundation(step.id)}>{step.label}<ArrowRight size={12}/></button>
              </div>)}</div>
          </section>}
        </aside>}
      </div>
      <section className="m-activity">
        <div className="m-activity-title">
          <span>
            <Radio size={13}/>Crónica de la frontera</span>
          <div className="m-inline" role="group" aria-label="Alcance de la crónica"><button className="m-link-button" aria-pressed={!worldChronicle} onClick={()=>setWorldChronicle(false)}>Mi explorador</button><button className="m-link-button" aria-pressed={worldChronicle} onClick={()=>setWorldChronicle(true)}>Mundo</button></div>
        </div>
        <div className="m-activity-grid">{chronicle.length ? chronicle.slice(0, 3).map(event => <div className="m-event" key={event.id}>
            <strong>{event.playerName}</strong> {event.text}
            <time>{timestamp(event.at)}</time>
          </div>) : <div className="m-event">Tu próxima decisión empezará a escribir esta crónica.</div>}</div>
      </section>
      <footer className="m-footer">
        <span>QFrontier · Frontera Cero · {view.rulesVersion}
        </span>
        <span>Las reservas conservan su historia.</span>
        <span>QRYP SIMULADO · Sin pagos ni tokens reales</span>
      </footer>
    </main>}
    </div>
  {showCelebration&&levelPending&&view.unlocks&&<LevelCelebration key={`${player?.id}:${levelPending.toLevel}`} fromLevel={levelPending.fromLevel} toLevel={levelPending.toLevel} unlocks={view.unlocks} boosts={view.boosts} onClose={dismissLevel} onInspect={()=>{dismissLevel();setProgressionProfile(player?.id??null);}}/>}
  {progressionProfile===player?.id&&view.unlocks&&!locked&&<LevelUnlockDialog unlocks={view.unlocks} boosts={view.boosts} onClose={closeProgression} onNavigate={navigate}/>}
  {!showCelebration&&progressionProfile!==player?.id&&!locked&&!toast&&!profilesOpen&&!helpOpen&&!createOpen&&notificationProfile!==player?.id&&notifications.snapshot.pending.length>0&&<ActivityAlerts items={notifications.snapshot.pending} onDismiss={()=>notifications.store.takeAlerts()} onOpen={()=>{notifications.store.takeAlerts();setNotificationsOpen(true);}}/>}
  {toast && <div className={`m-toast ${toast.error ? "error" : ""}`} role={toast.error ? "alert" : "status"} aria-live="polite">
    {toast.error ? <CircleHelp size={16}/> : <Check size={16}/>}
    <span>{toast.message}</span>
    <button aria-label="Cerrar aviso" onClick={() => setToast(null)}><X size={14}/></button>
  </div>}
  {quote && <QuoteDialog quote={quote} clock={clock} busy={busy} unavailable={storageUnavailable || sessionRequired} uncertain={pendingOrder?.requestId === quote.requestId} sessionRequired={sessionRequired} refreshing={refreshing} reconnect={reconnect} confirm={confirm} close={closeQuote}/>}
    {createOpen && player && <div className="m-overlay"><section className="m-dialog" role="dialog" aria-modal="true" aria-labelledby="m-create-title">
      <div className="m-dialog-header">
        <h2 id="m-create-title">Otra historia en la frontera.</h2>
        <button aria-label="Cerrar" disabled={busy} onClick={() => setCreateOpen(false)}><X size={19}/></button>
      </div>
      <p style={{ marginBottom: 18 }}>Un segundo explorador para probar intercambios y comunidades. Sus suministros iniciales también están vinculados.</p>
      <ActionForm title="Fundar otra estación" command="player.create" actor={player.id} busy={locked} act={act} fields={[{ key: "name", label: "Nombre del explorador", type: "text" }, { key: "stationName", label: "Nombre de estación", type: "text" }, { key: "faction", label: "Facción", type: "select", options: FACTIONS.map(faction => ({ value: faction.id, label: faction.name })) }]} button="Crear explorador de prueba"/>
    </section></div>}
    {helpOpen && <div className="m-overlay"><section className="m-dialog" role="dialog" aria-modal="true" aria-labelledby="m-help-title">
      <div className="m-dialog-header">
        <h2 id="m-help-title">Tu primera expedición.</h2>
        <button aria-label="Cerrar ayuda" onClick={() => setHelpOpen(false)}><X size={19}/></button>
      </div>
      <ol style={{ paddingLeft: 18, color: "#849874", fontSize: 12, lineHeight: 1.9 }}>
        <li><strong>Conoce tu distrito en Recorrer.</strong> Personaliza tu personaje, camina hasta los puestos y prueba una obra dentro de tu parcela. El encargo de madera a tablones guía la primera actividad con materiales y créditos del juego.</li>
        <li>
          <strong>Prospecta tu ubicación.</strong> El mapa revela las reservas cuando completas una prospección. Viaja a casillas conectadas y prepara agua y raciones.</li>
        <li>
          <strong>Reserva una extracción.</strong> Cada trabajo inmoviliza una parte del yacimiento. El servidor entrega los materiales al terminar.</li>
        <li>
          <strong>Producí en tu estación.</strong> Consultá recetas, cultivá y ampliá edificios. Los suministros de tutorial conservan su condición vinculada.</li>
        <li>
          <strong>Colabora o comercia.</strong> Vende materiales transferibles a la feria, publica trueques, acepta contratos o construye con un clan.</li>
        <li>
          <strong>Prepará tus rutas.</strong> Las expediciones y convoyes consumen suministros. Tu cuenta tiene 72 horas iniciales sin ataques entre jugadores. Después, el PvP continúa siendo voluntario y tu aldea permanece protegida.</li>
      </ol>
      <div className="m-warning" style={{ marginTop: 18 }}>Los créditos y QRYP del simulador son contabilidades de juego. No hay dinero real, wallet obligatoria, rendimiento garantizado ni NFTs emitidos.</div>
      <button className="m-button full" style={{ marginTop: 20 }} onClick={() => setHelpOpen(false)}>Vamos a explorar<ArrowRight size={13}/>
      </button>
    </section></div>}
  </div></GameRouteContext.Provider>;
}

