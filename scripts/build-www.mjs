// Copies just the files the game needs into www/, the folder the Android app is packed from.
// Dev tools and build scripts stay out of the app.
import { cpSync, rmSync, mkdirSync } from 'node:fs';
const KEEP = ['index.html', 'style.css', 'icon.svg', 'manifest.webmanifest', 'src', 'vendor', 'assets'];
rmSync('www', { recursive: true, force: true }); mkdirSync('www');
for (const p of KEEP) cpSync(p, 'www/' + p, { recursive: true });
console.log('www/ ready');
