import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const parts = [1,2,3,4].map(n => `scripts/.tmp-vocab-range-0583-0873.payload.${n}`);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const payload = parts.map(p => fs.readFileSync(p, 'utf8').trim()).join('');
const expectedPayload = '1ba4045aec3aa7c77ceca4bb7e16923d5e062d7d784a7ba3526a3e219ab296b6';
if (sha(payload) !== expectedPayload) throw new Error(`payload SHA mismatch: ${sha(payload)}`);
const source = zlib.gunzipSync(Buffer.from(payload, 'base64'));
const expectedSource = 'fae8d924631e744af5ceeeca4772e7cfcf4e6afd7b8c6e92efa7a4c9f5e93a40';
if (sha(source) !== expectedSource) throw new Error(`source SHA mismatch: ${sha(source)}`);
const temp = 'scripts/.tmp-vocab-range-0583-0873.inner.mjs';
fs.writeFileSync(temp, source);
try {
  await import(pathToFileURL(`${process.cwd()}/${temp}`).href + `?run=${Date.now()}`);
} finally {
  fs.rmSync(temp, { force: true });
}
