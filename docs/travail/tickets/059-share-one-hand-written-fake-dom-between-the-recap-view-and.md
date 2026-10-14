---
id: T059
titre: Share one hand-written fake DOM between the recap view and overlay card tests
statut: a-faire
bloque_par: T028, T145
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Deux fichiers de test écrivent chacun leur faux document, avec des nœuds qui n'ont pas les mêmes
opérations. Après ce ticket, `tests/helpers/fake-dom.cjs` fournit un seul faux document minimal, écrit
à la main et testé, et ces deux fichiers l'utilisent. Aucune bibliothèque DOM n'est installée.

## Sources

- Constats : TSTC-06
- Code vérifié à la version `0d5a954` (le nom d'abord, la ligne ensuite) :
  - `tests/architecture-f09.test.cjs` : `function page()`, ligne 227 — `createElement` rend un nœud
    `{ tag, className, textContent, dataset, attributes, children, setAttribute, append,
    replaceChildren, querySelectorAll: () => [] }` ; installé par `globalThis.document = page();
    t.after(() => { delete globalThis.document; })`, ligne 244 ; lu par les aides `marked` et `texts`,
    lignes 232-233.
  - `tests/tv-overlay-queue.test.cjs`, test « renderCard builds inert boxes only and empties the node
    when there is nothing to draw » : `const element = tag =>`, ligne 228 — nœud `{ tag, children,
    attributes, className, textContent, hidden, ownerDocument, firstChild, appendChild, removeChild,
    setAttribute }` ; liste `made` des nœuds créés, ligne 227, vidée ligne 238 et lue par l'assertion
    « no focusable element », ligne 248 ; `const doc`, ligne 236.
  - À laisser en place : le conteneur de liste de `tests/mac-ui.test.cjs` (`const container`, ligne 529) et le
    faux canevas de `tests/recording.test.cjs` (`document: { createElement`, ligne 26), qui ne sont pas des documents.
  - `tests/chat-error-ui.test.cjs:17` exige que `globalThis.document` soit indéfini : un document
    installé doit toujours être retiré à la fin du test.
  - `app/ui/recap-view.js:28` appelle `target.querySelectorAll('.recap-extra-sources[open]')` : le faux
    actuel répond toujours une liste vide.

## Périmètre

- À modifier :
  - `tests/helpers/fake-dom.cjs` (nouveau) : `fakeDocument()` rend `{ createElement, made }` ; un nœud
    porte l'union des deux formes actuelles (`tag`, `className`, `textContent`, `hidden`, `dataset`,
    `attributes`, `children`, `ownerDocument`, `firstChild`, `setAttribute`, `append`, `appendChild`,
    `removeChild`, `replaceChildren`, `querySelectorAll`) ; `made` liste les nœuds créés ;
    `installDocument(t)` pose le faux document sur `globalThis.document`, le retire à la fin du test et
    le rend ;
  - `tests/fake-dom.test.cjs` (nouveau) ;
  - `tests/architecture-f09.test.cjs` et `tests/tv-overlay-queue.test.cjs` : utilisent le module, leurs
    définitions locales disparaissent.
- À ne pas toucher : `app/`, `tv/` et tout le code de production ; `tests/mac-ui.test.cjs` ;
  `tests/recording.test.cjs` ; les titres des tests et les valeurs attendues.
- Limite voulue, à écrire en commentaire d'en-tête du module : pas de sélecteurs. `querySelectorAll`
  répond toujours une liste vide, comme aujourd'hui ; un test qui a besoin de sélecteurs ou d'attributs
  reflétés (`open`) ne relève pas de ce faux document.
- Aucune dépendance installée. Aucune ligne de plus de 160 caractères dans les fichiers créés ni
  ajoutée ailleurs.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `grep -nE "^function page\(|const element = " tests/architecture-f09.test.cjs tests/tv-overlay-queue.test.cjs`
   ne sort rien, et les deux fichiers importent `./helpers/fake-dom.cjs`.
2. `tests/fake-dom.test.cjs` prouve au moins : `append`, `appendChild`, `removeChild` et
   `replaceChildren` tiennent `children` et `firstChild` à jour ; `setAttribute` remplit `attributes` ;
   un nœud créé porte son document dans `ownerDocument` et figure dans `made` ; `installDocument(t)`
   pose `globalThis.document` et il est de nouveau indéfini une fois le test terminé.
3. `grep -c "^\s*test(" ` donne toujours 9 pour `tests/architecture-f09.test.cjs` et 10 pour
   `tests/tv-overlay-queue.test.cjs`, et `git diff -U0 HEAD -- tests/architecture-f09.test.cjs
   tests/tv-overlay-queue.test.cjs | grep -E "^-.*assert\."` ne sort rien.
4. `node --test --test-concurrency=1 tests/fake-dom.test.cjs tests/architecture-f09.test.cjs
   tests/tv-overlay-queue.test.cjs tests/chat-error-ui.test.cjs` passe.
5. `grep -n "require(" tests/helpers/fake-dom.cjs` ne sort rien : le module n'importe rien.
6. `node scripts/check.mjs` est vert.

Si un autre lot a renommé `tests/architecture-f09.test.cjs`, le retrouver par
`grep -ln "renderRecapView" tests/*.test.cjs`.

## Test d'acceptation attendu

Nouveau fichier `tests/fake-dom.test.cjs`, à la frontière du module (critère 2). Les tests existants
« the Mémoire view says a ceiling as a ceiling… » et « renderCard builds inert boxes only… » restent
la preuve que les deux vues se dessinent comme avant sur le document partagé.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si l'un des deux tests ne passe sur le document partagé qu'avec un
comportement que l'autre contredit : verdict BLOQUÉ, avec l'opération en cause.

## Journal
