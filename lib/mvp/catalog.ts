import type { BuildingType, ItemDefinition, ItemId, Recipe } from './types.ts';
import proposal from './reference-config.json' with { type: 'json' };
export const CONFIG = proposal;
const rows: [ItemId,string,ItemDefinition['group'],string][] = [
 ['iron_ore','Hierro mineral','raw','Reserva industrial finita.'],['copper_ore','Cobre mineral','raw','Materia para cable.'],['silica','Sílice','raw','Base del vidrio.'],['timber','Madera','raw','Construcción y tablones.'],['stone','Piedra','raw','Infraestructura resistente.'],['fiber','Fibra','raw','Tejidos y equipo ligero.'],['water','Agua','raw','Presupuesto hídrico limitado.'],['grain','Grano','raw','Alimentos y semillas.'],['herbs','Hierbas','raw','Insumo médico.'],['biomass','Biomasa','raw','Materia para nutrientes.'],['crystal_shard','Fragmento cristalino','raw','Aperturas avanzadas.'],['data_fragment','Fragmento de datos','raw','Investigación y escáneres.'],
 ['iron_ingot','Lingote','intermediate','Metal refinado.'],['copper_wire','Cable de cobre','intermediate','Componentes eléctricos.'],['alloy','Aleación','intermediate','Base de herramientas.'],['cloth','Tejido','intermediate','Equipo y salud.'],['nutrient','Nutriente','intermediate','Consume tres biomasas y agua.'],['seed','Semilla','intermediate','Inicio de un cultivo limitado.'],['glass','Vidrio','intermediate','Óptica y módulos.'],['plank','Tablón','intermediate','Madera preparada.'],
 ['ration','Ración','product','Logística; caduca en 72 horas.'],['bread','Pan','product','Trabajo civil.'],['preserved_food','Conserva','product','Alimento para viajes; caduca en siete días.'],['medkit','Botiquín','product','Recupera salud de unidades.'],['repair_kit','Reparación','product','Restaura durabilidad.'],['drill_module_i','Módulo de apertura I','product','Abre la primera capa.'],['drill_module_ii','Módulo de apertura II','product','Abre la segunda capa.'],['pickaxe','Pico','product','Mejora la extracción sin aumentar reservas.'],['scanner','Escáner','product','Equipo de prospección.'],['cart','Carro','product','Equipo de transporte.'],['weather_cloak','Refugio climático','product','Protección ambiental.'],['camp_kit','Kit de campamento','product','Soporte de expedición.'],['guard_armor','Armadura','product','Equipo defensivo.'],['spear','Lanza','product','Equipo de guardias.'],['arrow_bundle','Munición','product','Apoyo de tiradores.'],['bridge_kit','Kit de puente','product','Paso sobre agua.'],
 ['memory_core','Núcleo de memoria','rare','Hallazgo con procedencia.'],['ancient_map','Mapa antiguo','rare','Pista singular.'],['artifact_frame','Marco de artefacto','rare','Colección de temporada.'],['season_relic','Reliquia de temporada','rare','Stock regional explícito.'],
];
export const ITEMS: ItemDefinition[] = rows.map(([id,name,group,description]) => ({id,name,group,description,...(id==='ration'?{expiresInHours:72}:id==='preserved_food'?{expiresInHours:168}:id==='bread'?{expiresInHours:48}:{}),...(['pickaxe','scanner','cart','weather_cloak','guard_armor','spear'].includes(id)?{durability:20}:{})}));
export const ITEM_CATALOG = Object.fromEntries(ITEMS.map(item=>[item.id,item])) as Record<ItemId,ItemDefinition>;
// IDs, inputs, quantities, times and facilities come directly from the supplied
// technical package. Building unlock levels were not specified there and are
// explicit pilot parameters, separate from the reference recipe definitions.
const PILOT_RECIPE_LEVELS: Partial<Record<ItemId, number>> = {
  drill_module_i: 2, drill_module_ii: 3, scanner: 2, bridge_kit: 2, preserved_food: 2,
};
export const RECIPES: Recipe[] = proposal.recipes.map(reference => ({
  id: reference.id as ItemId,
  name: ITEM_CATALOG[reference.output as ItemId].name,
  inputs: Object.entries(reference.inputs).map(([itemId, qty]) => ({ itemId: itemId as ItemId, qty: Number(qty) })),
  output: [{ itemId: reference.output as ItemId, qty: reference.quantity }],
  seconds: reference.seconds,
  building: reference.building as BuildingType,
  level: PILOT_RECIPE_LEVELS[reference.id as ItemId] ?? 1,
}));
export const RECIPE_CATALOG=Object.fromEntries(RECIPES.map(r=>[r.id,r])) as Partial<Record<ItemId,Recipe>>;
export const BUILDING_LABELS:Record<BuildingType,string>={workshop:'Taller',garden:'Huerto',kitchen:'Cocina',laboratory:'Laboratorio',barracks:'Barracón',warehouse:'Depósito',logistics:'Puesto logístico'};
export const BIOME_LABELS={forest:'Bosque',plains:'Llanura',desert:'Desierto',mountain:'Montaña',swamp:'Pantano'};
export const TERRAIN_LABELS={firm:'Firme',rocky:'Rocoso',sandy:'Arenoso',muddy:'Embarrado',slope:'Pendiente',water:'Agua'};
export const WEATHER_LABELS={clear:'Despejado',rain:'Lluvia',heat:'Calor',storm:'Tormenta'};

