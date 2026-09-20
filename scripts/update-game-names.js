// Regenerates ui/game-names.json from Discord's public (undocumented but widely
// used by third-party rich-presence tools) "detectable applications" list — the
// same data Discord's own client uses to turn a running .exe into a pretty game
// name. Not run automatically; re-run by hand occasionally to pick up new games:
//
//   node scripts/update-game-names.js
//
// Only keeps Windows executables (patycord's detection is Windows-only), strips
// launcher entries (generic, not a specific game), and drops a handful of
// generic interpreter/runtime executables (java, python, wine, ...) that would
// otherwise misidentify anyone running some unrelated Java/Python/etc. app as
// playing whatever game happens to be first in Discord's list for that name —
// Discord's own client disambiguates these by full path, which patycord's
// simpler exe-name-only detector can't do.
const fs = require('fs');
const path = require('path');

const SOURCE_URL = 'https://discord.com/api/v9/applications/detectable';
const OUT_PATH = path.join(__dirname, '..', 'ui', 'game-names.json');

const AMBIGUOUS_HOST_PROCESSES = new Set([
  'java', 'javaw', 'python', 'python3', 'pythonw', 'wine', 'wine64',
  'node', 'electron', 'mono', 'dotnet', 'ruby', 'perl',
]);

async function main() {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
  const apps = await res.json();

  const map = {};
  for (const app of apps) {
    if (!app.name || !Array.isArray(app.executables)) continue;
    for (const exe of app.executables) {
      if (exe.os !== 'win32' || exe.is_launcher || !exe.name) continue;
      let stem = exe.name.toLowerCase().replace(/\\/g, '/').split('/').pop().replace(/^>/, '');
      if (stem.endsWith('.exe')) stem = stem.slice(0, -4);
      if (!stem || AMBIGUOUS_HOST_PROCESSES.has(stem)) continue;
      if (!map[stem]) map[stem] = app.name; // first entry wins on collision
    }
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(map));
  console.log(`Wrote ${Object.keys(map).length} entries to ${path.relative(process.cwd(), OUT_PATH)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
