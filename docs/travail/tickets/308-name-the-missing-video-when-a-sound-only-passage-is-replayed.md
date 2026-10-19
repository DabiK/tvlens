---
id: T308
titre: Name the missing video when a sound-only passage is replayed
statut: a-faire
bloque_par: T305
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Demander le rejeu d'un passage son seul renvoie un refus qui dit la vraie raison (le passage n'a que le son), au lieu
de « Média expiré. », qui laisse croire que le fichier a disparu.

## Sources

- Réserve de clôture de T304 (relecture de l'orchestrateur, 19/10) : `server/session-routes.cjs:16-21`,
  `unavailableMedia('images-absent')` tombe sur le cas par défaut, 410 `media-expired`.
- Code à `26f9e45` :
  - `server/session-routes.cjs:16-21` (`unavailableMedia`), `:28-30` (refus d'un passage non rejouable) ;
  - un passage déclaré son seul porte `available: false` et `mediaReason: 'images-absent'` (`core/session.cjs:35-37`),
    sauvegardé ou récupéré (T304) ;
  - le Mac et la TV nomment déjà ce cas à l'écran : `app/ui/sessions-view.mjs:10-22`, `tv/app/chat-view.js:17-23`.
- Test : `tests/server-routes.test.cjs:960-972` (table des raisons et codes, deux routes).

## Périmètre

- À modifier : `server/session-routes.cjs`, `tests/server-routes.test.cjs` (une ligne de plus dans la table) ; si les
  codes publics sont listés, `server/http.cjs` (`APPLICATION_CODES`).
- Raison `images-absent` : 410, message « Ce passage n'a que le son : aucune vidéo à rejouer. », code nommé
  `media-images-absent`. Les autres raisons gardent leur message et leur code.
- À ne pas toucher : le cœur, les vues du Mac et de la TV, le rejeu du son lui-même (décision produit à part).

## Critères d'acceptation

1. Passage `available: false`, `mediaReason: 'images-absent'` : les deux routes de média répondent 410 avec le
   message et le code nommés. Le test échoue avant la correction.
2. Les lignes existantes de la table de `tests/server-routes.test.cjs` passent sans modification.
3. `node scripts/check.mjs`.

## Test d'acceptation attendu

`tests/server-routes.test.cjs` : la raison `images-absent` dans la table des refus de média.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- 19/10, orchestrateur : ticket ouvert depuis la réserve de clôture de T304.
