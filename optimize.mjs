import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune, dedup, resample, textureCompress, meshopt as meshoptFn, flatten, join, quantize } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': (await import('meshoptimizer')).MeshoptDecoder });
const [,, src, out, ratio = '1', opts = '{}'] = process.argv;
const o = JSON.parse(opts);
const doc = await io.read(src);
const root = doc.getRoot();
if (o.removeNodes) { const re = new RegExp(o.removeNodes); for (const n of root.listNodes()) if (re.test(n.getName())) n.dispose(); }
if (o.stripTextures) { for (const t of root.listTextures()) t.dispose(); }
let tris = () => root.listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((a, p) => a + (p.getIndices() ? p.getIndices().getCount() / 3 : 0), 0), 0);
const before = tris();
const steps = [dedup(), prune({ keepLeaves: !!o.keepLeaves })];
if (+ratio < 1) steps.push(weld({ tolerance: 0.0001 }), simplify({ simplifier: MeshoptSimplifier, ratio: +ratio, error: o.error ?? 0.004, lockBorder: false }));
steps.push(prune({ keepLeaves: !!o.keepLeaves }));
if (root.listTextures().length) steps.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [o.tex ?? 512, o.tex ?? 512], quality: 80 }));
if (o.anim) steps.push(resample());
steps.push(meshoptFn({ encoder: MeshoptEncoder, level: 'medium' }));
await doc.transform(...steps);
await io.write(out, doc);
console.log(out, 'tris', before, '->', tris(), (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
