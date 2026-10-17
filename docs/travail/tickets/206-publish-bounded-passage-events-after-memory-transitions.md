---
id: T206
titre: Publish received passages and admission suspension through bounded events
statut: termine
bloque_par: T186, T194, T205
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Un diffuseur léger annonce la réception d'un passage et la suspension d'admission après transition,
en parallèle de `onChange`. Un abonné défaillant ne retient ni la perception ni les sauvegardes.
Les enrichissements, pertes de voie et nouvelles révisions relèvent du lot autonome T221.

## Sources

- Plan structurel du 16/10, phase 1 ; relecture A, constats 7, 8 et 11 ; `docs/domaine.md`,
  sections 3 Mémoire et 8 ; ADR 0029/0030. Les obligations de fin restent des appels explicites.
- Code vérifié à `dd5efc9` : `core/session.cjs:126` ferme l'admission et publie après refus disque,
  avant tout passage ; `:129` ajoute le passage et `:139` publie puis draine.
  `core/session.cjs:506` construit encore le snapshot pour `onChange`.
- `runtime/session-runtime.cjs:176-180` chaîne index, manifeste et hôte ; T186 isole ces
  notifications et le diagnostic, après état rétabli. T194 retire voie série et ancien `ask`,
  après T190/T193. Relire leurs livraisons avant câblage, sans refaire ces retraits.
- `tests/architecture.test.cjs:150` exige une permission exacte. T205 définit le noyau partagé,
  les entrées publiques et les exceptions ; T201 peut déjà avoir créé `core/shared/` pour les erreurs.
- Tests à conserver : split-perception, session-durable, watch-session-ending et architecture,
  sous `tests/`, suffixe `.test.cjs` ; ADR 0002/0003/0006/0008/0023.

## Périmètre

- Créer `core/shared/events.cjs` et `tests/events.test.cjs` : abonnement, désabonnement et
  publication synchrones, ordre conservé, événements publiés pendant une livraison mis en file.
  Aucune dépendance, horloge globale, minuterie ou attente d'un abonné asynchrone.
- Isoler exceptions et rejets de promesses de chaque abonné ainsi que le diagnostic injecté.
  Celui-ci identifie événement et abonné sans nouvelle publication récursive. Un abonné ne peut
  modifier le message reçu par les suivants ; une promesse jamais réglée ne retient pas la livraison.
- Dans `WatchSession`, enregistrer `PassageReceived` après admission et ajout du passage, et
  `AdmissionSuspended` après suspension pour disque plein. Livrer les faits depuis la composition
  partagée `runtime/session-runtime.cjs` après transition, avec une couture injectable.
- Chaque message porte type, `sessionId`, `passageId`, `revision` courante et données bornées
  nécessaires (cause structurée, intervalle). Une admission refusée n'a créé aucun passage :
  `AdmissionSuspended` porte `passageId:null`, `revision:null`. Aucun snapshot, texte, média,
  objet `Error` ou liste de passages dans le message. Le contrat de révision ne change pas ici.
- Vider les événements livrés, sans historique ni rejeu. La restauration reste silencieuse ;
  aucun `MemoryReopened` ici. Aucun lecteur actuel ne migre, `onChange` garde signature et cadence.
- Déclarer ou réutiliser `core/shared/**` selon la règle de T205 : permission à toute zone qui
  importe `core/**` et à chaque contexte, quel que soit l'ordre d'intégration de T201. Le noyau
  n'importe aucun contexte. Écrire l'ADR du diffuseur et des deux premiers événements.
- Ne déplacer ni voies, persistance, cycle de vie ou données historiques. Aucun harnais, test
  existant ou plancher supprimé ; tout code nouveau arrive sans infraction gelée.

## Critères d'acceptation

1. Deux abonnés reçoivent les messages dans l'ordre. Une publication imbriquée arrive à tous après
   la livraison courante. Le désabonnement empêche les livraisons suivantes ; sa règle pendant
   une livraison est explicitée et testée.
2. Un abonné lève, un autre rejette, un troisième ne règle jamais sa promesse : les autres sont
   servis et la publication rend la main. Les diagnostics sont observés sans rejet non traité ;
   faire lever le diagnostic ne provoque ni récursion ni arrêt des abonnés suivants.
3. Par l'ingestion publique, deux passages sont reçus une fois chacun après leur ajout effectif,
   malgré ces abonnés. Leur état est cohérent et leurs voies/sauvegardes continuent. Aucun
   abonné n'appelle `snapshot()` pour fabriquer le contenu des événements.
4. Un refus `TVLENS_STORAGE_FULL` ferme l'admission puis émet `AdmissionSuspended` avec identités
   nulles de passage/révision, sans `PassageReceived` ni passage fantôme. Un abonné ne peut
   empêcher la sauvegarde ou changer le refus. Fermer puis régler un fournisseur tardif ne
   produit aucun enrichissement tardif ; une restauration ne rejoue aucune réception.
5. À l'implémentation, jouer events, session-events, split-perception, watch-session-ending,
   session-durable et les gardes en séquentiel, puis `node scripts/check.mjs`. Les attentes de
   révision existantes restent inchangées dans ce lot.

## Test d'acceptation attendu

`tests/events.test.cjs` prouve ordre, réentrance mise en file, isolation et désabonnement.
`tests/session-events.test.cjs` conduit le vrai `WatchSession` et sa composition publique avec
fournisseurs différés, store et temps injectés, puis observe réception, refus, états et sauvegardes.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T205/T194 couvrent transitivement T030/T202 et T190/T193. Un callback synchrone doit rester court
et borné : l'isolation ne peut interrompre du calcul synchrone arbitraire. Aucun événement ne
remplace les appels obligatoires de sauvegarde, révocation ou fermeture.

## Journal

- Exploration terminée : règles, skill/tests, livraisons T186/T194/T205, code, appelants, suites et
  ADR concernés examinés. Témoin de hooks présent ; état initial et choix dans
  `.harness-state/tickets/T206/exploration.md`. Aucun écart prévu (`ecarts.md`). Le noyau partagé
  et ses six permissions existent déjà ; aucune modification de garde nécessaire.
- Diffuseur, tests d'abord : `node --test tests/events.test.cjs` : rouge sur l'ordre, puis 1/1
  vert (`events-order-*.log`) ; rouge sur la livraison imbriquée, puis 2/2 verts
  (`events-queue-*.log`) ; rouge sur la mutation, puis 3/3 verts (`events-immutable-*.log`) ;
  trois rouges sur les exceptions d'abonnés, puis 6/6 verts (`events-isolation-*.log`). Les rejets
  d'abonnés et diagnostics sont consommés ; une promesse jamais réglée ne retient rien.
- Mémoire, tests d'abord : `node --test tests/session-events.test.cjs` : rouge sur l'absence de
  réception, puis 1/1 vert (`session-received-*.log`) ; rouge sur l'absence de livraison par la
  composition, puis 2/2 verts (`session-composition-*.log`). Une étape intermédiaire livrait déjà
  les faits mais omettait le diffuseur sur la façade ; ajout à la valeur rendue, sans changement
  des assertions. Le contrôle rapide a aussi signalé des imports préparés trop tôt : retirés puis
  ajoutés avec leur usage, avant d'observer les rouges comportementaux.
- Refus disque : même commande, deux rouges sur l'absence de suspension, puis 4/4 verts
  (`session-suspension-*.log`). La fermeture d'admission est observable pendant la livraison ;
  refus identique et état sans passage sauvegardé malgré abonnés et diagnostic défaillants.
- Caractérisations de fin et restauration : même commande, 7/7 verts (`session-lifecycle-green.log`).
  Ajout des cas FIFO avec deux abonnés conservés et d'atterrissage après fermeture directe du cœur :
  `node --test --test-concurrency=1 tests/events.test.cjs tests/session-events.test.cjs` : 15/15 verts
  (`events-session-final.log`). Aucune attente de révision existante modifiée. ADR 0045 rédigé.
- Acceptation séquentielle :
  `node --test --test-concurrency=1 tests/events.test.cjs tests/session-events.test.cjs tests/split-perception.test.cjs tests/watch-session-ending.test.cjs tests/session-durable.test.cjs tests/architecture.test.cjs tests/architecture-guard.test.cjs` :
  **570/570 verts** (`acceptance.log`). Noyau et permissions de T205 réutilisés sans modifier la garde.
- Documentation : `node --test tests/documentation-index.test.cjs` : 10/11, rouge sur le lien
  manquant vers l'ADR 0044 déjà suivi (`documentation-index-red.log`). Complément de référence
  documenté dans `ecarts.md` avant modification, puis même commande : 11/11 verts
  (`documentation-index-green.log`). Carte des deux faits et ADR 0045 ajoutés ; son lien définitif
  est préparé dans `.harness-state/tickets/T206/adr-index-integration.patch` pour l'intégration,
  le banc refusant les cibles encore non suivies. Aucun changement du banc ni écriture Git.
- `node scripts/check.mjs --changed` : **vert**, règles/format/lint/gel/cliquet et 15/15 tests JS
  des deux nouveaux fichiers réussis (`check-changed.log`). Le compteur textuel produit passe de
  1233 à 1244, sans modification de plancher. `git diff --check` : vert. Contrôle complet lancé.
- Contrôle complet final : `node scripts/check.mjs` : **vert**, 2388/2388 tests JavaScript dans
  135 fichiers et 47 tests Python réussis ; règles, format, lint, gel et cliquet verts
  (`check-full.log`). Aucun test existant, harnais ou plancher modifié. `git diff --check` : vert.
  Verdict `TERMINÉ` dans `.harness-state/tickets/T206/verdict.json` ; seule réserve d'intégration :
  appliquer `adr-index-integration.patch` après suivi de l'ADR 0045, sans changer le banc documentaire.
  Aucun commit ni push ; relecture et intégration laissées à la boucle.
- Reprise après relecture 1 : rapport, ticket/journal, écarts, règles, témoin de hooks, état Git
  et diff relus. Constat mineur 1 accepté ; correction prévue dans `ecarts.md` avant modification :
  ne publier une suspension que si le refus ferme une admission encore ouverte. Preuves prévues
  pour deux refus concurrents et pour stop/closeIntake/close pendant une écriture. Le constat
  documentaire hors périmètre reste transmis par la boucle, sans duplication dans `reste`.
- Relecture 1, constat 1 :
  `node --test --test-name-pattern='^(concurrent storage refusals|storage refusal after)' tests/session-events.test.cjs` :
  **4/4 rouges** sur les faits émis sans transition (`correction-1-suspension-red.log`). État
  d'admission capturé avant fermeture et enregistrement conditionné à cet état, sans modifier
  refus, sauvegarde ou cadence d'état. `node --test tests/session-events.test.cjs` : **12/12 verts**
  (`correction-1-suspension-green.log`). Deux erreurs d'origine conservées pour les refus concurrents,
  un seul fait, aucun passage ; aucun fait après stop/closeIntake/close, refus et sauvegarde conservés.
  ADR 0045 précisé sur cette règle. Aucun test existant retiré ni assoupli.
- Validation après correction, en séquentiel :
  `node --test --test-concurrency=1 tests/events.test.cjs tests/session-events.test.cjs tests/split-perception.test.cjs tests/watch-session-ending.test.cjs tests/session-durable.test.cjs tests/architecture.test.cjs tests/architecture-guard.test.cjs` :
  **574/574 verts** (`correction-1-acceptance.log`). `node scripts/check.mjs --changed` : **vert**,
  règles/format/lint/gel/cliquet et 19/19 tests JS des deux fichiers (`correction-1-check-changed.log`).
  Compteur textuel produit à 1246, sans changer le plancher. `git diff --check` : vert.
  Contrôle complet après correction lancé.
- Contrôle complet après correction de la relecture 1 : `node scripts/check.mjs` : **vert**,
  2392/2392 tests JavaScript et 47 tests Python réussis ; règles/format/lint/gel/cliquet verts
  (`correction-1-check-full.log`). `git diff --check` : vert. Constat mineur 1 corrigé ; nouveau
  verdict `TERMINÉ`, aucune réserve propre. Le constat documentaire hors périmètre est transmis
  par la boucle depuis le rapport accepté. Aucun commit ni push ; relecture laissée à la boucle.

### Réserves à la clôture

- .harness-state/tickets/T206/relecture-2.md : 1. `docs/architecture.md:371` : hors périmètre (réserve reprise)

  **Le problème.** L'ADR 0045 n'est toujours pas suivi par Git : il apparaît en `??` dans `revue-2.fichiers`. Le contrôle complet n'est vert que pour cette raison : `tests/documentation-index.test.cjs` ne vérifie que les ADR suivis. Si le commit d'intégration n'applique pas `.harness-state/tickets/T206/adr-index-integration.patch`, ce test sera rouge sur la branche.

  **Attendu.** Appliquer ce patch dans le commit d'intégration. Durablement, la boucle ou le banc documentaire doit tenir compte des ADR ajoutés par un ticket, ce qui relève du harnais.
