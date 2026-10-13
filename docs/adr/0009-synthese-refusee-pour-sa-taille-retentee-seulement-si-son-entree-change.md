# ADR 0009 — Une synthèse refusée pour sa taille est dite comme un plafond, et n’est retentée que si son entrée a changé

| | |
|---|---|
| Issue | F09 — Résumé vivant : plafond de capacité et tentatives identiques ([#8](https://github.com/DabiK/tvlens/issues/8)), fiche [`08-f09.md`](../architecture-improvements/08-f09.md) |
| Date | 13 octobre 2026 |
| Statut | Revu : deux reviews indépendantes validées à la première passe sur le commit ci-dessous. En attente d’intégration locale par le merger à la date de rédaction. Non publié, non déployé. |
| Code relu | `c1bc4aa808353080178437d8b911baa9c71d86d1` (base `147f994`) |
| Détail | [Historique F09](../architecture-improvements/history/F09.md) |

## Contexte

Chaque synthèse du résumé vivant reçoit tous les textes originaux de la session, les chapitres déjà produits et les passages nouveaux ou corrigés. Au-delà de 240 000 caractères d’entrée sérialisée, l’adaptateur refuse, avant tout appel au modèle.

- ce refus était une erreur sans code, que le cœur traitait comme n’importe quelle panne : statut `error`, puis nouvelle tentative 25 s plus tard, tant qu’un passage attendait ;
- les originaux ne sont retirés qu’au changement de session : l’entrée refusée ne pouvait rétrécir que par la correction d’un texte ;
- chaque tentative publiait deux états complets, envoyés à la fenêtre et remis à l’archive ; sans résumé antérieur, la vue disait le résumé « momentanément indisponible ».

Le statut `error` et la répétition des tentatives sont confirmés par des tests rouges à la couture (vrai adaptateur derrière le vrai cœur, doublure à la place de Codex) ; le reste vient de la lecture du code. Ces tentatives n’atteignaient jamais le modèle : leur coût était local, et il n’a pas été mesuré. Aucune taille atteinte en usage réel, aucune durée de session n’a été observée.

## Décision

1. **L’adaptateur marque, le cœur décide.** Le refus porte `code: 'TVLENS_RECAP_CAPACITY'`, `size` (la longueur mesurée) et `limit`. Son message, le seuil et sa place avant l’appel au modèle sont inchangés. Le cœur redéclare le code sans importer l’adaptateur, et ne connaît pas le seuil : c’est l’idiome de `TVLENS_STORAGE_FULL` et de `TVLENS_VISION_TRANSIENT`.
2. **Un statut à part.** L’état publié et archivé dit `capacity`, avec le message. Toute autre erreur (panne, délai, résumé invalide) reste `error` et est retentée comme avant. Le dernier résumé, ses chapitres, leur provenance et tous les originaux ne sont pas touchés.
3. **L’entrée refusée est retenue par une révision, pas par une empreinte.** Un compteur avance à chaque changement de ce qu’une synthèse reçoit : source ajoutée, début, fin ou texte corrigés, limites, chapitres et passages intégrés par une synthèse réussie, nouvelle session, archive rouverte. La disponibilité en relecture, qui n’est pas envoyée, ne compte pas. L’entrée n’est jamais sérialisée pour être comparée.
4. **Le refus est celui de l’entrée envoyée.** La révision est relevée au départ de la tentative : un changement arrivé pendant que le refus se règle permet la tentative suivante.
5. **Un changement permet une tentative, pas plus,** après le délai habituel de 25 s. Si l’entrée tient, la synthèse reprend comme avant le plafond.
6. **Une nouvelle session et une archive rouverte partent sans blocage.** `restore` reste silencieux et ne reprend pas le statut ; à la reprise explicite, un refus local le rétablit.
7. **La vue le dit avec ses propres mots,** avec et sans résumé antérieur. Le libellé d’une panne passagère est inchangé.

Aucune synthèse récursive ou par chapitres, aucune route, aucun canal IPC, aucune dépendance. L’état publié ne gagne aucun champ, seulement une valeur de statut.

## Alternatives écartées

| Alternative | Exécutée ? | Raison |
|---|---|---|
| Empreinte de toute l’entrée, comparée à chaque tick | Non | Sérialiser plus de 240 000 caractères chaque seconde ; exclue par l’approbation d’exploration. |
| Signature limitée aux originaux et aux limites | Non, proposée à l’exploration, amendée par la supervision avant toute écriture | Les chapitres et les passages nouveaux entrent aussi dans ce que l’adaptateur mesure. |
| Lier le refus à l’état de la session quand il arrive | Seulement comme mutation | Une correction arrivée entre-temps resterait bloquée ; la mutation est détectée. |
| `error` avec un drapeau plutôt qu’un statut | Non | La vue et l’archive lisent déjà le statut ; un drapeau ajouterait un champ à l’état. |
| Mesurer la taille dans le cœur avant de tenter | Non | Le cœur devrait connaître le seuil, ou un port de mesure : hors du lot minimal. C’est ce qui supprimerait le refus résiduel décrit plus bas. |
| Reprendre le statut `capacity` à la réouverture | Non | `restore` ne reprend ni erreur ni statut ; l’approbation l’a laissé tel quel. |
| Une seule protection, compter ou effacer, à `reset`, à `restore` et après une synthèse | Non | Chaque ligne garde vrai un invariant écrit : le compteur suit tout changement, le refus s’efface là où l’erreur s’efface. Cinq mutations en restent indétectables une à une. |
| Reformuler le message de l’adaptateur | Non | Figé par un test commun et par l’approbation. |
| Synthèse par chapitres ou récursive | Non | Hors lot par le ticket ; voir les mesures préalables. |

## Conséquences

- Quand l’entrée cesse de changer (capture en pause, analyses terminées), un dernier refus local, puis plus aucune tentative.
- Tant que la capture continue au-delà du plafond, chaque nouveau passage change l’entrée : il reste un refus local par fenêtre de 25 s, avec deux publications d’état, sans appel au modèle. C’est la cadence d’avant. Déduit, non mesuré.
- Le compteur ne peut que surestimer un changement : une limite qui change puis revient coûte un refus local de plus. Il ne peut pas retenir une entrée qui n’a jamais été refusée.
- `size` et `limit` sont un point de mesure disponible sur le refus. Aucun code ne les lit ni ne les enregistre.
- `core/ports.cjs`, hors attribution, ne décrit pas de port de synthèse : cet ADR décrit le code d’erreur.
- `docs/living-recap.md`, hors des chemins de cette phase, décrit encore l’échec sans l’état `capacity` ni l’arrêt des tentatives.

## Mesures préalables à une synthèse par chapitres

Elle est hors de ce lot. Avant de la concevoir, il manque, sur des sessions réelles ou sur des données dites synthétiques :

- la taille de l’entrée à chaque tentative, acceptée ou refusée ;
- la part des originaux, des chapitres, des passages nouveaux (envoyés deux fois, comme nouveaux et comme originaux) et des limites ;
- la fréquence et l’ampleur des corrections de texte, et combien remettent en attente un passage déjà résumé ;
- le nombre de sources et de chapitres au premier refus ;
- la taille et la fréquence des états publiés, qui portent tous les originaux vers la fenêtre et vers l’archive.

Aucune de ces mesures n’existe à ce jour. À préserver quoi qu’elles montrent : l’accès aux originaux, chaque source citée une fois et une seule, aucune synthèse fondée sur une synthèse antérieure seule.

## Preuves

- **Déclaré par le développeur**, avant toute vérification du merger : 9 tests dans un fichier dédié, 8 rouges sur les fichiers produit de la base et 1 qui caractérise la panne ordinaire, 9 sur 9 sur le commit ; 5 fichiers de tests existants verts sans modification (52 tests), exécutés un à un ; 29 mutations d’une garde à la fois, 24 détectées. Les 5 autres sont des protections doublées à `reset`, à `restore` et après une synthèse réussie ; la paire de `restore`, retirée ensemble, est détectée.
- **Reviews indépendantes** : validation à la lecture du code et des journaux, sans exécuter de test.
- **Merger** : aucune exécution indépendante à la date de rédaction.

## Limites

- Codex réel, Mac natif, TV et VPS non exercés. La vue est rendue par son vrai module sur une doublure de document. Aucune taille, fréquence ni latence mesurée, aucun gain annoncé.
- Le statut `capacity` reste affiché si plus rien n’attend après un refus, quand une correction revient au texte déjà intégré : précédence héritée de `error`, non testée.
- Sans résumé antérieur, la vue dit « Aucun résumé n’est produit. » au-dessus du message inchangé de l’adaptateur, qui dit « Le dernier résumé reste disponible ».
- Une archive rouverte montre des passages en attente, pas le plafond, jusqu’à la reprise.
- Le test dédié dépend de la forme de `receiveRecap` dans `app/renderer.js`, et du chargement de la vue par détection de syntaxe sous Node.

La liste complète des dettes et des constats des reviews est dans l’historique.
