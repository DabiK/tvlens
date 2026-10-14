---
id: T092
titre: Feed the TV surveillance views with states published by the real core
statut: a-faire
bloque_par: T057, T058, T059, T062, T063, T064
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Les modèles de vue de la surveillance côté TV (`describeSurveillance` du panneau, `describeActivity` de
l'incrustation) ne sont testés que sur des états écrits à la main. Côté Mac, les modèles de vue propres à
`app/ui` sont déjà nourris par un vrai cœur `Surveillance` piloté par un scénario. Si le cœur change la forme de l'état qu'il publie, les
tests TV continuent de passer sur leurs littéraux pendant que l'écran de la TV se trompe.

Après ce ticket, le scénario qui fait vivre un vrai cœur de surveillance est une aide de test partagée, et les
modèles de vue TV sont nourris, pour chaque état d'activité que le cœur sait atteindre, par l'état réduit que
le serveur publie réellement. Un cas passe aussi par HTTP, en réutilisant le montage existant du serveur.

## Sources

- Constats : TSTC-12
- Code vérifié à la version `0d5a954` (nom d'abord, la ligne suit et bougera au formatage) :
  - `core/surveillance.cjs` : `snapshot({ full, brief })` (ligne 826) ; états d'activité calculés ligne 859 :
    `idle`, `stopped`, `late` (causes `detection-failed`, `registry-full`, `verification`, `detection`), `verifying`,
    `detecting`, `listening`, avec leurs libellés lignes 860-862.
  - `runtime/headless-runtime.cjs` : la vue du panneau publie `surveillance: this.surveillance.snapshot({ brief:
    true })` (lignes 474 et 569) ; `overlay()` (ligne 588) construit l'état de l'incrustation depuis le même
    instantané réduit.
  - `tv/app/surveillance-view.js`, fonction `describeSurveillance(surveillance, context)` (ligne 108) ;
    `tv/app/surveillance-overlay.js`, fonction `describeActivity(surveillance)` (ligne 157), états actifs
    `detecting`, `verifying`, `late` (ligne 23).
  - `tests/tv-panel.test.cjs` : états écrits à la main `compact()` (lignes 15-22) et `sourcedCard()`
    (lignes 23-27) ; tests « surveillance state: activation, counters, lateness with its cause and the number
    of unread passages » (ligne 226) et « surveillance activity is told in the words of the state:
    restoring, failed reading, a registry that is not saved » (ligne 259).
  - `tests/mac-ui.test.cjs` : `async function watchedSession(limits = {})` (lignes 145-178, vrai `Surveillance`
    avec détecteur et chercheur scénarisés, cinq passages), appelée lignes 182 et 246 ; fonction imbriquée
    `reading(down, passages, later)` (ligne 347, dans le test ligne 343) pour une lecture qui échoue.
  - `tests/server-surveillance.test.cjs`, test « a published surveillance card invalidates the entity tags of
    the polled views and of the ambient overlay… » (ligne 175) : vrai `HeadlessRuntime` derrière un vrai
    `RemoteServer`, lecture de `/v1/state?view=panel` et `/v1/surveillance/overlay` par la fonction `polled`.

## Périmètre

- À créer : `tests/helpers/watched-surveillance.cjs`, qui exporte la construction d'un cœur `Surveillance`
  scénarisé, déplacée depuis `watchedSession` sans changer son scénario ni ses valeurs, et, si elle se laisse
  extraire sans changer le test qui la contient, celle d'une lecture qui échoue (`reading`). Le nom de l'aide
  décrit ce qu'elle construit ; il ne cite ni ticket ni lot.
- À modifier : `tests/mac-ui.test.cjs` (ses deux appels passent par l'aide ; aucune assertion ne change) ;
  `tests/tv-panel.test.cjs` (nouveaux tests nourris par l'aide) ; `tests/server-surveillance.test.cjs`
  (assertions ajoutées dans le test ligne 175, qui passent les valeurs lues par `polled` aux modèles de vue
  TV).
- À ne pas toucher : le code de production (`core/`, `runtime/`, `server/`, `tv/app/`) ; les états écrits à
  la main de `tests/tv-panel.test.cjs` et les tests qui les utilisent (ils restent : ils couvrent des cas
  que le cœur n'atteint pas facilement) ; les aides créées par le lot L05, citées par leur nom si elles
  servent.
- Les textes attendus sont ceux que la TV affiche aujourd'hui, observés une fois puis figés en littéraux.
  Aucun texte n'est déplacé ni reformulé.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/mac-ui.test.cjs` passe avec le même nombre de tests qu'avant, et
   `grep -n "async function watchedSession" tests/mac-ui.test.cjs` ne rend plus rien : la construction vit dans
   l'aide partagée.
2. `node --test tests/tv-panel.test.cjs` passe. Un `test(` par état d'activité que le cœur scénarisé atteint
   parmi `idle`, `stopped`, `listening`, `detecting`, `verifying` et `late` (au moins deux causes de retard,
   dont `detection-failed`) : l'état est pris par `snapshot({ brief: true })` sur le vrai cœur, passé à
   `describeSurveillance` puis à `describeActivity`, et le test exige le statut, le compte et la pastille que
   la TV affiche. Un état que le scénario ne sait pas atteindre sans modifier le code de production est nommé
   au journal avec la raison ; il en reste au moins quatre.
3. Un test de `tests/tv-panel.test.cjs` exige que les clés de l'état réduit lues par `describeSurveillance`
   et `describeActivity` existent toutes dans l'instantané du vrai cœur : la liste de ces clés est écrite en
   littéral dans le test, et le test échoue en nommant la clé absente.
4. `node --test tests/server-surveillance.test.cjs` passe ; le test ligne 175 exige en plus que
   `describeSurveillance` appliqué à `surveillance` de `/v1/state?view=panel`, et `describeActivity`
   appliqué à la réponse de `/v1/surveillance/overlay`, racontent l'état attendu à au moins deux moments du
   scénario (surveillance lancée, carte publiée). Ses assertions existantes ne changent pas.
5. Preuve que les tests protègent, au journal avec commande et sortie : en renommant provisoirement la clé
   `activity` de l'instantané réduit dans `core/surveillance.cjs`, un test de `tests/tv-panel.test.cjs`
   échoue alors que les tests sur états écrits à la main passent. Le renommage est retiré avant la fin de la
   session.
6. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Les tests ajoutés à `tests/tv-panel.test.cjs` et les assertions ajoutées au test ligne 175 de
`tests/server-surveillance.test.cjs`. Frontières : l'instantané réduit publié par le vrai cœur, et la route
HTTP du vrai serveur, lus par les fonctions exportées de `tv/app`.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si l'état réel contredit un texte que la TV affiche sur un état écrit à la main
(écart entre ce que le cœur publie et ce que la vue attend) : le test nourri par le vrai cœur exige ce qui est
observé, son titre dit l'écart, et le journal le signale au propriétaire ; aucune vue n'est corrigée par ce
ticket. Si le lot L05 a déjà déplacé `watchedSession` dans une autre aide, cette aide est réutilisée et le
fichier `tests/helpers/watched-surveillance.cjs` n'est pas créé.

## Journal
