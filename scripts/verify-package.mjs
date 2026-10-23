import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { listPackage, statFile, extractFile } from "@electron/asar";
import filter from "./package-filter.cjs";
import { describeBuild } from "./build-info.mjs";
import { parseBuildInfo } from "../adapters/build-info.cjs";

function requireEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw Object.assign(new Error(message), { code: "TVLENS_PACKAGE_INVALID" });
}

function checkDependency(name, packages) {
  const matches = [
    ...name.matchAll(/(?:^|\/)node_modules\/(?:@[^/]+\/)?[^/]+/g),
  ];
  if (!matches.length) return;
  const last = matches.at(-1);
  const modulePath = name.slice(0, last.index + last[0].length);
  // Scoped directories are containers, not modules.
  if (/^node_modules\/@[^/]+$/.test(modulePath)) return;
  const dependency = packages[modulePath];
  if (!dependency || dependency.dev)
    throw Object.assign(
      new Error(`Dépendance hors production : ${modulePath}`),
      { code: "TVLENS_PACKAGE_INVALID" },
    );
}

async function checkManifest(archive, root, files) {
  const pkg = JSON.parse(extractFile(archive, "package.json"));
  const source = JSON.parse(
    await fs.readFile(path.join(root, "package.json"), "utf8"),
  );
  for (const key of ["name", "version", "main", "dependencies"])
    requireEqual(pkg[key], source[key], `Métadonnée différente : ${key}`);
  if (pkg.devDependencies || pkg.scripts)
    throw Object.assign(
      new Error("Métadonnées de développement présentes dans le paquet."),
      { code: "TVLENS_PACKAGE_INVALID" },
    );
  for (const name of Object.keys(source.dependencies ?? {})) {
    if (!files.includes(`node_modules/${name}/package.json`))
      throw Object.assign(new Error(`Dépendance absente : ${name}`), {
        code: "TVLENS_PACKAGE_INVALID",
      });
  }
}

async function checkUnpacked(archive, files) {
  const expected = files
    .filter((file) => statFile(archive, file).unpacked)
    .sort();
  const directory = archive + ".unpacked";
  const actual = [];
  let entries;
  try {
    entries = await fs.readdir(directory, {
      recursive: true,
      withFileTypes: true,
    });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    entries = [];
  }
  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    if (!entry.isFile())
      throw Object.assign(
        new Error("Lien ou fichier spécial parmi les fichiers décompressés."),
        { code: "TVLENS_PACKAGE_INVALID" },
      );
    actual.push(
      path
        .relative(directory, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join("/"),
    );
  }
  requireEqual(
    actual.sort(),
    expected,
    "Inventaire des fichiers décompressés différent de celui de l’archive.",
  );
}

export async function inspectArchive(archive, { root, expectedBuild }) {
  const entries = listPackage(archive);
  const files = [],
    ignore = filter.copyFilter(root);
  const lock = JSON.parse(
    await fs.readFile(path.join(root, "package-lock.json"), "utf8"),
  );
  for (const entry of entries) {
    if (
      !filter.keeps(entry) ||
      (entry !== "/build-info.json" && ignore(entry))
    ) {
      throw Object.assign(
        new Error(`Contenu interdit dans le paquet : ${entry}`),
        { code: "TVLENS_PACKAGE_INVALID" },
      );
    }
    const name = entry.slice(1),
      stat = statFile(archive, name, false);
    if (stat.link)
      throw Object.assign(new Error(`Lien interdit dans le paquet : ${name}`), {
        code: "TVLENS_PACKAGE_INVALID",
      });
    checkDependency(name, lock.packages);
    if (!stat.files) files.push(name);
  }
  for (const name of filter.sourceFiles(root)) {
    if (!files.includes(name))
      throw Object.assign(new Error(`Source absente du paquet : ${name}`), {
        code: "TVLENS_PACKAGE_INVALID",
      });
    if (name === "package.json") continue;
    const original = await fs.readFile(path.join(root, name));
    if (!extractFile(archive, name).equals(original))
      throw Object.assign(
        new Error(`Source différente dans le paquet : ${name}`),
        { code: "TVLENS_PACKAGE_INVALID" },
      );
  }
  await checkManifest(archive, root, files);
  await checkUnpacked(archive, files);
  const build = parseBuildInfo(
    JSON.parse(extractFile(archive, "build-info.json")),
  );
  requireEqual(
    build,
    expectedBuild,
    "Identité du paquet différente de la construction attendue.",
  );
  return {
    build,
    files: files.sort(),
    sourceFiles: filter.sourceFiles(root).length,
  };
}

export function probeNativeRuntime(appPath) {
  const archive = path.join(appPath, "Contents/Resources/app.asar");
  const program = `
    const path = require('node:path');
    const root = process.argv[1];
    const { readBuildInfo } = require(path.join(root, 'adapters/build-info.cjs'));
    const sharp = require(path.join(root, 'node_modules/sharp'));
    Promise.all([readBuildInfo(root),
      sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } }).resize(1, 1).png().toBuffer()
    ]).then(([build, image]) => {
      if (!build || image.length === 0) throw Error('Sonde native vide');
      console.log(JSON.stringify({ build, sharp: sharp.versions.sharp, electron: process.versions.electron }));
    }).catch(error => { console.error(error); process.exitCode = 1; });
  `;
  const result = spawnSync(
    path.join(appPath, "Contents/MacOS/TVLens"),
    ["-e", program, archive],
    {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      encoding: "utf8",
      timeout: 30000,
    },
  );
  if (result.status !== 0)
    throw Object.assign(
      new Error(
        `La sonde native du paquet a échoué : ${result.stderr || result.error?.message}`,
      ),
      { code: "TVLENS_PACKAGE_INVALID" },
    );
  return JSON.parse(result.stdout);
}

export function verifySignature(appPath, run = spawnSync) {
  const result = run("/usr/bin/codesign", ["--verify", "--deep", "--strict", appPath], {
    encoding: "utf8", timeout: 30000,
  });
  if (result.status !== 0) throw Object.assign(
    new Error(`Signature du paquet invalide : ${result.stderr || result.error?.message || "échec de codesign"}`),
    { code: "TVLENS_PACKAGE_SIGNATURE_INVALID" },
  );
  return { valid: true };
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      report: { type: "string" },
      "require-clean": { type: "boolean" },
    },
  });
  if (positionals.length !== 1)
    throw Object.assign(
      new Error(
        "Usage : node scripts/verify-package.mjs chemin/TVLens.app [--report fichier.json]",
      ),
      { code: "TVLENS_PACKAGE_INVALID" },
    );
  const root = process.cwd(),
    appPath = path.resolve(positionals[0]);
  const expectedBuild = await describeBuild({ root });
  if (values["require-clean"] && expectedBuild.dirty)
    throw Object.assign(new Error("Vérification CI refusée : dépôt modifié."), {
      code: "TVLENS_PACKAGE_INVALID",
    });
  const archive = path.join(appPath, "Contents/Resources/app.asar");
  const report = await inspectArchive(archive, { root, expectedBuild });
  report.signature = verifySignature(appPath);
  const native = probeNativeRuntime(appPath);
  requireEqual(
    native.build,
    expectedBuild,
    "La sonde native a chargé une autre identité.",
  );
  report.native = native;
  report.asarBytes = (await fs.stat(archive)).size;
  report.asarSha256 = createHash("sha256")
    .update(await fs.readFile(archive))
    .digest("hex");
  const json = JSON.stringify(report, null, 2) + "\n";
  if (values.report) await fs.writeFile(values.report, json);
  console.log(
    JSON.stringify(
      { ...report, files: `${report.files.length} fichiers vérifiés` },
      null,
      2,
    ),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
