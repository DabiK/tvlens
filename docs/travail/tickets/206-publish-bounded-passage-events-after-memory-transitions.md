---
id: T206
titre: Publish received passages and admission suspension through bounded events
statut: a-faire
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
