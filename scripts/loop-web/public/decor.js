// Le bureau : sol, murs, fenêtres sur la nuit, enseigne, et le mobilier de chaque poste. Chaque meuble se dessine dans
// la liste triée par profondeur que la scène partage avec les personnages.
import { P, box, context, decal, ellipse, glow, pixel, poly, shade } from "./draw.js";

export const GX = 12;
export const GY = 10;
export const WALL = 3.0;
const PAL = {
  floorA: "#1b1d29", floorB: "#1e2030", grid: "rgba(0,0,0,.25)", wallR: "#22243a", wallL: "#1b1d30", trim: "#2e3150",
  wood: "#4b3d36", leg: "#24222c", metal: "#2a2c3a", screenBack: "#14151d", sky: "#0a0b18", lounge: "#262338", chef: "#2a2230",
  pot: "#5a3f2e", glass: "#a9c4d8",
};
/** Le tableau de liège, en coordonnées du monde : la scène en fait une zone cliquable. */
export const WALL_BOARD = { from: [0, 1.0, 2.45], to: [0, 3.6, 0.9] };
export const QUEUE_SHELF = { x: 5.2, y: 9.0, w: 0.9, d: 0.55, h: 0.9 };
export const CHEST = { x: 6.7, y: 9.0, w: 0.8, d: 0.55, h: 0.6 };

function windows(t) {
  for (const wx of [3.3, 7.6]) {
    decal("y", 0.001, wx, 1.0, 1.5, 1.45, PAL.sky);
    for (let i = 0; i < 8; i++) {
      const sx = wx + 0.1 + ((i * 0.37 + wx) % 1.3);
      const sz = 1.12 + ((i * 0.53) % 1.2);
      if (Math.sin(t * 1.7 + i * 2.1 + wx) > -0.3) decal("y", 0.002, sx, sz, 0.05, 0.06, "#d9d6c4");
    }
    decal("y", 0.003, wx + 0.73, 1.0, 0.04, 1.45, PAL.trim);
    decal("y", 0.003, wx, 1.7, 1.5, 0.04, PAL.trim);
  }
  const g = context();
  const [mx, my] = P(8.5, 0, 2.15);
  g.fillStyle = "#efe8cf";
  g.beginPath();
  g.arc(mx, my, 5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = PAL.sky;
  g.beginPath();
  g.arc(mx + 2, my - 1.5, 4.2, 0, Math.PI * 2);
  g.fill();
}

function neon(t, dark, accent, name) {
  const g = context();
  g.save();
  const [nx, ny] = P(0, 6.3, 2.3);
  g.translate(nx, ny);
  g.transform(1, -0.5, 0, 1, 0, 0);
  g.font = "700 13px Silkscreen";
  g.textAlign = "center";
  let on = Math.sin(t * 0.8) > 0.96 ? 0.4 : 1;
  if (dark) on = 0.12;
  g.shadowColor = accent;
  g.shadowBlur = 10 * on;
  g.fillStyle = shade(accent, 1.1, on);
  g.fillText(name.toUpperCase(), 0, 0);
  g.restore();
}

export function drawRoom(t, { dark, accent, project }) {
  for (let x = 0; x < GX; x++) {
    for (let y = 0; y < GY; y++) poly([P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)], (x + y) % 2 ? PAL.floorA : PAL.floorB, PAL.grid);
  }
  const rug = (x, y, w, d, color) => poly([P(x, y), P(x + w, y), P(x + w, y + d), P(x, y + d)], color);
  rug(0.4, 7.1, 4.2, 2.6, PAL.lounge);
  rug(8.6, 5.8, 3.0, 3.8, PAL.chef);
  poly([P(0, 0), P(GX, 0), P(GX, 0, WALL), P(0, 0, WALL)], PAL.wallR);
  poly([P(0, 0), P(0, GY), P(0, GY, WALL), P(0, 0, WALL)], PAL.wallL);
  poly([P(0, 0, WALL), P(GX, 0, WALL), P(GX, -0.14, WALL), P(0, -0.14, WALL)], PAL.trim);
  poly([P(0, 0, WALL), P(0, GY, WALL), P(-0.14, GY, WALL), P(-0.14, 0, WALL)], PAL.trim);
  poly([P(0, 0), P(GX, 0), P(GX, 0, 0.1), P(0, 0, 0.1)], PAL.trim);
  poly([P(0, 0), P(0, GY), P(0, GY, 0.1), P(0, 0, 0.1)], PAL.trim);
  windows(t);
  neon(t, dark, accent, project);
  decal("x", 0.001, 1.0, 0.9, 2.6, 1.55, "#3a2e25");
  decal("x", 0.002, 1.08, 0.98, 2.44, 1.39, "#5c4a39");
  for (let i = 0; i < 14; i++) {
    const u = 1.18 + (i % 7) * 0.33;
    const z = 1.04 + Math.floor(i / 7) * 0.6 + ((i * 37) % 7) / 100;
    decal("x", 0.003, u, z, 0.24, 0.4, i % 5 === 0 ? accent : "#cfc8b4");
  }
}

function desk(x, y, w, d, color = PAL.wood) {
  for (const [lx, ly] of [[x, y], [x + w - 0.1, y], [x, y + d - 0.1], [x + w - 0.1, y + d - 0.1]]) box(lx, ly, 0, 0.1, 0.1, 0.62, PAL.leg);
  box(x, y, 0.62, w, d, 0.1, color);
}

function monitor(x, y, on, t, accent) {
  box(x + 0.25, y + 0.2, 0.72, 0.1, 0.1, 0.16, PAL.metal);
  box(x, y + 0.18, 0.86, 0.6, 0.12, 0.42, PAL.screenBack);
  if (on) glow(x + 0.3, y + 0.1, 1.1, 30, accent, 0.32 + 0.08 * Math.sin(t * 9));
}

function plant(x, y, leaves, color) {
  box(x, y, 0, 0.35, 0.35, 0.3, PAL.pot);
  for (let i = 0; i < leaves; i++) {
    const offset = i - (leaves - 1) / 2;
    ellipse(x + 0.17 + offset * 0.06, y + 0.17 - offset * 0.06, 0.72, 3.5, 9, offset * 0.45, color);
  }
}

const STATIONS = [
  { key: 3.4, draw: ({ act, t, accent }) => {
    desk(1.5, 1.6, 1.7, 0.75);
    monitor(2.0, 1.55, act === "explorateur", t, accent);
    box(2.9, 1.75, 0.72, 0.18, 0.18, 0.08, "#3a2a1a");
    ellipse(2.99, 1.84, 1.0, 5, 5, 0, "#4f7fa8");
  } },
  { key: 6.9, draw: ({ act, t, accent }) => {
    desk(5.0, 1.6, 1.8, 0.75);
    monitor(5.05, 1.55, act === "implementeur", t, accent);
    monitor(5.75, 1.55, act === "implementeur", t, accent);
    box(5.45, 2.0, 0.72, 0.5, 0.18, 0.03, PAL.metal);
  } },
  { key: 10.1, draw: ({ act, t, accent }) => {
    box(9.2, 0.35, 0, 0.85, 0.75, 2.2, "#23252f");
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        const lit = act === "gardien" ? Math.sin(t * 12 + i * 3 + j * 5) > 0 : Math.sin(t * 1.3 + i + j * 2) > 0.6;
        decal("y", 1.101, 9.32 + j * 0.22, 0.35 + i * 0.3, 0.1, 0.06, lit ? accent : "#2c2a22");
      }
    }
    if (act === "gardien") glow(9.6, 1.2, 1.2, 40, accent, 0.2);
  } },
  { key: 6.91, draw: ({ act, t, accent, dark }) => {
    desk(1.5, 5.0, 1.7, 0.75);
    monitor(2.0, 4.95, act === "relecteur", t, accent);
    box(2.85, 5.2, 0.72, 0.28, 0.2, 0.1, "#d8d2c2");
    box(1.62, 5.15, 0.72, 0.08, 0.08, 0.45, "#6d6250");
    box(1.55, 5.08, 1.15, 0.22, 0.22, 0.08, "#c9a85a");
    if (!dark) glow(1.66, 5.2, 0.9, 26, accent, act === "relecteur" ? 0.35 : 0.18);
  } },
  { key: 9.35, draw: ({ act, t, accent }) => {
    box(5.05, 4.2, 0, 0.08, 0.08, 1.9, "#3d4052");
    box(6.9, 4.2, 0, 0.08, 0.08, 1.9, "#3d4052");
    box(5.0, 4.22, 0.6, 2.0, 0.06, 1.25, "#d8d9de");
    const notes = act === "retro" ? Math.floor((t * 1.1) % 7) : 3;
    for (let i = 0; i < Math.min(notes, 6); i++) {
      decal("y", 4.281, 5.15 + (i % 3) * 0.6, 0.95 + Math.floor(i / 3) * 0.45, 0.32, 0.28, i === 0 ? accent : "#9a9caa");
    }
  } },
];

const LOUNGE = [
  { key: 9.9, draw: () => {
    box(0.6, 9.0, 0, 2.8, 0.6, 0.35, "#3b3550");
    box(0.6, 9.4, 0.35, 2.8, 0.2, 0.45, "#443d5c");
    box(0.6, 9.0, 0.35, 0.2, 0.6, 0.25, "#443d5c");
    box(3.2, 9.0, 0.35, 0.2, 0.6, 0.25, "#443d5c");
  } },
  { key: 7.2, draw: ({ t, dark }) => {
    box(0.15, 6.6, 0, 0.55, 0.55, 0.9, "#2a2b36");
    box(0.2, 6.65, 0.9, 0.45, 0.45, 0.45, "#5a5d6e");
    box(0.3, 6.95, 0.95, 0.12, 0.1, 0.14, "#e8e4da");
    if (dark) return;
    for (let i = 0; i < 3; i++) {
      const k = (t * 0.6 + i / 3) % 1;
      pixel(0.36 + Math.sin(k * 6 + i) * 0.03, 7.0, 1.15 + k * 0.6, 1, `rgba(255,255,255,${0.3 * (1 - k)})`);
    }
  } },
  { key: 13.6, draw: () => plant(3.9, 9.3, 5, "#3e6e52") },
];

const CHEF_OFFICE = [
  { key: 14.1, draw: () => {
    box(8.35, 5.6, 0, 0.05, 4.0, 1.05, PAL.glass, { alpha: 0.12, edge: false });
    box(8.35, 5.6, 1.05, 0.05, 4.0, 0.05, PAL.glass, { alpha: 0.4 });
  } },
  { key: 14.02, draw: () => {
    box(8.4, 5.56, 0, 3.4, 0.05, 1.05, PAL.glass, { alpha: 0.12, edge: false });
    box(8.4, 5.56, 1.05, 3.4, 0.05, 0.05, PAL.glass, { alpha: 0.4 });
  } },
  { key: 17.4, draw: ({ accent }) => {
    desk(9.3, 7.15, 2.0, 0.85, "#3a2f33");
    box(10.6, 7.3, 0.72, 0.5, 0.35, 0.03, "#dcd6c6");
    box(9.6, 7.35, 0.72, 0.12, 0.12, 0.16, accent);
  } },
  { key: 20.8, draw: () => plant(11.2, 9.2, 4, "#355f47") },
];

const STORAGE = [
  { key: 14.5, draw: ({ queued }) => {
    const { x, y, w, d } = QUEUE_SHELF;
    box(x, y, 0, w, d, 0.25, "#3a2e25");
    for (let i = 0; i < Math.min(12, queued); i++) box(x + 0.08 + (i % 3) * 0.26, y + 0.08, 0.25 + Math.floor(i / 3) * 0.13, 0.22, 0.4, 0.12, "#d8cba6");
  } },
  { key: 16.0, draw: ({ accent }) => {
    const { x, y, w, d } = CHEST;
    box(x, y, 0, w, d, 0.4, "#5a3a22");
    box(x, y, 0.4, w, d, 0.14, "#6a4528");
    box(x + 0.35, y + 0.54, 0.2, 0.1, 0.03, 0.14, accent);
  } },
];

/** Le mobilier, chaque meuble avec sa profondeur ; `scene` : { act, t, accent, dark, queued }. */
export function furniture(scene) {
  return [...STATIONS, ...LOUNGE, ...CHEF_OFFICE, ...STORAGE].map((item) => ({ key: item.key, draw: () => item.draw(scene) }));
}
