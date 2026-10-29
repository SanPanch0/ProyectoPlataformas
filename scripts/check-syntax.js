// Comprueba la sintaxis de todos los archivos JavaScript:  npm run check
import { readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { spawnSync } from 'node:child_process';

const roots = ['api', 'lib', 'public/js', 'scripts', 'tests', 'server.js'];
const files = [];
function walk(p) {
  if (statSync(p).isDirectory()) readdirSync(p).forEach((f) => walk(join(p, f)));
  else if (extname(p) === '.js' || extname(p) === '.mjs') files.push(p);
}
roots.forEach(walk);

let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) {
    failed++;
    console.log(`✘ ${f}\n${r.stderr}`);
  }
}
console.log(failed ? `\n${failed} archivo(s) con errores.` : `✔ ${files.length} archivos sin errores de sintaxis.`);
process.exit(failed ? 1 : 0);
