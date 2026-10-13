# ADR 0006 — Un bloc accepté est possédé dès son admission, et sa préparation est annulée quand sa session part

| | |
|---|---|
| Issue | F06 — Préparation d’ingestion hors du cycle de vie suivi ([#6](https://github.com/DabiK/tvlens/issues/6)), fiche [`06-f06.md`](../architecture-improvements/06-f06.md) |
| Date | 13 octobre 2026 |
| Statut | Revu : reviews standards et spécification validées à la seconde passe sur le commit ci-dessous, après un complément de périmètre approuvé à la suite de la première. En attente d’intégration locale par le merger à la date de rédaction. Non publié, non déployé. |
| Code relu | `8c895acbc51f3acf5c72ac2926da754a85e958d3`, deux commits de code (`7d051b7`, `8c895ac`), base `89a4a72` |
| Détail | [Historique F06](../architecture-improvements/history/F06.md) |

Cette version remplace celle qui décrivait `7d051b7` : le complément a changé trois de ses points, relevés dans l’historique.

## Contexte

L’hôte serveur reçoit les blocs de la TV sur `POST /v1/segments`. Le transport contrôle le bloc, prend un créneau de préparation unique (un autre bloc reçoit 429 pendant ce temps), fait assembler les médias (encodage des images, puis jusqu’à deux commandes FFmpeg de 15 s chacune), et remet le résultat au runtime, qui le stocke.

- Le runtime ne connaissait un bloc qu’à partir de son stockage. Pendant la préparation, le bloc n’existait que dans la pile du handler HTTP.
- La fin d’une session attendait les stockages en cours, relevés à cet instant : aucun pendant une préparation. Elle n’attendait donc pas cette préparation et ne l’arrêtait pas.
- Au retour de la préparation, le bloc était comparé à la session en mémoire par son identifiant seul. Une archive ouverte puis reprise garde l’identifiant de la session qui a fini.
- Toute erreur sans statut était répondue 400, qu’elle vienne du bloc ou de l’hôte. Côté TV, un 400 est un rejet définitif ; un 5xx est renvoyé pendant les 30 s de vie du bloc.

Observé sur la base par des tests rouges, avec une doublure d’assemblage tenue par le test ou des programmes Node à la place de FFmpeg :

- l’assemblage ne reçoit aucun signal, et la fin de la session répond pendant que le bloc reste sans réponse ;
- le premier bloc de la session suivante reçoit 429 tant que l’ancienne préparation tourne ;
- l’arrêt de l’hôte rend la main avec l’outil encore vivant et son dossier temporaire en place ;
- une préparation réglée après la fin, l’ouverture et la reprise du même identifiant est stockée dans cette nouvelle vie ;
- un bloc préparé à cheval sur un redémarrage de capture est stocké ;
- un bloc arrivé pendant qu’une fin est demandée est assemblé, puis refusé 400 ;
- un outil trop lent, un outil introuvable et un dossier temporaire refusé sont répondus 400, les deux derniers avec un chemin de l’hôte dans le message ;
- un spawn refusé qui rend un enfant sans tubes fait lever la commande avant que l’erreur annoncée au tick suivant ait un écouteur.

Déjà vrai sur la base, et caractérisé : un bloc d’une session ne peut pas être stocké dans une session d’un autre identifiant. Lu dans le code, sans être mesuré : aucune fuite permanente, le dossier temporaire partant quand ses commandes se règlent. Rien n’a été observé sur une TV ni sur le VPS.

## Décision

1. **Le runtime possède le bloc dès que le transport prend son créneau.** Un seul fait de cycle de vie : la session elle-même, la capture où le bloc a été accepté, et un signal d’annulation. Le transport le rend dans le même `finally` que le créneau 429, une fois le bloc répondu et la préparation réglée. Ni file, ni classe, ni dépendance ; `ingest(input)` sans opération fonctionne toujours.
2. **Un bloc qui arrive pendant qu’une session part est refusé avant tout travail média.**
3. **La fin d’une session, sa suppression, l’ouverture d’une archive à sa place et l’arrêt de l’hôte annulent ce qui est encore en préparation**, avant toute attente. Un bloc dont le stockage a commencé atterrit comme avant, et reste attendu en entier.
4. **L’attente de ce qui n’a pas lâché est bornée : 1000 ms par défaut, réglable par l’hôte.** C’est un plafond sur la fin, pas une garantie sur le nettoyage. Au-delà, la session part quand même et le dit, dans le résultat de la fin et au journal ; le bloc reste possédé et refusé, et le créneau reste pris, jusqu’au règlement réel de sa préparation.
5. **Une préparation qui n’a toujours pas lâché est attendue à nouveau**, dans la même borne, par chaque fin et chaque suppression ultérieure de la session en mémoire, et par l’arrêt de l’hôte, qu’une session soit chargée ou non. Elle n’est pas annulée deux fois. Chaque attente dépassée est dite : dans le résultat de cette fin, ou dans le dernier résultat et au journal de l’hôte.
6. **Juste avant d’être stocké, un bloc est comparé à la vie où il a été accepté** : annulation, objet session, capture. La comparaison et le début du stockage tiennent dans le même pas synchrone. Seul un bloc encore courant marque le registre des numéros déjà vus.
7. **Un start ou un resume n’annule rien, mais renouvelle la capture** : le bloc préparé à cheval est refusé à son retour.
8. **Un client qui part n’annule rien.** Son bloc est stocké, et renvoyé il est répondu comme doublon.
9. **L’assembleur reçoit le signal.** Une fois levé, rien de neuf n’est fait pour le bloc : ni dossier, ni fichier, ni outil. L’outil lancé, et lui seul, est tué. Un encodage d’image en cours ne s’arrête pas : il est laissé finir.
10. **Un outil qui a démarré n’est fini qu’à sa sortie.** Une erreur qu’il signale entre-temps, un kill que le système refuse, ne règle rien : son délai et son signal restent armés, et son dossier n’est pas supprimé sous lui. Seul un spawn refusé, qui rend un enfant sans pid, se termine sur son erreur ; sans tubes ou en levant, il est entendu.
11. **Un dossier temporaire que le système refuse de supprimer ne change pas la raison d’un refus.** Un bloc fautif garde son 400 et son message, un bloc annulé la raison de son signal ; l’échec de suppression est attaché à cette erreur. Seul, il est un refus de l’hôte.
12. **Ce qui relève de l’hôte n’est plus répondu comme une requête invalide.**

    | Situation | Réponse |
    |---|---|
    | Outil qui ne finit pas à temps ou ne démarre pas, dossier temporaire refusé | 503 `media-unavailable`, message sans chemin de l’hôte |
    | Préparation annulée, ou bloc arrivé pendant qu’une session part | 503 `session-closing` |
    | Capture renouvelée pendant la préparation | 409 `capture-changed` |
    | Bloc fautif : son non WAV, image indécodable, déclaration incohérente, outil sorti en erreur | 400, message inchangé |

13. **Le reste ne change pas** : corps bornés (413), 429, 507, archive en lecture seule (409), doublons, et tous les délais (5 s côté TV, 15 s par commande, 30 s de vie d’un bloc). Ni accusé anticipé, ni en-tête de mesure. Une pause refuse toujours le bloc qu’elle interrompt, en 400.

## Alternatives écartées

| Alternative | Exécutée ? | Raison |
|---|---|---|
| Laisser finir la préparation à la fin de la session, au lieu de l’annuler | Non, option posée à l’exploration | Arbitrée par la supervision : jusqu’à deux fois 15 s d’attente, ou une borne nouvelle sans mesure, face aux 30 s d’arrêt de l’unité de service. |
| N’attendre qu’une fois la préparation annulée, à la fin de sa session | Oui, au premier commit ; retirée au complément | Une fin ou un arrêt ultérieur ne la voyait plus : l’hôte pouvait sortir sous elle sans rien dire. |
| Régler la commande sur une erreur de son enfant, démarré ou non | Oui, au premier commit, comme sur la base ; retirée au complément | Après un kill refusé, le dossier partait sous un outil peut-être vivant. |
| Laisser l’échec de suppression du dossier remplacer l’erreur en cours | Oui, au premier commit ; retirée au complément | Un bloc fautif devenait un 503, que la TV renvoie. |
| Attendre aussi à une fin ou une ouverture sans session chargée, ou à la suppression d’une archive non chargée | Non | Rien ne part à ces points, et il n’y a ni résultat ni ligne de journal où le dire. Lecture acceptée par les deux reviews. |
| Annuler quand le client HTTP se déconnecte | Non | La TV coupe son envoi à 5 s : un bloc lent ne serait jamais stocké et serait renvoyé jusqu’à expiration. |
| Rendre le créneau, ou abandonner la préparation, à l’expiration de la borne | Non | Exclu par la supervision : le 429 reste vrai tant qu’une préparation tourne, et rien n’est supprimé sous elle. |
| Retenter périodiquement un kill refusé | Non | Hors du plan approuvé : seuls le délai et le signal déjà armés retentent. |
| Annuler aussi à un start ou un resume | Non | La supervision réserve l’annulation à la fin, à la suppression et à l’arrêt de l’hôte. |
| Répondre 503 à la capture renouvelée | Non, écartée au développement | Une ancienne capture renverrait son bloc et concurrencerait la nouvelle. Le 409 est un refus définitif, comme celui d’un numéro ancien. |
| Garder 400 pour une session qui part | Non | La TV compterait un bloc rejeté et capturerait jusqu’au bloc suivant. Avec un 503 elle redemande la session et s’arrête sur sa vraie cause. |
| Classer en ressource toute sortie en erreur de l’outil | Non | Exclu par la supervision : une entrée invalide inconnue ne doit pas devenir un renvoi. |
| En-tête `Server-Timing`, délai allongé, accusé de réception avant le stockage | Non | Nouvelle surface publique refusée par la supervision ; aucune mesure sur TV ne justifie un délai, et la fiche l’interdit sans preuve. |
| Annuler à une pause, ou compter les préparations comme une capture en cours | Non | Hors du plan approuvé ; le refus à la pause est conservé tel quel. |

## Conséquences

- **Un bloc perdu à la fin.** Le bloc en préparation quand sa session part n’est pas stocké, même si son assemblage venait de finir : au plus un bloc de 8 s. La base le perdait déjà quand l’assemblage finissait après l’arrêt de la capture.
- **Un bloc perdu au redémarrage de capture.** La base le stockait. Sa préparation n’est pas annulée : elle va au bout et garde le créneau, si bien que le premier bloc de la nouvelle capture peut recevoir 429 entre-temps, dans la limite des délais des commandes.
- **Tant qu’une préparation n’a pas lâché**, chaque fin de session suivante et l’arrêt de l’hôte prennent jusqu’à une seconde de plus et répètent la ligne d’erreur. Cette ligne ne nomme pas la session du bloc : à la fin d’une session B, elle figure dans le résultat de B alors que le bloc est celui de A.
- **Trois points n’attendent pas** une préparation encore possédée : une fin ou une ouverture demandée sans session chargée, et la suppression d’une archive non chargée. Le 429 en reste la seule trace. D’après la lecture des reviews, rien ne peut y être stocké ni ravivé : le bloc annulé est refusé pour toujours, et ses fichiers vivent hors du dossier de session.
- **Le créneau peut rester pris sans borne.** Un outil démarré dont les kills sont refusés et qui ne sort jamais tient sa commande, son opération et le créneau jusqu’au redémarrage de l’hôte. L’erreur du kill n’est gardée nulle part. Après la borne, l’hôte peut encore sortir sous cette préparation ; son journal le dit désormais.
- **Un 503 est renvoyé par la TV** pendant la vie du bloc. Sur un hôte chargé, un bloc dont l’outil dépasse son délai est donc préparé à nouveau à chaque renvoi, un à la fois ; cette charge n’est pas mesurée. Déduit par la review spécification : si le même identifiant est rouvert et repris dans cette fenêtre, le renvoi peut être stocké dans la vie reprise. C’est la même session et la même archive, pas un bloc d’une session dans une autre.
- **L’échec de suppression n’est lu par personne.** Il est attaché à l’erreur, sur l’objet même que le runtime a donné au signal, et l’assembleur n’a pas de journal : un dossier temporaire resté en place, avec les médias du bloc, ne laisse aucune ligne côté hôte.
- **Le 503 codé ne vaut que pour les blocs.** Le même message « Session en cours de fermeture. » reste un 400 sur les questions, la surveillance, le démarrage, l’ouverture et la reprise.
- **Le transport reçoit tout l’enregistrement de l’opération**, contrôleur d’annulation compris. « Seule la fin de la session annule » ne tient donc que par convention.

## Preuves

- **Déclaré par le développeur**, avant toute vérification du merger : 17 tests dans un fichier dédié, verts sur le commit relu. Chaque étape a son rouge, obtenu avant de modifier le code : 10 rouges et 3 caractérisations vertes sur la base, avec la version à 13 tests ; 4 rouges et 13 verts sur le code de `7d051b7`, avec la version à 17 tests. Dix-sept fichiers de tests existants, non modifiés, joués un à la fois à chaque commit : 130 sur 130. Les cinq tests existants de l’envoi côté TV, code inchangé : verts au premier commit.
- **Reviews indépendantes**, deux passes : lecture du code, du diff et des journaux conservés, sans exécuter de test.
- **Merger** : aucune exécution indépendante à la date de rédaction.

## Limites

- La preuve est synthétique : des programmes Node à la place de FFmpeg, une doublure d’assemblage, un runtime sur fournisseurs simulés. TV, VPS, réseau, hôte Mac et arrêt réel du service ne sont pas exercés.
- Le kill refusé, la suppression de dossier refusée et le spawn refusé ne sont exercés que sur doublures. Le comportement de Node sur lequel repose le point 10 est établi par une sonde locale sous Node 24.12 et par la lecture de sa source, pas par l’outil de documentation prévu par la mission, non utilisé hors ligne.
- Le désalignement entre les 5 s de la TV et les 15 s du serveur est inchangé. Une observation ponctuelle du délai HTTP complet a été faite sur la boucle locale d’un Mac, avec le vrai FFmpeg et des blocs générés : elle ne dit rien d’une TV ni d’un VPS, et aucun gain n’est annoncé. Ses chiffres sont dans l’historique.
- Les 1000 ms sont choisis par analogie avec F05, pas mesurés. Le dépassement de la borne n’est exercé qu’avec une doublure qui ignore son signal.
- L’annulation à l’ouverture d’une archive est établie par lecture : elle passe par la même fin de session, sans test propre.
- Une sortie en erreur de l’outil reste 400 même si sa cause est une ressource, par exemple un outil tué par le système.
- Un test lit deux champs internes de l’hôte, le serveur étant fermé à ce moment. Plusieurs tests lancent de vrais processus sur l’horloge réelle : à jouer hors charge concurrente.
- La version finale du fichier dédié n’a pas été jouée sur la base : les rouges sur la base sont ceux de sa version à 13 tests.

La liste complète des dettes, des constats des deux passes de review et des preuves est dans l’historique.
