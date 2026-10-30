import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url));
const read=f=>readFileSync(root+f,'utf8');
const jsFiles=readdirSync(root).filter(f=>f.endsWith('.js'));
const html=read('index.html');
const importMap=JSON.parse(html.match(/<script type="importmap">(.*?)<\/script>/s)[1]).imports;
const build=read('records.js').match(/export const BUILD='([^']+)'/)[1];
const staticImports=f=>[...read(f).matchAll(/from\s*'(\.\/[^']+)'/g)].map(m=>m[1]);

test('modules import shared code by bare path, so each module has exactly one instance',()=>{
  for(const f of jsFiles)for(const spec of staticImports(f))assert.ok(!spec.includes('?'),`${f} imports ${spec}: query strings create a second module instance`);
});

test('every imported module is versioned through the import map',()=>{
  const imported=new Set(jsFiles.flatMap(staticImports));
  for(const spec of imported)assert.equal(importMap[spec],`${spec}?v=${build}`,`${spec} missing from import map or wrong version`);
});

test('index.html, version.json and records.js BUILD carry the same build id',()=>{
  assert.equal(JSON.parse(read('version.json')).build,build);
  const versions=new Set([...html.matchAll(/\.\/[\w-]+\.(?:js|css)\?v=([\w-]+)/g)].map(m=>m[1]));
  assert.deepEqual([...versions],[build]);
});

test('entry scripts are not also imported as modules (no duplicate instances via two URLs)',()=>{
  const entries=[...html.matchAll(/<script type="module" src="(\.\/[\w-]+\.js)\?v=/g)].map(m=>m[1]);
  const imported=new Set(jsFiles.flatMap(staticImports));
  for(const e of entries)assert.ok(!imported.has(e),`${e} is both an entry script and an imported module`);
});

test('only records.js writes financial records or the portfolio cache',()=>{
  for(const f of jsFiles.filter(f=>!['records.js','supabase-data.js'].includes(f))){
    const src=read(f);
    assert.ok(!/localStorage\.setItem\(\s*STORAGE_KEY/.test(src),`${f} writes the portfolio cache directly`);
    assert.ok(!/applyEventChanges|saveRemoteEvents|syncRemoteCollections|flushRemoteSync/.test(src),`${f} bypasses commitChange()`);
  }
});

test('every form that changes transactions, ledger entries or strategy settlements goes through commitChange()',()=>{
  for(const f of ['asset-flow.js','ledger-ui.js','legacy-swap.js','strategy-settlement-ui.js','display.js'])
    assert.match(read(f),/commitChange\(/,`${f} must persist financial changes with commitChange()`);
});
