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

// Regex lookbehind is a *syntax* error in Safari/iOS before 16.4: the whole
// bundle fails to parse and the page stays blank. Refuse to ship it.
const lookbehind = scripts.join('\n').match(/.{0,60}\(\?<[=!].{0,30}/);
if (lookbehind) {
  throw new Error(
    `Bundle contains regex lookbehind, which breaks older Safari/iOS:\n  ${lookbehind[0]}\n` +
      'Find the package that introduced it and patch it (see patches/).',
  );
}

// If the app fails to start (e.g. an unsupported browser), show the reason on
// the page instead of a blank screen.
const startupGuard = `<script>
  (function () {
    function show(msg) {
      var root = document.getElementById('root');
      if (!root || root.children.length) return;
      root.innerHTML =
        '<div style="margin:auto;max-width:440px;padding:24px;font-family:Trebuchet MS,sans-serif;color:#2e3537;text-align:center">' +
        '<h2 style="font-weight:600">Starstell couldn\\'t start in this browser</h2>' +
        '<p>Try the latest Chrome, Firefox, Edge, or Safari.</p>' +
        '<pre style="white-space:pre-wrap;font-size:12px;opacity:.7"></pre></div>';
      root.querySelector('pre').textContent = String(msg);
    }
    window.addEventListener('error', function (e) { show(e.message || e.error); });
    window.addEventListener('unhandledrejection', function (e) { show(e.reason); });
    window.addEventListener('load', function () {
      setTimeout(function () { show('The app did not render.'); }, 4000);
    });
  })();
</script>`;

const inlined =
  startupGuard + '\n' + scripts.map((code) => `<script>\n${code}\n</script>`).join('\n');
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
