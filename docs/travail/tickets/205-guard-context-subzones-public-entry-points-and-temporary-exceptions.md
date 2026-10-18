---
id: T205
titre: Guard context subzones, public entry points and temporary exceptions
statut: termine
bloque_par: T202, T228
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

La garde sait déclarer les contextes, leurs points d'entrée publics et les exceptions de migration
qui doivent disparaître. Un nouveau sous-dossier impose des permissions explicites à ses consommateurs,
et un domaine ne peut importer celui d'un autre contexte, même par son point d'entrée.

## Sources

- `docs/domaine.md`, sections 6 à 8 ; ADR 0029 et 0030 : la garde précède les sous-zones et les
  extractions. T025 est intégré (`f9cb0e9`) ; T030 ajoute les frontières présentation/paquets/état,
  T202 le stock du temps global et la table des modules purs. Relire leur garde livrée et la prolonger.
- Code vérifié à `dd5efc9` : table `tests/architecture.test.cjs:7`, sélection de zone au préfixe
  le plus long à `:16`, résolution fichier/extensions/index à `:103`, inventaire partagé à `:121`.
  `tests/architecture.test.cjs:150` exige le motif exact de destination dans les permissions source.
- `tests/architecture-guard.test.cjs:27` copie la vraie garde dans un arbre temporaire ; `:38`
  exige que les gardes sélectionnées s'exécutent. Son cas à `:291` prouve déjà la sélection de
  sous-zone côté origine et destination, mais ne propose ni entrée publique ni exception temporaire.
- Appelant : `scripts/check.mjs:167` pour la découverte, `:173` pour l'exécution séquentielle. T201 prévoit aussi
  `core/shared/domain-error.cjs` : il peut avoir créé le noyau avant cette garde, contrairement à
  l'hypothèse « première sous-zone dans T206 ». Aucun second diffuseur ou catalogue n'en découle.
- Limite actuelle : `tests/architecture.test.cjs:57` et `:98` ne relèvent ni imports calculés,
  ni imports dans interpolations, ni spécificateurs entre accents graves. Ce ticket n'étend pas le lexer.

## Périmètre

- Modifier `tests/architecture.test.cjs`, `tests/architecture-guard.test.cjs` et `CONTRIBUTING.md` ;
  écrire un ADR court qui applique les frontières acceptées et décrit les exceptions transitoires.
  Réutiliser l'inventaire et la table uniques ; ne créer aucun sous-dossier produit ni paquet.
- Ajouter aux données de zone les informations nécessaires pour reconnaître contexte, couche,
  noyau partagé et point d'entrée. Garder la sélection du motif le plus précis et l'absence
  d'héritage implicite : autoriser `core/**` n'autorise pas `core/memory/**`.
- Pour un consommateur extérieur à un contexte, seule son entrée résolue `core/<contexte>/index.cjs`
  est accessible, après permission explicite. Un import de dossier résolu vers cet index est
  équivalent ; un chemin normalisé vers un module interne reste interdit. Les imports internes au
  même contexte sont permis suivant sa zone ; `core/shared/` est un noyau, pas un autre contexte.
- Refuser domaine A → domaine B, index compris, même si une permission de table l'autoriserait.
  `runtime/<contexte>/` peut lire une entrée publique étrangère si sa permission le déclare.
  Aucune permission produit nouvelle ne doit être déduite d'un simple préfixe anglais.
- Le code plat (`core/*.cjs` et `runtime/*.cjs` hors sous-dossier) n'appartient à aucun contexte,
  et l'interdiction entre domaines ne s'y applique pas. Il atteint un contexte par son entrée
  publique, avec une permission. Un module de contexte n'atteint un module plat que par une
  exception temporaire exacte, jusqu'au rangement de ce module.
- Une exception temporaire déclare nom stable, fichier source, destination résolue exacte et raison.
  Elle ne couvre qu'une arête de migration ; aucun joker de dossier. Elle échoue si son fichier ou
  son import disparaît, ou si l'arête devient permise sans elle. Une exception ne lève pas les
  interdictions de globales, de temps, d'Electron ou de paquets. Aucune exception ne légalise
  domaine A → domaine B ; elle sert notamment aux façades et réexports transitoires du code plat.
- Exercer les contextes fictifs et leurs permissions seulement dans les copies temporaires.
  La ligne `core/shared/**`, déclarée ici si le dossier existe, sinon par T206, est importable par
  toute zone qui importe `core/**` et par chaque ligne de contexte. Un ticket qui ajoute un module
  au noyau, comme T201, ne modifie pas la garde. Aucune zone produit vide n'est nécessaire.
  Les tickets créant ensuite une zone doivent ajouter sa ligne et les permissions de leurs lecteurs.
- Ne modifier ni produit, harnais, planchers, dépendances ou règles livrées par T030/T202.

## Critères d'acceptation

1. Dans l'arbre temporaire, un import permis vers `core/**` devient refusé après déclaration de
   `core/memory/**`. Le diagnostic donne source, destination, zones retenues et permission précise
   manquante. Son ajout rend vert seulement l'import public autorisable, pas les modules internes.
2. Depuis une application, `core/memory/index.cjs` et son import de dossier résolu passent avec
   permission ; un fichier interne échoue malgré cette permission. Même contexte vers module
   interne et contexte vers noyau partagé ont leurs cas verts ; chaque faute retirée revient au vert.
   `core/session.cjs` → `core/memory/index.cjs` passe avec permission.
   `core/memory/lanes.cjs` → `core/passage-text.cjs` échoue sans exception et passe avec une
   exception exacte. Les deux chemins sont des fixtures de l'arbre temporaire.
3. Depuis `core/inquiry/`, importer l'entrée ou un module de `core/memory/` échoue, même avec
   permission artificielle. Le diagnostic explique l'interdiction de domaine, sans conseiller une
   permission qui la contournerait. Depuis `runtime/inquiry/`, seule l'entrée permise passe.
4. Une exception exacte autorise une arête de façade de fixture. Changer la source ou la destination
   reste rouge ; retirer l'import, retirer le fichier ou rendre l'arête normalement permise rend
   l'exception inutile et fait échouer la garde jusqu'à suppression de sa déclaration.
5. Les nouvelles preuves utilisent les formes d'import et résolutions déjà reconnues, commentaires
   ignorés. Les cas de T030/T202 continuent à s'exécuter réellement, y compris si les filtres de
   nom évoluent. Les sorties distinguent refus de politique et défaut du banc.
6. La garde passe sur le dépôt ; journal des zones existantes et permissions réellement ajoutées.
   À l'implémentation, exécuter architecture puis architecture-guard en séquentiel, les suites TV
   affectées par leurs fixtures, puis `node scripts/check.mjs`. Aucun cas ni plafond ne baisse.

## Test d'acceptation attendu

`tests/architecture-guard.test.cjs` conduit la vraie garde sur des arbres temporaires complets.
Le premier scénario retire le droit implicite à un consommateur lors de la déclaration d'une sous-zone,
puis prouve que permission, entrée publique et interdiction entre domaines sont trois contrôles distincts.

## Hypothèses bloquantes

Aucune décision n'est attendue.

La table livrée après T030/T202 sera lue au démarrage : les repères présents décrivent `dd5efc9`,
pas leur implémentation future. Les chemins calculés et gabarits restent une limite nommée de la
garde lexicale. Une arête produit contraire à la cible est signalée, sans permission large ajoutée
pour masquer le conflit. Le stock gelé du temps et les gardes existantes restent indépendants.

## Journal

- Exploration : règles, skill, garde, banc, appelant et ADR lus ; état initial conservé dans
  `.harness-state/tickets/T205/exploration.md`. Six zones racines, aucun contexte produit ; noyau
  `core/shared/` déjà présent. Aucun écart prévu (`ecarts.md`).
- Tests d'abord, sorties conservées dans `.harness-state/tickets/T205/` :
  `node --test --test-name-pattern='^context declaration' tests/architecture-guard.test.cjs` :
  rouge sur le diagnostic manquant, puis 1/1 vert (`subzone-red.log`, `subzone-green.log`).
  `node --test --test-name-pattern='^context domains' tests/architecture-guard.test.cjs` :
  rouge sur le refus entre domaines ; `node --test --test-name-pattern='^context ' tests/architecture-guard.test.cjs` :
  12/12 verts après implémentation (`domain-red.log`, `domain-green.log`). Lors de l'élargissement,
  deux fixtures de commentaires multilignes laissaient un import actif ; corrigées sans changement du lexer.
- `node --test --test-name-pattern='^context modules require' tests/architecture-guard.test.cjs` :
  rouge observé (import accepté à tort), puis 1/1 vert (`flat-red.log`, `flat-green.log`).
  `node --test --test-name-pattern='^migration exceptions permit' tests/architecture-guard.test.cjs` :
  rouge sur les arêtes exactes encore refusées, puis 2/2 verts (`migration-red.log`, `migration-green.log`).
- `node --test --test-name-pattern='^migration exceptions (expire|require|reject)' tests/architecture-guard.test.cjs` :
  rouge sur les exceptions inutiles ou invalides ; `node --test --test-name-pattern='^migration exceptions' tests/architecture-guard.test.cjs` :
  14/14 verts après validation (`exception-validation-red.log`, `exception-validation-green.log`).
- `node --test --test-name-pattern='^guard fixture reports' tests/architecture-guard.test.cjs` :
  rouge sur l'identification du défaut du banc. Après correction,
  `node --test --test-name-pattern='^(context |migration exceptions|guard fixture reports)' tests/architecture-guard.test.cjs` :
  35/35 verts (`bench-red.log`, `context-migration-green.log`), dont les gardes indépendantes du temps et de pureté.
- Zones réellement ajoutées : uniquement `core/shared/**`, déjà présent. Permission exacte ajoutée
  à `core/**`, `adapters/**`, `runtime/**`, `server/**`, `mcp/**`, `app/**` ; noyau limité à lui-même.
  Aucun contexte ou exception produit ajouté. `node --test tests/architecture.test.cjs` : 10/10 verts
  (`architecture.log`) ; arêtes vers le noyau observées : 5 depuis `core/**`, 2 depuis `adapters/**`.
- Banc complet avant nettoyage : `node --test tests/architecture-guard.test.cjs` : 472/472 verts
  (`architecture-guard.log`). `node_modules/.bin/eslint tests/architecture.test.cjs tests/architecture-guard.test.cjs` :
  rouge sur un échappement inutile et une complexité de 17 ; extraction de la vérification d'une
  arête et correction de la regex, puis lint vert sans suppression (`lint-red.log`, `lint-green.log`).
  `node --test tests/architecture.test.cjs` relancé après nettoyage : 10/10 verts (`architecture-final.log`).
- Après nettoyage, exécution séquentielle : `node --test tests/architecture.test.cjs` : 10/10 verts ;
  `node --test tests/architecture-guard.test.cjs` : 472/472 verts (`architecture-guard-final.log`) ;
  `node --test --test-concurrency=1 tests/tv-*.test.cjs` : 149/149 verts (`tv-suites.log`).
  `git diff --check` : vert. ADR 0044 et consignes de déclaration ajoutés à `CONTRIBUTING.md`.
- `node scripts/check.mjs --changed` : vert (règles, format, lint, gel du lint, cliquet ;
  482 tests JS réussis dans les deux fichiers modifiés). Le compteur textuel des cas produit
  passe de 1211 à 1228, sans modifier son plancher (`check-changed.log`).
- Premier contrôle complet `node scripts/check.mjs` : règles, format, lint, gel et cliquet verts ;
  2349/2350 tests JS réussis, 47 tests Python réussis. Seul échec : lien de `CONTRIBUTING.md` vers
  l’ADR 0044 encore non suivie par Git, exclue volontairement de l'inventaire documentaire.
  `node --test tests/documentation-index.test.cjs` reproduit le rouge (10/11, `documentation-index-red.log`).
  Référence conservée sous forme de chemin explicite ; même commande : 11/11 verts
  (`documentation-index-green.log`). Aucune assertion modifiée. Réserve d'indexation de l'ADR dans
  `docs/architecture.md` après intégration consignée dans `ecarts.md` ; ce fichier est hors périmètre.
- Contrôle final `node scripts/check.mjs` : **vert**, 2350/2350 tests JavaScript et 47 tests Python
  réussis ; règles, format, lint, gel et cliquet verts (`check-full-final.log`). `git diff --check` : vert.
  Verdict `TERMINÉ` dans `.harness-state/tickets/T205/verdict.json`, avec la réserve documentaire
  d’indexation de l’ADR 0044 à l’intégration. Aucun commit ni push ; relecture laissée à la boucle.
- Reprise après relecture 1 : rapport, ticket/journal, écarts, état Git et diff relus ; trois constats
  mineurs acceptés, aucun nouveau périmètre. Validation des métadonnées, diagnostic neutre et
  preuve séparée des zones/permission prévus dans `ecarts.md`, tests d'abord. Les deux constats
  hors périmètre seront transmis par la boucle depuis le rapport, sans duplication dans `reste`.
- Constat 1 : `node --test --test-name-pattern='^zone metadata' tests/architecture-guard.test.cjs` :
  12 rouges observés sur des déclarations acceptées à tort (`correction-1-metadata-red.log`).
  Validation ajoutée ; `node --test --test-name-pattern='^(zone metadata|context |layer table selects)' tests/architecture-guard.test.cjs` :
  26/26 verts (`correction-1-metadata-green.log`). L'ancien cas de sous-zone conserve toutes ses
  assertions et déclare désormais sa couche, son contexte et son entrée.
- Constat 1, noyau : `node --test --test-name-pattern='^zone metadata rejects a context replacing' tests/architecture-guard.test.cjs` :
  rouge observé si un contexte remplace le marqueur du noyau (`correction-1-kernel-marker-red.log`).
  Marqueur rendu obligatoire pour la zone du noyau ; `node --test --test-name-pattern='^zone metadata' tests/architecture-guard.test.cjs` :
  13/13 verts (`correction-1-kernel-marker-green.log`). Consignes et ADR mis en cohérence.
- Constats 2 et 3 : `node --test --test-name-pattern='^(layer diagnostics|context declaration)' tests/architecture-guard.test.cjs` :
  3 rouges puis 3 verts (`correction-1-diagnostic-red.log`, `correction-1-diagnostic-green.log`).
  Permission décrite sans impératif ; le test du critère 1 exige séparément la paire de zones et le
  droit précis manquant pour sa zone source, ainsi que les deux chemins.
- Sensibilité du constat 3 : `node .harness-state/tickets/T205/correction-1-diagnostic-sensitivity.cjs` :
  deux mutations dans des copies temporaires refusées sur les assertions respectives (zones retirées,
  détail de permission retiré), puis témoin non modifié vert (`correction-1-diagnostic-sensitivity.log`
  et journaux `zones`, `permission`, `control`). Le premier script attendait un champ TAP `expected`
  absent de cette sortie : correction du détecteur pour lire l'assertion réellement affichée, sans
  changer les tests ; première sortie conservée dans `correction-1-diagnostic-sensitivity-bench-red.log`.
- Validation après correction, en séquentiel : `node --test tests/architecture.test.cjs` : 10/10 verts
  (`correction-1-architecture.log`) ; `node --test tests/architecture-guard.test.cjs` : 487/487 verts
  (`correction-1-architecture-guard.log`) ; `node --test --test-concurrency=1 tests/tv-*.test.cjs` :
  149/149 verts (`correction-1-tv.log`). Lint des deux fichiers et `git diff --check` verts.
- `node scripts/check.mjs --changed` après correction : **vert**, 497 tests JS réussis ; règles,
  format, lint, gel et cliquet verts (`correction-1-check-changed.log`). Le compteur textuel des
  cas produit monte à 1232, sans modification du plancher. Le contrôle complet est lancé.
- Contrôle complet après correction : `node scripts/check.mjs` : **vert**, 2365/2365 tests JS
  et 47 tests Python réussis, règles/format/lint/gel/cliquet verts (`correction-1-check-full.log`).
  `git diff --check` : vert. Constats 1, 2 et 3 corrigés ; nouveau verdict `TERMINÉ`, aucune
  réserve propre. Constats hors périmètre transmis par la boucle depuis le rapport accepté.
  Aucun commit ni push ; relecture laissée à la boucle.
- Reprise après relecture 2 : rapport, ticket/journal, écarts, état Git et diff relus ; constat mineur
  sur la couche non contrôlée accepté. Correction prévue dans `ecarts.md` : cohérence racine/couche,
  sans exiger de contexte pour `runtime/compose/`. Trois constats hors périmètre laissés à la boucle.
- Relecture 2, constat 1 : ajout de trois couches erronées à la fixture `core/memory/**`, sans contexte
  ni entrée, et de cinq sous-zones couvrant les autres racines. Commande ciblée :
  `node --test --test-name-pattern='^zone metadata rejects (an application layer|an adapter layer|a host layer|a .* layer under)' tests/architecture-guard.test.cjs` :
  8/8 rouges sur des lignes acceptées à tort (`correction-2-layer-red.log`). Association fixe de la
  racine à sa couche ajoutée avant la validation des rôles, sans permissions ni inventaire associés.
  `node --test --test-name-pattern='^zone metadata' tests/architecture-guard.test.cjs` : 21/21 verts
  (`correction-2-layer-green.log`). Le cas `runtime/compose/**` redevient vert avec sa couche correcte,
  sans contexte. Consignes et ADR explicitent la contrainte.
- Validation séquentielle après correction de la relecture 2 :
  `node --test tests/architecture.test.cjs` : 10/10 verts (`correction-2-architecture.log`) ;
  `node --test tests/architecture-guard.test.cjs` : 495/495 verts (`correction-2-architecture-guard.log`) ;
  `node --test --test-concurrency=1 tests/tv-*.test.cjs` : 149/149 verts (`correction-2-tv.log`).
  Lint des deux fichiers vert (`correction-2-lint.log`) et `git diff --check` vert.
- `node scripts/check.mjs --changed` : **vert**, 505 tests JS réussis ; règles, format, lint, gel
  et cliquet verts (`correction-2-check-changed.log`). Compteur textuel produit à 1233, sans changer
  le plancher. Contrôle complet lancé sur cet état.
- Contrôle complet après correction de la relecture 2 : `node scripts/check.mjs` : **vert**,
  2373/2373 tests JS et 47 tests Python réussis ; règles/format/lint/gel/cliquet verts
  (`correction-2-check-full.log`). `git diff --check` : vert. Constat mineur 1 corrigé ; nouveau
  verdict `TERMINÉ`, aucune réserve propre. Les trois constats hors périmètre restent transmis
  par la boucle depuis le rapport de relecture. Aucun commit ni push.

### Réserves à la clôture

- .harness-state/tickets/T205/relecture-3.md : 1. `tests/architecture.test.cjs:311-313` et `:353` : hors périmètre (constat 2 de la relecture 2, reconduit)

  **Problème.** Une exception de migration peut encore autoriser une arête qui va contre le sens des couches, par exemple `core/memory/x.cjs` → `runtime/module.cjs`. Le diagnostic du code plat conseille même d'en déclarer une dans ce cas. La correction n'a pas touché ce code. La table d'exceptions du produit est vide, donc rien ne régresse aujourd'hui.

  **Attendu.** Dans un ticket ultérieur :
  - limiter les exceptions aux arêtes dont la racine de destination est permise à la racine d'origine ;
  - ne pas conseiller d'exception pour une arête du domaine vers `runtime/`.

  En attendant, cela reste une réserve.
- .harness-state/tickets/T205/relecture-3.md : 2. `docs/architecture.md`, section « Décisions » : hors périmètre (reconduit)

  L'ADR 0044 doit y être indexé dès l'intégration. Sinon, `tests/documentation-index.test.cjs` sera rouge sur HEAD. La réserve est inchangée.
- .harness-state/tickets/T205/relecture-3.md : 3. `docs/architecture.md:17-21` : hors périmètre (reconduit)

  La table des couches ne mentionne ni `core/shared/**`, ni les métadonnées de contexte, ni les exceptions de migration. Elle ne dit pas non plus que la racine fixe la couche. La réserve est inchangée.
- .harness-state/tickets/T205/relecture-3.md : **Écart accepté, critère 6 (référence à l'ADR 0044 en chemin explicite) :** je maintiens la décision des relectures 1 et 2. Rien n'a changé sur ce point, et aucun test ni aucune assertion n'a été modifié.
