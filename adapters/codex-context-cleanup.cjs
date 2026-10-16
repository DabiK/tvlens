const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const CONTEXT_PREFIXES = [
  "tvlens-codex-session-",
  "tvlens-verify-",
  "tvlens-codex-probe-",
];
async function ownerAlive(dir, fileSystem, probe, onDiagnostic) {
  let operation = "read-owner";
  try {
    const pid = Number(await fileSystem.readFile(path.join(dir, "owner"), "utf8"));
    if (!Number.isSafeInteger(pid) || pid <= 0) throw Object.assign(Error("Propriétaire invalide."), { code: "INVALID_OWNER" });
    operation = "probe-owner";
    probe(pid);
    return true;
  } catch (error) {
    // Les anciens arbres sans marqueur restent balayables ; seule ESRCH confirme une mort à la sonde.
    const absent = operation === "read-owner" ? error?.code === "ENOENT" : error?.code === "ESRCH";
    if (absent) return false;
    // EPERM à la sonde confirme l'existence ; tout autre refus laisse l'appartenance incertaine.
    if (operation !== "probe-owner" || error?.code !== "EPERM") diagnoseCleanup(onDiagnostic, dir, operation, error);
    return true;
  }
}
const TVLENS_CODEX_CLEANUP_REFUSED = "TVLENS_CODEX_CLEANUP_REFUSED";
function diagnoseCleanup(onDiagnostic, candidate, operation, error) {
  const systemCode = /^[A-Z][A-Z0-9_]{0,63}$/.test(error?.code) ? error.code : "UNKNOWN";
  try {
    Promise.resolve(onDiagnostic({ code: TVLENS_CODEX_CLEANUP_REFUSED, candidate, operation, systemCode })).catch(() => {});
  } catch {
    // Un journal indisponible ne doit ni bloquer le nettoyage ni remplacer son erreur.
  }
}
async function removeStaleContext(dir, maxAgeMs, now, { fileSystem, probe, onDiagnostic }) {
  let operation = "lstat";
  try {
    const stat = await fileSystem.lstat(dir);
    if (!stat.isDirectory() || now - stat.mtimeMs < maxAgeMs) return false;
    if (await ownerAlive(dir, fileSystem, probe, onDiagnostic)) return false;
    operation = "rm";
    // Removes the links, never the credential files they point to.
    await fileSystem.rm(dir, { recursive: true });
    return true;
  } catch (error) {
    if (error?.code !== "ENOENT") diagnoseCleanup(onDiagnostic, dir, operation, error);
    return false;
  }
}
// A crash leaves private trees behind, each holding links to the credentials. Hosts call this once
// at start. A tree whose owner process is alive is never touched, whatever its age. Never throws;
// resolves to the names removed.
async function sweepStaleContexts(
  root = os.tmpdir(),
  maxAgeMs = 24 * 60 * 60 * 1000,
  now = Date.now(),
  { fileSystem = fs, probe = pid => process.kill(pid, 0), onDiagnostic = () => {} } = {},
) {
  const removed = [];
  let names = [];
  try {
    names = await fileSystem.readdir(root);
  } catch (error) {
    if (error?.code !== "ENOENT") diagnoseCleanup(onDiagnostic, root, "readdir", error);
    return removed;
  }
  for (const name of names) {
    if (!CONTEXT_PREFIXES.some((prefix) => name.startsWith(prefix))) continue;
    const effects = { fileSystem, probe, onDiagnostic };
    if (await removeStaleContext(path.join(root, name), maxAgeMs, now, effects)) removed.push(name);
  }
  return removed;
}

module.exports = { sweepStaleContexts, diagnoseCleanup, TVLENS_CODEX_CLEANUP_REFUSED };
