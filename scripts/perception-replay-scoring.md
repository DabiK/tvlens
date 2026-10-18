# Noter une revue humaine de perception

`score-perception-replay.cjs` lit les fichiers locaux, vérifie leurs identités et agrège des
jugements humains. Il ne charge aucun fournisseur, ne lance aucun processus et n'accède pas au
réseau. Il ne cherche pas de mots-clés et ne juge pas la vérité d'une description.
L'API publique exporte `scoreReplay(options)` et `compareReplays({reference, candidate})`.
Les options de chaque exécution sont `manifestPath`, `annotationsPath`, `reportPath`, `reviewPath`.

## Préparer les deux documents

1. Préparer le corpus au [format du rejeu](perception-replay.md). Le manifeste et tous ses médias
   doivent rester disponibles et intacts pour la notation.
2. Écrire les annotations attendues ci-dessous **avant toute inférence**, depuis le média source.
   Renseigner l'empreinte des octets exacts du manifeste (`shasum -a 256 manifest.json`). Les attendus
   décrivent l'action, l'ordre, les limites et les références attendues avec leur justification.
   Ne pas les copier dans le manifeste, le transcript ou le contexte envoyé au modèle.
3. Faire exécuter le rejeu par l'opérateur avec `--annotations attendus.json`. Le runner enregistre
   son empreinte avant de construire le premier fournisseur. Aucun essai réel n'est requis pour
   vérifier le scoreur. Une campagne sans cette empreinte est refusée : il faut une nouvelle
   exécution préparée correctement, jamais compléter l'ancien rapport après coup.
4. Examiner chaque sortie dans le `campaign.json` terminé ou interrompu, avec **les images
   effectivement envoyées** (`request.frames`), les paroles reçues (`input.transcript.text`),
   le contexte et leurs limites. Le son conservé n'a pas été transmis au modèle par le rejeu.
   Comparer aux attendus sans attribuer au modèle des preuves présentes seulement dans le média
   complet. Distinguer geste absent des images sélectionnées et geste visible mais mal décrit.
5. Écrire une revue distincte avec ses empreintes, `runId`, lecteur et justifications. Une autre
   exécution exige sa propre revue, même si ses réponses paraissent identiques.

L'antériorité repose sur la trace acquise par le runner, pas sur une date déclarative ajoutée à la
revue. Les empreintes détectent les changements ; elles ne sont ni une signature d'authenticité ni
une protection contre une falsification coordonnée de tous les documents.

## Annotations attendues, version 1

La racine contient `version: 1`, `manifestSha256` (SHA-256 hexadécimal des octets exacts du manifeste)
et `cases`. Chaque cas du manifeste a exactement une ligne ; doublons et identifiants étrangers
sont refusés. Une ligne contient :

| Champ | Contenu requis |
| --- | --- |
| `id` | Identifiant exact du cas. |
| `expected` | Texte non vide : attendu humain figé, y compris trajectoire, répétitions ou limites utiles. |
| `reason` | Justification humaine non vide de cet attendu et de ses limites. |
| `citations` | Liste de références attendues, éventuellement vide. |

Une référence a la forme `{id, startMs, endMs}` : identifiant du cas cité et temps de session en
millisecondes, nombres finis. Dans les attendus, décrire aussi en texte la preuve recherchée et
l'éventuelle limite de localisation ; les références ne sont pas interprétées sémantiquement.
Les annotations sont conservées dans la sortie du scoreur, jamais envoyées à une inférence.

## Revue d'une sortie précise, version 1

La racine contient les champs suivants :

| Champ | Contrat |
| --- | --- |
| `version` | `1`. |
| `manifestSha256` | Même empreinte que le manifeste et le rapport. |
| `annotationsSha256` | Empreinte des annotations, identique à celle acquise par le runner avant inférence. |
| `reportSha256` | Empreinte du fichier `campaign.json` exact, espaces et retours à la ligne compris. |
| `runId` | Identité d'exécution exacte de ce rapport. |
| `reviewer` | Nom ou identifiant non vide du lecteur humain. |
| `cases` | Lignes de revue, sans doublon ni identifiant étranger au corpus. |

Une ligne non revue contient `{id, status: "unreviewed", reason}` avec une raison non vide,
sans `dimensions` ni `citations`. Une ligne omise devient aussi explicitement « non évaluée »
dans le résultat ; son absence n'augmente jamais les réussites.

Une ligne revue contient `id`, `status: "reviewed"`, `reason` non vide, `dimensions` et `citations`.
Chaque dimension ci-dessous est obligatoire, sous la forme `{value, reason}`. **La justification
est obligatoire aussi pour `na`** : non applicable ne signifie ni inconnu ni réussi.

| Dimension | Valeurs autorisées et lecture |
| --- | --- |
| `accuracy` | `correct`, `partial`, `incorrect`, `na` : exactitude sémantique de la réponse. |
| `invention` | `absent`, `present`, `na` : ajout d'action, identité, citation ou détail sans preuve. |
| `order` | `correct`, `incorrect`, `na` : ordre des événements, séparé de leur présence. |
| `imageEvidence` | `sufficient`, `insufficient`, `unknown`, `na` : suffisance des images réellement reçues. |
| `speechEvidence` | Mêmes valeurs : suffisance des paroles réellement reçues, jamais du son non transmis. |
| `description` | `faithful`, `misdescribed`, `na` : preuve reçue fidèlement ou mal décrite. |
| `abstention` | `none`, `justified`, `unjustified`, `na` ; les deux abstentions exigent `accuracy: na`. |
| `references` | `correct`, `incorrect`, `missing`, `na` : jugement humain sur les références. |
| `causality` | `valid`, `violation`, `na` : respect du préfixe temporel admissible. |
| `provenance` | `valid`, `violation`, `na` : attribution aux bonnes preuves et à la bonne modalité. |

`citations` contient les références présentes dans la réponse, retranscrites par le lecteur, ou
`[]` en leur absence. Le rejeu de routine peut ne produire aucune référence explicite : expliquer
alors `references: na`. `correct` exige une liste non vide, `na` une liste vide. Une référence
erronée reste enregistrable : mauvais identifiant, intervalle inversé ou hors bornes restent visibles
avec `intervalValid: false`. Aucune tolérance historique de 500 ms n'est appliquée.
Un intervalle mécaniquement valide ne prouve ni l'action ni son attribution.

Le lecteur explique les cas `unknown` et les non-applicabilités, notamment une absence de sortie
après erreur ou annulation. Un cas sans réponse exploitable peut être revu pour son échec ; le
statut du rejeu lui interdit toute réussite, même si des jugements positifs ont été saisis.

## Commandes hors ligne

Les trois fichiers d'exemple sont entièrement fictifs, sans inférence ni annotation réelle.
Leur rapport porte une identité de fixture explicite. Leurs nombres ne valident pas G2.

```sh
node scripts/score-perception-replay.cjs --help
node scripts/score-perception-replay.cjs \
  --manifest scripts/fixtures/perception-replay/manifest.json \
  --annotations scripts/fixtures/perception-replay-scoring/annotations.json \
  --report scripts/fixtures/perception-replay-scoring/campaign.json \
  --review scripts/fixtures/perception-replay-scoring/review.json --validate
```

Retirer `--validate` pour publier les totaux et les cas sur stdout. Pour un corpus de l'opérateur :

```sh
node scripts/score-perception-replay.cjs --manifest corpus/manifest.json \
  --annotations corpus/attendus.json --report local/campaign.json --review local/revue.json \
  > notation.json
node scripts/score-perception-replay.cjs --manifest corpus/manifest.json \
  --annotations corpus/attendus.json --report local/campaign.json --review local/revue.json \
  --reference-report reference/campaign.json --reference-review reference/revue.json \
  > comparaison.json
```

Les options `--reference-manifest` et `--reference-annotations` permettent de montrer les cas non
appariés de deux corpus différents. Par défaut, la référence utilise le même corpus et les mêmes
attendus. `--validate` fonctionne aussi pour une comparaison ; il publie seulement les identités
validées. Toutes les erreurs sortent sur stderr avec un code stable et un statut 1, sans score sur
stdout. Le scoreur n'écrit aucun fichier d'entrée ; la redirection est choisie par l'opérateur.
Ne jamais rediriger stdout vers un fichier de preuve utilisé en entrée.

## Lire les résultats

Chaque résultat conserve les empreintes du corpus, des annotations, du rapport et de la revue,
ainsi que `runId`, backend, configuration, identité de code et état complet/incomplet. Chaque cas
conserve son entrée, ses attendus, sa revue avec justifications, ses preuves reçues ou `null` si
aucune requête n'a été faite, son erreur éventuelle et les contrôles d'intervalle des citations.

`totals` sépare cas, revus, non évalués, réussites, dénominateur des revus et abstentions justifiées.
Une réussite est une **réponse** jugée correcte, sans invention, sans abstention ni défaut humain
sur ordre, description, référence, causalité ou provenance ; une preuve applicable insuffisante
ou inconnue et une citation hors bornes l'excluent aussi. Ce compteur descriptif n'est pas un seuil
produit. L'abstention justifiée est comptée séparément et ne devient pas une action correcte.
Chaque dimension publie ses effectifs par valeur, `denominator` (revus applicables) et
`notApplicable`. Les non revus ne rejoignent aucun dénominateur de dimension.

La comparaison conserve les deux résultats complets et leurs couvertures respectives. Elle
apparie un identifiant seulement si l'entrée et la ligne d'attendu sont structurellement identiques
(ordre des propriétés JSON indifférent). La sélection reçue peut varier : elle reste visible.
`candidate-only`, `reference-only`, `input-mismatch` et `annotation-mismatch` exposent les autres
cas, sans calcul d'écart de qualité. `coverage` indique séparément les revues disponibles.

Pour les cas appariés et revus des deux côtés, `changes` donne chaque changement de valeur ;
les rangs descriptifs sont correct > partiel > faux, absence > présence d'invention, suffisant >
insuffisant, fidèle > mal décrit, valide > violation et référence correcte > incorrecte/manquante.
Absence d'abstention et abstention justifiée ont le même rang ; leur changement reste affiché.
`na` et `unknown` n'ont pas de rang : `regression: null`, et `notComparable` augmente.
Les dénominateurs de comparaison excluent ces valeurs ; la couverture de revue est affichée à part.
Aucun rang n'est additionné et aucune moyenne de dimensions ou de corpus non appariés n'est calculée.

`regressions` donne les cas et dimensions qui se dégradent. `newViolations` signale aussi une
violation de causalité/provenance face à une référence revue marquée `na`, sans prétendre calculer
un rang pour cette dernière. `violations` liste toutes les violations revues, y compris les cas
non appariés ou dont la référence n'est pas revue. Une hausse globale ne masque donc aucun cas
critique. Une revue absente ou un corpus fictif interdit de conclure à la réussite réelle de G2.
