---
id: T184
titre: Handle or justify every empty catch in the core
statut: termine
bloque_par: T177
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Chaque `catch` vide du cœur reçoit une gestion vérifiée de son erreur ou un commentaire précis
justifiant la poursuite. Les défauts qui dépassent une petite correction sont nommés en réserve,
avec leurs conséquences et preuves manquantes. Le cliquet baisse sans changer sa définition.

## Sources

- `docs/audit-points-chauds.md`, section A « Cliquet », 40 `catch` vides produit au relevé initial.
  Décision du propriétaire, le 15/10 : compléter T176/T177 par les six occurrences du cœur.
- Définition vérifiée à `e92c6a6` : `scripts/quality/metrics.mjs:10` reconnaît un corps `catch`
  composé seulement d’espaces ; `:35` le compte et `:6` donne le périmètre produit.
  `scripts/quality/baseline.json:4` fixe le maximum à 40. Le relevé statique trouve six cas dans
  `core/` ; les callbacks fléchés de rejet vides ne sont pas comptés par cette définition.
- Repères vérifiés à `e92c6a6` :

| Repère | Opération et comportement actuel |
| --- | --- |
| `core/deep-ask.cjs:22` | `trace` protège le callback injecté `onTrace` ; un diagnostic ne fait pas échouer le job. |
| `core/deep-ask.cjs:37` | `release` protège la libération des outils ; le refus ne remonte ni au job ni à la file. |
| `core/deep-ask.cjs:67` | `start` tente `tools.availability` ; en cas d’erreur l’information de disponibilité reste absente. |
| `core/deep-ask.cjs:113` | `run` lit `getInstruction` en mode chat ; sans consigne lisible, l’agent continue sans ce champ. |
| `core/deep-ask.cjs:148` | `run` tente `tools.freshness` pour les métriques finales ; leur absence ne fait pas échouer le job. |
| `core/moment-search.cjs:129` | `search` lit `index.passageVector` ; un cache illisible retire seulement la part sémantique de ce passage. |

- Frontières publiques : `DeepAsk.start`, instantanés publiés et fin du job dans
  `core/deep-ask.cjs:55`, `:25`, `:69` ; `MomentSearch.search`, `core/moment-search.cjs:48`.
  Tests protecteurs : `tests/deep-ask-restore.test.cjs`, `tests/chat-trace.test.cjs`,
  `tests/chat-instruction.test.cjs`, `tests/moment-index.test.cjs` et `tests/session-latency.test.cjs`.
  Leur présence ne prouve pas que chaque refus est déjà exercé : inventorier leurs assertions.
- T176 possède les adaptateurs, T177 app/runtime/server/TV ; ce ticket ferme l’inventaire du cœur.

## Périmètre

- Refaire l’inventaire au lancement et traiter les occurrences encore présentes dans `core/`,
  y compris déplacées dans ce répertoire. Une suppression antérieure, notamment de code mort par
  T100, n’est pas recréée ni comptée comme une gestion ajoutée ici.
- Pour une erreur déjà traduite ou une opération facultative, écrire dans le `catch` la conséquence
  précise et le chemin qui permet de continuer. Une petite gestion nouvelle utilise les résultats
  et ports injectés existants et possède un test provoquant le refus.
- Ne pas déclarer un échec de libération sans conséquence si cette propriété reste inconnue.
  Les réserves nomment fichier, opération, conséquence, preuve manquante et travail requis ;
  documenter le contrat conservé et sa limite sans masquer un défaut par « erreur ignorée ».
- Conserver les contrats informatifs de trace, disponibilité, consigne et fraîcheur. Pour un cache
  vectoriel illisible, préserver classement lexical, avertissements et annulation actuels ; aucun
  refus global ni nouvelle politique de recherche n’est introduit.
- Compléter les tests des comportements touchés ou créer `tests/core-error-handling.test.cjs`.
  Passer par `DeepAsk.start`/ses publications et `MomentSearch.search`, avec callbacks, outils,
  index, agent, horloge et minuteries maîtrisés ; pas de comparaison du texte du code produit.
- Ne modifier ni adaptateurs, ni hôtes, ni formats d’instantané, règles métier, callbacks hors
  compteur, historiques, harnais ou plancher. Aucun import externe, disque, réseau ou `process`
  n’est ajouté dans le cœur. Aucune installation ou utilisation d’un fournisseur réel.

## Critères d'acceptation

1. Le journal rapproche les six repères de l’inventaire courant : gestion existante documentée,
   gestion nouvelle testée, poursuite justifiée ou disparition antérieure. Chaque limite non
   établie devient une réserve nommée ; une justification générique ne suffit pas.
2. Toute gestion nouvelle est prouvée en provoquant l’erreur par une dépendance injectée, puis
   en observant résultat, état publié et travail suivant. Une erreur de diagnostic ne fait pas
   échouer la question ; le refus de libération ne bloque pas la file ; absence de disponibilité,
   consigne ou fraîcheur garde le contrat annoncé, sans fabriquer de données manquantes.
3. La recherche avec `passageVector` rejeté conserve sa réponse lexicale et ses compteurs/avertissements
   actuels ; l’annulation garde son refus. Le test utilise un index contrôlé et des passages fixes.
4. Le relevé utilisant la définition inchangée `emptyCatches` donne 0 dans `core/`. Conserver le détail
   par fichier et le total global avant/après : au seul SHA de départ, retirer les 16 + 18 + 6 cas
   des trois tickets donnerait 0 global ; au lancement, remesurer le code laissé par les prédécesseurs.
   Aucun déplacement hors cœur ou conversion en callback vide ne contourne ce comptage.
5. Les tests ajoutés deviennent rouges si leur nouvelle gestion est temporairement retirée, puis
   verts après rétablissement ; consigner ce rouge causal. Les justifications sans changement
   gardent les tests existants et leur portée réelle, sans inventer une preuve de panne matérielle.
6. Les suites touchées, la garde d’architecture et les régressions passent en séquentiel sans test
   supprimé ni assertion affaiblie ; `node scripts/check.mjs` est vert à l’implémentation. Le
   resserrement du plancher appartient à la boucle ; ce ticket `harnais: non` ne l’édite pas.

Commande de relevé statique, sans exécuter les modules du cœur :

```sh
node --input-type=module <<'JS'
import fs from 'node:fs';
import path from 'node:path';
import { emptyCatches, measure } from './scripts/quality/metrics.mjs';
let total = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(cjs|mjs|js)$/.test(entry.name)) {
      const count = emptyCatches(fs.readFileSync(file, 'utf8'));
      console.log(file, count);
      total += count;
    }
  }
}
walk('core');
console.log('core', total, 'produit', measure(process.cwd()).catch_vides_prod);
JS
```

## Test d'acceptation attendu

Les tests des modules ou `tests/core-error-handling.test.cjs` provoquent les refus à leurs frontières
publiques et observent les questions suivantes, les champs absents et la recherche maintenue.
Le comptage statique ferme l’inventaire ; un commentaire seul ne prouve pas l’absence d’un défaut.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T177 implique T176, T046, T031 et T150. Reprendre le code encore actif sans supposer qu’un autre
refactor a traité les six cas. Le périmètre explicite les contrats existants et les petites gestions
établies ; toute politique nouvelle ou défaut plus large reste une réserve à recadrer séparément.
Aucun résultat d’exécution ni incident matériel n’est déduit de la seule lecture de ces repères.

## Journal

- Exploration à `3c966d3` : les six repères sont encore actifs, sans déplacement ni
  disparition. `emptyCatches` inchangé donne `core/deep-ask.cjs: 5`,
  `core/moment-search.cjs: 1`, tous les autres fichiers du cœur à 0 ; cœur 6,
  produit 6. Les prédécesseurs ont donc laissé uniquement les six cas du cœur.
  Exploration et portée réelle des assertions existantes consignées dans
  `.harness-state/tickets/T184/exploration.md` ; aucun écart prévu (`ecarts.md`).
  Les protections existent déjà : commentaires précis et tests des contrats conservés,
  sans ajout de gestion ni nouvelle politique.
- Rapprochement des six repères avec le code courant :

  | Repère initial | Traitement livré et preuve |
  | --- | --- |
  | `deep-ask:22`, `trace` | Poursuite justifiée : le callback ne conditionne ni réponse ni file. `deep-ask-restore` provoque son erreur et observe deux réponses publiées `done`, dont la seconde était en attente. `chat-trace` conserve sa preuve sur une question déjà en erreur. |
  | `deep-ask:37`, `release` | Contrat conservé et limite explicitée : réponse et file continuent, sans nouvel essai ni garantie de libération effective. Tests de refus synchrone après réponse et lors d'une annulation en file ; les questions suivantes aboutissent. Réserve mémoire ci-dessous. |
  | `deep-ask:67`, `availability` | Poursuite justifiée : champ absent dans toutes les publications, outils encore remis à l'agent, deux questions terminées. Aucun intervalle fabriqué. |
  | `deep-ask:113`, `getInstruction` | Poursuite justifiée : aucun champ instruction transmis à l'agent ; deux réponses publiées aboutissent. Le test existant des consignes normales, tronquées, absentes et du mode inspect est conservé. |
  | `deep-ask:148`, `freshness` | Poursuite justifiée : champs finaux absents, durées et état des preuves au démarrage conservés, puis question suivante terminée. Doublure avec contexte de départ fixe, sans fraîcheur finale inventée. |
  | `moment-search:129`, `passageVector` | Poursuite justifiée : score lexical conservé, seul le vecteur du passage rejeté manque. Index injecté, passages fixes : classement et scores, compteurs partiels, avertissement hybride ; en panne de requête aussi, réponse lexicale et avertissement existant. Une recherche suivante aboutit. Le refus d'annulation avant classement est conservé ; le test existant d'annulation pendant settle reste intact. |

- Tests écrits avant les commentaires :
  `node --test --test-concurrency=1 tests/deep-ask-restore.test.cjs tests/moment-index.test.cjs`
  → 35/35 verts sur le code de départ (`tests-before-comments.log`). Neuf tests
  complémentaires caractérisent les protections déjà présentes ; aucun nouveau
  traitement d'erreur n'est revendiqué. Horloge/minuteries virtuelles pour DeepAsk,
  minuteries injectées pour MomentSearch ; aucune attente de délai ni fournisseur réel.
- Sensibilité causale : `python3 -B .harness-state/tickets/T184/mutations.py` retire
  chaque protection existante séparément puis restaure immédiatement le fichier.
  Les commandes Node exactes et sorties sont dans `red-*.log` : trace, release lors
  de l'annulation, availability et instruction échouent sur leurs assertions ; les
  deux cas de cache rejeté échouent sur `doesNotReject`. Le retrait de la protection
  freshness fait remonter l'erreur injectée depuis le finally (rouge d'exécution,
  pas une assertion rouge). Cela ne constitue pas un rouge causé par un commentaire.
  Après restauration/commentaires, même commande de tests → 35/35 verts
  (`tests-after-comments.log`).
- Le contrôle rapide des éditions a signalé les suppressions `no-empty` devenues
  inutiles. `node_modules/.bin/eslint --prune-suppressions core/deep-ask.cjs core/moment-search.cjs`
  → sortie 0 ; seuls les comptes 5 et 1 de cette règle sont retirés du gel, selon
  `docs/standards.md`. Aucun changement du harnais ni du plancher.
- `node .harness-state/tickets/T184/inventory.mjs` avant/après, avec la définition
  `emptyCatches` inchangée : `deep-ask` 5 → 0, `moment-search` 1 → 0 ; chacun des
  22 autres fichiers du cœur 0 → 0 ; cœur 6 → 0, produit 6 → 0. Détail complet
  par fichier conservé dans `inventory-before.log` et `inventory-after.log`.
  Aucun déplacement ni remplacement par un callback de rejet.
- `node scripts/check.mjs --changed` → vert : règles, format, lint, gel, cliquet et
  35/35 tests de deux fichiers ; `catch_vides_prod` 6 → 0 et cas statiques 1254 → 1263.
  Sortie complète dans `.harness-state/tickets/T184/check-changed.log`.
- Réserve nommée — `core/deep-ask.cjs`, `release(job)` : un refus synchrone n'empêche
  pas la réponse ni la file (prouvé par doublure), mais peut laisser retenus le
  préfixe copié et les dépendances des outils. Le catch ne réessaie pas et n'atteste
  pas la réussite du nettoyage. Preuves manquantes : devenir des références après
  une libération partielle et mesure de mémoire réelle. Travail requis : définir
  puis tester séparément un contrat de reprise/diagnostic du nettoyage. Aucune
  panne matérielle ni absence de fuite n'est déduite de ces tests. Cette limite
  est conservée selon l'ADR 0004, sans la masquer par une justification générique.
- `node scripts/check.mjs` → vert en séquentiel : règles, format, lint, gel et
  cliquet ; 1452/1452 tests JS dans 115 fichiers (gardes d'architecture et suites
  protectrices comprises), puis 22/22 tests Python. Sortie complète dans
  `.harness-state/tickets/T184/check-full.log`. `git diff --check` → sortie 0.
  Aucun test supprimé ni assertion affaiblie ; aucun fournisseur réel, appareil,
  installation, commit ou push. Verdict `TERMINÉ` remis à la boucle, avec la réserve
  de libération ci-dessus ; la relecture et le resserrement du plancher lui reviennent.
- Reprise après `relecture-1.md` : constat mineur 1 accepté. L'horloge immobile ne
  prouvait pas la conservation des durées annoncée pour le refus de freshness.
  Correction prévue : première réponse en 120 ms, seconde en 45 ms après 120 ms
  d'attente dans la file ; assertions exactes sur les métriques publiées. Aucun
  écart ni changement de comportement produit. Exploration de reprise consignée
  dans `.harness-state/tickets/T184/exploration-correction-1.md`.
- Correction du constat 1, tests d'abord :
  `node --test --test-concurrency=1 --test-name-pattern='unreadable freshness' tests/deep-ask-restore.test.cjs`
  → assertion rouge après renforcement des attentes (durées effectives encore
  toutes à zéro), puis 1/1 vert après avance de l'horloge dans l'agent contrôlé.
  La première question part immédiatement : `(waitMs,totalMs) = (0,120)` ; la
  seconde, créée pendant cette réponse, attend puis s'exécute : `(120,45)`.
  Les deux réponses terminées et l'objet evidence exact restent vérifiés.
  Sorties dans `correction-1-red-clock.log` et `correction-1-green-clock.log`.
- `python3 -B .harness-state/tickets/T184/check-timing-mutations.py` → les deux
  mutations indépendantes du calcul produit (`waitMs:0`, puis `totalMs:0`) font
  échouer ce test sur son assertion ; restauration immédiate après chaque essai.
  Commandes et sorties dans `correction-1-red-waitMs.log` et
  `correction-1-red-totalMs.log`. Aucun changement produit livré lors de la reprise.
- `node scripts/check.mjs --changed` après restauration → vert, 35/35 tests de
  deux fichiers, règles, format, lint, gel et cliquet verts ; sortie conservée
  dans `.harness-state/tickets/T184/correction-1-check-changed.log`.
- `node scripts/check.mjs` après correction → vert en séquentiel : 1452/1452
  tests JS dans 115 fichiers et 22/22 tests Python ; règles, format, lint, gel et
  cliquet verts (`correction-1-check-full.log`). `git diff --check` → sortie 0.
  Constat mineur 1 corrigé, aucune contestation ; nouveau verdict `TERMINÉ`, avec
  la réserve de libération initiale conservée. Aucun commit ni push.

### Réserves à la clôture

- Réserve initiale conservée : core/deep-ask.cjs, release(job). Un refus synchrone préserve réponse/annulation et file mais peut laisser retenus préfixe et dépendances ; aucun nouvel essai ni succès du nettoyage n'est attesté. Manquent le devenir des références après libération partielle et une mesure mémoire réelle. Travail distinct requis : définir puis tester un contrat de reprise/diagnostic du nettoyage (ADR 0004). Les doublures ne prouvent aucune panne matérielle ni absence de fuite.
- Relecture de correction et resserrement du plancher réservés à la boucle.
