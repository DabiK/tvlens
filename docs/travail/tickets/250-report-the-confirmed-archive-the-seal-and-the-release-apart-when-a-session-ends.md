---
id: T250
titre: Report the confirmed archive the seal and the release apart when a session ends
statut: a-faire
bloque_par: T227, T254
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Le résultat de fin distingue l'archive confirmée, le scellement et le déchargement effectif ; il
nomme les obligations en échec et dit si la fin est complète. Ces faits sont ajoutés au résultat
serveur sans changer ses statuts ni refus, ni les réponses IPC du Mac.

## Sources

- Coupe de T234, relecture A, constat 1, et décision du propriétaire du 17/10 reproduite ci-dessous.
  ADR 0030 pour les trois faits de fin et les obligations ; ADR 0007 pour les étapes toutes tentées,
  ADR 0002/0003/0004/0020 pour barrière, ressources et outils. `docs/domaine.md`, sections 6 et 8.
- Code vérifié à `1d8aa48` : `runtime/session-closing.cjs:63-70` construit le résultat sans ces
  faits ; `:73-79` engage le préambule puis toutes les étapes. `:95-96` confirme localement
  le scellement, `:105-112` appelle `letGo` et garde localement son échec ; `:121` efface
  seulement après scellement et lâcher de l'hôte. `:29-35` annule et remet les questions au store.
- `runtime/headless-session-lifecycle.cjs:147-164` fixe les étapes serveur, `:169-170` réduit
  le résultat dans `lastEnd`, `:180` définit la fin sans session. `server/session-routes.cjs:66-67`
  expose end et son alias close. `app/main.cjs:395` rend seulement `freedBytes` par IPC.
- `runtime/session-lifecycle.cjs:118-149` confirme état final, barrière et manifeste, `:153-160`
  scelle. `runtime/surveillance-runtime.cjs:568-574` attend la dernière écriture du registre ;
  son chemin d'écriture `:224-239` absorbe les refus dans des diagnostics, ce qu'un simple retour
  de `reset` ne permet pas de confondre avec une écriture confirmée.
- Filets : `tests/architecture-f07.test.cjs:67` définit `outcome`, `:82-94` conserve une archive
  malgré des échecs d'étapes ; `tests/headless-session-lifecycle.test.cjs:310` fixe le résultat
  headless. `eslint-suppressions.json:276-279` gèle une occurrence de complexité du protocole.
- T227 implique toute la phase 1 des fichiers concernés, dont T223 qui modifie la description
  de rétention à `runtime/headless-session-lifecycle.cjs:62-67`. Relire les interfaces livrées.

## Périmètre

- Étendre `runtime/session-closing.cjs` par `sealed`, `released`, une liste d'obligations en
  échec et un indicateur de fin complète. Nommer les champs réels dans les tests et le journal.
  `sealed` confirme un appel de scellement réussi ; il n'est jamais déduit de `archived`.
  `released` confirme `letGo` sans exception ; un reset d'interface ne le prouve pas.
- Déclarer explicitement les obligations applicables et les fermetures facultatives dans les
  étapes remises au protocole, sans comparaison de message. Admission, préparations/révocation,
  ingestions atterries, questions annulées et remises au store, état final avec barrière/manifeste,
  scellement avant effacement et lâcher de l'hôte restent des obligations. La dernière écriture
  du registre de surveillance est obligatoire selon la décision ci-dessous. Une étape inapplicable
  n'est pas un échec : une archive conservée n'exige pas le scellement réservé à l'effacement.
- Faire remonter le refus de la dernière écriture de surveillance de cette session jusqu'au
  résultat, même si le runtime garde ses diagnostics sans rejeter `reset`. Adapter seulement son
  raccord de fin et la confirmation nécessaire ; aucune refonte du registre ou du format disque.
  Les fermetures de fournisseurs restent diagnostiquées sans rendre la fin incomplète.
- Conserver `id`, `archived`, `freedBytes`, `errors`, `refused` et leurs garanties. Toutes les
  étapes restent tentées. L'archive peut être confirmée malgré une autre obligation en échec ;
  la fin globale reste alors incomplète. Ne pas élargir les conditions de rejet ou changer le sort
  du dossier pour fabriquer cette distinction. Aucun effacement sans scellement et déchargement.
- Propager les ajouts dans `lastEnd`, `/v1/session/end` et l'alias close, sans changer les statuts
  ni les refus historiques. Définir aussi leur résultat sans session. Le Mac remet ses étapes
  et leurs obligations au protocole mais conserve exactement ses réponses IPC ; T239 migrera sa fin.
- Étendre l'aide `outcome` de `tests/architecture-f07.test.cjs:67` sans rien retirer, puis
  les tests headless, serveur et fil. Seules les attentes de champs ajoutés évoluent ; les preuves
  de durabilité, l'ordre, les erreurs et les refus restent vérifiés. Élaguer le gel devenu inutile,
  sans augmenter `complexity:1` ni déplacer une infraction dans un nouveau fichier.
- Ne pas corriger ici l'ordre Mac, ajouter de préambule d'annulation des questions avant attente,
  extraire le coordinateur ou changer les codes/statuts de transport : T234 fixe le contrat,
  T253 traite les refus, puis T236 extrait le coordinateur.

## Critères d'acceptation

1. Le protocole rend séparément archive confirmée, scellement effectué, lâcher réussi,
   obligations en échec et fin complète. Chaque fait suit son opération réelle, jamais une
   simple liste d'erreurs vide. Les chemins archive, session vide, suppression et absence de session
   ont des résultats définis ; une fin répétée ne réemploie pas une confirmation étrangère.
2. Retenir puis refuser séparément une obligation empêche toute fin complète ; toutes les autres
   étapes sont tentées. L'échec est nommé, et les faits réussis restent vrais. Un refus d'archive
   ne devient jamais `archived:true`, même si le manifeste historique dit déjà « archivée ».
3. Le refus de la dernière écriture de surveillance rend la fin incomplète et figure dans les
   obligations en échec. Un refus de fermeture du chat ou du résumé vivant garde son diagnostic
   sans rendre la fin incomplète quand toutes les obligations ont réussi.
4. Scellement et libération refusés restent distincts ; aucun effacement sous une session tenue.
   Les règles de `refused`, les erreurs collectées et la priorité du refus existant restent celles
   du protocole. Aucun dossier n'est recréé par une écriture tardive.
5. Le vrai client T038 reçoit les ajouts par end et close, avec les mêmes statuts et refus.
   Les réponses IPC Mac restent identiques ; `architecture-f07` conserve tous ses cas et assertions
   historiques hors ajout des faits. Aucun fournisseur réel n'est utilisé.
6. À l'implémentation, jouer en séquentiel `architecture-f07`, `surveillance-runtime`,
   `headless-session-lifecycle`, `server-sessions` et `wire-contract`, puis
   `node scripts/check.mjs`. Aucun test, compteur ou plancher affaibli.

## Test d'acceptation attendu

Étendre `tests/architecture-f07.test.cjs` par les pannes d'obligations et de fermetures facultatives,
avec des promesses retenues. `tests/headless-session-lifecycle.test.cjs` observe `lastEnd` ;
`tests/server-sessions.test.cjs` et `tests/wire-contract.test.cjs` exercent les vraies routes.
`tests/surveillance-runtime.test.cjs` fait refuser la dernière écriture réelle du faux store,
sans remplacer ce refus par une simple exception inventée dans le coordinateur.

## Hypothèses bloquantes

Décision du propriétaire, le 17/10 (« Surveillance oui, fournisseurs non », en réponse à la
question posée) : la dernière écriture du registre de surveillance
(`runtime/surveillance-runtime.cjs:568-574`) est une obligation : son échec rend la fin incomplète.
La fermeture des fournisseurs (agent de chat, résumé vivant) n'en est pas une : son échec est
noté, sans rendre la fin incomplète (ADR 0007).

Question posée : quand une session se termine, quelles étapes doivent avoir réussi pour que
la fin soit déclarée « complète » ?

Aucune décision n'est attendue. Les noms exacts des nouveaux champs sont fixés par ce lot et
relus par T234 ; ils ne sont pas réputés présents à la base `1d8aa48`.

## Journal
