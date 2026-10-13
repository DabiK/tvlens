// Mesures de qualité sans dépendance : elles alimentent le cliquet (scripts/quality/ratchet.mjs).
// Chaque mesure est un simple comptage reproductible ; aucune ne juge le code.
import fs from "node:fs";
import path from "node:path";

export const PROD_DIRS = ["core", "adapters", "runtime", "server", "mcp", "app", "tv/app"];
export const TEST_DIR = "tests";
export const LONG_LINE = 160;
const CODE = /\.(cjs|mjs|js)$/;
const EMPTY_CATCH = /catch\s*(\([^)]*\))?\s*\{\s*\}/g;
// Un fichier de test porte le nom d'un comportement, pas celui d'un chantier ou d'une revue.
// Visés : « architecture-f07 », « t012-… », « issue-9 », « review-regressions », « refactor-boundaries ».
export const TICKET_NAMED_TEST = /(^|[-_.])(f\d{2}|t\d{3}|(ticket|issue)-?\d+|review|refactor)([-_.]|$)/i;
// Fichiers autorisés à lire process.env : la configuration et les deux points d'entrée des hôtes.
const ENV_READERS = new Set(["adapters/config.cjs", "app/main.cjs", "server/main.cjs"]);

function walk(root, dir, out = []) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) walk(root, rel, out);
    else if (CODE.test(entry.name)) out.push(rel);
  }
  return out;
}

export function longLines(text) {
  let count = 0;
  for (const line of text.split("\n")) if (line.length > LONG_LINE) count++;
  return count;
}

export function emptyCatches(text) {
  return (text.match(EMPTY_CATCH) || []).length;
}

/** Mesures d'un seul fichier, utilisées par le contrôle rapide après chaque édition. */
export function measureText(text) {
  return { lignes_longues: longLines(text), catch_vides: emptyCatches(text) };
}

/**
 * Sens de chaque mesure : "max" ne peut que baisser, "min" ne peut que monter.
 */
export const DIRECTIONS = {
  lignes_longues_prod: "max",
  lignes_longues_tests: "max",
  catch_vides_prod: "max",
  tests_nommes_par_chantier: "max",
  process_env_hors_config: "max",
  inner_html: "max",
  cas_de_test: "min",
};

export function measure(root) {
  const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
  const prod = PROD_DIRS.flatMap((dir) => walk(root, dir)).sort();
  const tests = walk(root, TEST_DIR).sort();
  const m = Object.fromEntries(Object.keys(DIRECTIONS).map((key) => [key, 0]));
  for (const rel of prod) {
    const text = read(rel);
    m.lignes_longues_prod += longLines(text);
    m.catch_vides_prod += emptyCatches(text);
    m.inner_html += (text.match(/\.innerHTML\b/g) || []).length;
    if (!ENV_READERS.has(rel) && /\bprocess\.env\b/.test(text)) m.process_env_hors_config++;
  }
  for (const rel of tests) {
    const text = read(rel);
    m.lignes_longues_tests += longLines(text);
    if (!/\.test\.(cjs|mjs|js)$/.test(rel)) continue;
    if (TICKET_NAMED_TEST.test(path.basename(rel))) m.tests_nommes_par_chantier++;
    m.cas_de_test += (text.match(/^\s*test\(/gm) || []).length;
  }
  return m;
}
