---
id: T208
titre: Read and write session archives through a versioned converter
statut: termine
bloque_par: T222, T205
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: critique
---

## Ce que le ticket livre

`session.json` reçoit un format et une version explicites, lus et écrits par un convertisseur de la
Mémoire distinct du snapshot publié. Les formes historiques établies restent ouvrables sans réécriture,
sans reprise d'analyse et sans perte des passages, questions, compteurs ou raisons d'indisponibilité.

## Sources

- `docs/domaine.md`, section 9 ; ADR 0029/0030. T222 étend le corpus figé T037 avant conversion ; T194
  conserve les questions historiques après retrait de leur ancien chemin actif. Relire leur livraison.
  T205 est ajouté pour placer le nouveau convertisseur dans `core/memory/` avec son entrée publique.
- Code vérifié à `dd5efc9` : `core/session.cjs:18` et `:20` valident la forme restaurable ;
  `:438` restaure ; `:443` utilise l'absence de `retention` comme marqueur implicite.
  `core/session.cjs:476` reprend history sans média, `:478` les questions, `:480` reprend la séquence
  au-delà des passages et orphelins ; `:486` honore `until-deleted` ; `:487` fixe la lecture seule.
- `core/session.cjs:489` construit le snapshot ; `:513` le sauvegarde tel quel, sans version.
  `runtime/session-runtime.cjs:171` et `:172` injectent le même store comme média et archive.
  `adapters/local-store.cjs:143` charge le JSON et `:185` sauvegarde session ; `:159` coalesce,
  `:172` écrit le temporaire, `:173` renomme. `runtime/session-lifecycle.cjs:118` confirme les
  états avant le manifeste final ; aucun second écrivain produit direct n'a été relevé.
- `adapters/session-library.cjs:97` valide l'état ;
  `:104` ajoute les paires dont l'intervalle est connu ; `:112` compte les orphelins.
  `runtime/session-lifecycle.cjs:3` adopte inventaire et miniatures, puis fournit `hasMedia`,
  `hasThumbnail` et orphelins au cœur. `runtime/session-runtime.cjs:52` valide avant composition.
- `adapters/session-library.cjs:26` reconnaît deux rétentions pour son classement sans manifeste ;
  `:43` classe une valeur absente ou inconnue comme ancienne. Le cœur ne teste que l'absence :
  cette différence existe et ne doit pas être « corrigée » au passage.
- Tests lus : session-durable (formes historiques à `tests/session-durable.test.cjs:236`),
  session-lifecycle (restauration à `tests/session-lifecycle.test.cjs:186`), server-sessions,
  clip-unreadable, architecture-f08 et les tests de persistance. ADR 0002/0003 : confirmation,
  coalescence et scellement ; ADR 0006/0008/0023 : admission et aucune analyse rejouée à l'ouverture.

## Périmètre

- Rejouer le corpus historique étendu par T222 avant toute modification produit ; il est le
  témoin indépendant des lectures. Ne pas ajouter ses variantes ni régénérer ses témoins ici.
- Créer le convertisseur pur dans `core/memory/archive.cjs`, exporté par `core/memory/index.cjs` :
  `toArchive` encode le modèle sauvegardable, `fromArchive` décode et valide le document.
  Écrire `format: 'tvlens-viewing-memory'`, `version: 1` dans `session.json`, en conservant les champs
  historiques à leur nom et valeur. Le manifeste garde son format distinct `tvlens-session`.
  La version 1 écrit, en plus de `format` et `version`, exactement les clés de premier niveau que
  `snapshot()` écrit aujourd'hui, et pour chaque passage de `segments` et de `history` toutes ses
  clés, sans liste blanche. Retirer un champ du disque demande une version 2 et son témoin.
- Déclarer ou enrichir la sous-zone et les permissions de ses lecteurs dans la garde de T205.
  Si T207 a créé l'index public, l'utiliser ; sinon le créer sans réexport des structures internes.
  Le convertisseur ne dépend ni des hôtes ni du disque ni de `MemoryView` ou de `snapshot()`.
  Le nouveau code et toute logique déplacée arrivent sans infraction gelée ; élaguer les suppressions
  devenues inutiles conformément aux standards, sans relever leurs comptes.
- Faire passer la sauvegarde de `WatchSession.persist()` et les lectures bibliothèque/runtime par
  ce convertisseur. Garder un seul emplacement de validation de format ; les exports historiques
  encore appelés peuvent déléguer, sans seconde interprétation parallèle. `LocalSessionStore` reste
  responsable d'écrire atomiquement le document, pas de connaître le domaine ou un statut HTTP.
- Séparer décodage historique et restauration effective : inventaire réel, récupérations, disponibilité,
  états interrompus, séquence et lecture seule gardent leurs propriétaires actuels. L'absence du
  marqueur historique reste distinguable ; ne pas normaliser `retention` trop tôt et changer not-kept
  en expired. Ne pas relancer l'élagage à l'ouverture ni retirer la rétention dans ce ticket.
- Un format étranger, une version future ou une enveloppe partielle sont refusés avant restauration
  et sans écriture. Seuls les documents sans aucun des deux marqueurs suivent le lecteur historique.
  Écrire un ADR court et `tests/session-archive.test.cjs` ; prolonger archive-compat et les tests
  de lecture/écriture affectés. Aucun changement de snapshot, de fil `/v1`, de nom d'identifiant,
  de document questions/résumé vivant/surveillance, ni migration destructive sur place.

## Critères d'acceptation

1. Chaque variante historique est lisible par `SessionLibrary.read()` puis le runtime réel : mêmes
   identités, ordre, bornes, observations, questions, compteurs et motifs média attendus. Sommes du
   corpus et octets de la copie sont inchangés après ouverture et fermeture sans reprise.
   La lecture reste indépendante du convertisseur qui écrit la nouvelle version.
2. Une sauvegarde nouvelle écrit les marqueurs annoncés ; la lecture par `fromArchive` et l'ouverture
   publique restituent le même modèle sauvegardable. Le snapshot et les réponses publiées gardent
   leurs clés et valeurs précédentes : les marqueurs d'archive n'apparaissent pas sur le fil.
3. Format/version invalides, futurs et enveloppes partielles sont refusés sans fallback historique
   trompeur, sans réécriture du dossier. Le refus passe par les codes déjà livrés si disponibles,
   jamais par une nouvelle reconnaissance de texte d'erreur ni un statut HTTP dans le cœur.
4. Disque retenu : une écriture en cours et au plus une attente par document. Refus puis reprise,
   pause/fin, barrière et scellement conservent les garanties des ADR 0002/0003. Aucun abonné à un
   événement n'est seul chargé de la sauvegarde ou de la confirmation finale.
5. Pour chaque session du corpus et pour une session neuve conduite par le runtime,
   `fromArchive(toArchive(…))` restitue les mêmes clés de premier niveau et, passage par passage,
   les mêmes clés et valeurs que le `session.json` historique, `format` et `version` mis à part.
   Comparer les données JSON réellement écrites ; la restauration effective garde ses traitements
   explicites de disponibilité et d'analyse interrompue, séparés du décodage sans perte.
6. À l'implémentation, exécuter en séquentiel session-archive, archive-compat, session-durable,
   session-lifecycle, server-sessions, clip-unreadable, architecture-f08 et les tests d'architecture,
   puis `node scripts/check.mjs`. Comparer le corpus avant/après ; aucun test ou plancher ne baisse.

## Test d'acceptation attendu

Rejouer `tests/archive-compat.test.cjs` sur les témoins historiques de T222 avant le changement
d'écrivain. `tests/session-archive.test.cjs` teste les deux fonctions pures, puis les suites bibliothèque
et runtime prouvent la lecture sans effets et la nouvelle écriture réelle sur disque temporaire.
Un aller-retour du nouveau convertisseur seul ne constitue pas la preuve de compatibilité.

## Hypothèses bloquantes

Aucune décision n'est attendue.

« Toutes les formes passées » désigne les formes établies par le code et les témoins disponibles,
pas des archives déployées que cette session n'a pas lues. Toute autre forme découverte doit être
ajoutée comme témoin avant d'étendre le lecteur. Les variantes de résumé vivant sont hors de ce
format. La sous-zone peut être créée ici si T207 n'est pas encore livré ; T214 la complétera ensuite.
Le changement de rétention relève de T215 (hôtes/archives), puis T223 (élagage et tests dédiés).

## Journal

- Cadrage : ticket et `docs/standards.md` lus ; aucun jalon ni rapport d'échec, ce n'est pas une reprise.
- Exploration (`.harness-state/tickets/T208/exploration.md`) : seul écrivain `WatchSession.persist()`
  (`core/session.cjs:492`) vers `LocalSessionStore.save` ; la forme est validée à cinq endroits
  (`restorable` du cœur, `restore()`, bibliothèque `:111`, runtime `:59-68`, syntaxe JSON du store).
  Code livré réutilisable : `TVLENS_ARCHIVE_INVALID` (traduit en 400 `invalid-archive` par le serveur).
  Deux contraintes hors ticket, dans le périmètre : `adapters/**` doit gagner `core/memory/**` dans la
  garde ; `tests/architecture-f08.test.cjs:142` restaure ce que le port a reçu, donc une enveloppe v1.
  Références `chemin:ligne` du ticket décalées depuis `dd5efc9`, contenu inchangé ; aucun écart de périmètre.
- Base avant changement, en séquentiel (`node --test tests/<nom>.test.cjs`, journaux `base-*.log`) :
  archive-compat 22/22, session-durable 23/23, session-lifecycle 15/15, server-sessions 29/29,
  clip-unreadable 5/5, architecture-f08 23/23, architecture 10/10, architecture-guard 495/495,
  session-library 12/12, session-runtime 7/7, server-routes 47/47. Empreintes des 148 fichiers de
  `tests/fixtures/archives` notées dans `corpus-avant.sha256`.
- Implémentation (agent `implementeur`, journaux `impl-*.log`) : `core/memory/archive.cjs` (`toArchive`,
  `fromArchive`, validation déplacée, code `TVLENS_ARCHIVE_INVALID`) publié par l'index ; `persist()`,
  `restore()`, la bibliothèque et `createSessionRuntime` passent par lui ; garde : `adapters/**` reçoit
  `core/memory/**`. Nouveau `tests/session-archive.test.cjs` (17), cas ajoutés à session-library (+4),
  session-runtime (+5), session-durable (+1), server-routes (+1), archive-compat prolongé. Rouge vu pour
  chaque ajout selon le compte rendu ; suites ciblées vertes, `check --changed` et `check` complet verts
  (2432/2432 JS, 47 Python) d'après `impl-check-full.log` ; empreintes du corpus identiques.
- ADR `docs/adr/0047-session-json-porte-un-format-et-une-version-lus-par-un-convertisseur.md` écrit et
  indexé dans `docs/architecture.md` (avec une phrase sur `toArchive`/`fromArchive` dans la section Mémoire).
- Relecture 1 (`node scripts/loop/reviewed-state.mjs record --ticket T208`, `revue-1.diff`) : relecteur neuf,
  `VERDICT : accepté`, `CONSTATS : 0 bloquant, 0 mineur, 0 hors périmètre` (`relecture-1.md`, enregistrée
  dans `relectures.jsonl`). Aucune correction.
- `node scripts/check.mjs` sur l'état de la relecture 1 : vert, 2432/2432 JS, 47 Python (`check-full-final.log`).
- Correction de l'ADR par l'orchestrateur : la phrase « une archive v1 ne s'ouvre plus avec une version
  antérieure » était fausse (l'ancien `restorable` ignore les clés en plus). Relecture de correction 1
  (`revue-2`) : `à corriger`, 1 mineur, `NON CORRIGÉS : 0` — la nouvelle phrase affirmait à tort qu'une
  v2 serait toujours ouverte. Reformulée au conditionnel (refus par la forme seulement). Relecture de
  correction 2 (`revue-3`) : `accepté`, 0 constat, `NON CORRIGÉS : 0` (`relecture-3.md`). Code et tests
  inchangés depuis la relecture 1.
- `node scripts/check.mjs` sur l'état final relu : **vert**, règles, format, lint, gel et cliquet verts
  (lignes_longues_prod 422 → 420, cas_de_test_produit 1258 → 1269), **2432/2432 tests JS** sur 137
  fichiers, 47 tests Python OK (`check-full-revue-3.log`). Empreintes des 148 fichiers du corpus
  identiques à `corpus-avant.sha256`. Aucun test supprimé ou assoupli, aucun plancher ni harnais
  protégé modifié. Verdict `TERMINÉ`, intégration laissée à la boucle.

### Réserves à la clôture

- Non vérifié : ouverture dans l'Electron réel et depuis la TV ; seuls la bibliothèque, le runtime headless et les routes HTTP ont été exercés en test.
- Question pour le propriétaire : avec un manifeste, list() ne lit pas session.json ; une session dont session.json porte une version future y apparaît selon son manifeste, puis est refusée à l'ouverture (contrat de liste inchangé, refus avant restauration tenu).
