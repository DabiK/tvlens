# 0069 — La décision web reçoit le titre de la source quand l'hôte le connaît

- Date : 2026-10-23
- Ticket : `docs/travail/tickets/318-give-the-web-decision-the-title-of-the-watched-source.md`
- Statut : acceptée ; amende l'ADR 0067

## Contexte

Avec le déclencheur `model` (ADR 0067), l'appel de décision écrit la requête de recherche à partir de la question et
des trois passages récents. Sans le nom de l'œuvre regardée, la requête vise souvent la mauvaise : « Apollo 13 », « Space
Chimps » ou « Avatar » au lieu d'Artemis I, Spring ou Tears of Steel. Dans le flux réel (F1,
`experiments/essais/2026-10-22-produit-complet-web-gx10/`), seules 8 questions web sur 18 sont justes. L'essai H4b
(`experiments/essais/2026-10-22-web-reel-texte-gx10/`) rejoue ces requêtes en ne changeant que la requête de recherche,
écrite avec le titre de la source (bras PT de H2). Résultat : 14 questions web justes sur 18, 7 mixtes sur 11 au lieu
de 5, et 2 inventions au lieu de 5 ; 8 questions gagnées, aucune perdue. `decisionMessages`
(`adapters/web-decision-prompt.cjs`) acceptait déjà une ligne « Titre de la source », mais aucun hôte ne la remplissait.

## Décision

Le titre de la source est une entrée facultative de l'appel de décision, fournie par l'hôte qui le connaît.

- La composition (`runtime/conversation-runtime.cjs`) accepte un `getSourceTitle(sessionId)` lié tard par l'hôte, comme
  `getInstruction`. Elle ne le transmet qu'à l'agent local, dans ses options. `OllamaQuestionAgent` le lit à chaque
  décision, pour la session de la question. Il le nettoie par une fonction pure de `core/web-retrieval.cjs`, qui retire
  les caractères de contrôle et de format, réduit les espaces, borne la longueur par une constante nommée et ne garde
  pas un titre vide. Il le passe ensuite à `decisionMessages`. Un getter absent, en échec, ou qui rend un titre vide ou
  celui d'une autre session laisse la décision identique à celle d'avant.
- Mac : le titre suit la source réellement capturée par la session chargée. Il est posé à chaque démarrage ou reprise
  de capture, y compris la reprise d'une archive ou une reprise sur une autre fenêtre. Il vaut `null` tant que la
  session n'a rien capturé, par exemple pour une archive ouverte en lecture.
- Serveur : `POST /v1/session/start` accepte un corps facultatif `{ sourceTitle }`. Une chaîne bornée devient le titre
  de la session démarrée ou reprise par cet appel, gardé par le coordinateur de session. Un `{}` laisse le titre de la
  session chargée tel quel. Toute autre forme est refusée avec un code public nommé, sans écho de la valeur. C'est une
  évolution compatible du fil `/v1` (ADR 0042) : un client qui envoie `{}` démarre comme avant, et un corps absent reste
  refusé par le transport, comme avant.
- Rejeux : un scénario peut déclarer `sourceTitle`, envoyé au démarrage ; le rapport dit si un titre était fourni.
- Le titre n'entre que dans l'appel de décision : ni le prompt de réponse, ni les sources, ni les traces ne le portent.
  Le résultat dit seulement s'il était présent.

## Alternatives écartées

- Déduire le titre des passages (texte à l'écran, générique) : non mesuré, et un titre inventé fausserait la requête.
- Transmettre le titre par DeepAsk, comme la consigne active : DeepAsk ne connaît pas la décision web, et le ticket
  l'exclut.
- Mettre le titre dans le prompt de réponse : H4b ne mesure que son effet sur la requête de recherche.
- Envoyer le titre depuis la TV : `tv/capture.py` ne connaît que l'application, pas le contenu.

## Conséquences

- Quand l'hôte connaît la source, la requête nomme la bonne œuvre. C'est le levier principal mesuré pour les questions
  web.
- Le titre est une donnée non fiable : nom de fenêtre choisi sur le Mac, ou titre déclaré par un client. Il peut
  orienter la requête. Un nom d'écran (« Écran 1 ») ou celui d'un document privé devient un « titre ».
- La requête écrite par le modèle peut contenir ce titre. Elle est publiée avec le résultat, sauvegardée, copiée dans les
  rapports de rejeu, et, avec SearXNG (résidence `hybrid`), envoyée hors de la machine comme toute requête.
- Le titre n'est pas persisté : un redémarrage du serveur le perd, et une archive reprise n'en a qu'une fois sa capture
  reprise sur une source nommée (Mac) ou démarrée avec un titre (serveur).
- La TV reste sans titre tant qu'elle ne peut pas le lire.

## Protégée par

- `tests/ollama-question-agent.test.cjs` : corps de l'appel de décision avec et sans titre ; titre d'une autre
  session ; getter en échec ; titre absent de la réponse, des sources et des traces.
- `tests/web-retrieval.test.cjs` : nettoyage et borne du titre.
- `tests/server-routes.test.cjs` : refus nommé sans écho de la valeur, borne, corps absent toujours refusé par le
  transport, `{}` sans effet sur le titre, titre fourni à la reprise, titre jusqu'à l'appel de décision par HTTP.
- `tests/mac-ipc-contract.test.cjs` : getter de l'hôte Mac au démarrage, à la reprise d'archive et au changement de
  source.
- `tests/local-stream-replay.test.cjs` : scénario, démarrage et rapport.
