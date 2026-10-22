# 0064 — Les questions locales reçoivent un condensé citable des passages plus anciens que leur fenêtre

- Date : 2026-10-22
- Ticket : `docs/travail/tickets/313-give-local-questions-a-compact-digest-of-the-older-passages.md`
- Statut : acceptée

## Contexte

La voie locale (ADR 0057) reconstruit chaque question sans fil : en chat, `context()` ne lui donne que les six derniers
passages utilisables, et elle s'abstient ou invente sur les faits plus anciens. Codex garde un fil et a déjà reçu ces
passages. Sur 60 questions dans le flux réel de la GX10
(`experiments/essais/2026-10-22-flux-60-questions-gx10/README.md`), un journal compact injecté par le proxy de mesure
a fait passer les réponses pertinentes de 28 à 38, les inventions de 16 à 9 et les faits entièrement anciens de 0/19 à
6/19, sans changer les questions récentes, pour un délai médian de 6,3 s au lieu de 5,0 s.

## Décision

`core/older-passage-digest.cjs` construit, sans lecture ni horloge, une entrée par passage utilisable plus ancien que
la fenêtre récente : sa transcription rognée (ou « (pas de parole transcrite) »), suivie de « Image : » et des 300
premiers caractères du visuel sur les deux premières entrées et à chaque changement de sujet. Au-delà de 10 000
caractères, les entrées du milieu sont retirées une à une ; les deux premières et la dernière restent. Chaque entrée
porte l'id, les bornes et la disponibilité réels du passage, `precision: 'compact-journal'` et les champs média de
`core/shared/media-evidence.cjs` (un passage son seul garde `hasImages: false` et n'a pas de ligne « Image »).

`VideoTools` prend l'option `olderPassageDigest`. Avec elle, une question de chat sans intention reçoit ces entrées
avant ses six passages récents, calculées sur le même préfixe figé (ADR 0046, 0061) ; `omittedCount` baisse du nombre
d'entrées placées. Les entrées entrent dans `memoryEvidence`, donc DeepAsk accepte qu'une réponse les cite, sans
changer ses règles de preuve ; elles ne passent pas par l'audit des lectures et ne remplacent pas une preuve déjà
présente, alors qu'une lecture complète ultérieure du passage les remplace. `recap` (fenêtre de 120) et
`explain-moment` gardent leur contexte. `makeTools` (`runtime/conversation-runtime.cjs`) active l'option si et
seulement si `questionsBackend` vaut `local` : aucun réglage nouveau.

Quatre écarts avec le prototype mesuré sont tranchés : les entrées sont citables (dans J3, elles ne l'étaient pas, et
8 des 9 réponses remplacées par la phrase de validation sont des réponses J3) ; tous les passages utilisables anciens sont
repris, paroles seules comprises, ce qui garde `omittedCount` cohérent ; l'id et la disponibilité sont ceux du passage,
non recalculés ; le condensé est réservé au chat sans intention. Le sujet absent est comparé comme un sujet vide, et
la coupe à 300 compte en unités UTF-16, là où le prototype comptait en points de code. La valeur `compact-journal` est
celle que le modèle a vue pendant la mesure.

## Alternatives écartées

- Garder la réécriture dans le proxy de mesure : le produit n'en bénéficierait pas et les entrées resteraient non citables.
- Construire le condensé dans l'agent local ou dans son prompt : l'agent n'a pas la mémoire, et ADR 0057 met les
  limites dans `VideoTools` ; ces fichiers changent aussi sur une autre branche.
- Le construire dans DeepAsk : DeepAsk valide les preuves, il ne compose pas le contexte.
- Un interrupteur de configuration : un A/B se fait entre deux commits, sans réglage de plus à porter.
- Le donner aussi à Codex : son fil a déjà reçu ces passages, ce serait les répéter.

## Conséquences

Une question locale peut répondre et citer sur toute la session, dans un budget borné (environ 2 500 à 3 000 jetons
au plafond, non mesuré contre `numCtx`). Les preuves gardées après la question (ADR 0004) grossissent d'autant, et les
questions suivantes peuvent citer ces entrées par `priorEvidence`. Un passage utilisable par son seul résumé apparaît
sans parole et perd ce résumé hors ligne « Image ». L'effet de la citabilité n'est pas encore mesuré : un essai dans le
flux réel de la GX10, sans réécriture du proxy, doit suivre.

## Protégée par

`tests/older-passage-digest.test.cjs` couvre le module (texte, lignes « Image », son seul, amincissement), la fenêtre
de `VideoTools` avec et sans l'option, `recap` et `explain-moment` inchangés, les preuves et leur remplacement, et la
validation des citations par DeepAsk. `tests/conversation-runtime.test.cjs` vérifie le contexte d'une question locale
et celui de la même question avec Codex.
