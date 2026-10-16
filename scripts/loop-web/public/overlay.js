// Ce qui se lit par-dessus l'image agrandie, net et non pixelisé : les noms, la bulle de l'agent qui travaille, la bulle
// du chef quand une décision l'attend, et les étiquettes de la file et du coffre.
import { CHEST, QUEUE_SHELF } from "./decor.js";
import { ROLES, activeRole, engineOf, roleLabel } from "./model.js";

const INK = "#0b0c10";
const PAPER = "#ebebef";
const FAINT = "#545766";
const BUBBLE_MAX = 280;
const BUBBLE_PAD = 9;
const BUBBLE_HEIGHT = 24;
// Une action Bash de Claude est rangée sous le nom affiché du sous-agent : « implémenteur », avec son accent.
const ACTION_AGENT = { explorateur: "explorateur", implementeur: "implémenteur", relecteur: "relecteur" };
const FALLBACK = {
  explorateur: "Je lis le ticket…", implementeur: "J'écris le test d'abord…", relecteur: "Je relis le diff…", retro: "Qu'est-ce qui a coincé ?",
};

function pixelBox(screen, x, y, w, h, fill, border) {
  screen.fillStyle = border;
  screen.fillRect(x + 2, y, w - 4, h);
  screen.fillRect(x, y + 2, w, h - 4);
  screen.fillStyle = fill;
  screen.fillRect(x + 2, y + 2, w - 4, h - 4);
}

function fitText(screen, text, max) {
  let shown = text;
  while (screen.measureText(shown).width + BUBBLE_PAD * 2 > max && shown.length > 4) shown = shown.slice(0, -2);
  return shown === text ? text : `${shown.slice(0, -1)}…`;
}

function bubble(screen, x, y, text, { bg = PAPER, fg = INK, font = "500 11px 'Geist Mono'" } = {}) {
  screen.font = font;
  const shown = fitText(screen, text, BUBBLE_MAX);
  const w = Math.round(screen.measureText(shown).width + BUBBLE_PAD * 2);
  const bx = Math.round(x - w / 2);
  const by = Math.round(y - BUBBLE_HEIGHT - 12);
  pixelBox(screen, bx, by, w, BUBBLE_HEIGHT, bg, INK);
  screen.fillStyle = bg;
  screen.fillRect(Math.round(x) - 3, by + BUBBLE_HEIGHT - 2, 6, 4);
  screen.fillRect(Math.round(x) - 1, by + BUBBLE_HEIGHT + 2, 2, 3);
  screen.fillStyle = fg;
  screen.textAlign = "left";
  screen.textBaseline = "middle";
  screen.fillText(shown, bx + BUBBLE_PAD, by + BUBBLE_HEIGHT / 2 + 1);
  return { x0: bx, y0: by, x1: bx + w, y1: by + BUBBLE_HEIGHT };
}

function nameTag(screen, x, y, text, strong, accent) {
  screen.font = "400 10px Silkscreen";
  const w = Math.round(screen.measureText(text).width + 12);
  const bx = Math.round(x - w / 2);
  const by = Math.round(y + 10);
  screen.fillStyle = strong ? accent : "rgba(11,12,16,.88)";
  screen.fillRect(bx, by, w, 16);
  screen.fillStyle = strong ? INK : PAPER;
  screen.textAlign = "center";
  screen.textBaseline = "middle";
  screen.fillText(text, Math.round(x), by + 8.5);
}

/**
 * La dernière action de l'agent, d'après la vue : Codex signe toutes les siennes et tient l'exploration et
 * l'implémentation ; Claude range les siennes par sous-agent. Le relecteur du mode Codex n'écrit aucun fil.
 */
function actionOf(role, view) {
  const codexRole = role === "explorateur" || role === "implementeur" ? "Codex" : null;
  const owner = view.ticket?.moteur === "codex" ? codexRole : ACTION_AGENT[role];
  const action = owner ? [...(view.actions ?? [])].reverse().find((entry) => entry.agent === owner) : null;
  if (!action) return role === "gardien" ? `${view.phase?.label ?? ""}…` : FALLBACK[role];
  const target = String(action.target ?? "").replace(/\s+/g, " ");
  return action.tool === "Bash" ? `$ ${target}` : `${action.tool} · ${target}`;
}

function label(screen, toScreen, place, text, hot, accent) {
  const [sx, sy] = toScreen(place.x + place.w / 2, place.y + 1.1, -0.2);
  screen.font = "400 10px Silkscreen";
  screen.fillStyle = hot ? accent : FAINT;
  screen.textAlign = "center";
  screen.fillText(text, sx, sy);
}

/**
 * Le calque de la scène. `selected()` : l'agent suivi dans le terminal, nommé lui aussi ; `asks()` : le nombre de
 * décisions qui attendent le chef.
 */
export function createOverlay({ accent, selected, asks }) {
  const agents = (screen, frame) => {
    const { view, actors, tops, hover, toScreen, t } = frame;
    const act = activeRole(view);
    for (const [role, actor] of Object.entries(actors)) {
      if (role === "chef") continue;
      const [fx, fy] = toScreen(actor.x, actor.y, 0);
      const [hx, hy] = toScreen(actor.x, actor.y, tops[role] ?? 1.3);
      if (!view.alive) {
        if (!ROLES[role].robot && Math.sin(t * 2 + actor.seed) > 0) nameTag(screen, hx + 10, hy - 18 - ((t * 8 + actor.seed * 10) % 10), "z", false, accent);
        continue;
      }
      const engine = engineOf(role, view);
      const text = engine === "machine" ? roleLabel(role, view) : `${roleLabel(role, view)} · ${engine}`;
      if (role === act || hover?.role === role || selected() === role) nameTag(screen, fx, fy, text.toUpperCase(), role === act, accent);
      if (role === act && !actor.path.length) bubble(screen, hx, hy, actionOf(role, view));
    }
  };
  const chef = (screen, frame) => {
    const { view, actors, toScreen, hits, t } = frame;
    const [fx, fy] = toScreen(actors.chef.x, actors.chef.y, 0);
    nameTag(screen, fx, fy, "DABI · CHEF", false, accent);
    const count = asks();
    if (!view.alive || !count) return;
    const [cx, cy] = toScreen(actors.chef.x, actors.chef.y, 1.45);
    const zone = bubble(screen, cx, cy, `! ${count} DÉCISION${count > 1 ? "S" : ""}`, { bg: accent, fg: INK, font: "400 11px Silkscreen" });
    if (Math.sin(t * 6) > -0.2) {
      screen.fillStyle = accent;
      screen.fillRect(zone.x0 - 8, zone.y0 + 4, 3, 10);
      screen.fillRect(zone.x0 - 8, zone.y0 + 16, 3, 3);
    }
    hits.push({ kind: "chef", ...zone });
  };
  return (screen, frame) => {
    agents(screen, frame);
    chef(screen, frame);
    const { view, hover, toScreen } = frame;
    label(screen, toScreen, QUEUE_SHELF, `FILE ${view.remaining?.tickets?.length ?? 0}`, hover?.kind === "queue", accent);
    label(screen, toScreen, CHEST, `COFFRE ${(view.finished ?? []).filter((entry) => entry.outcome === "integre").length}`, hover?.kind === "chest", accent);
  };
}
