# ADR 0008 — Une description d’images qui échoue sur une erreur passagère est redemandée une fois, quand la voie est libre

| | |
|---|---|
| Issue | F08 — Un échec transitoire de vision reste définitif ([#7](https://github.com/DabiK/tvlens/issues/7)), fiche [`07-f08.md`](../architecture-improvements/07-f08.md) |
| Date | 13 octobre 2026 |
| Statut | Revu : deux reviews indépendantes validées à la première passe sur le commit ci-dessous. En attente d’intégration locale par le merger à la date de rédaction. Non publié, non déployé. |
| Code relu | `2cec0b16575cd5fde02027950d6d01204f65ab82` (base `474346a`) |
| Détail | [Historique F08](../architecture-improvements/history/F08.md) |

## Contexte

Dans la voie vision séparée, tout rejet de la description d’un passage était définitif : `visionStatus` passait à `error`, la perte était comptée, et rien ne remettait le passage en analyse, alors que son média reste conservé par défaut.

- le cœur ne distinguait aucune erreur, et l’adaptateur n’en classait aucune ;
- l’échéance de 45 s de l’adaptateur et la fermeture de la session arrivaient par le même signal, indiscernables après coup ;
- les erreurs des transports (client Codex, tuyau Codex, agent local) sont des messages sans code ; seul le refus d’authentification porte un drapeau lisible par machine.

Ces constats viennent de la lecture du code, confirmés à la couture par des tests rouges derrière le vrai client Codex et un faux App Server. Ni la fréquence de ces échecs ni la forme des erreurs d’un Codex réel n’ont été observées.

## Décision

1. **L’adaptateur marque, le cœur décide.** Un rejet de `observeVisual` qui porte `code: 'TVLENS_VISION_TRANSIENT'` est le seul que la session peut redemander. C’est l’idiome de `TVLENS_STORAGE_FULL` : le cœur n’importe aucun adaptateur.
2. **Une seule redemande, en ligne.** Elle a lieu dans le même appel de la voie vision, sans file, sans minuterie et sans reprise différée ; un troisième appel est impossible par construction. Conditions, vérifiées à l’échec puis de nouveau après la relecture du média : session ni en fin, ni fermée, ni en lecture seule ; média encore conservé et relu ; aucun passage en attente derrière ; aucune question ne retenant la vision. Là où la vision est permise pendant une question, la redemande l’est aussi.
3. **Rien n’est publié comme perdu entre les deux appels.** Le passage reste `analyzing`, garde son premier départ, et sa révision n’augmente qu’une fois, au succès. Rien n’est repris à la réouverture d’une archive.
4. **Les refus passent d’abord et gagnent toujours** : appelant annulé, authentification refusée, confinement ou entrée refusés par le client, HTTP 4xx du backend local, client ou backend fermé. Ils sont cherchés sur l’erreur et sur ce qu’elle nomme comme cause.
5. **Le marquage demande ensuite une preuve positive** : l’échéance que l’adaptateur possède (la raison même de son signal, ou le tour que Codex confirme avoir interrompu sans détail d’échec propre), cinq messages exacts d’un transport qui a cédé, ou un HTTP 5xx du backend local. Tout le reste est définitif : erreur inconnue, tour `failed`, détail fournisseur, autre `TimeoutError`.
6. **Trois compteurs distincts dans `coverage`.** `visionRetried` compte les seconds appels lancés, `visionRecovered` ceux qui ont réussi, `visionError` reste la perte finale. Les deux nouveaux n’existent qu’après leur premier événement et ne sont repris à la réouverture que comme entiers positifs bornés : un second appel par passage au plus, pas plus de récupérations que de seconds appels. `apiCalls` compte chaque appel réellement fait.
7. **L’échéance d’une description peut être abaissée, jamais relevée** (`timeoutMs`, 45 s par défaut). Aucun hôte ne la passe.

Aucune route, aucun canal IPC, aucun module ni dépendance n’est ajouté. Le texte publié en cas de perte finale est inchangé.

## Alternatives écartées

| Alternative | Exécutée ? | Raison |
|---|---|---|
| Poser le marqueur à la source, par un code dans le client Codex, le tuyau et l’agent local | Non | Ces adaptateurs sont partagés et en lecture seule pendant la vague. La classification vit donc dans `codex-perception.cjs`, sur des messages recopiés (dette). |
| Tout `TimeoutError` vaut échéance | Non, proposée à l’exploration, amendée par la supervision avant toute écriture | Un délai qui n’est pas celui de l’adaptateur ne prouve rien ; seule l’identité avec la raison de son signal compte. |
| Le message nu « Connexion Codex interrompue. » d’une requête en attente | Non, proposée à l’exploration, écartée au développement à la lecture du client | C’est aussi ce que reçoit une requête en attente quand le garde de confinement ferme le processus. |
| Un `turn/start` resté sans réponse | Non, même origine | Le tour peut tourner dans Codex sans avoir été acquitté. |
| Tour `failed` ou détail fournisseur traités comme passagers | Non | La taxonomie Codex n’est connue que par des doublures. |
| Reprise différée : nouvelle file, minuterie, attente de la fin d’une question | Non | Exclue par l’approbation d’exploration. |
| Remise en analyse à la réouverture ou à la reprise d’une archive | Non | Interdite par le ticket. |
| Compteurs ajoutés au jeu initial de `coverage` | Non | Des tests communs comparent l’objet entier ; le précédent `videoUnreadable` naît déjà à son premier événement. |
| Publier l’erreur, puis repasser le passage en analyse | Non | L’état lu par la surveillance et les compteurs d’attente oscillerait. |

## Conséquences

- Une coupure du processus Codex en plein tour, ou une échéance de l’adaptateur sans détail, coûte un second appel au lieu du passage, si la voie est libre.
- Le second appel tient la voie jusqu’à une échéance de plus, et la voie n’est « libre » qu’à l’instant du contrôle : un passage encore en transcription arrive derrière, et la file bornée peut en écarter d’autres, comptés. Déduit, non mesuré.
- En capture continue, une description arrêtée par l’échéance de 45 s trouvera rarement la voie libre : elle est alors perdue comme avant. Déduit, non mesuré.
- `apiCalls` compte le second appel. La fenêtre Mac affiche ce nombre comme des passages ; son libellé est hors des fichiers du ticket.
- La liste de messages dépend de trois adaptateurs. Si l’un d’eux change un message, la redemande disparaît pour ce cas, sans risque de boucle ; les tests passent par les émetteurs réels pour la liste blanche.
- Le contrat du port de perception (`core/ports.cjs`) n’est pas mis à jour, le fichier étant hors attribution : cet ADR décrit le code d’erreur, les conditions et les compteurs.

## Preuves

- **Déclaré par le développeur**, avant toute vérification du merger : 19 tests ajoutés dans un fichier dédié, 16 rouges sur la base et 3 qui caractérisent, 19 sur 19 sur le commit ; 16 fichiers de tests existants verts sans modification, exécutés un à un ; 26 mutations d’une garde à la fois, 25 détectées, la dernière couverte par un veto et détectée en combinaison.
- **Reviews indépendantes** : validation à la lecture du code et des journaux, sans exécuter de test.
- **Merger** : aucune exécution indépendante à la date de rédaction.

## Limites

- Codex réel, modèle local réel, TV, VPS et interface Mac non exercés. Aucune fréquence d’échec ni latence mesurée, aucun gain annoncé.
- Sur la voie Codex, la redemande ne sert qu’à la perte du processus en plein tour, au tuyau mort, à la poignée de main sans réponse et à l’échéance sans détail. La forme la plus plausible d’une coupure réseau côté Codex, une notification d’erreur de flux avant la fin du tour, reste définitive tant que la taxonomie n’est pas vérifiée.
- Deux fermetures décidées par l’hôte peuvent ressortir marquées : le tuyau qui se ferme sur une ligne de plus de 4 000 000 caractères, et, dans une fenêtre étroite de la poignée de main, « Codex déconnecté. » après une fermeture par le garde. Une redemande au plus, et la reconnexion repasse tous les contrôles de confinement. Déduit par les reviews, non testé.
- Un `timeoutMs` non entier ferait échouer chaque description, Node refusant ce délai. Défaut connu, hors de portée des hôtes actuels, non corrigé dans ce lot.
- La voie unique des adaptateurs à `observe()` seul n’est pas couverte.

La liste complète des dettes et des constats des reviews est dans l’historique.
