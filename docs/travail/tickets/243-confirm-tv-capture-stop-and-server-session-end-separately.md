---
id: T243
titre: Confirm TV capture stop and server session end separately
statut: a-faire
bloque_par: T242
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

La page TV arrête sa capture locale puis demande au serveur de finir la session nommée. Elle
affiche séparément l'arrêt local et la fermeture serveur ; Python s'arrête aussi s'il reçoit le
refus codé `session-ended`, sans reprendre sa capture de lui-même.

## Sources

- `docs/domaine.md`, sections 9 et 10 ; ADR 0030. T241 nomme les commandes, T242 apporte
  l'attente d'arrêt local ; T250 fournit le résultat réel de fin, T236/T239 le raccordent aux deux hôtes.
- Code vérifié à `1d8aa48` : `tv/app/companion.js:329` arrête déjà la capture locale,
  `:331` attend sa sortie dans une borne de 15 s, puis `:340` appelle end avec `{}`.
  L'ordre demandé existe donc partiellement ; les confirmations distinctes et la cible manquent.
- `tv/app/capture-control.js:61` passe encore par un hook close non nommé ;
  `tv/app/remote-client.js:168` porte `closeSession`. Les autres chemins de départ de session
  doivent garder la même cible que le geste, sans clore la session adoptée depuis.
- `tv/app/timeline-view.js:63` appelle onEnd sans identité, puis `:65` réinitialise la frise
  après succès. Le dialogue `tv/app/index.html:163` ne possède qu'un emplacement d'erreur à
  `:172` ; les deux confirmations n'y sont pas déjà représentées.
- `tv/transport.py:64` arrête déjà pour session absente, changée ou non accueillante.
  `:76` lit les refus HTTP ; `:88` classe actuellement un 410 `session-ended` comme rejet
  générique du bloc, sans arrêter la capture. `tv/capture.py:82` sait propager un arrêt SessionChanged.
- `runtime/capture-intake.cjs:17` émet `stale-session`, `:28` `session-stopped` et `:9`
  `session-closing`. `/v1/segments` ne produit pas aujourd'hui le 410 `session-ended` : ce code
  existe sur les médias (`server/session-routes.cjs:6`, `:27`), pas comme fait d'ingestion établi.
- Tests lus : `tests/test_tv_control.py:322` et `tests/test_tv_capture.py:504` caractérisent
  expressément le 410 simulé sans arrêt ; T204 autorise leur évolution volontaire dans ce lot.
  wire-contract, tv-paired-page, tv-panel et le raccord timeline portent les garanties de page.

## Périmètre

- Modifier companion, les appels de fermeture ou de changement de session dans capture-control/sessions-view,
  remote-client, timeline-view, le dialogue d'index.html et les libellés nécessaires aux confirmations.
  Adapter les aides DOM du banc aux seuls éléments ajoutés. Réutiliser l'attente locale
  T242 ; la page est seule coordinatrice des deux processus, aucun appel du serveur vers la TV.
- Figer le `sessionId` au geste, arrêter localement, confirmer par l'état du contrôleur puis
  envoyer end/close nommé. Ne pas déduire l'arrêt local de `ended:true`, ni la fermeture serveur
  d'un processus local terminé. Sur timeout local, ne pas demander la fin comme si l'arrêt était confirmé.
  La confirmation garde la cible présentée à l'ouverture du dialogue, même si la frise reçoit
  une autre session avant son appui ou pendant l'attente ; ne pas relire une identité mutable à la fin.
- Rendre visibles deux faits indépendants, avec état « non confirmé » en cas d'échec. La fin
  serveur se lit dans le résultat T250 : déchargement effectif distinct d'archivage confirmé.
  Un `archived:false` ou échec obligatoire n'est jamais présenté comme une archive conservée.
  Une perte de réponse réseau ne vaut pas confirmation ; un nouvel essai reste nommé et explicite.
  Après un `stale-session` sur un nouvel essai, ou une réponse sans les faits de T250 conservés
  par T236, la page relit `/v1/sessions` (`tv/app/remote-client.js:159`) : « session fermée »
  seulement si la session visée n'est plus `current`, « archive confirmée » seulement si sa ligne
  est `archived`, sinon « non confirmé » ; jamais « serveur refusé » pour une session réellement fermée.
  Les faits acquis restent consultables après fermeture du dialogue et lors des polls suivants ;
  le reset de frise ne doit pas les effacer avant qu'ils puissent être lus.
- Étendre transport Python et le libellé d'arrêt capture pour reconnaître le code exact
  `session-ended` et lever l'arrêt définitif, quelle que soit la langue du message. Garder
  `lastRefusal`, compter le bloc refusé une seule fois et les blocs encore abandonnés séparément ;
  le rapport indique la cause stable et aucun bloc suivant ne repart vers une autre session.
- Le 410 de T204 reste une réponse simulée de compatibilité tant que le serveur n'en produit
  pas sur ingestion. Ce lot ne remplace pas silencieusement `stale-session`, `session-stopped`
  ou `session-closing`. Le prévol existant assure toujours l'arrêt contre le serveur courant.
  Un ancien Python garde ce comportement connu ; les commandes sans identité restent celles de T241.
- Toute nouvelle cause de `drop()` reçoit son libellé dans `DROP_LABELS`
  (`tv/app/sessions-view.js:217`) et la raison `session-ended` son texte dans
  `stop_message` (`tv/capture.py:22-28`). `tests/tv-panel.test.cjs:522-525` garde cette couverture.
- Conserver TTL, reprises réseau, refus stockage plein/lecture seule, déduplication et possession
  des blocs des ADR 0006/0023. Aucun refus générique 410 sans le code n'est assimilé à une fin.
  Aucun changement de format persisté, installation ou nouveau protocole distribué ; harnais inchangé.

## Critères d'acceptation

1. Par la vraie page du banc, les appels sont stop local → confirmation locale → end nommé.
   Une session B adoptée pendant l'attente n'est jamais finie par le geste qui visait A.
   Les chemins « terminer » et « nouvelle session » utilisent la même règle de cible.
2. Les deux confirmations sont affichées indépendamment : local arrêté/serveur refusé, local
   non confirmé/serveur encore chargé, puis deux confirmations réussies. Une erreur de barrière
   affiche l'archivage non confirmé sans effacer le fait d'arrêt local ; les résultats T234 restent fidèles.
3. Sur HTTP local, un refus codé `session-ended` au POST arrête le transport puis la vraie capture,
   conserve statut/code et cause de perte une fois, attend le thread et ne tente aucun bloc suivant.
   Les deux anciens cas T204 sont renforcés pour ce changement décidé, sans supprimer leurs contrôles de comptage.
4. Un 410 sans code ou avec un autre code garde son rejet générique ; 503 reste retentable dans
   le TTL. Session absente/changée/non accueillante, disque plein et lecture seule gardent leurs
   causes distinctes. Aucun abandon ou reste de file n'est perdu dans les totaux.
5. Le vrai client T038 sans identité continue son parcours connu ; l'ancien producteur contre le
   serveur courant reste arrêté par prévol, sans supposer un 410 d'ingestion absent. Les corps,
   codes et séquences historiques restent définis hors ajout explicitement testé.
6. À l'implémentation, jouer en séquentiel les tests page/panneau et wire-contract, puis
   `python3 -B -m unittest discover -s tests -p 'test_tv_control.py'`, puis la même commande pour
   `test_tv_capture.py`, puis `node scripts/check.mjs`. Aucun test, perte ou plancher n'est diminué.

7. Réponse de fin perdue puis nouvel essai, et réponse historique : le banc de page affiche
   les faits lus dans la liste. Il distingue session encore `current`, ligne `archived`,
   session absente sans archive confirmée et erreur de lecture de liste.

## Test d'acceptation attendu

Étendre `tests/tv-paired-page.test.cjs` avec commandes et réponses retenues des deux clients et
assertions sur les deux états affichés. Les suites Python de T204 font répondre le faux serveur
par code, puis exécutent le transport et la capture réels jusqu'au rapport final. Le filet ne
prétend pas caractériser une version installée sur une TV ni une route serveur inexistante.

## Hypothèses bloquantes

Aucune décision n'est attendue.

L'arrêt sur `session-ended` est décidé par l'ADR 0030. Sa production par l'ingestion n'est pas
établie ; l'ajouter ultérieurement exigerait un contrat additif préservant les anciens refus,
hors de ce ticket. La fermeture côté serveur et l'archivage réussi restent deux faits différents.

## Journal
