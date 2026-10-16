// Les personnages en voxels : un corps, une tête, des cheveux peints face par face selon l'orientation, un accessoire
// par rôle. Et le robot de la boucle. Chaque fonction rend la hauteur du sommet de la tête, où poser l'étiquette.
import { P, box, cam, context, decal, ellipse, glow, pixel, shade } from "./draw.js";

const HEAD = 0.34;
const HAIR_ON_FACES = { "y+": ["front", "side"], "x+": ["side", "front"], "y-": ["back", "side"], "x-": ["side", "back"] };

function legs(a, look, swing) {
  const lw = 0.13;
  const half = 0.2;
  if (a.face[0] === "y") {
    box(a.x - half, a.y - 0.07 + swing, 0, lw, lw, 0.34, look.pants);
    box(a.x + half - lw, a.y - 0.07 - swing, 0, lw, lw, 0.34, look.pants);
  } else {
    box(a.x - 0.07 + swing, a.y - half, 0, lw, lw, 0.34, look.pants);
    box(a.x - 0.07 - swing, a.y + half - lw, 0, lw, lw, 0.34, look.pants);
  }
}

function torso(a, look, z0, working, t) {
  const alongY = a.face[0] === "y";
  const bw = alongY ? 0.44 : 0.28;
  const bd = alongY ? 0.28 : 0.44;
  const type = working ? Math.sin(t * 22 + a.seed) * 0.03 : 0;
  const forward = working ? 0.14 : 0;
  const arm = shade(look.top, 0.85);
  if (alongY) {
    box(a.x - bw / 2 - 0.1, a.y - 0.06 + forward, z0 + 0.06 + type, 0.1, 0.12, 0.34, arm);
    box(a.x - bw / 2, a.y - bd / 2, z0, bw, bd, 0.44, look.top);
    box(a.x + bw / 2, a.y - 0.06 + forward, z0 + 0.06 - type, 0.1, 0.12, 0.34, arm);
  } else {
    box(a.x - 0.06 + forward, a.y - bd / 2 - 0.1, z0 + 0.06 + type, 0.12, 0.1, 0.34, arm);
    box(a.x - bw / 2, a.y - bd / 2, z0, bw, bd, 0.44, look.top);
    box(a.x - 0.06 + forward, a.y + bd / 2, z0 + 0.06 - type, 0.12, 0.1, 0.34, arm);
  }
  if (look.hood) box(a.x - 0.17, a.y - 0.22, z0 + 0.36, 0.34, 0.1, 0.14, shade(look.top, 1.2));
}

function cornrows(hx, hy, z) {
  const g = context();
  g.strokeStyle = "#4a3426";
  g.lineWidth = 1 / cam.s;
  for (let i = 0; i < 3; i++) {
    const u = hx + 0.08 + i * 0.09;
    g.beginPath();
    g.moveTo(...P(u, hy, z));
    g.lineTo(...P(u, hy + HEAD, z));
    g.stroke();
  }
}

/** Les cheveux sur les deux faces visibles : le front, le côté ou la nuque selon l'orientation, puis le dessus. */
function hair(a, look, hx, hy, hz) {
  const color = look.cornrows ? "#0d0b0b" : look.hair;
  if (!color) return;
  const kinds = HAIR_ON_FACES[a.face];
  const paint = (which, kind) => {
    const at = (which === "y" ? hy : hx) + HEAD + 0.001;
    const u0 = which === "y" ? hx : hy;
    if (kind === "front") return decal(which, at, u0, hz + HEAD - 0.07, HEAD, 0.07, color);
    if (kind === "back") return decal(which, at, u0, hz + 0.05, HEAD, HEAD - 0.05, color);
    decal(which, at, u0, hz + HEAD - 0.1, HEAD, 0.1, color);
    decal(which, at, a.face.endsWith("+") ? u0 : u0 + HEAD * 0.55, hz + 0.08, HEAD * 0.45, HEAD - 0.08, color);
  };
  paint("y", kinds[0]);
  paint("x", kinds[1]);
  box(hx - 0.01, hy - 0.01, hz + HEAD, HEAD + 0.02, HEAD + 0.02, 0.05, color);
  if (look.cornrows) cornrows(hx, hy, hz + HEAD + 0.051);
}

function face(a, look, hx, hy, hz, sleep) {
  const side = { "y+": "y", "x+": "x" }[a.face];
  if (!side) return;
  const at = (side === "y" ? hy : hx) + HEAD + 0.002;
  const u = side === "y" ? hx : hy;
  const eye = sleep ? 0.015 : 0.055;
  decal(side, at, u + 0.07, hz + 0.16, 0.065, eye, "#0e0c14");
  decal(side, at, u + 0.2, hz + 0.16, 0.065, eye, "#0e0c14");
  if (look.goatee) {
    decal(side, at, u + 0.09, hz + 0.08, 0.16, 0.03, "#0d0b0b");
    decal(side, at, u + 0.135, hz, 0.07, 0.08, "#0d0b0b");
  }
  if (look.accessory === "glasses") decal(side, at + 0.002, u + 0.04, hz + 0.15, 0.27, 0.03, "#15151c");
}

const ACCESSORIES = {
  hat: (hx, hy, hz) => {
    box(hx - 0.08, hy - 0.08, hz + HEAD + 0.02, HEAD + 0.16, HEAD + 0.16, 0.04, "#6b5a3a");
    box(hx + 0.04, hy + 0.04, hz + HEAD + 0.06, HEAD - 0.08, HEAD - 0.08, 0.12, "#7d6a45");
  },
  headset: (hx, hy, hz) => {
    box(hx - 0.06, hy + 0.1, hz + 0.1, 0.06, 0.14, 0.16, "#15151c");
    box(hx + HEAD, hy + 0.1, hz + 0.1, 0.06, 0.14, 0.16, "#15151c");
    box(hx - 0.04, hy + 0.14, hz + HEAD + 0.02, HEAD + 0.08, 0.06, 0.04, "#15151c");
  },
  beret: (hx, hy, hz) => box(hx - 0.03, hy - 0.03, hz + HEAD + 0.02, HEAD + 0.06, HEAD + 0.06, 0.07, "#6e2f3a"),
};

function bobOf(a, state, t) {
  if (a.path.length) return Math.abs(Math.sin(a.walkT)) * 0.05;
  if (state === "work") return Math.abs(Math.sin(t * 8 + a.seed)) * 0.02;
  return state === "sleep" ? -0.04 : 0;
}

/**
 * Un personnage. `a` : { x, y, face ("y+", "x+", "y-", "x-"), path, walkT, seed } ; `state` : "work", "walk",
 * "coffee", "sleep" ou "idle".
 */
export function drawPerson(a, look, t, state) {
  ellipse(a.x, a.y, 0, 10, 5, 0, "rgba(0,0,0,.4)");
  legs(a, look, a.path.length ? Math.sin(a.walkT) * 0.07 : 0);
  const z0 = 0.34 + bobOf(a, state, t);
  torso(a, look, z0, state === "work", t);
  const hz = z0 + 0.44 + (state === "sleep" ? -0.05 : 0);
  const hx = a.x - HEAD / 2;
  const hy = a.y - HEAD / 2;
  box(hx, hy, hz, HEAD, HEAD, HEAD, look.skin);
  hair(a, look, hx, hy, hz);
  face(a, look, hx, hy, hz, state === "sleep");
  ACCESSORIES[look.accessory]?.(hx, hy, hz);
  if (state === "coffee") pixel(a.x + 0.28, a.y + 0.12, z0 + 0.25, 3, "#e8e4da");
  return hz + HEAD + 0.1;
}

/** Le robot de la boucle : il s'allume pendant les contrôles et s'éteint quand la boucle s'arrête. */
export function drawRobot(a, t, active, dark, accent) {
  const lift = active ? Math.round(Math.sin(t * 5) * 2) / 50 : 0;
  let eyes = active ? accent : "#6d6a58";
  if (dark) eyes = "#2a2c38";
  ellipse(a.x, a.y, 0, 11, 5.5, 0, "rgba(0,0,0,.4)");
  box(a.x - 0.22, a.y - 0.18, 0.02, 0.44, 0.36, 0.14, "#2f3240");
  box(a.x - 0.24, a.y - 0.2, 0.2 + lift, 0.48, 0.4, 0.5, "#8c90a3");
  decal("y", a.y + 0.201, a.x - 0.1, 0.32 + lift, 0.2, 0.14, active ? accent : "#3c3f4f");
  box(a.x - 0.2, a.y - 0.17, 0.74 + lift, 0.4, 0.34, 0.32, "#a7abbd");
  decal("y", a.y + 0.171, a.x - 0.15, 0.82 + lift, 0.3, 0.14, "#111219");
  decal("y", a.y + 0.172, a.x - 0.1, 0.86 + lift, 0.06, active ? 0.07 : 0.03, eyes);
  decal("y", a.y + 0.172, a.x + 0.04, 0.86 + lift, 0.06, active ? 0.07 : 0.03, eyes);
  box(a.x - 0.015, a.y - 0.015, 1.06 + lift, 0.03, 0.03, 0.18, "#5b5f72");
  box(a.x - 0.04, a.y - 0.04, 1.24 + lift, 0.08, 0.08, 0.08, active && Math.sin(t * 10) > 0 ? accent : "#3c3f4f");
  if (active) glow(a.x, a.y, 1.0, 40, accent, 0.2);
  return 1.36 + lift;
}
