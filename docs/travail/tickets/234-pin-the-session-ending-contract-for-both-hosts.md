---
id: T234
titre: Pin the session ending contract for both hosts
statut: a-faire
bloque_par: T250
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Un même contrat de fin est exercé sur le Mac et le serveur, par leurs vrais raccords, avant
l'extraction du coordinateur unique. Ce lot reste limité aux tests ; il lit le résultat de fin
livré par T250. Les écarts encore présents du Mac sont nommés dans les données du banc et
disparaissent avec la migration de sa fin.

## Sources

- Plan du 17/10, T234 ; `docs/domaine.md`, sections Bibliothèque, 6 et 8 ; ADR 0030 qui amende
  l'ADR 0007. ADR 0002/0003/0004/0006/0020/0023/0024 restent obligatoires.
- Code vérifié à `1d8aa48` : `runtime/session-closing.cjs:73` lève `beginEnding`, exécute
  `begin`, puis entre dans la première étape avant attente. Il ne ferme pas lui-même l'admission.
  `runtime/session-closing.cjs:29` annule les questions, attend leurs fins visibles puis flush.
- Serveur : `runtime/headless-session-lifecycle.cjs:147` annule les préparations, puis
  `runtime/headless-session-lifecycle.cjs:155` attend pause et ingestions avant les questions.
  Mac : `app/main.cjs:368` révoque MCP ; `app/main.cjs:370` attend le résumé avant les questions
  et `app/main.cjs:378` attend les ingestions avant la pause. L'admission ne ferme qu'à cette
  étape capture ; l'écart n'est accessible qu'à la fermeture de l'application (`:402`, `:587`),
  les autres gestes refusant déjà une fin pendant capture (`:455-456`, `:464-465`, `:507`).
- `runtime/session-closing.cjs:64` rend id/archived/freedBytes/errors/refused ; sealed et held
  restent locaux à `runtime/session-closing.cjs:80` et `runtime/session-closing.cjs:104`.
  `runtime/headless-session-lifecycle.cjs:169` réduit encore ce résultat ; `app/main.cjs:395`
  ne rend que freedBytes. Le résultat demandé par le plan n'est pas déjà disponible.
- `tests/architecture-f07.test.cjs:82` exige explicitement archived:true malgré des échecs
  d'étapes ; `tests/architecture-f07.test.cjs:305` exerce déjà les deux compositions.
  `tests/session-lifecycle.test.cjs:278` couvre le cycle de ressources et ses erreurs ;
  `tests/mac-ipc-contract.test.cjs:867` et `tests/headless-session-lifecycle.test.cjs:310`
  fixent aussi les issues de fin. Ces attentes ne peuvent être changées silencieusement.
- État attendu après phase 1 : T227 implique projection commune et voies/états extraits,
  persistance T208, absence d'élagage T223 et politique vision applicative. Aucun de ces tickets
  ne change le résultat de fin ; T250 l'ajoute.

## Périmètre

- Après T250, créer `tests/session-ending-contract.test.cjs` avec
  un scénario paramétré par hôte, et des helpers de tests réutilisables issus des bancs actuels.
  Le Mac charge son vrai main et preload avec Electron simulé ; le serveur son runtime réel
  et ses routes HTTP. Les doubles pilotent ressources et pannes, pas un cycle de vie réinventé.
- Réutiliser les coutures T195/T203, les projections de phase 1 et les vrais propriétaires
  de checkpoint/ingestion. Extraire un helper d'un test existant est autorisé ; conserver ses
  scénarios, ses assertions utiles et leur nombre. Aucune modification de code produit.
- Avant la première attente, le contrat constate ce que fixe l'ADR 0030 : admission fermée,
  nouvelles questions et nouveaux appels MCP refusés, préparations serveur invalidées, contextes
  MCP Mac révoqués. Les questions sont annulées puis leur état remis au store avant l'archivage
  ou le scellement, à leur place dans l'ordre serveur (`runtime/headless-session-lifecycle.cjs:153-164`).
- Écarts Mac, décrits par leur comportement et sans identifiant de ticket dans le banc : ordre
  des étapes (`app/main.cjs:369-378`) ; à la fermeture de l'application seulement (`:402`), admission
  fermée à l'étape capture ; résultat de fin non public (`:395`), observé par le disque et le journal.
- Distinguer trois faits par le résultat public du propriétaire de la fin : archive confirmée,
  scellement confirmé, session effectivement déchargée. Ne déduire aucun de ces faits d'une
  liste d'erreurs vide, d'un `archived` seul ou d'un reset d'interface. Les adaptateurs gardent
  leurs réponses historiques ; ces faits sont ceux de T250.
- Nommer les capacités propres aux hôtes et les différences provisoires d'ordre de l'ADR 0007.
  Les différences qui contredisent l'ADR 0030 sont des manques, pas des exemptions pérennes.
  Les erreurs d'un adaptateur facultatif peuvent coexister avec une archive confirmée ; une
  obligation de sécurité/durabilité manquée interdit d'annoncer la fin globalement réussie.
- Si une garantie manque encore après prérequis, produire sa preuve rouge et s'arrêter avec
  le constat. Ne pas mettre un skip, changer l'attente, ajouter une fausse capacité au double
  ou corriger le produit dans ce ticket. Le lot ne peut être déclaré terminé sur ce rouge.

## Critères d'acceptation

1. La même fonction de contrat s'exécute pour les deux hôtes et retient leur première attente.
   Avant de la libérer, elle constate admission fermée, refus de nouveaux travaux, invalidation
   des préparations et révocation MCP selon capacités, refus des nouvelles questions.
   L'écart d'admission au départ de l'application Mac est caractérisé explicitement jusqu'à sa migration.
2. Chaque obligation (admission, préparations, révocation MCP, ingestions atterries, questions
   annulées et remises au store, état final avec barrière et manifeste, scellement avant effacement,
   lâcher de l'hôte, et surveillance selon la décision de T250) est rendue défaillante séparément.
   Les autres étapes sont tentées ; la fin ne se déclare pas réussie. Le résultat distingue précisément les faits qui ont réussi,
   dont une archive confirmée éventuellement conservée malgré une autre obligation refusée.
3. État final, barrière et manifeste sont retenus puis refusés séparément : aucune confirmation
   anticipée. Un bloc déjà stocké atterrit ; aucun traitement neuf ni réponse MCP révoquée ne
   passe. Les outils/baux restent tenus jusqu'au retour réel de l'agent et des appels en vol.
4. Scellement refusé, déchargement refusé et effacement refusé ne se confondent pas. Rien n'est
   supprimé sans scellement et déchargement ; les écritures tardives ne recréent pas un dossier.
   Les erreurs de ressource facultative restent diagnostiquées sans effacer une archive confirmée.
5. Fin répétée, archive rouverte sans reprise, suppression explicite et arrêt d'hôte conservent
   leurs garanties. Les capacités et écarts temporaires sont nommés dans les données du banc.
   Aucun événement/abonné n'est chargé seul d'une obligation.
6. À l'implémentation, après le correctif distinct, jouer le contrat, `architecture-f07`,
   `session-lifecycle`, `headless-session-lifecycle`, `mac-ipc-contract` et `server-sessions`
   en séquentiel, puis `node scripts/check.mjs`. Aucun test ou plancher affaibli.

## Test d'acceptation attendu

Dans `tests/session-ending-contract.test.cjs`, en réutilisant `HOSTS` et `onBothHosts` de
`tests/architecture-f07.test.cjs:305-306`, le contrat commun déclenche les vraies commandes de
fin via IPC/HTTP et observe les commandes aux propriétaires injectés, les fichiers et le résultat de fin. Promesses différées et temps
maîtrisés remplacent les attentes réelles. Un test du seul `closeSession` sur doubles ne prouve
pas le préambule des deux compositions et ne suffit pas à ce lot.

## Hypothèses bloquantes

Aucune décision n'est attendue. Le résultat de fin est celui que T250 a livré ; relire ses noms réels.

## Journal
