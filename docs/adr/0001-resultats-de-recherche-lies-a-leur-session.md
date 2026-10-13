# ADR 0001 — Un résultat de recherche appartient à la session qui l’a demandé

| | |
|---|---|
| Issue | F01 — Résultats Mac attachés à la mauvaise session ([#1](https://github.com/DabiK/tvlens/issues/1)), fiche [`01-f01.md`](../architecture-improvements/01-f01.md) |
| Date | 13 octobre 2026 |
| Statut | Accepté et intégré localement (avance rapide `e1d857b` → `0940c45`). Non publié, non déployé. |
| Code relu | `0940c454bf97b07b7db79819b8d1781f2d57b947` |
| Détail | [Historique F01](../architecture-improvements/history/F01.md) |

Rédigé après coup, pendant la phase documentaire de F02, à partir des rapports de la boucle et du commit réel.

## Contexte

Dans chaque session, les passages sont numérotés à partir de `moment-1`. Une carte de recherche de la fenêtre Mac ne retenait que cet identifiant. Trois conséquences établies à la lecture du code d’origine :

- au clic, la relecture reconstruisait l’adresse du passage à partir de la session chargée : une carte de la session A ouvrait le `moment-1` de la session B ;
- les cartes survivaient au changement de session ;
- une recherche lancée dans A et terminée après l’ouverture de B revenait étiquetée A, avec la miniature de B.

Seules les réponses tardives (miniature de B et erreur brute sans session chargée) ont été reproduites en rouge sur le code d’origine. Le reset et le refus de relecture d’une ancienne carte ont été vérifiés dans la fenêtre native sur le code corrigé.

## Décision

1. **L’hôte garde la session qui demande jusqu’à sa réponse.** Le traitement `moments:search` capture le runtime chargé à l’entrée ; passages, classement, miniatures et `sessionId` viennent de lui. Si une autre session, ou aucune, est chargée quand la réponse est prête, il refuse par « Session obsolète. ».
2. **La fenêtre invalide au changement.** Les résultats et leur statut sont vidés au reset et au changement d’identifiant de session. Chaque requête prend un numéro ; une réponse ou un refus dépassé est ignoré.
3. **Une carte porte sa session, et toute relecture est validée.** `replayTarget` vérifie la session puis le passage avant de construire l’adresse du média ; la fenêtre ne construit plus cette adresse elle-même.
4. **Deux fonctions pures dans `app/ui/search-view.mjs`** (`searchCards`, `replayTarget`), pour prouver le refus par comportement. Ce fichier sort de la liste du ticket ; l’extension a été approuvée avant développement.

Aucun canal IPC, méthode de pont ni identifiant HTML n’est ajouté ; la forme de la réponse de recherche est inchangée.

## Alternatives écartées

| Alternative | Exécutée ? | Raison |
|---|---|---|
| Garder toute la logique dans `app/renderer.js` | Non, repli proposé à l’exploration | Ce fichier ne se charge pas hors d’Electron : la preuve se réduisait à des gardes textuelles. |
| Donner à la relecture la session chargée comme valeur par défaut | Prévue au plan d’exploration, non livrée | Une carte sans session aurait été acceptée ; le code livré transmet la carte et refuse par défaut. |

## Conséquences

- Une réponse tardive n’emprunte plus les médias d’une autre session ; une ancienne carte ne relit rien dans une autre session.
- La relecture depuis la frise, les citations, le résumé et la surveillance passe par la même validation, sans changement de comportement pour la session chargée.
- Les moments gardés, servis par leur propre protocole, ne sont ni vidés ni refusés.

## Preuves

- **Déclaré par le développeur** : deux tests ajoutés, rouges sur le code d’origine puis verts ; deux mutations qui refont échouer le test du modèle de vue ; suite hors ligne 476 sur 476.
- **Confirmé par le merger** : suite Node complète 476 sur 476 sur `0940c45` ; sonde dans la fenêtre Electron native, en mode simulé et isolé, sur le scénario A/B.
- Les deux reviews indépendantes ont validé à la lecture, sans exécuter de test.

## Limites

- La fin de session n’annule pas la recherche en cours : elle peut tourner jusqu’à 15 s, son résultat est refusé. À reprendre avec F07.
- Le câblage de la fenêtre est couvert par des gardes textuelles sensibles au formatage, complétées par la sonde native du merger.
- Aucune vérification sur TV, VPS ou fournisseur.
