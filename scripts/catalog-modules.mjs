import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const excluded=new Set(['node_modules','.git','.wrangler','.next','.vinext','dist','work','outputs','.openai']);
async function collect(dir=''){
 const result=[];
 for(const item of await fs.readdir(path.join(root,dir),{withFileTypes:true})){
  if(excluded.has(item.name)||item.name==='next-env.d.ts')continue;
  const name=path.posix.join(dir,item.name);
  if(item.isSymbolicLink())throw Error(`Linked source: ${name}`);
  if(item.isDirectory())result.push(...await collect(name));else if(item.isFile()&&!/\.tsbuildinfo$/.test(name))result.push(name);
 }
 return result;
}
const groups={
 'app':'Rutas web, API autenticada, componentes de funciones, paneles y estilos.',
 'lib/auth':'Identidad firmada y control de acceso.',
 'lib/client':'Estado y utilidades del cliente, navegación y avisos.',
 'lib/audio':'Motor WebAudio y emisores.',
 'lib/graphics':'Escenas, terreno, ciudad, modelos, movimiento y colisiones.',
 'lib/mvp':'Reglas económicas, mundo persistente, producción y almacenamiento.',
 'components':'Primitivas de interfaz reutilizables.',
 'hooks':'Hooks compartidos.',
 'build':'Entrada Cloudflare Worker y adaptadores de compilación.',
 'db':'Esquema ORM y candidato experimental de persistencia por entidad.',
 'drizzle':'Migración activa y snapshots de esquema; no contiene datos de jugadores.',
 'public':'Activos gráficos, GLB, audio, fuentes y avisos.',
 'scripts':'Herramientas de desarrollo, preparación, empaquetado y verificación.',
 'tests':'Casos de regresión y contratos de dominio/persistencia/gráficos.',
 'docs':'Diseños, límites e informes históricos redactados.',
 'examples':'Ejemplo D1 independiente.',
 'vendor':'Recursos de terceros con sus avisos.',
 'root':'Configuración, dependencias, seguridad y documentación principal.'
};
const map=new Map(Object.keys(groups).map(key=>[key,[]]));
for(const file of (await collect()).sort()){
 const key=Object.keys(groups).find(k=>k!=='root'&&(file===k||file.startsWith(k+'/')))||'root';
 map.get(key).push(file);
}
let result='# Catálogo completo de módulos y archivos\n\nGenerado con `node scripts/catalog-modules.mjs`. Describe las carpetas reales de la alfa, no el árbol de producción propuesto. No enumera dependencias instaladas, builds ni estado privado.\n\n';
for(const [group,files] of map){
 if(!files.length)continue;
 result+=`## ${group} (${files.length} archivos)\n\n${groups[group]}\n\n`;
 for(const file of files){
  let api='';
  if(/\.[cm]?[jt]sx?$/.test(file)){
   const source=await fs.readFile(path.join(root,file),'utf8');
   const names=[...source.matchAll(/export\s+(?:async\s+)?(?:function|class|interface|type|const)\s+([A-Za-z_$][\w$]*)/g)].map(m=>m[1]);
   if(names.length)api=' — '+[...new Set(names)].slice(0,8).map(x=>'`'+x+'`').join(', ')+(names.length>8?'…':'');
  }
  result+=`- [${file}](../../${file})${api}\n`;
 }
 result+='\n';
}
await fs.mkdir(path.join(root,'docs/architecture'),{recursive:true});
await fs.writeFile(path.join(root,'docs/architecture/MODULES.md'),result);
console.log(JSON.stringify({files:[...map.values()].reduce((n,v)=>n+v.length,0),groups:[...map].map(([name,files])=>({name,count:files.length}))}));
