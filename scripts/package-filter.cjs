const fs = require("node:fs");
const path = require("node:path");

const SOURCE_ROOTS = ["app", "core", "adapters", "runtime"];
const ASSETS = ["app/index.html", "app/style.css", "app/ui/shell.css"];
const CODE = /\.(?:js|cjs|mjs)$/;
const PRIVATE_NAMES = new Set([
  "connection.js",
  "auth.json",
  "auth.txt",
  "device-token",
  "env.local",
  "sessions",
  "saved-moments",
  "node_gyp_bins",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
]);

function keeps(name) {
  if (name === "") return true;
  if (!name.startsWith("/") || name.includes("\\")) return false;
  const parts = name.slice(1).split("/");
  if (
    parts.some(
      (part) => !part || part.startsWith(".") || PRIVATE_NAMES.has(part),
    )
  )
    return false;
  if (/\.(?:o|obj|ovpn|pem|key|enc|env)$/i.test(name)) return false;
  if (["/package.json", "/build-info.json"].includes(name)) return true;
  if (parts[0] === "node_modules") return true;
  if (!SOURCE_ROOTS.includes(parts[0])) return false;
  return (
    CODE.test(name) ||
    ASSETS.includes(name.slice(1)) ||
    !path.posix.extname(parts.at(-1))
  );
}

// The copy filter receives directories too. Only these enumerated files and their ancestors are copied.
// Refusing source symlinks prevents an admitted filename from pulling private files out of the checkout.
function sourceFiles(root) {
  const result = ["package.json"];
  function walk(relative) {
    if (!keeps("/" + relative)) return;
    const info = fs.lstatSync(path.join(root, relative));
    if (info.isSymbolicLink())
      throw Object.assign(
        new Error(
          `Lien symbolique interdit dans les sources du paquet : ${relative}`,
        ),
        { code: "TVLENS_PACKAGE_SOURCE_LINK" },
      );
    if (info.isDirectory()) {
      for (const name of fs.readdirSync(path.join(root, relative)).sort())
        walk(`${relative}/${name}`);
    } else if (CODE.test(relative) || ASSETS.includes(relative))
      result.push(relative);
  }
  for (const directory of SOURCE_ROOTS) walk(directory);
  for (const asset of ASSETS) {
    if (!result.includes(asset))
      throw Object.assign(new Error(`Ressource du paquet absente : ${asset}`), {
        code: "TVLENS_PACKAGE_ASSET_MISSING",
      });
  }
  return result.sort();
}

function copyFilter(root) {
  const admitted = new Set([""]);
  for (const filename of sourceFiles(root)) {
    let name = "/" + filename;
    while (name !== "/") {
      admitted.add(name);
      name = path.posix.dirname(name);
    }
  }
  return (name) =>
    !keeps(name) ||
    !(
      admitted.has(name) ||
      name === "/node_modules" ||
      name.startsWith("/node_modules/")
    );
}

module.exports = { keeps, sourceFiles, copyFilter, SOURCE_ROOTS, ASSETS };
