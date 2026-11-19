import * as esbuild from 'esbuild';
import fs from 'fs';
const r = await esbuild.build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', write: false, target: 'es2020', legalComments: 'none' });
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = fs.readFileSync('template.html', 'utf8').replace('/*__BUNDLE__*/', () => js);
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/planta-automotriz-vr.html', html);
fs.writeFileSync('index.html', html); // GitHub Pages
console.log('OK', (html.length / 1024).toFixed(0) + ' KB');
