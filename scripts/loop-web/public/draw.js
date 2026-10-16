// Les primitives du dessin isométrique : un point du monde (x, y au sol, z en hauteur) devient un point du canvas.
// Le monde se dessine dans un petit canvas, agrandi ensuite sans lissage : c'est ce qui donne le pixel.

export const TW = 64;
export const TH = 32;
export const ZH = 38;
/** Le cadrage courant ; la scène le règle, un portrait l'emprunte le temps de se dessiner. */
export const cam = { s: 1, x: 0, y: 0 };
let g = null;

/** Le contexte où dessiner ; rend le précédent pour qu'on puisse le remettre. */
export function useContext(context) {
  const previous = g;
  g = context;
  return previous;
}
export const context = () => g;

export const P = (x, y, z = 0) => [(x - y) * TW / 2, (x + y) * TH / 2 - z * ZH];

function rgb(color) {
  const n = parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Une couleur assombrie (k < 1) ou éclaircie (k > 1), avec son opacité. */
export function shade(color, k, alpha = 1) {
  const channel = (v) => Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v) * (k - 1) : v * k)));
  const [r, gg, b] = rgb(color).map(channel);
  return `rgba(${r},${gg},${b},${alpha})`;
}

export function poly(points, fill, stroke) {
  g.beginPath();
  g.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i][0], points[i][1]);
  g.closePath();
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = 1 / cam.s;
    g.stroke();
  }
}

const EDGE = "rgba(4,4,10,.55)";

/** Un pavé : les trois faces visibles, éclairées depuis la gauche. */
export function box(x, y, z, w, d, h, color, options = {}) {
  const top = z + h;
  const alpha = options.alpha ?? 1;
  const edge = options.edge === false ? null : EDGE;
  const A = P(x, y, top), B = P(x + w, y, top), C = P(x + w, y + d, top), D = P(x, y + d, top);
  const E = P(x, y + d, z), F = P(x + w, y + d, z), G = P(x + w, y, z);
  poly([D, C, F, E], shade(color, 0.78, alpha), edge);
  poly([C, B, G, F], shade(color, 0.58, alpha), edge);
  poly([A, B, C, D], shade(color, 1.12, alpha), edge);
}

/** Un rectangle peint à plat sur une face : « y » regarde vers la gauche de l'écran, « x » vers la droite. */
export function decal(face, at, u, z, w, h, color) {
  const points = face === "y"
    ? [P(u, at, z), P(u + w, at, z), P(u + w, at, z + h), P(u, at, z + h)]
    : [P(at, u, z), P(at, u + w, z), P(at, u + w, z + h), P(at, u, z + h)];
  poly(points, color);
}

export function glow(x, y, z, radius, color, alpha) {
  const [px, py] = P(x, y, z);
  const gradient = g.createRadialGradient(px, py, 0, px, py, radius);
  gradient.addColorStop(0, shade(color, 1, alpha));
  gradient.addColorStop(1, shade(color, 1, 0));
  g.fillStyle = gradient;
  g.beginPath();
  g.arc(px, py, radius, 0, Math.PI * 2);
  g.fill();
}

export function ellipse(x, y, z, rx, ry, rotation, color) {
  const [px, py] = P(x, y, z);
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(px, py, rx, ry, rotation, 0, Math.PI * 2);
  g.fill();
}

export function pixel(x, y, z, size, color) {
  const [px, py] = P(x, y, z);
  g.fillStyle = color;
  g.fillRect(Math.round(px), Math.round(py), size, size);
}
