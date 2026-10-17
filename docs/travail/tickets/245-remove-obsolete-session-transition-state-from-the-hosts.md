---
id: T245
titre: Remove obsolete session transition state from the hosts
statut: a-faire
bloque_par: T243, T244
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Les hôtes ne conservent plus les propriétaires et raccords provisoires des transitions désormais
tenues par le coordinateur. Une seule autorité porte session chargée, sérialisation et faits de fin ;
les transports et projections conservent leur comportement public.

## Sources

- Dernier temps « contracter » de l'ADR 0030 et de `docs/domaine.md`, sections 3 Bibliothèque,
  6, 10 et 12. T237/T238/T239 ont migré le Mac, T240 l'accès effectif à l'agent, T241–T243
  les commandes TV, T244 les moments gardés. T243 et T244 couvrent ces branches de dépendances.
- Code vérifié à `1d8aa48` : `app/main.cjs:49` porte switching, `:51` closing/archiveOnQuit,
  `:52` loaded, `:107` la chaîne locale, `:314` adopt et `:353` endSession.
  Ce sont les points de départ de l'inventaire, pas la liste supposée des restes après migration.
- `runtime/headless-runtime.cjs:188` à `:216` délègue les faits du coordinateur ; `:378`
  délègue adopt, `:454` leave, `:457` release et `:463` located. Certaines lectures servent
  encore au produit : session/options/intake/projections/routes ne peuvent disparaître sans migration.
- `runtime/headless-session-lifecycle.cjs:40` à `:50` possède les transitions actuelles ;
  `runtime/session-lifecycle.cjs:34` possède séparément la fin des ressources. L'ADR 0020 impose
  de garder ce second cycle, même après disparition du nom « headless » du coordinateur.
- `runtime/headless-runtime.cjs:469` capture les faits d'une liste avant attente ; T192 garde
  cette cohérence. `app/session-rows.cjs:3` adapte encore l'ancien loaded Mac ; sa forme aura
  évolué après T216 et T223. La contraction ne doit pas recréer une lecture déchirée pendant une attente.
- Tests et appelants lus : routes serveur, main/preload, moment-actions, session-rows,
  headless-runtime, coordinateur actuel ; tests headless-session-lifecycle, mac-ipc-contract,
  server-sessions, session-lifecycle, architecture-f07 et session-delete.
- `tests/documentation-index.test.cjs:9` inventorie encore les anciens propriétaires runtime :
  aligner ce contrôle documentaire sur les modules réellement conservés, sans retirer son exigence de carte à jour.

## Périmètre

- Refaire l'inventaire des références sur les livraisons T237–T244 avant suppression : fichier,
  symbole, lecteurs produit, lecteurs de test et sort. Les repères ci-dessus sont ceux de la
  base `1d8aa48` ; aucun symbole n'est présumé mort par son seul nom ou parce qu'il est un getter.
- Retirer de `app/main.cjs` les références modifiables et fonctions provisoires qui possèdent
  encore la session ou sa transition, notamment le conteneur loaded hérité s'il existe encore.
  Les lectures passent par le coordinateur ou une projection détachée ; aucune copie modifiable
  ne devient un second registre de session ou un second détenteur de `fresh`/ending.
- Distinguer fermeture d'hôte et fermeture de session : le garde Electron de départ de l'application,
  ses minuteries et ses ressources globales restent là où ils ont une responsabilité propre.
  Ne pas retirer un booléen d'hôte nécessaire au prétexte que son nom ressemble à celui du coordinateur.
- Retirer les délégations mortes de HeadlessRuntime et l'ancienne façade du coordinateur headless
  si tous leurs appelants sont migrés. Les adaptateurs HTTP et les coutures publiques encore
  nécessaires restent possibles, sans logique ni état dupliqués. Migrer leurs vrais lecteurs
  au propriétaire public ; ne pas supprimer des sondes de sécurité pour faire disparaître un usage.
- Vérifier qu'aucune couture de T237 ou T238 ne subsiste ; retirer les autres raccords
  transitoires et les exceptions de garde devenues inutiles. Les étapes de révocation, annulation, sauvegarde, barrières et scellement
  restent appelées par le coordinateur et le cycle de ressources, jamais confiées aux abonnés.
- Garder les projections T219/T224/T225, la politique T227 et les règles partagées T191/T192.
  Ne pas fusionner runtime de ressources et runtime d'hôte, ni dissoudre tout HeadlessRuntime :
  ses questions, surveillance, vues et transport dépassent cette contraction Bibliothèque.
- Adapter les tests et doubles par leurs frontières publiques, conserver tous leurs cas et
  garanties. Compléter la description de responsabilité et l'ADR de T236 dans `docs/architecture.md`
  et l'ADR existant ; pas d'ADR nouveau requis pour retirer la transition prévue.
  Adapter l'inventaire de documentation-index au remplacement effectif du coordinateur et
  conserver ses scénarios de diagnostic d'un propriétaire absent de la carte.
  Élaguer les suppressions ESLint devenues inutiles, sans déplacement de gel ou changement du harnais.

## Critères d'acceptation

1. `rg -n 'let loaded\b|let transition\b|const exclusive\b' app/main.cjs` ne renvoie rien ;
   chaque délégation de `HeadlessRuntime` encore présente (repères
   `runtime/headless-runtime.cjs:188-216`, `:378-383`, `:454-468` à `1d8aa48`) figure au journal
   avec ses appelants relevés par `rg`. Chaque délégation supprimée est sans appelant restant ;
   chaque façade conservée a ses lecteurs et sa responsabilité nommés.
2. Les scénarios start → pause → reprise → fin, ouverture en lecture seule → question → départ,
   suppression chargée/non chargée et départ de l'application ont les mêmes résultats observables après contraction.
   Le contrat T234 passe pour les deux hôtes et les pannes obligatoires ne deviennent pas des succès.
3. Une liste et un stockage retenus pendant A → B gardent les faits de la session à l'entrée
   de la requête (T192). Les changements tardifs de mémoire, question ou recherche de A n'agissent
   pas sur B ; les étapes obligatoires ne dépendent d'aucune livraison d'événement réussie.
4. Archive confirmée, scellement et déchargement restent distincts ; les ressources de chaque
   session sont fermées une fois. Aucune écriture tardive ne recrée le dossier supprimé ; une
   archive vide reprise et un moment gardé conservent leurs garanties après départ de leur session.
5. Les témoins d'archives et de fil restent intacts ; les nouveaux champs/commandes T241–T243
   et leurs chemins anciens gardent les mêmes comportements. Aucun nom persisté, URL, code
   historique ou canal n'est retiré dans cette contraction.
6. À l'implémentation, jouer en séquentiel les tests cités, `tests/headless-session-lifecycle.test.cjs` (ou le fichier
   du coordinateur nommé au journal de T236), le contrat
   T234, archive-compat, wire-contract, les tests TV/Python affectés et les gardes, puis
   `node scripts/check.mjs`. Le journal donne l'inventaire avant/après et les résultats observés,
   sans objectif artificiel de taille de fichier ni baisse de tests ou de planchers.

## Test d'acceptation attendu

Réutiliser les bancs IPC/HTTP et le contrat du coordinateur, avec les courses et refus existants.
Le relevé de références par `rg` puis lecture des appelants justifie les suppressions ; il ne
remplace pas les preuves de comportement. Les tests de ressources gardent leurs stores et
promesses différées ; aucun Electron natif, TV distante ou fournisseur réel n'est sollicité.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Les restes réellement présents après les prérequis ne sont pas établis aujourd'hui : l'inventaire
est une condition d'entrée, pas une permission de supprimer tous les getters de HeadlessRuntime.
Les interdictions de fusion de T191/T192 sont amendées par l'ADR 0030 ; leurs invariants restent.
Les changements de phase 1 dans ces fichiers sont transitivement ordonnés après T227.

## Journal
