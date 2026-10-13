// Builds the ambient TV application as its own package, next to the panel application and never in its
// place. It only writes an .ipk file: nothing is installed, launched or copied to the TV.
//
//   node scripts/package-tv-ambient.mjs                         production package, org.tvlens.ambient
//   node scripts/package-tv-ambient.mjs --probe                 probe package, org.tvlens.ambientprobe
//   node scripts/package-tv-ambient.mjs --probe --id org.tvlens.ambientprobe.floating --window-type floating
//   options: --window-type overlay|floating|system_ui   --output-dir <dir>   --stage-only <dir>
//
// The probe package is the only one that understands the debugging parameters of the native validation
// protocol (paint without a grant, stay open on keys, magenta marker, deliberate freeze). Its page lives
// in this script on purpose: the production sources in tv/app carry no such path.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PRODUCTION_ID = 'org.tvlens.ambient';
export const PROBE_ID = 'org.tvlens.ambientprobe';
export const WINDOW_TYPES = ['overlay', 'floating', 'system_ui'];
const PROBE_PATTERN = /^org\.tvlens\.ambientprobe(\.[a-z0-9]{1,24})?$/;
const SHARED = ['ambient.css', 'surveillance-overlay.js', 'icon.png'];

export const PROBE_HTML = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>TVLens — Sonde alertes</title>
    <link rel="stylesheet" href="ambient.css" />
    <style>
      .probe-marker { position: absolute; left: 0; top: 0; width: 48px; height: 48px; background: #ff00ff; }
      .probe-keys { position: absolute; right: 0; top: 0; padding: 4px 12px; background: #000000cc; color: #ffffff; font-size: 22px; }
    </style>
  </head>
  <body>
    <div id="ambient" role="status" hidden></div>
    <script src="surveillance-overlay.js"></script>
    <script src="ambient-probe.js"></script>
  </body>
</html>
`;

// Classic script for the TV engine, same floor as tv/app. It draws with the production renderer and adds,
// here only, what the protocol needs to observe the compositor: probe.handshake:false paints without a
// grant, probe.closeOnKey:false counts the keys instead of closing (Back always closes), probe.marker draws
// a magenta square inside the box, probe.freeze blocks the page on purpose, probe.noFocus asks for a window
// without focus. Its life is bounded at 25 s whatever it is asked. It READS its launch parameters exactly as
// the production page does (launchParams at load, else webOSLaunch or webOSRelaunch, waited for 1.5 s): a
// probe that gave up sooner would conclude that nothing can be displayed on a TV that only delivers them
// with the event.
export const PROBE_JS = `// Probe page of the native validation protocol. Never part of the production package.
(function (root) {
  "use strict";
  var overlay = root.TVLensOverlay,
    doc = root.document,
    node = doc.getElementById("ambient"),
    HARD_LIFE_MS = 25000,
    GRANT_MS = 1500,
    KEY_REPORT_MS = 150,
    params = null,
    probe = {},
    keys = 0,
    counter = null,
    run = 0,
    closing = false,
    pending = null,
    life = null;

  function flag(name, fallback) {
    return typeof probe[name] === "boolean" ? probe[name] : fallback;
  }
  function shut() {
    if (closing) return;
    closing = true;
    run++;
    overlay.renderCard(node, null);
    root.close();
  }
  function route(name) {
    return params.control + "/ambient/" + name + "/" + params.nonce;
  }
  // Same reading as tv/app/ambient.js, word for word: what counts as "no parameters", and where they are looked for.
  function empty(raw) {
    if (raw === undefined || raw === null) return true;
    if (typeof raw === "string") return !raw.trim() || raw.trim() === "{}";
    return typeof raw === "object" && !Array.isArray(raw) && !Object.keys(raw).length;
  }
  function given() {
    var system = root.PalmSystem || root.webOSSystem;
    return !empty(root.launchParams) ? root.launchParams : system ? system.launchParams : undefined;
  }
  function decode(value) {
    if (typeof value === "string") {
      try {
        value = JSON.parse(value);
      } catch (_) {
        value = null;
      }
    }
    return value && typeof value === "object" ? value : null;
  }
  function decorate() {
    var marker;
    if (flag("marker", false)) {
      marker = doc.createElement("div");
      marker.className = "probe-marker";
      node.appendChild(marker);
    }
    if (!flag("closeOnKey", true)) {
      counter = doc.createElement("div");
      counter.className = "probe-keys";
      counter.textContent = "Touches reçues : " + keys;
      node.appendChild(counter);
    }
  }
  function wait(mine) {
    root
      .fetch(route("wait"))
      .then(function (response) {
        return response.status === 200 ? response.json() : null;
      })
      .then(
        function (body) {
          if (mine !== run) return;
          if (!body || body.close !== false) return shut();
          root.setTimeout(function () {
            if (mine === run) wait(mine);
          }, 250);
        },
        function () {
          if (mine === run) shut();
        },
      );
  }
  function paint(mine, granted) {
    if (params.element === "pill") overlay.renderActivity(node, overlay.describePill(params.activity));
    else overlay.renderCard(node, overlay.describeCard(params.card, { hint: "Sonde" }));
    if (node.hidden) return shut();
    decorate();
    if (granted) wait(mine);
    // B7 of the protocol: a page that no longer runs anything, to learn whether the system can still close it.
    if (flag("freeze", false))
      root.setTimeout(function () {
        for (;;) {}
      }, 500);
  }
  function start(value) {
    var mine,
      input,
      copy = {},
      abort,
      key,
      system = root.PalmSystem || root.webOSSystem;
    if (closing) return;
    root.clearTimeout(pending);
    if (empty(value)) value = given();
    input = decode(value);
    // webOSLaunch repeats what was already read at load: one start per nonce, as in production.
    if (input && params && input.nonce === params.nonce) return;
    if (!input) return shut();
    mine = ++run;
    probe = input.probe && typeof input.probe === "object" ? input.probe : {};
    for (key in input) if (Object.prototype.hasOwnProperty.call(input, key)) copy[key] = input[key];
    // Without a handshake no controller is called: the address is only a placeholder for the shared parser.
    if (!flag("handshake", true) && typeof copy.control !== "string") copy.control = "http://127.0.0.1:8788";
    params = overlay.parseAmbientParams(copy);
    if (!params) return shut();
    overlay.renderCard(node, null);
    counter = null;
    node.style.left = params.box.x + "px";
    node.style.top = params.box.y + "px";
    node.style.width = params.box.width + "px";
    node.style.height = params.box.height + "px";
    try {
      if (system && typeof system.setInputRegion === "function") system.setInputRegion([]);
    } catch (_) {}
    try {
      if (flag("noFocus", params.profile === "passthrough") && system && system.window && typeof system.window.setFocus === "function") system.window.setFocus(false);
    } catch (_) {}
    root.clearTimeout(life);
    life = root.setTimeout(shut, Math.min(HARD_LIFE_MS, typeof probe.lifeMs === "number" && probe.lifeMs > 0 ? probe.lifeMs : params.displayMs + 1500));
    if (!flag("handshake", true)) return paint(mine, false);
    abort = new AbortController();
    root.setTimeout(function () {
      abort.abort();
      if (mine === run && node.hidden) shut();
    }, GRANT_MS);
    root.fetch(route("ack"), { method: "POST", signal: abort.signal }).then(
      function (response) {
        if (mine !== run) return;
        if (response.status !== 200) return shut();
        paint(mine, true);
      },
      function () {
        if (mine === run) shut();
      },
    );
  }
  doc.addEventListener(
    "keydown",
    function (event) {
      var left = false;
      function leave() {
        if (left) return;
        left = true;
        shut();
      }
      if (closing) return;
      keys++;
      if (counter) counter.textContent = "Touches reçues : " + keys;
      // Back (461) always closes: the probe never traps the remote.
      if (event.keyCode === 461 || event.key === "Escape") return shut();
      if (!flag("closeOnKey", true)) return;
      run++;
      overlay.renderCard(node, null);
      if (!params || !flag("handshake", true)) return shut();
      root.setTimeout(leave, KEY_REPORT_MS);
      root.fetch(route("key"), { method: "POST", keepalive: true }).then(leave, leave);
    },
    true,
  );
  doc.addEventListener("visibilitychange", function () {
    if (doc.hidden) shut();
  });
  doc.addEventListener("webOSLaunch", function (event) {
    start(event && event.detail);
  }, true);
  doc.addEventListener("webOSRelaunch", function (event) {
    start(event && event.detail);
  }, true);
  life = root.setTimeout(shut, HARD_LIFE_MS);
  // Without parameters at load the probe waits for the launch event as long as production does, nothing painted.
  if (empty(given())) pending = root.setTimeout(shut, GRANT_MS);
  else start(given());
})(window);
`;

// Flat application folder for the unchanged packager. `dir` must be new or empty: a stray file (a pairing
// secret, a leftover of another build) must never end up in a package.
export function assemble({ dir, probe = false, id, windowType = 'overlay', appDir = path.join(root, 'tv', 'app') } = {}) {
  if (!dir) throw Error('Dossier d’assemblage requis.');
  if (!WINDOW_TYPES.includes(windowType)) throw Error(`Type de fenêtre inconnu : ${windowType}. Valeurs admises : ${WINDOW_TYPES.join(', ')}.`);
  const ident = id ?? (probe ? PROBE_ID : PRODUCTION_ID);
  if (probe && !PROBE_PATTERN.test(ident)) throw Error(`Un paquet de sonde garde un identifiant de sonde (${PROBE_ID} ou ${PROBE_ID}.<variante>) : il ne prend jamais la place de ${PRODUCTION_ID} ni du panneau.`);
  if (!probe && /probe/i.test(ident)) throw Error('Identifiant de sonde refusé sans --probe.');
  if (!probe && ident !== PRODUCTION_ID) throw Error(`Identifiant inconnu : le paquet de production s’appelle ${PRODUCTION_ID}.`);
  fs.mkdirSync(dir, { recursive: true });
  if (fs.readdirSync(dir).length) throw Error(`Dossier d’assemblage non vide : ${dir}`);
  const files = probe ? [...SHARED] : ['ambient.html', 'ambient.js', ...SHARED];
  for (const name of files) fs.copyFileSync(path.join(appDir, name), path.join(dir, name));
  const info = JSON.parse(fs.readFileSync(path.join(appDir, 'appinfo.ambient.json'), 'utf8'));
  Object.assign(info, { id: ident, defaultWindowType: windowType }, probe ? { main: 'ambient-probe.html', title: 'TVLens — Sonde alertes' } : {});
  fs.writeFileSync(path.join(dir, 'appinfo.json'), JSON.stringify(info, null, 2) + '\n');
  if (probe) {
    fs.writeFileSync(path.join(dir, 'ambient-probe.html'), PROBE_HTML);
    fs.writeFileSync(path.join(dir, 'ambient-probe.js'), PROBE_JS);
  }
  return { dir, id: ident, version: info.version, probe, windowType, files: fs.readdirSync(dir).sort() };
}

function options(argv) {
  const out = { probe: false };
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i], value = () => { if (argv[i + 1] === undefined) throw Error(`Valeur attendue après ${name}.`); return argv[++i]; };
    if (name === '--probe') out.probe = true;
    else if (name === '--id') out.id = value();
    else if (name === '--window-type') out.windowType = value();
    else if (name === '--output-dir') out.outputDir = path.resolve(value());
    else if (name === '--stage-only') out.stageOnly = path.resolve(value());
    else throw Error(`Option inconnue : ${name}`);
  }
  return out;
}

function main() {
  const args = options(process.argv.slice(2));
  if (args.stageOnly) {
    const staged = assemble({ dir: args.stageOnly, probe: args.probe, id: args.id, windowType: args.windowType });
    console.log(`Dossier assemblé (aucun paquet construit) : ${staged.dir}\n${staged.id} · ${staged.windowType} · ${staged.files.join(', ')}`);
    return;
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tvlens-ambient-pkg-'));
  try {
    const staged = assemble({ dir: path.join(work, 'app'), probe: args.probe, id: args.id, windowType: args.windowType });
    const output = args.outputDir || path.join(root, 'dist', 'tv-ambient');
    // The existing packager is called as it is: it reads the identifier from appinfo.json and takes the first level of the folder.
    const built = spawnSync(process.env.TVLENS_PYTHON || 'python3', [path.join(root, 'prototypes', 'lg-sidebar', 'package.py'), '--app-dir', staged.dir, '--output-dir', output], { encoding: 'utf8' });
    if (built.error || built.status !== 0) throw Error(`Empaquetage échoué : ${built.error ? built.error.message : built.stderr.trim()}`);
    console.log(`${built.stdout.trim()}\n${staged.id} ${staged.version} · fenêtre ${staged.windowType} · ${staged.files.join(', ')}\nPaquet construit seulement : rien n’est installé ni lancé sur la TV.`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
