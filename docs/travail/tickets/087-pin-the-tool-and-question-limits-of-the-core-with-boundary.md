---
id: T087
titre: Pin the tool and question limits of the core with boundary tests
statut: a-faire
bloque_par:
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Les bornes que le cœur impose aux outils vidéo et à la file de questions sont aujourd'hui écrites dans le
code sans qu'aucun test n'échoue si on les déplace. Après ce ticket, chaque borne a un test à la valeur
limite : la dernière valeur acceptée passe, la première valeur refusée reçoit le message fixe attendu. Un
refactor du cœur qui déplace ou perd une de ces bornes fait échouer un test nommé.

Aucun code de production n'est modifié.

## Sources

- Constats : TSTB-06
- Code vérifié à la version `0d5a954` (nom d'abord, la ligne suit et bougera au formatage) :
  - `core/video-tools.cjs`, méthode `invoke(name, args, detail)` (ligne 126), appelée par `call(name, args)`
    (ligne 120). Ordre des contrôles, à lire en entier avant d'écrire un cas :
    - plus de 8 appels : « Limite de huit appels d’outils atteinte. » (ligne 128) ;
    - intervalle invalide : « Intervalle invalide ou postérieur à la question. » (ligne 139) ;
    - aucun passage dans l'intervalle : « Aucun passage observé dans cet intervalle. » (ligne 144) ;
    - `get_transcript` au-delà de 60 000 ms : « Transcription limitée à 60 secondes par appel. » (ligne 146) ;
    - nom d'outil inconnu : « Outil inconnu. » (ligne 151), atteint seulement avec un intervalle valide qui
      contient des passages ;
    - `inspect_clip` au-delà de 20 000 ms ou de quatre passages : « Réexamen limité à 20 secondes et quatre
      segments. » (ligne 152) ;
    - `exactSpeech` qui n'est pas un booléen : « Option exactSpeech invalide : true ou false. » (ligne 153) ;
    - troisième inspection, ou inspection pendant qu'une autre est en cours : « Au plus deux inspections, une
      à la fois. » (ligne 154) ;
    - question de réexamen non texte, vide ou de plus de 2 000 caractères : « Question de réexamen
      invalide. » (ligne 155).
  - `core/deep-ask.cjs`, classe `DeepAsk`, méthode `start(question, options)` (ligne 55) :
    - question non texte, vide ou de plus de 2 000 caractères : « Question invalide. » (ligne 56) ;
    - cinq questions déjà en attente : « Cinq questions sont déjà en attente. Attends une réponse ou annule
      une question. » (ligne 57) ;
    - `intent` présent mais hors de `recap` et `explain-moment` : « Action inconnue. » (ligne 58) ; `mode`
      n'est pas contrôlé ;
    - `anchorMs` ou `startMs` non fini ou négatif, ou `startMs` postérieur à `anchorMs` : « Intervalle de
      question invalide. » (ligne 59).
  - File de `DeepAsk` : `start` pousse la question puis appelle `drain`, qui passe aussitôt la première en
    `running` ; le refus de la ligne 57 ne compte que les questions `queued`. Il faut donc une question en
    cours (agent qui ne rend pas) plus cinq en attente pour que la start suivante soit refusée. `run`
    (ligne 77) arme une minuterie de `timeoutMs` (300 000 ms par défaut) qui n'est effacée qu'à la fin de la
    question ; `cancelAll` (ligne 38) annule les questions en attente et en cours.
  - Modèles de construction sans réseau ni disque : `tests/chat-codex.test.cjs` lignes 5 (`DeepAsk`) et 41-42
    (`VideoTools` avec un instantané d'un passage, une recherche et un inspecteur factices) ;
    `tests/clip-unreadable.test.cjs` ligne 113.
- Mesure du constat : aucune de ces phrases n'est exigée par un test à sa valeur limite. À reproduire avant
  d'écrire chaque cas : `grep -rn "<début de la phrase>" tests/`.

## Périmètre

- À créer : `tests/video-tools-limits.test.cjs` et `tests/question-admission-limits.test.cjs` (deux fichiers
  à plat, nommés par le comportement).
- À ne pas toucher : `core/`, tout autre code de production, les tests existants.
- Les valeurs attendues sont écrites en littéraux dans les tests (8, 60000, 20000, 4, 2, 5, 2000) : un test
  qui importerait une constante du code ne verrait pas son déplacement.
- Les phrases attendues sont les textes actuels, comparés en entier. Le ticket caractérise ; il ne reformule
  rien.
- Si une phrase est déjà exigée par un test existant à sa valeur limite, le cas n'est pas doublé : le journal
  cite le test existant.
- Doubles : objets littéraux et horloge injectée (`now`). Aucun délai réel, aucun `setTimeout` d'attente.
  L'agent factice attend une promesse que le test tient ; chaque test qui laisse une question en cours ou en
  attente appelle `cancelAll()` dans un `t.after`, pour qu'aucune minuterie de `run` ne retienne le
  processus. Une inspection tenue en cours passe par un `inspector.inspect` qui attend une promesse du test,
  libérée en fin de test.

## Critères d'acceptation

Chaque critère se vérifie par un test ou une commande.

1. `node --test tests/video-tools-limits.test.cjs` passe. Le fichier contient, un `test(` par règle :
   - le huitième appel d'outil répond, le neuvième est refusé par la phrase de la ligne 128 ;
   - une transcription de 60 000 ms répond, une de 60 001 ms est refusée ;
   - un nom d'outil inconnu, sur un intervalle valide qui contient un passage, reçoit « Outil inconnu. » ;
   - un réexamen de 20 000 ms sur quatre passages est admis, un de 20 001 ms est refusé, un sur cinq passages
     est refusé ;
   - `exactSpeech` autre que `true` ou `false` est refusé ;
   - deux inspections successives sont admises, la troisième est refusée ; une inspection lancée pendant
     qu'une autre n'a pas rendu est refusée (une inspection exige un `media.lease`, un `inspector.inspect`
     et des passages `available` : le double les fournit) ;
   - une question de réexamen de 2 000 caractères est admise, une de 2 001, une vide et une non texte sont
     refusées.
2. `node --test tests/question-admission-limits.test.cjs` passe. Le fichier contient : une question de 2 000
   caractères admise, une de 2 001, une vide, une faite d'espaces et une non texte refusées ; avec une
   question en cours que l'agent ne termine pas, cinq questions de plus admises en attente, la suivante
   refusée par la phrase de la ligne 57, puis de nouveau admise dès qu'une des questions en attente a été
   annulée par `cancel(raison, id)` ; un `intent` inconnu refusé par « Action inconnue. » ; un `startMs`
   postérieur à `anchorMs` et un `anchorMs` négatif refusés par « Intervalle de question invalide. ».
3. Preuve que les tests protègent, à consigner au journal avec commande et sortie : en remplaçant
   provisoirement `++this.calls > 8` par `++this.calls > 9` dans `core/video-tools.cjs`, puis `length>=5`
   par `length>=6` dans le refus de file de `core/deep-ask.cjs`, le test correspondant échoue. Les deux remplacements sont retirés avant la fin de la
   session.
4. Aucun cas ne lit une constante exportée par `core/` pour calculer sa valeur attendue :
   `grep -n "require(" tests/video-tools-limits.test.cjs tests/question-admission-limits.test.cjs` ne montre
   que `node:test`, `node:assert/strict` et les deux modules testés.
5. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Deux fichiers neufs, `tests/video-tools-limits.test.cjs` et `tests/question-admission-limits.test.cjs`.
Frontière : les méthodes publiques `VideoTools.call` et `DeepAsk.start`, sur des doubles en mémoire.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si une borne ne peut être atteinte sans modifier le code de production, ou si
le comportement observé à la limite contredit la phrase ou la valeur citée ici : verdict BLOQUÉ, avec la
commande et la sortie qui le montrent. Le test n'est pas adapté pour passer.

## Journal
