// La scène : le bureau en pixel art, les agents qui vont de leur poste au salon selon la phase, le parchemin du ticket
// qui passe de bureau en bureau, et les zones cliquables. 30 images par seconde au plus, rien quand l'onglet est caché.
import { P, box, cam, glow, pixel, useContext } from "./draw.js";
import { CHEST, GX, GY, QUEUE_SHELF, WALL, WALL_BOARD, drawRoom, furniture } from "./decor.js";
import { CHEF, ROLES, activeRole, pathBetween, placeOf } from "./model.js";
import { drawPerson, drawRobot } from "./people.js";

// Taille d'un pixel du monde à l'écran.
const PX = 2;
const FRAME_MS = 33;
const WALK_SPEED = 3.4;
const SCROLL_SPEED = 1.3;
const SPARKS_PER_SECOND = 4;
const COINS = 26;

function makeActors(view) {
  const actors = {};
  for (const [role, r] of Object.entries(ROLES)) {
    const place = placeOf(role, view);
    const at = place === "desk" ? r.spot : r.lounge;
    actors[role] = { role, x: at.x, y: at.y, place, path: [], face: "y+", walkT: 0, seed: Math.random() * 10 };
  }
  actors.chef = { role: "chef", ...CHEF.spot, place: "desk", path: [], face: "y+", walkT: 0, seed: 3 };
  return actors;
}

function walk(actor, dt) {
  if (!actor.path.length) {
    actor.walkT = 0;
    actor.face = "y+";
    return;
  }
  const target = actor.path[0];
  const dx = target.x - actor.x;
  const dy = target.y - actor.y;
  const distance = Math.hypot(dx, dy);
  const step = WALK_SPEED * dt;
  if (Math.abs(dx) > Math.abs(dy)) actor.face = dx > 0 ? "x+" : "x-";
  else actor.face = dy > 0 ? "y+" : "y-";
  actor.walkT += dt * 10;
  if (distance > step) {
    actor.x += (dx / distance) * step;
    actor.y += (dy / distance) * step;
    return;
  }
  actor.x = target.x;
  actor.y = target.y;
  actor.path.shift();
}

function scrollTarget(view) {
  const role = activeRole(view);
  if (role) return { x: ROLES[role].spot.x + 0.1, y: ROLES[role].spot.y + 0.75, z: 1.35 };
  if (view?.alive && view.phase?.key === "start") return { x: QUEUE_SHELF.x + 0.45, y: QUEUE_SHELF.y + 0.2, z: 1.0 };
  return null;
}

function stateOf(role, actor, act, dark) {
  if (dark) return "sleep";
  if (actor.path.length) return "walk";
  return role === act ? "work" : "coffee";
}

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/**
 * La scène dans `canvas`. `overlay(screen, frame)` dessine par-dessus, net : étiquettes et bulles. `onHit(hit)` reçoit
 * les clics sur un agent, le chef, le parchemin, le tableau, la file ou le coffre.
 */
export class Scene {
  constructor(canvas, { accent, overlay, onHit }) {
    Object.assign(this, { canvas, accent, overlay, onHit });
    this.screen = canvas.getContext("2d");
    this.low = document.createElement("canvas");
    this.world = this.low.getContext("2d");
    Object.assign(this, { view: null, project: "", queued: 0, actors: null, hits: [], hover: null, tops: {}, sparks: [] });
    this.scroll = { at: null, from: null, to: null, t: 1 };
    Object.assign(this, { dpr: 1, raf: null, last: 0 });
    canvas.addEventListener("mousemove", (event) => this.hoverAt(event));
    canvas.addEventListener("mouseleave", () => { this.hover = null; });
    canvas.addEventListener("click", (event) => {
      const hit = this.hitAt(event);
      if (hit) this.onHit(hit);
    });
    document.addEventListener("visibilitychange", () => this.start());
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  /** La vue du serveur ; la première place chacun sans le faire marcher. */
  show(view, { project, queued }) {
    Object.assign(this, { view, project, queued });
    this.actors ??= makeActors(view);
    this.start();
  }

  /** Des pièces qui jaillissent du coffre. */
  celebrate() {
    for (let i = 0; i < COINS; i++) {
      const x = CHEST.x + 0.4 + (Math.random() - 0.5) * 0.5;
      this.sparks.push({ x, y: CHEST.y + 0.25, z: 0.6, vz: 1.5 + Math.random() * 2, falls: true, life: 1.4, age: 0, size: 2 });
    }
  }

  toScreen(x, y, z = 0) {
    const [px, py] = P(x, y, z);
    return [(cam.x + px * cam.s) * PX, (cam.y + py * cam.s) * PX];
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.low.width = Math.ceil(rect.width / PX);
    this.low.height = Math.ceil(rect.height / PX);
    const [minX] = P(0, GY);
    const [maxX] = P(GX, 0);
    const minY = P(0, 0, WALL)[1];
    const maxY = P(GX, GY)[1];
    cam.s = Math.min((this.low.width - 6) / (maxX - minX), (this.low.height - 64) / (maxY - minY));
    cam.x = this.low.width / 2 - ((minX + maxX) / 2) * cam.s;
    cam.y = this.low.height / 2 - ((minY + maxY) / 2) * cam.s + 6;
  }

  start() {
    if (this.raf || document.hidden || !this.view) return;
    this.raf = requestAnimationFrame((timestamp) => this.frame(timestamp));
  }

  frame(timestamp) {
    this.raf = null;
    if (document.hidden) return;
    this.start();
    if (timestamp - this.last < FRAME_MS) return;
    const dt = Math.min(0.1, (timestamp - this.last) / 1000);
    this.last = timestamp;
    this.syncActors();
    for (const actor of Object.values(this.actors)) walk(actor, dt);
    this.moveScroll(dt);
    this.moveSparks(dt);
    this.draw(timestamp / 1000);
  }

  syncActors() {
    for (const [role, r] of Object.entries(ROLES)) {
      const actor = this.actors[role];
      const want = placeOf(role, this.view);
      if (r.robot || actor.place === want) continue;
      actor.path = pathBetween(role, actor.place, want);
      actor.place = want;
    }
  }

  moveScroll(dt) {
    const sc = this.scroll;
    const target = scrollTarget(this.view);
    const same = target && sc.to && target.x === sc.to.x && target.y === sc.to.y;
    if (!same && !(target === null && sc.to === null)) Object.assign(sc, { from: sc.at || target, to: target, t: 0 });
    sc.t = Math.min(1, sc.t + dt * SCROLL_SPEED);
    if (!sc.to) {
      sc.at = null;
      return;
    }
    const k = ease(sc.t);
    const f = sc.from || sc.to;
    sc.at = { x: f.x + (sc.to.x - f.x) * k, y: f.y + (sc.to.y - f.y) * k, z: f.z + (sc.to.z - f.z) * k + Math.sin(Math.PI * sc.t) * 1.4 };
  }

  moveSparks(dt) {
    const role = activeRole(this.view);
    if (role && Math.random() < dt * SPARKS_PER_SECOND) {
      const { spot } = ROLES[role];
      this.sparks.push({ x: spot.x + (Math.random() - 0.5) * 0.5, y: spot.y + 0.35, z: 1.25, vz: 0.8, life: 1.2, age: 0, size: 1 });
    }
    for (const spark of this.sparks) {
      spark.age += dt;
      spark.z += spark.vz * dt;
      if (spark.falls) spark.vz -= 3 * dt;
    }
    this.sparks = this.sparks.filter((spark) => spark.age < spark.life);
  }

  drawScroll(t) {
    const at = this.scroll.at;
    if (!at || !this.view?.ticket) return;
    const z = at.z + Math.round(Math.sin(t * 2.4) * 2) / 40;
    glow(at.x, at.y, z, 22, this.accent, 0.3);
    box(at.x - 0.12, at.y - 0.12, z - 0.12, 0.24, 0.24, 0.2, "#e9dfc4", { edge: false });
    box(at.x - 0.16, at.y - 0.16, z - 0.14, 0.06, 0.32, 0.24, "#9c7d4a", { edge: false });
    const [sx, sy] = this.toScreen(at.x, at.y, z);
    this.hits.push({ kind: "ticket", x0: sx - 20, y0: sy - 18, x1: sx + 20, y1: sy + 14 });
  }

  actorItems(t, act, dark) {
    return Object.entries(this.actors).map(([role, actor]) => ({ key: actor.x + actor.y + 0.05, draw: () => {
      if (role === "chef") this.tops.chef = drawPerson(actor, CHEF.look, t, "idle");
      else if (ROLES[role].robot) this.tops[role] = drawRobot(actor, t, act === role, dark, this.accent);
      else this.tops[role] = drawPerson(actor, ROLES[role].look, t, stateOf(role, actor, act, dark));
    } }));
  }

  drawWorld(t) {
    const { world, low, accent } = this;
    const dark = !this.view.alive;
    const act = activeRole(this.view);
    world.setTransform(1, 0, 0, 1, 0, 0);
    world.clearRect(0, 0, low.width, low.height);
    world.setTransform(cam.s, 0, 0, cam.s, cam.x, cam.y);
    useContext(world);
    drawRoom(t, { dark, accent, project: this.project });
    const items = [...furniture({ act, t, accent, dark, queued: this.queued }), ...this.actorItems(t, act, dark)];
    items.sort((a, b) => a.key - b.key).forEach((item) => item.draw());
    this.drawScroll(t);
    for (const spark of this.sparks) pixel(spark.x, spark.y, spark.z, spark.size, accent);
    if (!dark) return;
    world.setTransform(1, 0, 0, 1, 0, 0);
    world.fillStyle = "rgba(4,4,8,.6)";
    world.fillRect(0, 0, low.width, low.height);
  }

  /** Une zone cliquable autour d'un pavé du monde, étendue vers le bas pour couvrir son étiquette. */
  boxHit(kind, { x, y, w, d, h }) {
    const corners = [[x, y, 0], [x + w, y + d, 0], [x + w, y, h], [x, y + d, h], [x, y, h], [x + w, y + d, h]];
    const points = corners.map(([a, b, c]) => this.toScreen(a, b, c));
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    this.hits.push({ kind, x0: Math.min(...xs) - 6, y0: Math.min(...ys) - 6, x1: Math.max(...xs) + 6, y1: Math.max(...ys) + 24 });
  }

  addHits() {
    const [b0x, b0y] = this.toScreen(...WALL_BOARD.from);
    const [b1x, b1y] = this.toScreen(...WALL_BOARD.to);
    this.hits.push({ kind: "board", x0: Math.min(b0x, b1x), y0: Math.min(b0y, b1y), x1: Math.max(b0x, b1x), y1: Math.max(b0y, b1y) });
    this.boxHit("queue", QUEUE_SHELF);
    this.boxHit("chest", CHEST);
    for (const [role, actor] of Object.entries(this.actors)) {
      const [fx, fy] = this.toScreen(actor.x, actor.y, 0);
      const [, hy] = this.toScreen(actor.x, actor.y, this.tops[role] ?? 1.3);
      this.hits.push({ kind: role === "chef" ? "chef" : "actor", role, x0: fx - 22, y0: hy - 4, x1: fx + 22, y1: fy + 20 });
    }
  }

  draw(t) {
    const { screen, canvas, low, dpr } = this;
    this.hits = [];
    this.drawWorld(t);
    screen.setTransform(1, 0, 0, 1, 0, 0);
    screen.clearRect(0, 0, canvas.width, canvas.height);
    screen.imageSmoothingEnabled = false;
    screen.drawImage(low, 0, 0, low.width * PX * dpr, low.height * PX * dpr);
    screen.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.addHits();
    const frame = { view: this.view, actors: this.actors, tops: this.tops, hover: this.hover, hits: this.hits, t };
    this.overlay(screen, { ...frame, toScreen: (x, y, z) => this.toScreen(x, y, z) });
  }

  hitAt(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return [...this.hits].reverse().find((hit) => x >= hit.x0 && x <= hit.x1 && y >= hit.y0 && y <= hit.y1) ?? null;
  }

  hoverAt(event) {
    const hit = this.hitAt(event);
    this.canvas.style.cursor = hit ? "pointer" : "default";
    this.hover = hit ? { kind: hit.kind, role: hit.role ?? null } : null;
  }
}
