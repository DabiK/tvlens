---
id: T171
titre: Keep TV chat cards and submission state inside one view
statut: a-faire
bloque_par: T170, T185
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

La conversation TV possède une seule vue pour ses cartes, leur progression et l'état d'envoi d'une
question. Le companion lui remet l'état reçu et les actions ; il ne maintient plus un second registre
de cartes ni un second verrou d'envoi. La navigation à la télécommande et l'interface du banc restent
compatibles.

## Sources

- `docs/audit-points-chauds.md`, section B « Découpage des trois gros fichiers », conversation TV.
  Décision du propriétaire, le 15/10 : ouverture sélective après T150 et périmètre de cette file.
- Code vérifié à `e92c6a6`, avant T169 et T170 :
  - `tv/app/companion.js:383` détient notamment `submitting`, `cards`, `anchor`, `followLatest`,
    `selectedMoment` et `receivedAt` dans la composition de page ;
  - `tv/app/companion.js:415` branche la navigation ; `tv/app/companion.js:842` extrapole le
    temps serveur à partir d'un delta monotone ;
  - `tv/app/companion.js:880` crée ou réutilise une carte par job et compare sa sérialisation ;
    `tv/app/companion.js:976` rafraîchit sa progression ; `tv/app/companion.js:995` gère l'annulation ;
  - `tv/app/companion.js:1021` calcule le statut et la disponibilité de l'envoi ;
    `tv/app/companion.js:1045` rend l'état, puis `tv/app/companion.js:1106` fusionne la réception
    et vide les cartes lors d'un changement de session ;
  - `tv/app/companion.js:1176` ajoute l'écho immédiat ; `tv/app/companion.js:1187` soumet,
    libère l'IME avant d'attendre le réseau, rattache l'écho à l'ID reçu et conserve le texte sur erreur ;
  - `tv/app/index.html:22` contient les éléments de conversation et de formulaire ;
    `tv/app/index.html:191` charge les scripts ;
  - `tests/helpers/tv-page.cjs:38` définit un DOM minimal de navigation et
    `tests/helpers/tv-page.cjs:158` le document. Il lui manque actuellement la création d'éléments
    et plusieurs opérations utilisées par le rendu réel des cartes ;
  - `tests/tv-panel.test.cjs:29` protège les modèles de progression/fraîcheur et
    `tests/tv-panel.test.cjs:166` la fusion des vues ; `tests/chat-error-ui.test.cjs:21` distingue
    les formes de résultat ; `tests/tv-remote-navigation.test.cjs:5` démarre une page non appairée.
- ADR 0011 pour le partage en script classique ; interfaces et ADR du contrôleur livrés par T170.

## Périmètre

- Créer `tv/app/chat-view.js`, script classique suivant l'ADR 0011, et le charger avant le companion.
  La fabrique reçoit les éléments/document nécessaires, les modèles, l'horloge et des actions injectées
  de soumission, annulation, navigation vers les citations et accélération du polling.
- Déplacer le registre des cartes, leur rendu et progression, l'écho d'envoi et le verrou `submitting`.
  La vue expose les opérations nécessaires pour recevoir un état, mettre à jour la progression,
  soumettre et se réinitialiser lors d'un changement de session. Elle peut notifier sa disponibilité
  d'envoi à la composition ; celle-ci ne recopie pas son état privé.
- La composition garde le snapshot partagé avec les autres vues, la sélection de moment et la
  navigation globale. Elle transmet à la vue la cible figée de la question, la connexion et les états
  nécessaires. La vue possède les effets de formulaire et de cartes, y compris le focus après envoi.
- Utiliser `chat-model.js` et le contrôleur de T170 sans recopier leurs règles. Le timer local qui
  rafraîchit aussi la surveillance peut appeler une méthode de la vue ; ne pas créer une seconde
  cadence de polling ni une minuterie de progression laissée active après libération.
- Ajouter `tests/tv-chat-view.test.cjs` avec le document minimal et les opérations
  déjà livrées par T185 dans `tests/helpers/tv-page.cjs`. Réutiliser aussi son mode appairé pour
  le cas de branchement de soumission ; ne pas reconstruire ce banc ni son DOM.
  Ajouter `chat-view.js` à la liste de la garde des littéraux de durée de
  `tests/tv-panel.test.cjs:80-85`, sans modifier ses assertions sur les libellés déplacés.
- Documenter la propriété de l'état et l'interface de la vue dans un ADR au premier numéro libre.
- Ne modifier ni protocole HTTP, politique d'ancrage, contenu des résultats, règles de polling,
  navigation globale, surveillance, frise ou bibliothèque. Ne supprimer aucun test existant.

## Critères d'acceptation

1. Recevoir deux fois un job crée un seul article, réutilisé lors du passage de queued à running puis
   done. Le test vérifie le DOM, les liens/citations et les libellés de résultat, y compris erreur,
   abstention et réponse provisoire. Le texte venu du serveur est ajouté comme texte, jamais par HTML.
2. La progression avance avec l'horloge injectée sans nouveau corps réseau ni reconstruction de la
   carte ; elle conserve l'extrapolation du temps serveur. Un 304 de T170 ne déclenche pas un nouveau
   rendu des cartes. La réception d'une vue chat conserve la timeline des autres vues de la même session.
3. Une soumission ajoute immédiatement un écho et désactive l'envoi. Un deuxième envoi pendant la
   promesse ne part pas. Le clavier est libéré et le focus remis à Dicter avant la réponse réseau,
   sans nouveau déplacement du focus à son retour. Les arguments de l'action contiennent le texte,
   la session et l'ancre figés, et les bornes de passage du moment sélectionné lorsqu'il y en a un.
4. Sur succès, l'écho devient la carte du job reçu ou disparaît si le polling a déjà créé cette carte :
   aucun doublon. Le champ n'est vidé que s'il contient encore le texte envoyé ; une nouvelle saisie
   est conservée. Le polling est accéléré. Sur erreur, l'écho disparaît, le texte reste disponible,
   le message d'erreur est visible et l'état d'envoi est libéré.
5. Un changement de session réinitialise les cartes ; une réponse tardive à un envoi de l'ancienne
   session ne rattache pas son écho déconnecté à la nouvelle conversation. L'annulation garde sa
   cible actuelle : job running, sinon dernier queued. Le défilement ne ramène pas au bas de page
   un spectateur en train de lire une carte ancienne ou de naviguer dans la conversation.
6. Le companion ne possède plus `cards` ni `submitting` et délègue les effets de conversation à une
   seule instance de vue. Le cas appairé passe par le formulaire et les scripts réels ; les tests de
   télécommande restent verts et `window.tvlensPanel` conserve `stats`, `kick`, `state`.
7. La garde des littéraux de durée couvre `chat-view.js` sans changement de ses assertions.
   Une mutation qui crée une seconde carte lorsque le polling précède l'accusé d'envoi rend le test
   du critère 4 rouge ; sortie consignée puis mutation retirée. Les tests de vue, modèle, polling,
   navigation, erreurs et compatibilité passent en séquentiel, puis `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

`tests/tv-chat-view.test.cjs`, frontière : la vraie vue, son DOM minimal et ses actions injectées.
Les tests conduisent réception, temps et réponses d'envoi différées, et vérifient nœuds, focus et
appels d'actions. Un cas appairé du banc de page prouve le branchement du formulaire ; aucun test
ne reconstruit une vue de substitution depuis le texte du companion.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T170 implique les modèles de T169, le retrait ambient et les horloges de T058, donc T150. Les repères
précèdent ces déplacements : les interfaces livrées doivent être lues avant de commencer. Le DOM
minimal décrit à `e92c6a6` ne suffit pas encore au rendu appairé ; T185 en livre l’enrichissement
réutilisable, que ce ticket consomme, sans dépendance npm ni promesse de validation sur le moteur
réel de la TV. En cas de refus ambient, le recadrage de dépendance nommé par T169 précède T170 ;
le banc de T185 reste disponible indépendamment de cette décision.

## Journal
