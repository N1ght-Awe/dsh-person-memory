import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestFile = path.join(root, 'RELEASE-MANIFEST.json');
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const failures = [];
function walk(dir, rel='') {
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(item=>{
    const name=rel?rel+'/'+item.name:item.name;
    if(name==='.git')return [];
    const full=path.join(dir,item.name);
    if(item.isSymbolicLink()){failures.push({file:name,rule:'symbolic-link'});return [];}
    return item.isDirectory()?walk(full,name):[name];
  });
}
const files=walk(root).sort();
const listed=Object.keys(manifest.files).sort();
if(JSON.stringify(files.filter(f=>f!=='RELEASE-MANIFEST.json'))!==JSON.stringify(listed))
  failures.push({rule:'manifest-file-set'});
const patterns=[
  ['credential-material',/(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----)/],
  ['personal-home-path',/[A-Z]:[\\/]+Users[\\/]+[^<\s]+/i],
  ['live-identifier',/\b\d{9,12}\b/],
  ['private-ip',/\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/],
];
for(const file of files) {
 const text=fs.readFileSync(path.join(root,file),'utf8');
 if(file!=='RELEASE-MANIFEST.json') {
  const hash=crypto.createHash('sha256').update(text).digest('hex');
  if(manifest.files[file]!==hash)failures.push({file,rule:'hash-mismatch'});
 }
 for(const [rule,pattern] of patterns)if(pattern.test(text))failures.push({file,rule});
 if(/(?:^|\/)(?:node_modules|backups|state|session-memory)\//.test(file)||/\.(?:log|key|pem|zip)$|\.private\.|\.local\./.test(file))
   failures.push({file,rule:'runtime-or-private-file'});
}
console.log(JSON.stringify({files:files.length,passed:failures.length===0,failures},null,2));
if(failures.length)process.exitCode=1;

