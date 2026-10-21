import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const files=execFileSync('git',['ls-files','--cached','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
if(!files.length)throw Error('Stage the intended public files before auditing');
const blocked=[/^(?:work|outputs|node_modules|dist|\.wrangler|\.next|\.git|\.openai)\//,/\.(?:sqlite(?:-\w+)?|db|pem|key|pfx|p12|zip|mp4|log)$/i,/(?:^|\/)(?:\.env|\.dev\.vars)(?:\.|$)/];
const secrets=[/\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{20,}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\bsk-proj-[A-Za-z0-9_-]{20,}/,/[A-Za-z0-9._%+-]+@(?:gmail|hotmail|yahoo|outlook)\.com/i,/C:[\\/]+Users[\\/]+Usuario/i,/D:[\\/]+QryptaHackathon/i];
const problems=[],manifest=[];
for(const name of files){
 if(blocked.some(r=>r.test(name)))problems.push({path:name,reason:'private/generated file'});
 const bytes=await fs.readFile(path.join(root,name));
 if(/\.(?:[cm]?[jt]sx?|jsonc?|md|txt|css|svg|sh|ps1|sql)$/.test(name)){
  const text=bytes.toString('utf8');
  if(secrets.some(r=>r.test(text)))problems.push({path:name,reason:'credential or personal data pattern'});
 }
 manifest.push({path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
if(problems.length){console.log(JSON.stringify({passed:false,problems},null,2));process.exitCode=1;}
else console.log(JSON.stringify({passed:true,files:files.length,bytes:manifest.reduce((n,f)=>n+f.bytes,0),assets:manifest.filter(f=>f.path.startsWith('public/')).length,largestBytes:Math.max(...manifest.map(f=>f.bytes))}));
await fs.mkdir(path.join(root,'work'),{recursive:true});
await fs.writeFile(path.join(root,'work/publication-audit.json'),JSON.stringify({passed:!problems.length,problems,files:manifest},null,2));
