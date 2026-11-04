// Builds the React Native (react-native-web) app into ONE self-contained
// docs/index.html — JavaScript and favicon inlined — so it can be hosted on
// GitHub Pages (Settings → Pages → Deploy from branch → main /docs) or opened
// directly from disk. No paths to resolve, no `_expo/` folder for Jekyll to drop.
//
// Usage: npm run build:html

import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');
const outDir = join(root, 'docs');
const outFile = join(outDir, 'index.html');

// 1. Standard Expo web export (index.html + _expo/static/js/... + favicon).
rmSync(distDir, { recursive: true, force: true });
execSync('npx expo export --platform web --output-dir dist --clear', { cwd: root, stdio: 'inherit' });

let html = readFileSync(join(distDir, 'index.html'), 'utf8');

// 2. Inline every bundled script. Inline scripts ignore `defer`, so they are
//    moved to the end of <body>, after #root exists.
const scriptTag = /<script src="([^"]+\.js)"[^>]*><\/script>/g;
const scripts = [];
html = html.replace(scriptTag, (_match, src) => {
  const code = readFileSync(join(distDir, src.replace(/^\//, '')), 'utf8')
    // Keep the HTML parser from ending or confusing the <script> element early.
    .replace(/<\/script/gi, '<\\/script')
    .replace(/<!--/g, '<\\!--');
  scripts.push(code);
  return '';
});
if (scripts.length === 0) throw new Error('No bundled <script src="..."> found in dist/index.html');

const inlined = scripts.map((code) => `<script>\n${code}\n</script>`).join('\n');
// Function replacer so `$` sequences in the bundle are not treated as patterns.
html = html.replace('</body>', () => `${inlined}\n</body>`);

// 3. Inline the favicon as a data URI.
html = html.replace(/<link rel="icon" href="([^"]+)"\s*\/?>/, (_match, href) => {
  const icon = readFileSync(join(distDir, href.replace(/^\//, ''))).toString('base64');
  return `<link rel="icon" href="data:image/x-icon;base64,${icon}" />`;
});

// 4. Match the page background to the default theme so there's no white flash before JS runs.
html = html.replace('</style>', '  body { background-color: #eef4f6; }\n    </style>');

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, html);
writeFileSync(join(outDir, '.nojekyll'), '');

const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`\n✔ Wrote ${outFile} (${kb} KB, ${scripts.length} script(s) inlined)`);
