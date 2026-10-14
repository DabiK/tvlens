---
id: T127
titre: Name and test the request rules of the Mac chat in a pure module
statut: a-faire
bloque_par: T157
adr: non
installe: non
harnais: non
supprime_tests: non
---

## Ce que le ticket livre

Trois règles qui décident de ce que la fenêtre Mac envoie aux modèles vivent aujourd'hui en ligne dans
`app/renderer.js`, sans nom ni test : l'affirmation tirée d'un texte pour la vérification (préfixes
reconnus, renvois vides comme « ça », coupe à 2 000 caractères), la question débarrassée du préfixe pour
savoir si elle doit être effacée, et la demande d'approfondissement d'une réponse (« Approfondis cette
réponse : » suivi des 1 200 premiers caractères). Après ce ticket, elles sont des fonctions pures de
`app/ui/chat-requests.mjs`, fixées par des tests de caractérisation, et la fenêtre les appelle. Aucun
texte ni aucune demande ne change, à une exception près, décrite ci-dessous.

Défaut constaté en préparant ce ticket (exécution de l'expression de l.30 avec `node -e` à `0d5a954`) :
`que` et `si` ne sont pas suivis d'une limite de mot, si bien que « vérifie quelque chose » propose
« lque chose » et « vérifie simplement X » propose « mplement X » dans la boîte de vérification. Le ticket
ajoute cette limite de mot : c'est le seul changement de comportement admis. Attention : sans le drapeau
`u`, `\b` de JavaScript tient les lettres accentuées pour des non-lettres, si bien qu'un simple
`(?:que|si)\b` transforme encore « vérifie siège X » en « ège X » (vérifié avec `node -e`). La limite doit
donc exiger que `que` ou `si` ne soient suivis d'aucune lettre, accentuée ou non (par exemple une
anticipation négative sur les lettres, ou une fin de texte, une espace ou un séparateur `:`, `—`, `-`).

## Sources

- Constats : OUBLI-23
- Fiche : `docs/travail/fiches/interface-mac.md`, étape 1.
- Code concerné, à la version `0d5a954` :
  - `app/renderer.js`, constante `verifyPrefix` (l.30) :
    `/^(?:\/verify\b|v[ée]rifie(?:r)?\b(?:\s+(?:que|si))?|fact[- ]?check\b)\s*[:—-]?\s*/i`.
  - `app/renderer.js`, `openVerification` (l.284-291) : `text.trim().replace(verifyPrefix, '').trim()`
    (l.287), affirmation vidée si elle n'est qu'un renvoi
    `/^(?:ça|cela|cette affirmation|ce qu['’]il vient de dire)[.!?]?$/i` (l.288), puis
    `claim.slice(0, 2000)` (l.289).
  - `app/renderer.js`, gestionnaire `$('verify-form').onsubmit` (l.294-301) : la question est effacée si,
    débarrassée du préfixe, elle égale l'affirmation envoyée (l.298).
  - `app/renderer.js`, table `actions`, entrée `'job-more'` (l.335) :
    `` bridge.ask(`Approfondis cette réponse : ${job.result.answer.slice(0, 1200)}`) ``.
  - `tests/mac-ui.test.cjs` : aucun test ne lit `verifyPrefix` ni la demande d'approfondissement.
- Modèle de forme : `app/ui/search-view.mjs` et les tests qui l'importent depuis `tests/mac-ui.test.cjs`.

## Périmètre

- À créer : `app/ui/chat-requests.mjs`, sans DOM, sans pont, sans import externe. Il exporte :
  - `claimFrom(text)` : l'affirmation à proposer dans la boîte de vérification (préfixe retiré, renvoi
    vidé, coupe à 2 000 caractères), à l'identique de `openVerification` ;
  - `withoutVerifyPrefix(text)` : le texte débarrassé des espaces et du préfixe, à l'identique de l.298 ;
  - `deepenRequest(answer)` : la demande d'approfondissement exacte de l.335.
  Les noms peuvent changer si un nom plus juste s'impose ; la forme (trois fonctions pures) ne change pas.
- À modifier : `app/renderer.js` (`verifyPrefix`, `openVerification`, `verify-form`, `actions['job-more']`)
  et le fichier de tests où la vague 1 a rangé les tests des modules `app/ui/` (aujourd'hui
  `tests/mac-ui.test.cjs` ; tests à plat, arbitrage A1).
- `verifyPrefix` et l'expression des renvois disparaissent de `app/renderer.js`. Le texte « Approfondis
  cette réponse : » n'y apparaît plus.
- Hors périmètre : les gardes `verificationState.busy` et `configuration?.verificationAvailable`, les
  messages de `notice`, le dialogue (`showModal`, `focus`) ; tout passage de ces règles dans `core/` ou
  `runtime/` (décision 3 de la fiche, arbitrage A6) ; `app/preload.cjs`, `app/main.cjs`.
- Les deux bornes (2 000 et 1 200 caractères) portent un nom dans le module (`docs/standards.md` : une
  constante a un nom et vit à un seul endroit). La borne de 2 000 caractères de
  `VerificationService.verify` (`core/verification.cjs`) n'est pas touchée.
- La faute injectée pour le critère 3 est défaite à la main avant la fin de la session et le test relancé.
- Aucune ligne de plus de 160 caractères dans le nouveau module ; `app/renderer.js` n'en gagne aucune.

## Critères d'acceptation

1. Les tests du module passent et prouvent, en l'important directement :
   - `claimFrom` retire chacun des préfixes reconnus aujourd'hui : `/verify`, `vérifie`, `verifie`,
     `vérifier`, `vérifie que`, `vérifie si`, `fact-check`, `fact check`, `factcheck`, suivis ou non de
     `:`, `—` ou `-`, sans tenir compte de la casse ;
   - un texte sans préfixe revient seulement débarrassé de ses espaces de bord ;
   - un mot qui commence comme un préfixe sans en être un (par exemple `vérifiez`) n'est pas coupé ;
   - « vérifie quelque chose » donne « quelque chose », « vérifie simplement X » donne « simplement X » et
     « vérifie siège X » donne « siège X » (seul changement de comportement, voir plus haut) ; ces trois
     cas échouent sur l'expression d'aujourd'hui, ce que le journal montre en lançant le test avant la
     correction ; « vérifie que X », « vérifie si: X » et « vérifie qu’il X » (gardé tel quel) ne
     changent pas ;
   - « ça », « cela », « cette affirmation », « ce qu'il vient de dire » et « ce qu’il vient de dire »,
     seuls, avec ou sans `.`, `!` ou `?` final, et après un préfixe, donnent une affirmation vide ; suivis
     d'autres mots, ils sont gardés ;
   - un texte de 2 500 caractères donne une affirmation de 2 000 caractères ;
   - `withoutVerifyPrefix` rend, pour une question préfixée de moins de 2 000 caractères qui n'est pas un
     renvoi, la même chaîne que `claimFrom` ; pour « vérifie ça », il rend « ça » (le renvoi n'est vidé que
     dans l'affirmation, comme aujourd'hui l.287-288 et l.298) ;
   - `deepenRequest` rend « Approfondis cette réponse : » suivi de la réponse, coupée à 1 200 caractères
     pour une réponse plus longue.
2. Ces tests n'utilisent ni `vm` ni la lecture du texte de `app/renderer.js`.
3. Une garde de branchement, indifférente à la mise en page, prouve que `app/renderer.js` importe
   `app/ui/chat-requests.mjs` et appelle ses trois fonctions ; une faute injectée puis défaite (l'appel de
   `deepenRequest` remplacé par la chaîne d'avant) la fait échouer, sortie au journal.
4. Les gardes statiques existantes de `tests/mac-ui.test.cjs` (imports résolus, pont, pluriels, plafonds)
   passent avec le nouveau module dans `rendererFiles`.
5. `grep -cE "verifyPrefix|Approfondis|cette affirmation" app/renderer.js` rend 0 (5 à `0d5a954`).
6. Le nombre de tests du fichier modifié ne baisse pas (`grep -c "^\s*test("` avant et après, au journal).
7. `node scripts/check.mjs` est vert.

## Test d'acceptation attendu

Dans le fichier de tests des modules `app/ui/` (aujourd'hui `tests/mac-ui.test.cjs`). Frontière :
`claimFrom`, `withoutVerifyPrefix` et `deepenRequest` importés depuis `app/ui/chat-requests.mjs` ; aucun
DOM, aucun pont.

## Hypothèses bloquantes

Aucune décision n'est attendue. Si un cas des tests montre que le comportement d'aujourd'hui diffère de
la lecture faite ici (par exemple un préfixe listé qui n'est pas retiré), le test fixe le comportement
observé et l'écart est noté au journal ; s'il fallait changer un texte ou une demande pour extraire :
verdict BLOQUÉ, avec l'écart constaté.

## Journal
