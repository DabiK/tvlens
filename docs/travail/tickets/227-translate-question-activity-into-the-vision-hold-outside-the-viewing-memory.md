---
id: T227
titre: Translate question activity into the vision hold outside the viewing memory
statut: a-faire
bloque_par: T226
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

La coordination applicative traduit l'activité des questions et le réglage `visionDuringAsk` en
politique générique de retenue de la vision. La mémoire ne connaît plus les questions ; les deux
hôtes gardent la règle T190, la fermeture et les mêmes informations historiques publiées.

## Sources

- Troisième lot de T220, relecture B, constats 6 et 14 ; `docs/domaine.md:88` impose une politique
  générique reçue par Mémoire ; ADR 0029/0030. T226 implique racine renommée, voies T214,
  états T217 et projections T219/T224/T225. Relire la façade T190 encore présente après ces lots.
- Code vérifié à `dd5efc9` : `core/session.cjs:76-81` possède l'activité et la fin de retenue ;
  `:91` lève aussi le drapeau à fermeture d'admission ; `:172` classe la perte asking/backlog ;
  `:314` interdit le second essai quand la retenue s'applique, `:320` retient la vision seule.
- `app/main.cjs:67` active par défaut visionDuringAsk ; `runtime/session-runtime.cjs:175` le
  transmet au cœur. Les callbacks de questions sont à `app/main.cjs:149` et
  `runtime/headless-runtime.cjs:126` (verrou closing distinct des jobs), repris par T190.
- `tests/architecture.test.cjs:191-199` garde déjà la surveillance contre le vocabulaire des
  questions ; modèle pour la garde Mémoire. T030 étend la garde des écritures de drapeaux,
  T205 les zones/points d'entrée/exceptions. Aucun harnais modifié par ce lot.
- Tests publics à conserver : split-perception, session-latency, architecture-f08,
  watch-session-ending, question-ceiling et bancs Mac/serveur, sous `tests/`, suffixe `.test.cjs`.
  ADR 0004/0008 pour baux et nouvel essai, ADR 0002/0003/0006/0023 pour fin/ingestion.

## Périmètre

- Déplacer la traduction de `setQuestionPending` et `visionDuringAsk` dans `runtime/`, avec
  un seul propriétaire partagé par les hôtes, par exemple `runtime/memory/vision-policy.cjs`.
  Le filtre d'activité T190 reste celui de la session concernée ; les jobs étrangers, sans
  identité ou terminés ne la rendent pas occupée. Ne pas recopier cette règle dans les hôtes.
- La mémoire n'expose plus qu'une commande de politique générique pour retenir/libérer la vision,
  déléguée aux voies T214. Elle possède sa transition, la mesure de retenue, la publication et
  le drainage différé de cette instance ; la coordination ne reprend pas « affecter, émettre,
  drainer ». Relâcher A puis adopter B ne peut pas drainer B.
- Couvrir les sources autres qu'une question : `closeIntake` et verrou de fermeture serveur.
  La fermeture les appelle explicitement avant attente, sans dépendre d'un abonné d'activité.
  Une fin de question ne lève pas un verrou de fermeture et ne rouvre jamais l'admission.
  Respecter le comportement du réglage sur retenue, cause asking et refus de second essai,
  sans rendre arbitrairement la fermeture plus ou moins restrictive que le code livré.
- Retirer noms et options de Questions des règles de `core/memory/**`. La projection applicative
  conserve les valeurs historiques `asking`, `visionSkippedAsking`, `visionBlockedMs` et cause
  asking aux frontières ; le convertisseur conserve les clés d'archives comme `questions`.
  Adapter les accès de statut T219 : aucune de ces données de Questions n'entre dans MemoryView.
- Ajouter une garde « `core/memory/**` ne nomme pas les questions », sur le modèle cité : refuser
  `DeepAsk`, `setQuestionPending`, `visionDuringAsk` et le couplage d'activité dans les règles.
  Les seules graphies historiques nécessaires au schéma d'archive sont inventoriées précisément
  comme traductions de données, sans exemption d'un module ou dossier entier aux dépendances.
  La garde porte sur les règles et imports, sans rendre illisibles les archives historiques.
- Migrer commandes et fixtures T190 vers cette coordination dans scripts et tests, puis vérifier
  les deux hôtes. Compléter l'ADR de politique T214, permissions de runtime selon T205, et
  élaguer les suppressions ESLint inutiles. Aucun fil, format, délai, perte ou plafond changé.

## Critères d'acceptation

1. Une question queued/running de A retient ou laisse avancer la vision selon visionDuringAsk,
   sans retenir l'audio. Jobs de B, terminés ou sans session ne modifient pas A ; surveillance
   seule ne l'occupe pas. Répéter la même activité ne publie ni ne draine une seconde fois.
2. Libérer la retenue termine exactement sa mesure et reprend la même instance. Un callback
   différé de A ne draine pas B ; ending/closed interdit toute analyse/publication tardive.
3. `closeIntake` reste synchrone, silencieux et ferme l'admission ; le verrou serveur garde
   le comportement asking publié, la cause de perte et le refus du nouvel essai de T214/T190,
   même sans question active. Une notification tardive de fin de question ne l'efface pas.
4. La garde refuse une règle de Mémoire qui importe Questions ou nomme son activité, puis passe
   après retrait de cette faute. Les seules clés de données historiques recensées restent
   traduites et lisibles ; archives T222/T215, corps T213 et canaux Mac ne changent pas.
5. Les tests T190 passent par la nouvelle coordination, sans mutation de drapeau par l'hôte et
   sans affaiblir leurs assertions. Jouer les suites citées, tests de politique et gardes en
   séquentiel, puis `node scripts/check.mjs`. Aucun cas ni plancher supprimé.

## Test d'acceptation attendu

Ajouter `tests/vision-policy.test.cjs` : vraie mémoire, vraie coordination, fournisseurs et temps
maîtrisés ; conduire activité de questions, fermeture et bascule A/B par les entrées publiques.
Les bancs Mac/serveur prouvent le câblage partagé et les gardes s'exécutent sur arbres temporaires.

## Hypothèses bloquantes

Aucune décision n'est attendue.

La traduction ne change pas le réglage ni ses valeurs par défaut. Les noms exacts des commandes
génériques dépendent des voies livrées par T214 ; le lot retire le vocabulaire de Questions de la
mémoire, pas les champs historiques des données ou les obligations explicites de fermeture.

## Journal
