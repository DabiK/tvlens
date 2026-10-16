---
id: T037
titre: Freeze a reference session archive and prove the current code reads it
statut: termine
bloque_par: T193
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Une archive produite une fois par les vraies frontières de sauvegarde, avec des fournisseurs simulés,
est figée et relue par le code courant. Les migrations disposeront d'un témoin indépendant de leur
écrivain, avec des attentes explicites sur les données conservées et les limites de leur lecture.

## Sources

- `docs/domaine.md`, section 9 ; ADR 0029 : convertisseurs versionnés, données historiques conservées.
  Ce filet précède T208 et ne dépend plus du découpage global T145.
- Code vérifié à `dd5efc9` : `core/session.cjs:489` construit le snapshot non versionné ;
  `core/session.cjs:513` le remet à l'archive. `adapters/local-store.cjs:5` nomme les documents,
  `adapters/local-store.cjs:50` écrit les médias avec images, audio et intervalle ;
  `adapters/local-store.cjs:159` coalesce les états avant temporaire et renommage.
- `adapters/session-library.cjs:89` lit et complète l'état depuis l'inventaire ;
  `adapters/session-library.cjs:117` liste, `adapters/session-library.cjs:133` lit l'archive.
  Avec manifeste, la liste reprend ses totaux sans relire `session.json` ; sans manifeste, elle
  distingue rétention reconnue et archive historique (`adapters/session-library.cjs:26`, `:34`).
- `runtime/headless-runtime.cjs:520` délègue l'ouverture à
  `runtime/headless-session-lifecycle.cjs:207`. Le résumé vivant est sauvegardé côté Mac à
  `app/main.cjs:207`. Le banc hors ligne existe à `tests/server-sessions.test.cjs:70`.
- `adapters/local-store.cjs:119` inventorie des paires de fichiers, sans décoder les vidéos.
  Un clip tronqué avant lecture reste une paire présente : ne pas le déclarer automatiquement manquant.
  `adapters/embedding-store.cjs:9` lit aussi un journal JSONL, nommé `embeddings.json` par
  `runtime/session-providers.cjs:187`.
- `.gitignore` ignore notamment WebM et dossiers `sessions/` ; `.prettierignore` exclut déjà
  `tests/fixtures/`. Aucune `.gitattributes` n'existe à cette version.
  Tests à conserver : session-durable, session-lifecycle et server-sessions ; ADR 0002 et 0003.

## Périmètre

- Créer `scripts/fixtures/write-reference-archive.cjs`, générateur manuel hors des tests, et
  `tests/fixtures/archives/durable-v1/`, avec deux dossiers de sessions aux identifiants UUID.
  Le conteneur parent ne s'appelle ni `sessions` ni `saved-moments`.
- Le générateur pilote le runtime réel hors ligne, sur horloges maîtrisées : perception simulée,
  agent de questions simulé, aucun identifiant personnel. Employer les petits médias de fixture
  disponibles ; aucun outil média réel ni fournisseur n'est requis. Désactiver les embeddings pour
  ce premier corpus, afin de ne pas confondre JSON et JSONL.
- La perception simulée par défaut passe par les deux voies livrées par T193 ; chaque passage figé
  porte `audioStatus` et `visionStatus`, que `expected.json` attend. Au commit vérifié,
  `adapters/simulated-providers.cjs:40` n'expose encore que `observe` et `ask` ;
  `core/session.cjs:59` choisit alors la voie série. Le choix du simulé est à
  `runtime/session-providers.cjs:154` (et non `:65` comme dans la relecture A). Relire la
  livraison T193 avant génération.
- Figer une session archivée avec au moins deux passages, médias, miniatures, conversation et registre
  de surveillance ; puis une session interrompue, avec état sauvegardé et manifeste non final.
  Après écriture, tronquer un clip de cette seconde session et ajouter un `session.json.tmp` résiduel.
  Documenter précisément ces deux altérations ; ne pas présenter ce clip comme un média absent.
- Ajouter `expected.json` (attentes de lecture, pas copie des documents), `SHA256SUMS` et un README
  donnant commit producteur, commande, altérations et règle de conservation. Le générateur n'est
  jamais lancé par un test ; une génération figée ne se régénère pas pour accompagner un nouveau format.
  Un changement d'attente exige un comportement expliqué et relu, sans remplacer le témoin historique.
- Ajouter `tests/archive-compat.test.cjs`, et une aide de copie si nécessaire. Ajouter une exception
  ciblée dans `.gitignore` pour ce corpus et `.gitattributes` avec
  `tests/fixtures/archives/** -text`. Ne pas modifier `.prettierignore`, déjà suffisant.
- Aucun changement produit, format, autre test ou harnais. Ce socle ne couvre pas `living-recap.json`,
  les archives antérieures au manifeste, les anciens médias sans intervalle ni la rétention glissante.
  T222 ajoute ses variantes avant T208 ; T215 ajoute l'archive réellement élaguée avant retrait
  de cette politique. Toute migration du résumé vivant doit d'abord ajouter son propre témoin.

## Critères d'acceptation

1. Le test vérifie l'ensemble exact des fichiers couverts par `SHA256SUMS`, sans autoréférence du
   fichier de sommes. Tous les documents JSON du corpus se lisent ; aucun JSONL n'y est inclus.
   Les sommes et les fichiers restent identiques avant et après chaque scénario.
2. Sur une copie temporaire, `SessionLibrary.list()` et `read()` restituent identités, états,
   passages, conversation, surveillance et inventaire définis dans `expected.json`. Les totaux du
   manifeste et l'inventaire physique sont comparés séparément, sans les assimiler.
3. `HeadlessRuntime.open()` ouvre l'archive en lecture seule, avec les passages et le registre
   attendus. Le banc interdit tout fournisseur réel et ne relance aucune analyse à l'ouverture.
   L'ouverture et la fermeture sans reprise ne modifient pas les octets de la copie.
4. La session interrompue reste lisible malgré le temporaire résiduel. Son clip tronqué est compté
   selon la présence de sa paire, sans promesse de décodage ; les autres données restent consultables.
   Toute attente liée à un mtime est calculée après `utimes` sur la copie, jamais depuis les dates Git.
5. Aucun fichier nécessaire n'est ignoré par Git : vérifier chaque chemin avec
   `git check-ignore --no-index`, en interprétant aussi les négations. Hors dépôt Git, ce contrôle
   est explicitement marqué non lancé. Le test ne touche jamais au corpus original.
6. À l'implémentation, exécuter en séquentiel archive-compat, session-durable, session-lifecycle et
   server-sessions, puis `node scripts/check.mjs`. Aucun cas existant ni plancher n'est retiré.

## Test d'acceptation attendu

`tests/archive-compat.test.cjs` relit une copie de la génération par `SessionLibrary` puis
`HeadlessRuntime.open()`. Le test de lecture ne dépend pas du générateur ni d'un aller-retour courant.
Les écritures sont terminées avant de figer le corpus ; l'interruption simulée n'est pas un crash matériel.

## Hypothèses bloquantes

Aucune décision n'est attendue.

La capacité du runtime courant à produire puis rouvrir ce corpus reste à prouver à l'implémentation :
aucune génération ni aucun test n'ont été exécutés au découpage. Si une génération réelle ne se relit
pas sans correction produit, consigner le défaut et arrêter ce ticket sans retoucher le témoin.
Si la simulation ne produit aucune affirmation, conserver le registre vide, l'attente zéro et sa limite
dans le README. Les variantes exclues ci-dessus ne constituent pas une preuve de compatibilité générale.

## Journal

- Exploration : T193 relu sur `4dfc282`, voies simulées audio/vision confirmées ;
  protocole de copie après barrières et avant clôture retenu pour l'interruption.
  Détails et écarts dans `.harness-state/tickets/T037/` ; aucun changement produit prévu.

- Rouge observé : `node --test tests/archive-compat.test.cjs` échoue sur
  `0 !== 2` (sessions absentes), journal `red-corpus.log`.
- Génération unique : `node scripts/fixtures/write-reference-archive.cjs tests/fixtures/archives/durable-v1`
  réussit (code 0). Deux sessions de deux passages sauvegardées par le runtime réel,
  embeddings désactivés ; troncature et temporaire documentés dans le corpus.
  Registre sans affirmation : attente zéro conservée avec sa limite explicite.
- Lecture : `node --test tests/archive-compat.test.cjs` passe les cinq scénarios de
  données puis échoue sur le WebM ignoré par `*.webm` (`red-git.log`). Après
  l'exception ciblée et `.gitattributes`, les six cas passent (`green-archive.log`).
- `node scripts/check.mjs --changed` : premier passage rouge sur `no-regex-spaces` ;
  regex corrigée sans changer son langage. Aucun test ou plancher assoupli.
- Contrôles ciblés exécutés dans l'ordre, en séquentiel :
  `node --test tests/archive-compat.test.cjs` : 6/6 ;
  `node --test tests/session-durable.test.cjs` : 24/24 ;
  `node --test tests/session-lifecycle.test.cjs` : 15/15 ;
  `node --test tests/server-sessions.test.cjs` : 29/29, tous codes 0.
  Sorties conservées dans le dossier d'état.
- Protection manuelle : la même commande de génération sur le dossier existant
  est refusée avec `EEXIST` (code 1, avant toute écriture). `git check-attr text --`
  sur le clip tronqué retourne `text: unset`. Le test contrôle chaque chemin du
  corpus avec `git check-ignore --no-index --verbose`, négations comprises.

- Contrôle final complet : `node scripts/check.mjs` : vert, code 0 ; règles,
  format, lint, gel et cliquet verts, 1936/1936 tests JS (127 fichiers) et 22 tests
  Python réussis (`check-full.log`).
- Contrôle final des changements : `node scripts/check.mjs --changed` : vert,
  code 0, six tests réussis (`check-changed-final.log`). `git diff --check` : code 0.
  `shasum -a 256 -c SHA256SUMS` dans le corpus : 23 fichiers OK, code 0.
- Livraison : générateur manuel, deux témoins historiques, attentes explicites,
  six tests de compatibilité sur copies, exception Git et attribut `-text`.
  Aucun code produit, autre test ou harnais modifié ; aucun commit ni push.
  Verdict `TERMINÉ` remis à la boucle pour relecture.

- Reprise après `relecture-1.md` : constat mineur 1 accepté. Option 1 retenue :
  retrait du remplacement tardif de `child_process` et de la promesse « process ».
  Fournisseurs injectés et interception de `fetch` conservés ; qualification rouge
  par préchauffage volontaire à l'ouverture avant correction du banc.
- Qualification avant correction :
  `node --require ./.harness-state/tickets/T037/probe-archive-warmup.cjs --test --test-name-pattern='the headless host' tests/archive-compat.test.cjs`
  échoue sur l'assertion du registre d'appels : deux `chat.prepare` au lieu de zéro,
  malgré l'absorption volontaire des erreurs (`correction-1-red-warmup.log`).
  Ce rouge qualifie le garde conservé ; aucune correction produit n'est nécessaire.
- Correction du constat 1 : interception tardive des processus retirée ; message
  limité aux fournisseurs injectés, `fetch`, analyse, préchauffage et embeddings.
  Les six cas et leurs assertions de données restent conservés. Corpus, sommes,
  attentes et générateur inchangés.
- Après correction, exécutions séquentielles :
  `node --test tests/archive-compat.test.cjs` : 6/6 ;
  `node --test tests/session-durable.test.cjs` : 24/24 ;
  `node --test tests/session-lifecycle.test.cjs` : 15/15 ;
  `node --test tests/server-sessions.test.cjs` : 29/29 ;
  `node scripts/check.mjs --changed` : vert, code 0, six tests réussis.
  Journaux `correction-1-*.log` dans le dossier d'état.
- Doute de la relecture expliqué à la lecture :
  `runtime/session-lifecycle.cjs` appelle `watch.closeIntake()` avant `watch.close()` ;
  `core/session.cjs` y force `#questionPending = true` pour verrouiller les questions,
  puis sauvegarde ce drapeau via le getter `asking`. La copie archivée est prise
  après cette fermeture, la copie interrompue avant ; leur différence est attendue.
  La restauration recalcule ce drapeau en mémoire. Aucun témoin n'a été retouché.
- Validation complète de la correction : `node scripts/check.mjs` : vert, code 0 ;
  1936/1936 tests JS (127 fichiers), 22 tests Python réussis, règles/format/lint/gel/cliquet
  verts (`correction-1-full.log`). `git diff --check` : code 0.
  Constat 1 corrigé ; nouveau verdict `TERMINÉ` remis à la boucle, sans commit ni push.
