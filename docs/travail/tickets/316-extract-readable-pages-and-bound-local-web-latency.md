---
id: T316
titre: Extract readable web pages and bound local web answer latency
statut: termine
bloque_par: T315
adr: oui
installe: oui
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

La recherche web locale extrait le contenu principal des pages avec Mozilla Readability et un DOM léger, en conservant
l’extraction actuelle comme repli. Ses délais réservent du temps à la réponse et interrompent une question trop lente,
pour viser une réponse en moins de 15 secondes sans supprimer les replis existants.

## Sources

Code lu à `cfa0bf8` (branche d'essai `essai/f1-journal-web`) ; les fichiers de code et de test cités sont identiques sur
`feat/recherche-web-locale` à `a314d48` :

- `docs/standards.md:13-23` : constantes nommées, frontières du cœur et dépendances externes injectées.
- `docs/travail/tickets/315-give-the-model-the-part-of-each-page-that-matches-the-question.md` :
  modèle de ticket et conservation du début de page plus passage pertinent.
- `adapters/web/html-text.cjs:13-76` : sélection maison `article`, `main`, `body`, décodage et nettoyage ;
  `:79-81` : contrats `plainText`, `titleText`, `htmlPage`.
- `adapters/web/searxng.cjs:20-32` : recherche à 5 s, page à 4 s, cinq ouvertures, limite de 1,5 Mio par page ;
  `:102-107` : titre, seuil de 200 caractères et documents issus des pages lues ;
  `:161-238` : ouvertures parallèles, annulation, redirections et lecture bornée.
- `adapters/web/frozen-corpus.cjs:123-154` : corpus déjà extrait en texte, limité à 20 000 caractères.
- `core/web-retrieval.cjs:2-9`, `:154-164` : trois documents, lecture de 20 000 caractères et `pageExcerpt`
  limité à 2 500 caractères.
- `adapters/ollama/question-agent.cjs:19-24`, `:98-122`, `:169-226` : décision à 5 s, récupération à 15 s,
  file interne, échéance globale et abandon de la récupération même si le port ignore son signal.
- `core/deep-ask.cjs:11-13` : plafond général de 300 s, hors attente en file ;
  `adapters/ollama/http-client.cjs:60-72` : le transport attend sa réponse avant de revérifier l’annulation.
- `tests/searxng-retrieval.test.cjs:166-197`, `:212-334`, `:353-399` : extraction, bornes réseau,
  redirections, délais, annulation et HTML malformé.
- `tests/ollama-question-agent.test.cjs:1026-1044`, `:1203-1221` : replis sur délais ;
  `tests/web-retrieval.test.cjs:95-210` : sélection des extraits ;
  `tests/frozen-corpus-retrieval.test.cjs:118-176` : bornage du corpus et annulation.
- `docs/adr/0066-une-question-locale-repond-du-web-a-partir-des-pages-recuperees-avant-la-reponse.md:25-35` :
  pages ouvertes, validation des sources et repli sans pages.
- `docs/adr/0067-le-modele-local-decide-la-recherche-web-et-ecrit-sa-requete.md:23-35` :
  appel de décision court, repli sur la règle et diagnostics.
- Documentation officielle consultée :
  [Mozilla Readability](https://github.com/mozilla/readability#readability) expose `parse()`, `textContent`
  et `maxElemsToParse` ;
  [LinkeDOM](https://github.com/WebReflection/linkedom#readme) fournit un DOM pour Node sans chercher à simuler
  un navigateur complet. La compatibilité du couple sera vérifiée par les fixtures du ticket.
- Mesures fournies par Dabi : décision médiane 0,65 s, maximum 0,96 s sur 408 appels ;
  recherche SearXNG et ouverture des pages ensemble sur 59 recherches réelles (cache H4 sur GX10) :
  médiane 1,7 s, 90e centile 3,7 s, maximum 5,3 s ; réponse avec pages médiane entre 4,3 et 5,7 s.
  Ces mesures ne constituent pas des maxima garantis pour de futures questions.
- Décision de périmètre de Dabi : aucune double recherche ; H2b obtient 21/60 contre 26 pour la référence.

## Périmètre

### Extraction HTML

- Ajouter `@mozilla/readability` et `linkedom` aux dépendances de production et au verrou npm.
  Vérifier leur chargement depuis les modules CommonJS du projet.
- Dans `adapters/web/html-text.cjs`, faire de Readability le chemin principal de `htmlPage`.
  Construire un document isolé par parsing HTML uniquement : aucun script exécuté, aucune ressource chargée,
  aucun navigateur, aucun ajout de propriétés globales.
- Conserver le contrat `{ title, text }`. Utiliser le texte de l’article, jamais son HTML, normaliser les espaces
  et appliquer `WEB_PAGE_READ_MAX_CHARS`. Préserver les séparations entre paragraphes afin de ne pas coller les mots.
- Conserver la priorité actuelle du titre HTML et son plafond de 300 caractères, puis le repli existant sur le
  titre SearXNG. `plainText` reste inchangé.
- Une extraction est utilisable si son texte normalisé atteint le seuil existant de 200 caractères.
  Partager ce seuil avec SearXNG sans en dupliquer la valeur.
- Si le parsing ou Readability échoue, renvoie `null`, un texte vide ou trop court, utiliser l’extraction actuelle
  sur le HTML original, avant mutation du DOM. Le filtrage final de SearXNG reste applicable.
  Conserver ce repli sans enrichir ses heuristiques.
- Fixer une limite nommée de 20 000 éléments pour `maxElemsToParse` ; son dépassement mène au même repli.
  Cette limite borne le travail de Readability, sans prétendre borner à elle seule la durée du parsing DOM.
- Préserver les limites de téléchargement, redirections, types de contenu, ouvertures parallèles et documents
  retournés. Une notice SearXNG seule ne devient jamais une source.
- Ne modifier ni le corpus figé, qui contient déjà du texte, ni l’algorithme `pageExcerpt`.

### Budget de délai

Retenir les budgets suivants, avec horloge et minuteries injectées :

| Étape | Budget | Justification |
| --- | --- | --- |
| Décision | `WEB_DECISION_TIMEOUT_MS = 1500` | 540 ms de marge sur le maximum observé de 960 ms |
| Récupération complète | `WEB_RETRIEVAL_TIMEOUT_MS = 5000` | 59 recherches réelles (cache H4) : médiane 1,7 s, 90e centile 3,7 s, maximum 5,3 s ; 3,5 s en couperait environ une sur huit |
| Question locale éligible au web | `WEB_QUESTION_TIMEOUT_MS = 14000` | Au pire des budgets précédents, 7,5 s restent pour répondre (médiane observée 4,3 à 5,7 s) |
| Marge jusqu’à l’objectif produit | 1 s | Restitution et ordonnancement ; marge prévue, non mesurée |

- L’échéance de 14 s est commune à toute la question locale éligible au web : décision éventuelle, récupération,
  extraction, réponse et éventuels outils vidéo. Elle commence à l’entrée dans `answer`, inclut la file interne
  de l’adaptateur et n’est jamais réinitialisée entre les étapes.
- L’attente dans la file de DeepAsk avant l’appel de l’agent reste mesurée séparément, conformément au contrat actuel.
  Ne pas présenter le budget comme une garantie de délai depuis le clic utilisateur, ni comme une garantie
  d’obtenir une réponse pertinente.
- Appliquer cette échéance aux questions avec port de récupération, en mode `chat` sans intention, pour les trois
  déclencheurs. Les autres parcours gardent leur plafond actuel ; ne pas abaisser `QUESTION_TIMEOUT_MS` globalement.
- Garder les délais internes de SearXNG comme protections secondaires. Le signal du budget de récupération de 5 s
  couvre la recherche et toutes les pages ; aucun nouveau budget complet n’est accordé à chaque étape.
- À 1,5 s, abandonner effectivement l’attente de décision, annuler l’appel et appliquer `callsForWeb` à la question
  brute. Une décision tardive ne déclenche rien et ne modifie ni l’usage ni le résultat.
- À 5 s de récupération, conserver `#raceRetrieval` : annuler, abandonner l’attente et répondre sans pages,
  avec le statut et la limite existants.
- À l’échéance commune, arrêter l’attente et rendre l’erreur existante `TVLENS_OLLAMA_QUESTION_TIMEOUT`.
  Ne pas transformer cette erreur en réponse réussie ou en simple échec de recherche.
- L’abandon doit fonctionner même si une promesse réseau ignore son signal. Consommer ses résolutions et rejets
  tardifs sans résultat publié, compteur modifié ou appel supplémentaire. Nettoyer minuteries et écouteurs.
  Préserver la sérialisation et empêcher une question expirée en file de démarrer ultérieurement.
- Les échéances JavaScript ne préemptent pas une extraction synchrone : documenter cette limite.
  Aucune garantie temps réel stricte ni infrastructure de workers n’est introduite.

Ajouter l'ADR 0068 (0063 à 0067 sont pris sur d'autres branches), selon `docs/adr/0000-gabarit.md`, pour le choix d’extraction et
l’échéance locale, en amendement des ADR 0066 et 0067 ; ajouter son lien dans `docs/architecture.md`.

## Hors périmètre

- Nouvel index, plongements, classement supplémentaire, agent ou outil de recherche.
- Double recherche, seconde requête après échec, collecte de pages supplémentaires.
- Modification des prompts, de la règle `callsForWeb`, des déclencheurs par défaut ou de la validation des sources.
- Refonte de DeepAsk, de ses files, du transport partagé ou des parcours sans récupération web.
- Modification du harnais, relâchement du cliquet, suppression ou affaiblissement des tests.
- Pages réelles copiées dans Git, essai fournisseur, modèle local, TV, VPS ou déploiement.

## Critères d’acceptation

1. Une fixture HTML synthétique sans `article` ni `main`, avec navigation, liens latéraux, pied de page et plusieurs
   paragraphes centraux, passe par `SearxngRetrieval.retrieve`. Le document rendu contient le fait central et exclut
   les marqueurs du bruit. Ce test échoue avec l’extraction actuelle.
2. Des tests distinguent explicitement le succès de Readability du repli : résultat nul, vide, inférieur à
   200 caractères, exception et dépassement de la limite d’éléments. Le repli conserve un texte exploitable ;
   une page inutilisable après les deux chemins reste exclue.
3. Une fixture avec scripts inline et externes, gestionnaires d’événements, image, iframe et feuille de style
   n’exécute aucun marqueur et ne provoque aucune requête de ressource. Les seuls appels réseau sont ceux attendus
   pour SearXNG et les pages choisies. Aucun HTML n’est transmis comme texte de réponse.
4. Les tests existants conservent titre, `text/plain`, HTML malformé, entités, bornage des octets, redirections,
   dédoublonnage et règle des pages ouvertes. Les bornes de 20 000 et 2 500 caractères restent vérifiées ;
   les tests du corpus et de `pageExcerpt` restent verts.
5. Avec temps virtuel, une décision de 960 ms, une récupération de 2 500 ms et une réponse de 5 700 ms donnent
   une réponse sourcée à 9 160 ms. Une seule recherche est effectuée.
6. Avec décision puis récupération bloquées, leurs échéances surviennent à 1 500 ms puis 6 500 ms depuis le départ.
   Le repli sans pages peut encore répondre avant 14 000 ms. Vérifier aussi le repli de décision quand la règle
   ne demande aucune recherche.
7. Une réponse qui ne finit pas est abandonnée à l’échéance commune, y compris si elle ignore son signal.
   Une attente interne consomme le même budget. Une annulation utilisateur ou fermeture de session interrompt
   chaque étape sans lancer la suivante. Aucun résultat tardif ne contamine la question suivante.
8. Les parcours sans port, hors chat ou avec intention gardent leur comportement et leur plafond actuels.
   Les diagnostics distinguent toujours décision échouée, récupération échouée et échéance de question.
9. `node scripts/check.mjs` passe. L’ADR précise les budgets, leur justification et les limites de la cible de 15 s.
   Aucun essai réel n’est nécessaire pour accepter ce ticket ; les tests simulés ne prouvent pas une latence réelle.

## Test d’acceptation attendu

Dans `tests/searxng-retrieval.test.cjs`, ajouter d’abord la fixture bruitée du critère 1 et observer son échec,
puis son succès après remplacement de l’extraction. Compléter au besoin par `tests/html-text.test.cjs` pour les
chemins Readability et repli, via `htmlPage`.

Dans `tests/ollama-question-agent.test.cjs`, utiliser les horloges, minuteries, réponses réseau et promesses maîtrisées
pour vérifier les critères 5 à 8 par `answer`, jusqu’au résultat ou au code d’erreur. Aucune attente réelle de
1,5 s, 5 s ou 14 s ; aucune assertion sur le texte du code source.

Toutes les fixtures sont écrites pour les tests, avec des faits et domaines fictifs. Aucune page réelle,
aucun extrait du corpus privé et aucun oracle d’expérience ne sont copiés dans le dépôt public.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

- Préparation en lecture seule sur `cfa0bf8` par Codex Astra, à la demande de Dabi (22/10). Budget de récupération
  porté de 3,5 à 5 s par la session GX10 d'après les 59 recherches réelles du cache H4. Aucun fichier modifié,
  aucune dépendance installée et aucun contrôle lancé.
- Pendant le traitement, consigner les versions installées, les échecs initiaux des tests d’acceptation,
  les résultats observés et les éventuels écarts.
- 22/10, orchestrateur : brouillon déposé ; seules la forme (consigne de dépôt retirée, version du code, numéro
  d'ADR) a changé.
- 22/10, orchestrateur : accord du propriétaire pour installer `@mozilla/readability` et `linkedom` (« Oui », relayé
  par la session GX10) ; boucle lancée.
- 22/10, orchestrateur (Claude) : exploration (`explorateur`, rapport dans `.harness-state/tickets/T316/exploration.md`).
  Aucun écart de périmètre. Seuil de 200 caractères à déplacer dans `html-text.cjs` ; dépendances absentes du verrou ;
  l'échéance actuelle de 300 s démarre à la sortie de file et la décision attend un transport qui ignore son signal ;
  `#raceRetrieval` à généraliser à la décision et à l'échéance de 14 s armée dans `answer`. Écart déclaré (critère 2) :
  cas nul et vide provoqués par un extracteur injecté dans `htmlPage`.
- 22/10, orchestrateur : implémentation (`implementeur`). Versions installées : `@mozilla/readability` 0.6.0
  (Apache-2.0), `linkedom` 0.18.14 (ISC). Rouges observés : critère 1 (texte commençant par `NAV_LINK…`), critère 6
  (décision non abandonnée à 1 500 ms), critères 7-8 (huit cas sans issue à 14 s) ; critère 2 prouvé par mutations
  (repli retiré : 7 échecs), critère 5 vert dès le départ (non-régression). Écart déclaré : `maxElemsToParse` inopérant
  sous LinkeDOM, comptage préalable par `querySelectorAll('*')`. `node scripts/check.mjs` (implémenteur) : vert,
  3 176 tests JS, 71 Python. ADR 0068 écrit, lien dans `docs/architecture.md`, délais mis à jour dans 0066 et 0067.
- 22/10, orchestrateur : relecture 1 (`relecteur`) « à corriger », 0 bloquant, 1 mineur (décision tardive après 1,5 s non
  testée), 1 hors périmètre (plafond de cinq minutes annoncé par DeepAsk) ; les deux écarts déclarés sont acceptés.
  Correction confiée à l'implémenteur.
- 23/10, orchestrateur : correction (test de la décision tardive ajouté, rouge observé par mutation qui laisse passer
  la réponse tardive). `node scripts/check.mjs` (implémenteur) : vert, 3 177 tests JS, 71 Python.
- 23/10, orchestrateur : relecture 2 (correction) « accepté », 0 bloquant, 0 mineur, 1 hors périmètre, 0 non corrigé.
  `node scripts/check.mjs` lancé par l'orchestrateur : `check : vert`, 3 177 tests JS réussis sur 3 177, 71 tests
  Python OK, cliquet `cas_de_test_produit` 1737 → 1756.

### Réserves à la clôture

- Écart accepté, critère 2 : les cas nul et vide de Readability sont provoqués par un extracteur injecté dans htmlPage.
- Écart accepté, critère 2 : maxElemsToParse est inopérant sous LinkeDOM (getElementsByTagName('*') renvoie 0) ; la limite de 20 000 éléments est appliquée par un comptage préalable querySelectorAll('*').
- Hors périmètre : DeepAsk annonce toujours un plafond de 300 s (core/deep-ask.cjs:11-13) ; une question coupée à 14 s y apparaît comme une erreur TVLENS_OLLAMA_QUESTION_TIMEOUT.
- Question pour le propriétaire : avec le déclencheur auto, une question de chat purement vidéo reçoit aussi l'échéance de 14 s dès qu'un port de récupération est configuré (voulu par le ticket, à confirmer en usage réel).
- Non vérifié : aucune latence réelle mesurée ; un hôte déployé doit relancer npm ci pour les deux nouvelles dépendances.
