import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outlinePath = path.join(root, 'data', 'mousetrap_context_outline.json');
const patchesDir = path.join(root, 'data', 'context-outline-patches');

const outline = JSON.parse(fs.readFileSync(outlinePath, 'utf8'));
const patchFiles = fs.readdirSync(patchesDir).filter(name => name.endsWith('.json')).sort();

for (const file of patchFiles) {
  const patch = JSON.parse(fs.readFileSync(path.join(patchesDir, file), 'utf8'));
  if (!patch.blockId || !patch.outline || !patch.plan) throw new Error(`Invalid outline patch: ${file}`);
  const plan = outline.blockPlan.find(item => item.blockId === patch.blockId);
  if (!plan) throw new Error(`Unknown blockId in patch: ${patch.blockId}`);
  Object.assign(plan, patch.plan);
  outline.outlines[patch.blockId] = patch.outline;
}

fs.writeFileSync(outlinePath, JSON.stringify(outline, null, 2) + '\n');
console.log(JSON.stringify({ merged: patchFiles, outlines: Object.keys(outline.outlines) }, null, 2));
