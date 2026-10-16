---
id: T225
titre: Stop building the full snapshot to notify
statut: a-faire
bloque_par: T224, T208
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: critique
---

## Ce que le ticket livre

La racine Mémoire notifie des faits ou invalidations bornés et ne construit plus son snapshot
complet pour prévenir les lecteurs. Les deux hôtes utilisent la projection applicative déjà livrée,
et `session.json` reste écrit uniquement par le convertisseur avec ses barrières explicites.

## Sources

- Troisième lot de T219, relecture B, constat 5 ; `docs/domaine.md`, sections 6, 8 et 9 ;
  ADR 0029/0030. T224 implique la migration serveur T219 et tous les lecteurs T209 à T213 ;
  T208 sépare archive et état publié. Relire leurs contrats, invalidations et tests avant contraction.
- Code vérifié à `dd5efc9` : `core/session.cjs:506` construit le snapshot dans `emit()`,
  `:513` le sauvegarde et `:520` publie l'issue de sauvegarde ;
  `runtime/session-runtime.cjs:176-180` chaîne encore index, manifeste et hôte.
- `adapters/local-store.cjs:157-169` coalesce par document, `:202` porte la barrière ;
  `runtime/session-lifecycle.cjs:118` confirme avant le manifeste final. Aucun abonné ne remplace cela.
- `runtime/headless-runtime.cjs:241-246` construit par auditeur seulement quand il en existe ;
  seul `scripts/replay-lg-stream.cjs:121` s'abonne hors tests. La mesure 0/1/3 est un banc de
  contrat de coût, pas un gain produit établi. ADR 0025 conserve les garanties Mac.
- Tests : session-durable, session-lifecycle, server-state-views, server-sessions,
  mac-ipc-contract, state-delivery et architecture-f04/f08/f10 sous `tests/`, suffixe `.test.cjs`.
  ADR 0002/0003/0004/0006/0008/0023 restent obligatoires.

## Périmètre

- Retirer le callback complet de `WatchSession.emit()` et son chaînage hérité dans le runtime
  partagé seulement après inventaire des consommateurs. Garder la consultation explicite
  compatible encore nécessaire, sans construction complète par notification ou par abonné.
- Compléter la matrice des invalidations T219 : progression, départ/fin de voie, pertes,
  disponibilité, retenue, admission suspendue, pause/reprise, lecture seule, erreurs de traitement
  et sauvegarde ; les hôtes ajoutent questions, quotas, index, stockage et chargement.
  Une notification non liée à un passage reste une invalidation bornée, documentée dans l'ADR.
- Relever aussi cycle de vie, moments gardés, protocoles média, recherche Mac et simulateurs hors
  sept familles. Donner la projection applicative aux demandeurs d'état publié, sans redonner
  un snapshot complet à chaque abonné ni élargir MemoryView à d'autres contextes.
- Garder au plus une projection complète partagée par livraison, les lectures bornées des
  abonnés spécialisés et les occasions de cadence manifeste sans passage nouveau. Aucun rejeu,
  nouvelle file historique ou minuterie du domaine. Détacher au remplacement de session.
- Vérifier `session.json` uniquement par T208, jamais par la projection publiée. Les sauvegardes,
  leur ordre, `saveError`, la coalescence, la barrière et le scellement restent des appels
  obligatoires explicites ; aucun abonné isolé n'en devient l'unique responsable.
- Adapter seulement racine, runtime partagé, lectures restantes et tests affectés. Ne pas
  refondre les cycles de vie ou déplacer la racine. Compléter l'ADR T219, maintenir les zones
  T205 et élaguer les suppressions ESLint devenues inutiles sans déplacer de dette.

## Critères d'acceptation

1. Les sept lecteurs et les deux hôtes fonctionnent sans callback snapshot complet. Aucune
   notification du domaine ni abonné spécialisé ne construit une vue complète pour son usage propre.
2. Une matrice conduite par promesses couvre progression et départ/fin des voies, pause/reprise,
   retenue, stockage plein, échec puis retour de sauvegarde, archive ouverte et remplacement.
   Le dernier état est visible même sans nouveau texte de passage publié.
3. Dans le même scénario avant/après contraction, compter constructions de snapshots complets,
   MemoryView complètes/bornées et projections pour 0, 1 puis 3 abonnés. Ajouter un abonné n'ajoute
   pas de construction complète ; trois changements rapprochés gardent le dernier état. Consigner
   les comptes sans annoncer de gain de latence/mémoire ni les assimiler à des auditeurs produit.
4. Un premier abonné et son diagnostic défaillent : les autres reçoivent l'état, les voies continuent
   et les sauvegardes obligatoires sont tentées. Le dernier `session.json` écrit par T208 contient
   les faits acquis, y compris le bloc qui atterrit pendant fermeture.
5. Derrière un disque retenu, une écriture et au plus un dernier état attendent par document.
   Refuser l'état final ou la barrière empêche `archived:true` ; réessayer confirme cette vie,
   sans double fermeture de ressources ni résurrection d'un dossier scellé.
6. Les corps figés T213, le contrat T038, ETags/304 et ADR 0025 gardent leurs preuves. Jouer les
   suites citées, memory-projection, wire-contract et contrats d'événements/vue/archive affectés
   en séquentiel, puis `node scripts/check.mjs`. Aucun test ou plancher n'est retiré.

## Test d'acceptation attendu

`tests/memory-projection.test.cjs` compose vraie mémoire, abonnés comptés et disque maîtrisé.
Les suites session-lifecycle/session-durable retiennent puis refusent état final/barrière,
y compris quand l'abonné et son diagnostic échouent. Les bancs des deux hôtes vérifient la
livraison réelle ; le comptage passe par une couture injectée, sans comparaison du source.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T208 doit déjà avoir séparé écrivain et projection. S'il manque ce contrat, signaler le manque
avant de contracter : ne pas réimplémenter la persistance dans ce lot critique. Ajouter une
invalidation manquante n'autorise pas à confier la sauvegarde au diffuseur.

## Journal
