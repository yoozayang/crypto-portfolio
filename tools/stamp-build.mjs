// Stamps one build id into records.js (BUILD), version.json and every local ?v= URL in index.html.
// Run after changing any JS/CSS file, before committing:  node tools/stamp-build.mjs
// GitHub Pages ignores query strings and caches for 10 minutes, so the ?v= value only busts browser caches;
// the running page compares its BUILD with version.json before every cloud write and refuses stale code.
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const pad=n=>String(n).padStart(2,'0');
const d=new Date();
const build=process.argv[2]||`${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
const edit=(file,fn)=>{const p=root+file,before=readFileSync(p,'utf8'),after=fn(before);if(after===before&&!before.includes(build))throw new Error(`${file}: nothing stamped`);writeFileSync(p,after);};
edit('records.js',s=>s.replace(/export const BUILD='[^']*';/,`export const BUILD='${build}';`));
edit('index.html',s=>s.replace(/(\.\/[\w-]+\.(?:js|css))\?v=[\w-]+/g,`$1?v=${build}`));
writeFileSync(root+'version.json',JSON.stringify({build},null,2)+'\n');
console.log(`build ${build}`);
