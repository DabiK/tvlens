---
id: T125
titre: Decide description retries and verifier failures on error codes, not wording
statut: a-faire
bloque_par: T124
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

La reprise d'une description et le diagnostic du vérificateur se décident sur les codes et champs
stables, indépendamment de la formulation des messages. Les issues produites par les émetteurs réels
gardent la politique de l'ADR 0008 ; un nouvel ADR remplace seulement sa classification textuelle.

## Sources

- `docs/audit-architecture.md`, rapport A, B4 et D4 ; rapport B, B2 et D2.
  Décision du propriétaire, le 16/10 : garder T124, retirer T145 ; T199/T178 sont transitifs.
- Code vérifié à `8340014` : `adapters/codex-perception.cjs:23` porte les messages passagers,
  `adapters/codex-perception.cjs:34` les refus, `adapters/codex-perception.cjs:43` les quatre niveaux
  de cause ; `adapters/codex-perception.cjs:58` donne priorité à l'appelant annulé puis au refus,
  avant preuve d'échéance et perte passagère. `adapters/codex-perception.cjs:173` marque
  TVLENS_VISION_TRANSIENT sur une nouvelle erreur gardant la cause.
- `adapters/codex-verifier.cjs:24` classe par préfixe ; `adapters/codex-verifier.cjs:57` construit
  le client hors du try. Garder la branche de rôle refusé, même sans passage naturel par ce catch.
- Le diagnostic de tour vient désormais de `adapters/codex-session-events.cjs:143`, pas de
  l'ancienne méthode event du client. T124 code aussi les émetteurs extraits events/run.
- Tests : `tests/architecture-f08.test.cjs` couvre échéance, refus imbriqués, vrais RPC, client Codex,
  serveur local et redemande dans WatchSession ; `tests/verification.test.cjs` couvre le refus
  d'outil et le confinement réel. L'ADR 0008 nomme explicitement la dette des messages recopiés.

## Périmètre

- Modifier seulement les deux lecteurs, leurs tests cités et ajouter un ADR au prochain numéro
  disponible. Importer les constantes de leurs émetteurs livrés par T124, events/run compris.
- Dans perception, garder l'ordre appelant → refus → échéance → passager et quatre niveaux de cause.
  La table cible est :

  | Classe | Champs stables |
  | --- | --- |
  | Refus prioritaire | authRequired ; CODEX_INPUT_REFUSED, CONFINEMENT_REFUSED, TOOL_REFUSED, SESSION_CLOSED |
  | Refus local prioritaire | LOCAL_VLM_INPUT_REFUSED, CLOSED ; UNAVAILABLE avec httpStatus entier 400 à 499 |
  | Passager | CODEX_CONNECTION_LOST, DISCONNECTED ; REQUEST_TIMEOUT avec method initialize ou thread/start |
  | Passager local | LOCAL_VLM_UNREACHABLE ; UNAVAILABLE avec httpStatus entier 500 à 599 |
  | Preuve de l'échéance propre | erreur identique à deadline.reason, ou turnStatus interrupted sans turnError, échéance expirée |
  | Définitif | toute autre issue, notamment REQUEST_CUT et délai turn/start |

  Les noms du tableau abrègent les constantes TVLENS_ de T124. Un signal expiré à côté d'une erreur
  inconnue ne la rend jamais passagère. Un refus imbriqué gagne sur une erreur extérieure passagère.
- Dans le vérificateur, TOOL_REFUSED rend le message fixe actuel ; CONFINEMENT_REFUSED, ROLE_REFUSED
  ou authRequired rendent l'erreur d'origine ; SyntaxError et défaut gardent leurs messages actuels.
- Retirer ensembles de messages, préfixes et regex de classification. Garder le marquage
  TVLENS_VISION_TRANSIENT, le plafond de 45 s et la décision de redemande dans WatchSession.
- Les erreurs fabriquées des tests reçoivent les codes et champs de leurs vrais émetteurs, avec
  leurs messages actuels gardés. Ne changer aucune valeur attendue des scénarios existants.
  Ajouter les contre-épreuves code/message ci-dessous ; aucune assertion de source n'est nécessaire.
- Le nouvel ADR cite 0008 sans le réécrire : mêmes conditions de redemande, codes à la source,
  classification par champs, abandon des messages recopiés. Aucun numéro ancien réservé.
  Ni émetteurs, ni transport HTTP/IPC/TV, ni code du domaine ne sont modifiés.

## Critères d'acceptation

1. Le message exact d'une ancienne erreur passagère sans code n'est plus marqué, même si un délai
   sans lien a expiré. Le même code passager sous un message reformulé reste marqué.
2. Éprouver CONNECTION_LOST, DISCONNECTED, REQUEST_TIMEOUT initialize/thread/start et les issues
   locales 503/injoignable. REQUEST_CUT, REQUEST_TIMEOUT turn/start, statut local manquant ou
   hors intervalle et erreur inconnue restent définitifs.
3. Chaque refus est définitif, même dans la cause d'une erreur passagère et malgré une échéance
   expirée. Prise seule, chacune des erreurs extérieures de la contre-épreuve est passagère.
   L'appelant annulé n'est jamais marqué.
4. La raison même de l'échéance et le tour interrupted sans turnError sont passagers uniquement
   selon les conditions de la table. Un tour avec turnError conserve sa classification définitive.
5. Les tests par vrais émetteurs gardent toutes leurs décisions ; les tests du vérificateur gardent
   texte fixe d'outil refusé et identité de l'erreur de confinement/rôle/authentification.
   Le diff des assertions existantes et des seules fixtures modifiées est décrit au journal.
6. Aucune classification de ces deux lecteurs ne lit message, startsWith ou regex de texte ;
   les messages de sortie du vérificateur restent permis. Le nouvel ADR décrit cette substitution.
   Rétablir les deux vérifications d'absence de la fiche de base ; chacune affiche `0`
   (le statut 1 de grep signifie ici aucune correspondance) :

   ```sh
   grep -cE "Connexion Codex|Codex déconnecté|délai de connexion|Backend local|Confinement Codex|Outil hors du périmètre|Entrée média|Session Codex fermée|Recherche annulée" adapters/codex-perception.cjs
   grep -cE "startsWith\('(Outil|Confinement|Rôle)" adapters/codex-verifier.cjs
   ```

7. En copies isolées, retirer TOOL_REFUSED des refus de perception puis du vérificateur fait
   échouer un cas dans chacun. Sorties rouge/verte consignées, mutations retirées.
8. À l'implémentation, exécuter architecture-f08 puis verification en séquentiel, et
   `node scripts/check.mjs`. Aucune assertion existante affaiblie, aucun cas supprimé.

## Test d'acceptation attendu

Un nouveau cas d'architecture-f08 appelle `CodexPerception.observeVisual` avec des erreurs codées
puis reformulées et avec un ancien message sans code. Il prouve que le code porte la décision et
qu'un refus imbriqué l'emporte. Les vrais émetteurs assurent la continuité de la politique produit.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T124 est nécessaire pour les constantes et champs, et implique T199/T178. Si une issue d'un vrai
émetteur change de classe, relever l'émetteur ou la condition manquante avant toute retouche
d'assertion. La lecture textuelle ne reste pas comme repli silencieux.

## Journal
