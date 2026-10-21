// Public source package only. Compiled runtime, credentials and saves are excluded.
import {readdirSync,copyFileSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,relative,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..');
const destination=resolve(root,'outputs',`source-${Date.now()}`,'qfrontier');
const directories=['app','lib','components','hooks','public','db','drizzle','tests','vendor','docs','scripts','build','examples'];
const files=['package.json','package-lock.json','vite.config.ts','wrangler.example.jsonc','cloudflare-env.d.ts','framework-env.d.ts','tsconfig.json','next.config.ts','postcss.config.mjs','eslint.config.mjs','components.json','drizzle.config.ts','README.md','DEPLOY-CLOUDFLARE.md','SECURITY.md','THIRD_PARTY_NOTICES.md','.gitignore','.npmrc'];
function collect(dir){for(const entry of readdirSync(resolve(root,dir),{withFileTypes:true})){const file=join(dir,entry.name);if(entry.isSymbolicLink())throw Error('Source packages never follow links');if(entry.isDirectory())collect(file);else if(entry.isFile())files.push(file);}}
directories.forEach(collect);
const manifest=[];
for(const file of files.sort()){
 const target=resolve(destination,file),r=relative(destination,target);if(!r||r.startsWith('..'))throw Error('Invalid package path');
 mkdirSync(dirname(target),{recursive:true});copyFileSync(resolve(root,file),target);
 const bytes=readFileSync(target);manifest.push({path:file.replaceAll('\\','/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
// A personalised wrangler.jsonc is never copied into an export.
copyFileSync(resolve(root,'wrangler.example.jsonc'),resolve(destination,'wrangler.jsonc'));
writeFileSync(resolve(destination,'EXPORT-MANIFEST.json'),JSON.stringify({format:1,kind:'public-source',privateStateIncluded:false,files:manifest},null,2)+'\n');
console.log(JSON.stringify({directory:destination,files:manifest.length+1,bytes:manifest.reduce((n,f)=>n+f.bytes,0)}));
