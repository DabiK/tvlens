// Les fenêtres : le tableau des quêtes, les listes de la file et du coffre, et la fiche d'un ticket. Une fiche est lue
// sur le serveur au moment où on l'ouvre ; son texte s'affiche comme du texte.
import { h, fill, markdown } from "./dom.js";
import { boardColumns } from "./model.js";

const STATUS = { "a-faire": "à faire", "en-cours": "en cours", termine: "terminé", bloque: "bloqué" };
// Assez de cartes pour une colonne qu'on parcourt ; la recherche trouve les autres.
const CARDS_PER_COLUMN = 40;

const showModal = (dialog) => {
  if (!dialog.open) dialog.showModal();
};

/** Fermer d'un clic hors du contenu, ou par Échap comme toute fenêtre modale. */
function closeOnBackdrop(dialog) {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}

export class Panels {
  constructor(elements, { fetchJson }) {
    Object.assign(this, elements, { fetchJson });
    this.state = null;
    this.filter = "all";
    this.search = "";
    closeOnBackdrop(this.boardModal);
    closeOnBackdrop(this.sheet);
    this.closeBoard.addEventListener("click", () => this.boardModal.close());
    this.searchInput.addEventListener("input", () => {
      this.search = this.searchInput.value;
      this.renderBoard();
    });
    for (const button of this.filterSeg.querySelectorAll("button")) button.addEventListener("click", () => this.setFilter(button.dataset.filter));
  }

  update(state) {
    this.state = state;
    if (this.boardModal.open) this.renderBoard();
  }

  setFilter(filter) {
    this.filter = filter;
    for (const button of this.filterSeg.querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.filter === filter));
    this.renderBoard();
  }

  openBoard(filter) {
    if (filter) this.setFilter(filter);
    else this.renderBoard();
    showModal(this.boardModal);
  }

  renderBoard() {
    if (!this.state) return;
    const columns = boardColumns(this.state.tickets, { liveId: this.state.view.ticket?.id ?? null, filter: this.filter, search: this.search });
    this.count.textContent = String(this.state.tickets.length);
    const card = (entry) => h("button", {
      class: ["card", entry.live && "playing", entry.ask && "ask", entry.done && "done"].filter(Boolean).join(" "),
      onclick: () => this.openTicket(entry.id),
    }, h("div", { class: "id" }, h("span", {}, entry.id), h("span", {}, entry.mark)), h("div", { class: "t" }, entry.titre));
    fill(this.board, columns.map((column) => h("div", { class: column.ask ? "col ask" : "col" },
      h("h3", {}, column.name, h("b", {}, String(column.cards.length))),
      h("div", { class: "cards" },
        column.cards.length ? column.cards.slice(0, CARDS_PER_COLUMN).map(card) : h("div", { class: "none" }, "Rien ici."),
        column.cards.length > CARDS_PER_COLUMN ? h("div", { class: "more" }, `+ ${column.cards.length - CARDS_PER_COLUMN}`) : null))));
  }

  /** Une liste de quêtes (`queueList` ou `chestList` du modèle) ; chaque ligne ouvre sa fiche. */
  openList(list) {
    const row = (entry) => h("li", {}, h("button", { onclick: () => this.openTicket(entry.id) },
      h("b", {}, entry.id), h("span", {}, entry.titre, entry.tag ? h("i", { class: "tag" }, entry.tag) : null), h("em", {}, entry.meta ?? "")));
    const sections = list.sections.map((section) => [
      section.name ? h("h4", {}, section.name) : null,
      section.rows.length ? h("ol", { class: "qlist" }, section.rows.map(row)) : h("p", { class: "sub" }, "Rien pour l'instant."),
    ]);
    fill(this.sheetBody, this.closeButton(), h("div", { class: "kicker" }, list.kicker), h("h1", {}, list.title),
      list.sub ? h("p", { class: "sub" }, list.sub) : null, sections);
    showModal(this.sheet);
    this.sheetBody.scrollTop = 0;
  }

  closeButton() {
    return h("button", { class: "close", onclick: () => this.sheet.close() }, "FERMER");
  }

  async openTicket(id) {
    const ticket = this.state?.tickets.find((entry) => entry.id === id);
    if (!ticket) return;
    const meta = [ticket.niveau && `niveau ${ticket.niveau}`, ticket.bloquePar.length && `après ${ticket.bloquePar.join(", ")}`, ticket.harnais && "harnais"]
      .filter(Boolean).map((text) => h("span", {}, text));
    const ask = ticket.decisionAttendue && ticket.statut === "a-faire" ? h("div", { class: "ask" }, h("b", {}, "TA DÉCISION"), ticket.decisionAttendue) : null;
    const body = h("div", {}, h("p", { class: "sub" }, "Lecture de la fiche…"));
    fill(this.sheetBody, this.closeButton(), h("div", { class: "kicker" }, `${id} · ${(STATUS[ticket.statut] ?? ticket.statut).toUpperCase()}`),
      h("h1", {}, ticket.titre), h("div", { class: "meta" }, meta), ask, body);
    showModal(this.sheet);
    this.sheetBody.scrollTop = 0;
    const found = await this.fetchJson(`/api/ticket?id=${encodeURIComponent(id)}`).catch(() => null);
    if (!found) return fill(body, h("p", { class: "sub" }, "Fiche introuvable."));
    fill(body, markdown(found.text.replace(/^---\n[\s\S]*?\n---\n?/, "")));
  }
}
