# ADR 0002 — Une session n’est dite archivée qu’une fois ses états finaux confirmés sur disque

| | |
|---|---|
| Issue | F02 — Archivage confirmé avant garantie d’écriture ([#2](https://github.com/DabiK/tvlens/issues/2)), fiche [`02-f02.md`](../architecture-improvements/02-f02.md) |
| Date | 13 octobre 2026 |
| Statut | Accepté localement : deux reviews indépendantes validées sur le commit ci-dessous. Intégration locale en attente du merger à la date de rédaction. Non publié, non déployé. |
| Code relu | `828307e9099024288ea7306fd3e837a209f4a1af` (base `0940c45`) |
| Détail | [Historique F02](../architecture-improvements/history/F02.md) |

## Contexte

Une écriture refusée à la fin d’une session (EIO, répertoire qui n’accepte plus d’écriture) était absorbée sur trois maillons :

- le cœur rangeait le refus de sauvegarde dans un champ que la prochaine analyse réussie effaçait ;
- le store avançait son manifeste en mémoire avant de l’écrire, et oubliait un rejet au maillon suivant de sa chaîne d’écritures ;
- le runtime avalait le rejet de l’écriture du manifeste.

La fin pouvait donc répondre `archived: true`, et écrire `archived` sur disque, à côté d’un état que le disque avait refusé.

## Décision

1. **Trois notions séparées.** Dans le store : le manifeste demandé (`manifest`), le manifeste confirmé sur disque (`confirmed`) et le dernier refus par fichier (`refused`). Dans le cœur : `saveError`, que seule une sauvegarde aboutie efface, et qui passe par le champ `lastError` déjà publié.
2. **Une barrière explicite avant de dire « archivée ».** `flush()` attend les écritures demandées et rejette tant que le dernier essai d’un fichier d’état a été refusé, en nommant le fichier sans chemin.
3. **Un ordre de fermeture fixe.** Le runtime libère d’abord toutes les ressources, passe ensuite la barrière, et n’écrit le manifeste `archived` qu’en dernier. `archive()` rejette sinon ; `close()` et `seal()` n’échouent jamais pour un refus disque, donc ni une suppression ni l’arrêt d’un hôte ne sont retenus.
4. **« Archivée » est un fait de la vie en cours du runtime**, pas une lecture du manifeste : toute vie qui a capturé écrit son manifeste final, y compris une archive rouverte puis reprise.
5. **Sans manifeste, la bibliothèque ne conclut pas à une archive.** Un état sauvegardé qui nomme une rétention connue est une session dont le manifeste n’a pas atterri : en cours si elle est en mémoire, interrompue sinon, sans date de clôture inventée. Un état d’avant les manifestes garde sa ligne.

Aucune route, aucun canal IPC, aucun état de liste n’est ajouté. Les hôtes ne changent que par commentaires : leurs coutures existantes rapportaient déjà un rejet de `archive()` (`archived: false` avec `errors` par HTTP, journal sur les deux hôtes).

## Alternatives écartées

| Alternative | Exécutée ? | Raison |
|---|---|---|
| Ne passer la barrière que si le manifeste n’est pas encore `archived` | Oui, premier jet avant commit | Une archive ouverte en lecture seule reçoit quand même les questions posées dessus ; refusées, la fermeture aurait encore répondu `archived: true`, comme le code d’origine. |
| Une barrière qui ne connaît que les écritures du store | Oui, premier jet avant commit | Un refus du port d’archive lui-même n’atteint pas la chaîne du store ; le runtime honore donc aussi `saveError`. |
| Décider du manifeste final d’après l’état du manifeste confirmé | Oui, commit `e0a9a55` | Rejetée par les deux reviews puis reproduite : sur une archive reprise, ce manifeste vient d’une vie antérieure et dit déjà `archived`. |
| Comparer l’identité du manifeste demandé et du manifeste confirmé | Non, proposée par la review | Deux pauses tardives séparées par un refus pouvaient réécrire `live` sur une fin confirmée. |
| Compter le manifeste dans la barrière | Non, écartée à la conception | Un refus ancien du manifeste aurait empêché de tenter le manifeste final, donc toute nouvelle tentative. |
| fsync, nouvel état de liste, nouvelle surface IPC ou HTTP | Non | Exclus par l’approbation d’exploration. |

## Conséquences

- Une fin refusée répond `archived: false`, nomme le fichier manquant et laisse le dossier dans son dernier état confirmé, rouvrable en lecture seule.
- Un fichier d’état dont la dernière écriture a été refusée et qui n’est jamais réécrit (résumé vivant, registre de surveillance) empêche d’annoncer l’archive. C’est voulu, et c’est un comportement nouveau.
- Le store connaît l’ordre du protocole de son unique appelant : il exclut le manifeste de la barrière parce que le runtime l’écrit après.

## Preuves

- **Déclaré par le développeur** : dix tests ajoutés aux coutures store, cœur, runtime, HTTP et Mac, rouges avant chaque correctif puis verts ; mutations ; sondes avant/après ; passages dans la fenêtre Electron native en mode simulé.
- **Confirmé par le merger** : suite Node complète 486 sur 486 sur `828307e`.
- Les reviews indépendantes ont validé à la lecture, sans exécuter de test.

## Limites

- Pas de fsync : une coupure de courant après le renommage n’est pas couverte.
- Sur une archive reprise dont le manifeste est refusé pendant toute la vie reprise, la liste garde l’ancienne archive et ses anciens totaux ; seuls la réponse et le journal disent l’échec.
- Côté Mac, l’échec ne s’affiche pas dans la fenêtre : journal et état de la liste seulement.
- TV non exercée.

La liste complète des dettes et des constats reportés est dans l’historique.
