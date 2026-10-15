---
id: T184
titre: Handle or justify every empty catch in the core
statut: a-faire
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
