// Le terminal : le fil en direct de l'agent choisi, comme si on regardait sa session. Il ne redessine que les lignes qui
// changent, suit le bas tant qu'on n'est pas remonté, et dit franchement quand un agent n'écrit aucun fil.
import { h, fill } from "./dom.js";
import { cam, useContext } from "./draw.js";
import { CAST, CHEF, ROLES, activeRole, clock, duration, engineOf, feedSource, modelName, roleLabel } from "./model.js";
import { drawPerson, drawRobot } from "./people.js";

// À moins de cette distance du bas, le terminal suit les nouvelles lignes.
const FOLLOW_MARGIN = 24;
const PORTRAIT = { size: 18, scale: 0.44, lift: 28 };
const EVENT_NAMES = {
  session: "session", "session-terminee": "session finie", integre: "intégré", retro: "rétro", bloque: "bloqué",
  "tentative-refusee": "tentative refusée", "reprise-impossible": "reprise impossible", "push-refuse": "push refusé",
};

const output = (entry) => (entry.out?.length
  ? h("span", { class: "o" }, entry.out.join("\n"), entry.total > entry.out.length ? `\n… ${entry.total - entry.out.length} lignes de plus` : "")
  : null);

function status(entry) {
  if (entry.open) return h("span", { class: "run" }, "⠿ en cours");
  return entry.exit ? h("span", { class: "x" }, `exit ${entry.exit}`) : null;
}

const LINES = {
  phase: (entry) => h("div", { class: "ln phase" }, entry.label.toUpperCase()),
  say: (entry) => h("div", { class: "ln say" }, entry.text),
  think: () => h("div", { class: "ln think" }, "réflexion…"),
  cmd: (entry) => h("div", { class: "ln cmd" }, h("span", { class: "c" }, entry.cmd), status(entry), output(entry)),
  tool: (entry) => h("div", { class: "ln tool" },
    h("span", { class: "n" }, entry.name), " ", h("span", { class: "t" }, entry.target), status(entry), output(entry)),
  edit: (entry) => h("div", { class: "ln edit" }, entry.paths.join(", ")),
  spawn: (entry) => h("div", { class: "ln spawn" }, `lance ${entry.agent}${entry.text ? ` · ${entry.text}` : ""}`),
  todo: (entry) => h("div", { class: "ln todo" }, entry.items.map((item) => h("span", {}, `${item.done ? "■" : "□"} ${item.text}`))),
  warn: (entry) => h("div", { class: "ln warn" }, `! ${entry.text}`),
  turn: (entry) => h("div", { class: "ln turn" }, `— ${entry.text}`),
};
const lineOf = (entry) => (LINES[entry.k] ?? LINES.turn)(entry);

function eventLine(event) {
  let detail = "";
  if (event.phase === "session") detail = `${event.moteur ?? "claude"} · ${modelName(event.modele)} · tentative ${event.attempt ?? 1}`;
  if (event.phase === "session-terminee") detail = `${duration((event.duree_s ?? 0) * 1000)} · ${event.relectures ?? 0} relecture(s)`;
  if (event.phase === "integre") detail = `commit ${event.commit ?? "—"}`;
  if (event.phase === "retro") detail = `${event.observations ?? 0} observation(s)`;
  if (event.raison) detail = event.raison;
  const what = `${event.ticket ?? ""} ${EVENT_NAMES[event.phase] ?? event.phase}`;
  return h("div", { class: "ln ev" }, h("i", {}, clock(Date.parse(event.at))), h("b", {}, what), h("span", {}, detail));
}

/** Le buste d'un agent, dessiné avec les mêmes voxels que la scène. */
function portrait(canvas, role) {
  canvas.width = PORTRAIT.size;
  canvas.height = PORTRAIT.size;
  const context = canvas.getContext("2d");
  const saved = { ...cam };
  const previous = useContext(context);
  Object.assign(cam, { s: PORTRAIT.scale, x: PORTRAIT.size / 2, y: PORTRAIT.lift });
  context.setTransform(cam.s, 0, 0, cam.s, cam.x, cam.y);
  const actor = { x: 0, y: 0, face: "y+", path: [], walkT: 0, seed: 0 };
  if (ROLES[role]?.robot) drawRobot(actor, 0, false, false, "#6d6a58");
  else drawPerson(actor, role === "chef" ? CHEF.look : ROLES[role].look, 0, "idle");
  useContext(previous);
  Object.assign(cam, saved);
}

export class Terminal {
  constructor({ cast, head, body, jump }, { fetchJson }) {
    Object.assign(this, { cast, head, body, jump, fetchJson });
    this.role = null;
    this.state = null;
    this.feed = { key: null, agent: null, base: 0, entries: [], nodes: [] };
    this.shown = null;
    this.buttons = null;
    this.follow = true;
    this.cursor = h("span", { class: "cursor" });
    body.addEventListener("scroll", () => {
      this.follow = body.scrollHeight - body.scrollTop - body.clientHeight < FOLLOW_MARGIN;
      jump.classList.toggle("show", !this.follow);
    });
    jump.addEventListener("click", () => this.toBottom());
  }

  toBottom() {
    this.follow = true;
    this.body.scrollTop = this.body.scrollHeight;
    this.jump.classList.remove("show");
  }

  /** L'état venu du serveur ; sans agent choisi, le terminal suit celui qui travaille. */
  update(state) {
    this.state = state;
    this.role ??= activeRole(state.view) ?? "gardien";
    this.renderCast();
    this.renderSource();
  }

  select(role) {
    this.role = role;
    this.follow = true;
    this.renderCast();
    this.renderSource();
  }

  source() {
    return feedSource(this.role, this.state.view, this.state.agents);
  }

  /** Les portraits se dessinent une fois ; seuls le choix et le voyant de l'agent qui travaille changent ensuite. */
  renderCast() {
    this.buttons ??= CAST.map((role) => {
      const canvas = h("canvas");
      portrait(canvas, role);
      const dot = h("span", { class: "dot" });
      const button = h("button", { role: "tab", onclick: () => this.select(role) }, canvas, ROLES[role].short, dot);
      return { role, button, dot };
    });
    if (!this.cast.childElementCount) fill(this.cast, this.buttons.map((entry) => entry.button));
    const act = activeRole(this.state.view);
    for (const { role, button, dot } of this.buttons) {
      button.setAttribute("aria-selected", String(role === this.role));
      dot.className = role === act ? "dot on" : "dot";
    }
  }

  renderHead(source) {
    const { view } = this.state;
    const engine = engineOf(this.role, view);
    let detail = engine === "machine" ? "events.jsonl · le journal de la boucle" : `${engine} · ${this.modelOf()}`;
    if (source.kind === "feed" && source.agent === "codex") detail = `${modelName(view.ticket.modele)} · un seul fil pour l'exploration et l'implémentation`;
    if (source.kind === "feed" && source.agent === "orchestrateur") detail = "orchestrateur Claude · contrôles et verdict";
    const marks = { feed: ["● DIRECT", ""], journal: ["● JOURNAL", ""], review: ["○ ARCHIVE", "off"], none: ["○ HORS FIL", "off"] };
    const [mark, tone] = view.alive ? marks[source.kind] : ["■ ARRÊTÉE", "off"];
    fill(this.head, h("strong", {}, roleLabel(this.role, view).toUpperCase()), h("span", {}, detail), h("em", { class: tone }, mark));
  }

  modelOf() {
    const ticket = this.state.view.ticket;
    if (this.role === "relecteur") return modelName(ticket?.relecteur || "opus");
    if (this.role === "retro") return "Sonnet 5.5";
    return modelName(ticket?.modele);
  }

  /** Le contenu change seulement quand la source change ; un fil, lui, se complète à chaque sondage. */
  renderSource() {
    const source = this.source();
    this.renderHead(source);
    const id = this.state.view.ticket?.id ?? "";
    const identity = `${source.kind}:${source.agent ?? ""}:${id}:${source.kind === "journal" ? this.journalMark() : ""}`;
    if (identity === this.shown) return;
    this.shown = identity;
    if (source.kind === "journal") this.showJournal();
    if (source.kind === "none") fill(this.body, h("div", { class: "nofeed" }, h("b", {}, source.title.toUpperCase()), source.why));
    if (source.kind === "review") this.showReview(source, id);
    if (source.kind === "feed") this.showFeed();
  }

  journalMark() {
    const journal = this.state.journal ?? [];
    return `${journal.length}:${journal.at(-1)?.at ?? ""}`;
  }

  showJournal() {
    fill(this.body, (this.state.journal ?? []).map(eventLine), this.state.view.alive ? this.cursor : null);
    if (this.follow) this.toBottom();
  }

  async showReview(source, id) {
    fill(this.body, h("div", { class: "nofeed" }, h("b", {}, "PAS DE FIL EN DIRECT"), source.why));
    const review = await this.fetchJson(`/api/review?id=${encodeURIComponent(id)}`).catch(() => null);
    if (this.shown?.startsWith("review:") !== true) return;
    if (!review?.text) return this.body.append(h("div", { class: "ln turn" }, "— aucun rapport pour cette quête : il arrivera à la fin de la relecture."));
    this.body.append(h("div", { class: "ln phase" }, `RELECTURE-${review.rank}.MD · ${review.id}`), h("div", { class: "report" }, review.text));
  }

  showFeed() {
    this.feed = { key: null, agent: this.source().agent, base: 0, entries: [], nodes: [] };
    fill(this.body, this.cursor);
    this.poll();
  }

  /** Demande au serveur les lignes à partir de la première encore ouverte, et remplace à partir de là. */
  async poll() {
    const source = this.state ? this.source() : null;
    if (source?.kind !== "feed") return;
    const { feed } = this;
    const open = feed.entries.findIndex((entry) => entry.open);
    const since = feed.base + (open < 0 ? feed.entries.length : open);
    const page = await this.fetchJson(`/api/feed?agent=${encodeURIComponent(source.agent)}&since=${feed.key ? since : 0}`).catch(() => null);
    if (!page || page.agent !== this.feed.agent) return;
    this.apply(page);
  }

  apply(page) {
    const { feed } = this;
    let local = page.from - feed.base;
    if (page.key !== feed.key || local < 0 || local > feed.entries.length) {
      Object.assign(feed, { key: page.key, base: page.from, entries: [], nodes: [] });
      fill(this.body, this.cursor);
      local = 0;
    }
    for (const node of feed.nodes.splice(local)) node.remove();
    feed.entries.splice(local);
    for (const entry of page.entries) {
      const node = lineOf(entry);
      feed.entries.push(entry);
      feed.nodes.push(node);
      this.cursor.before(node);
    }
    this.cursor.hidden = !this.state.view.alive;
    if (this.follow && page.entries.length) this.toBottom();
  }
}
