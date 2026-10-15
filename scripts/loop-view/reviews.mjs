// Cycles de relecture d'un ticket : une ligne de `relectures.jsonl` et le rapport `relecture-<n>.md` du même rang.
import { reviewVerdict } from "../loop/reviewed-state.mjs";

// La ligne du rapport que le relecteur écrit : « CONSTATS : 0 bloquant, 2 mineur, 1 hors périmètre ».
const FINDINGS = /^\s*CONSTATS\s*:\s*(\d+)\s+bloquants?\s*,\s*(\d+)\s+mineurs?\s*,\s*(\d+)\s+hors\s+périmètre/imu;

function findingsOf(report) {
  const counts = FINDINGS.exec(report || "");
  if (!counts) return null;
  const [, blocking, minor, outOfScope] = counts.map(Number);
  return { blocking, minor, outOfScope };
}

/**
 * Un cycle par relecture enregistrée, dans l'ordre. `reports` associe le rang d'une relecture au texte de son
 * rapport quand il existe ; sans rapport lisible, le cycle existe sans décompte.
 */
export function reviewCycles(entries, reports = {}) {
  return entries.map((entry, index) => {
    const rank = index + 1;
    const report = reports[rank] ?? null;
    return {
      rank,
      at: entry.at ?? null,
      verdict: entry.verdict ?? (report ? reviewVerdict(report) : "illisible"),
      model: entry.modele ?? null,
      findings: findingsOf(report),
    };
  });
}
