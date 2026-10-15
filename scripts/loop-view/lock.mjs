// Le verrou de la boucle (`.harness-state/loop/lock`) : le numéro du processus qui tourne. Le test « le processus
// vit-il ? » est passé en argument, pour que ce module reste pur.

/** `lockText` est le contenu du verrou, null s'il n'existe pas ; `isRunning(pid)` dit si ce processus vit. */
export function loopStatus(lockText, isRunning) {
  const text = String(lockText ?? "").trim();
  if (!/^\d+$/.test(text) || Number(text) === 0) return { alive: false, pid: null };
  const pid = Number(text);
  return { alive: Boolean(isRunning(pid)), pid };
}
