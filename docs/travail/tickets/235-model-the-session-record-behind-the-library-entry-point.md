---
id: T235
titre: Model the session record behind the library entry point
statut: a-faire
bloque_par: T227, T254
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

`SessionRecord`, dans `core/library/`, possède les métadonnées durables d'une session et ses
exécutions de capture, avec source connue ou explicitement inconnue. Son convertisseur produit
le manifeste historique ; un seul propriétaire prépare ce document, titre Mac compris.

## Sources

- `docs/domaine.md`, section Bibliothèque et section 9 ; ADR 0029/0030, 0002/0003/0020,
  ADR 0044 (garde T205). Le document de fiche reste `manifest.json`, pas une nouvelle copie
  de `session.json` ni un magasin supplémentaire.
- Code vérifié à `1d8aa48` : `runtime/session-manifest.cjs:27` construit le manifeste avec
  identité, titre, dates, hôte, premier sujet, totaux et captures ;
  `runtime/session-manifest.cjs:67` restaure les captures sans les tronquer ;
  `runtime/session-manifest.cjs:73` borne à 100 à l'ajout d'une reprise. Les captures actuelles
  ont startedAt/fromMs, sans source ; la borne n'est pas une validation historique à l'ouverture.
- `runtime/session-manifest.cjs:88` limite les écritures en lecture seule et transmet le
  refus final. `runtime/session-lifecycle.cjs:126` passe la barrière avant ce manifeste final,
  `runtime/session-lifecycle.cjs:176` ajoute la capture après reprise. La confirmation reste
  propre à cette vie du runtime, distincte de l'ancien state:'archived' du document.
- `adapters/session-library.cjs:38` projette live/interrupted depuis le manifeste et la session
  courante ; `adapters/session-library.cjs:52` fabrique unreadable. Sa validation permissive
  est à `adapters/session-library.cjs:24`. Aucun agrégat SessionRecord n'existe encore.
- `app/main.cjs:423` affecte directement `runtime.store.manifest` pour le titre : ce rédacteur
  doit aussi migrer. `adapters/local-store.cjs:157` remplace des documents coalescés ; son
  `saveManifest` à `adapters/local-store.cjs:194` fusionne pourtant un patch en mémoire. Ne pas
  confondre cette commodité de port avec une fusion de deux agrégats rédacteurs.
- Filets : `tests/session-manifest.test.cjs:73`, `tests/session-manifest.test.cjs:160`,
  `tests/session-library.test.cjs:26`, `tests/mac-ipc-contract.test.cjs:434` ; table des zones
  à `tests/architecture.test.cjs:17`. T227 implique T209 (manifeste par vue/événements), T215/T223
  (rétention retirée), T219/T224/T225 (projection), T220/T226 (racine et vocabulaire), T208 déjà intégré.

## Périmètre

- Créer `core/library/session-record.cjs`, son convertisseur de manifeste et `core/library/index.cjs`,
  avec types JSDoc utiles. Le modèle reçoit temps et faits comme valeurs ; aucun import disque,
  adaptateur, Mémoire ou hôte, ni horloge globale. Le runtime collecte les faits depuis les
  accès publics livrés par la phase 1 et remet le document au port de stockage.
- Déplacer la propriété des métadonnées actuellement construites par le manifeste : identité,
  titre, hôte d'origine, dates, état durable live/archived et captures. Les totaux, premier sujet
  et médias sont des faits apportés par l'application, pas un accès de l'agrégat à la Mémoire.
  La confirmation disque reste celle du cycle de ressources ; un document demandé n'est pas confirmé.
- Adapter `runtime/session-manifest.cjs`, `runtime/session-runtime.cjs` et les appels nécessaires
  de `runtime/session-lifecycle.cjs`. Le service de manifeste garde cadence monotone 30 s,
  premier passage, déclencheurs T209 et écriture finale explicite. Ses mises à jour passent
  toutes par la même fiche ; aucune seconde reconstruction parallèle dans la bibliothèque.
- Remplacer la mutation de titre Mac par une commande publique du runtime vers cette fiche,
  avec les mêmes titre/date/source affichée qu'avant. Garder le port `saveManifest` et ses
  garanties ; lui donner un document complet de ce seul propriétaire, sans généraliser une
  modification de stockage pour les autres fichiers.
- La fiche représente la source de chaque capture par une donnée détachée facultative ; absence
  historique signifie inconnue, jamais une application/fenêtre devinée depuis le titre ou l'hôte.
  À livrer : le seul producteur est le Mac ; chaque capture qu'il ouvre (démarrage
  `app/main.cjs:403-423`, reprise `:409` et `:487-493`) doit recevoir
  `captureSources.capturedSourceName()` (appel existant au démarrage à `:421`), borné à 80 caractères
  comme le titre (`:422`). Aujourd'hui les reprises ne transmettent pas cette source ; le ticket
  ajoute ce raccord. Le serveur n'en reçoit aucune : ses captures sont
  de source inconnue. Le nom du champ est fixé dans l'ADR du ticket. Aucun futur modèle Capture,
  greffon ou sélection d'application n'est créé.
- Garder `format:'tvlens-session'`, `version:1`, les noms/champs/valeurs historiques et les
  extensions déjà lues. Le convertisseur lit les formes admises aujourd'hui ; ne pas durcir
  leur validation au passage. Les anciennes entrées sans source ne sont pas réécrites à
  l'ouverture ; les seuls ajouts persistés sont les métadonnées source nécessaires.
- À une nouvelle capture, retenir les 100 dernières comme aujourd'hui, sans perdre createdAt,
  titre, hôte et autres métadonnées. Ne pas tronquer une archive seulement lue ni prétendre
  reconstruire les captures anciennes manquantes. Ne pas fusionner deux vies de capture.
- Laisser loaded/closing au coordinateur, interrupted/unreadable aux projections de bibliothèque.
  Déclarer `core/library/**` avec contexte, entrée et permissions exactes selon T205 ; aucun
  domaine étranger n'importe son interne. Les constantes/helpers purs nécessaires au modèle
  quittent l'adaptateur ou sont injectés, sans import remontant vers lui.
- Ajouter `tests/session-record.test.cjs`, étendre manifeste/bibliothèque/runtime et titre Mac,
  conserver corpus et fil. Écrire l'ADR du rédacteur unique et de la conversion, lié avec une
  phrase dans `docs/architecture.md`, Décisions. Élaguer les suppressions devenues inutiles ;
  aucune infraction gelée n'arrive dans le nouveau code.

## Critères d'acceptation

1. Une création, une publication, une pause, une reprise et une fin produisent les mêmes faits
   durables qu'avant, hors ajout de source : titre, dates, hôte, premier sujet, totaux et ordre
   des captures. Le titre choisi sur Mac atteint le disque via la fiche, sans affectation du store.
2. Source fournie et source inconnue restent distinctes ; absence historique n'invente rien.
   Une capture démarrée puis reprise sur le Mac enregistre la source de chacune ; une capture
   du serveur reste inconnue.
   Après plus de 100 reprises, seules les 100 dernières captures restent, createdAt/hôte/titre
   demeurent. Restaurer une liste historique plus longue reste silencieux jusqu'au nouvel ajout.
3. La bibliothèque continue de projeter interrompue/illisible selon ses fichiers et la session
   courante. Aucun état chargé/en fermeture n'est sauvegardé dans la fiche ; pas de durcissement
   implicite des anciennes formes ni renommage ou perte d'un champ historique.
4. Ouverture et fermeture d'une archive seulement lue n'écrivent rien et n'appellent aucun
   fournisseur. Pause/reprise gardent leur ordre, la cadence ses occasions sans passage prêt.
   Un refus final ou de barrière interdit la confirmation, et un nouvel essai n'hérite pas
   de la confirmation de la vie précédente. Coalescence et scellement restent ceux du store.
5. Tests de garde : import interne externe refusé, accès public déclaré accepté, import de
   Mémoire dans le domaine Bibliothèque refusé. Tous les appels de production préparant le
   manifeste passent par le même propriétaire ;
   `git grep -n 'store.manifest =' -- app runtime server` ne trouve aucune affectation,
   et `saveManifest` n'est appelé que par le service de fiche.
6. À l'implémentation, jouer `session-record`, `session-manifest`, `session-library`,
   `session-runtime`, `session-lifecycle`, `archive-compat`, les bancs de titre Mac et les gardes
   en séquentiel, puis `node scripts/check.mjs`. Aucun cas, corpus ou plancher affaibli.

## Test d'acceptation attendu

`tests/session-record.test.cjs` conduit les commandes et le convertisseur publics avec dates
injectées et manifestes historiques explicites. `session-manifest` garde ses tests de cadence
et de refus ; bibliothèque/runtime réels sur disque temporaire et banc IPC Mac prouvent que
la fiche écrit réellement le titre et les captures, sans réécrire une archive lue seule.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le plan dit « plafonné à 100 comme aujourd'hui » : la borne établie porte sur l'ajout d'une
capture, pas sur le décodage historique. Aucun contrat de fiche de source n'est encore livré ;
ce lot conserve une référence descriptive fournie ou inconnue, sans inventer l'application
TV ni la fenêtre capturée. T235 peut avancer indépendamment du contrat de fin T234 ; T236
attendra les deux, ainsi que la traduction des refus livrée par T253.

## Journal
