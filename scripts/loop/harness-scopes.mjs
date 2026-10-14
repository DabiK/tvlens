// Portées du harnais : ce qu'une session de la boucle peut modifier dans le harnais quand `TVLENS_HARNESS_SCOPE` est
// fixé. Le hook guard-write le refuse pendant la session, la boucle le revérifie sur le diff après.
// Aucun import ni effet de bord : le hook importe ce module, et un hook qui plante laisse passer l'écriture.

/** Portée de l'harmonisation des consignes : les skills et les agents, jamais les contrôles. */
export const INSTRUCTIONS_SCOPE = "consignes";

const SCOPES = new Map([[INSTRUCTIONS_SCOPE, Object.freeze([".claude/skills/", ".claude/agents/"])]]);

/** Dossiers que la portée ouvre dans le harnais ; null pour une portée inconnue, qui n'ouvre rien. */
export function scopeDirs(scope) {
  return SCOPES.get(scope) ?? null;
}

/** Vrai si le chemin (relatif au projet, avec des « / ») est dans un dossier que la portée ouvre. */
export function inScope(scope, file) {
  return (scopeDirs(scope) ?? []).some((dir) => file.startsWith(dir));
}
