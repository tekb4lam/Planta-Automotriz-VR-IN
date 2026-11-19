import sharp from 'sharp';
const S = '/home/claude/assets/ph/tex/', O = '/home/claude/assets/final/textures/';
const jobs = [
  ['hangar_concrete_floor', 'floor', 1024, null],
  ['box_profile_metal_sheet', 'wall', 1024, 'gray'],
  ['corrugated_iron_02', 'roof', 512, null],
  ['blue_metal_plate', 'press', 1024, null],
  ['metal_plate', 'plate', 512, 'gray'],
  ['painted_metal_shutter', 'panel', 512, null],
];
for (const [src, name, size, mode] of jobs) {
  let d = sharp(S + src + '/Diffuse.jpg').resize(size, size);
  if (mode === 'gray') d = d.grayscale().linear(1.25, 15);
  await d.webp({ quality: 82 }).toFile(O + name + '_col.webp');
  await sharp(S + src + '/nor_gl.jpg').resize(Math.min(size, 512), Math.min(size, 512)).webp({ quality: 85 }).toFile(O + name + '_nor.webp');
  await sharp(S + src + '/arm.jpg').resize(256, 256).webp({ quality: 85 }).toFile(O + name + '_arm.webp');
  console.log(name);
}
