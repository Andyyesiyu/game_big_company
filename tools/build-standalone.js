#!/usr/bin/env node
// Inlines js/*.js into index.html so the whole game is one file you can send to someone.
// Usage: node tools/build-standalone.js [out.html]   (default: dist/layoff-games.html)
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(root, 'dist', 'layoff-games.html'));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(
  /<script src="([^"]+)"><\/script>/g,
  (_, src) => `<script>\n${fs.readFileSync(path.join(root, src), 'utf8').replace(/<\/script/g, '<\\/script')}</script>`,
);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`${out} (${(html.length / 1024).toFixed(0)} KB)`);
