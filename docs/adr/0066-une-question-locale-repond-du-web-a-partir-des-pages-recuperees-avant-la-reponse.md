# 0066 — Une question locale répond du web à partir des pages récupérées avant la réponse

- Date : 2026-10-22
- Ticket : `docs/travail/tickets/309-answer-a-local-question-from-retrieved-pages-and-validate-its-sources.md`
- Statut : acceptée ; amende l'ADR 0057

## Contexte

L'ADR 0057 réservait le web au backend Codex : une source externe proposée par l'agent Ollama devenait une réponse
insuffisante (`adapters/ollama/question-response.cjs`). Le propriétaire veut que la voie locale réponde aux questions
qui demandent internet, ou un fait vidéo plus un fait extérieur. T308 a livré un port de récupération
(`WebRetrievalPort`, `core/ports.cjs`), une règle pure qui dit si une question appelle le web (`callsForWeb`,
`core/web-retrieval.cjs`) et une clé d'URL stricte (`sourceKey`, `adapters/external-links.cjs`). La règle du domaine
reste : une source ne compte que si sa page a été ouverte (`docs/domaine.md:17`) ; le propriétaire a confirmé le 22/10
qu'elle vaut aussi pour la voie locale, un simple résultat de recherche ne comptant pas. DeepAsk ne revalide pas les URL ;
l'agent est le seul garde.

## Décision

`OllamaQuestionAgent` accepte un port `retrieval` facultatif et un réglage `webTrigger` (`auto` par défaut, ou
`always`). Sans port, rien ne change : prompt et refus de l'ADR 0057. Avec un port, l'agent récupère des pages avant
la réponse, seulement pour une question en mode chat sans intention, quand `callsForWeb` est vraie ou que le réglage
vaut `always`. La requête est la question brute bornée (`retrievalQuery`).

- La récupération n'est pas un outil : les pages, rebornées par l'agent (nombre, longueur, `sourceKey`, doublons),
  entrent dans le bloc de données non fiables du prompt. La liste des outils vidéo reste celle de l'ADR 0057.
- Une source locale est valide si sa clé d'URL est celle d'une page rendue par la récupération de ce tour, avec un
  titre et un extrait non vides ; au plus six, une par page, publiée sous l'URL de la page. Le bilan
  `sourceValidation` a la forme de celui de Codex et accompagne toute réponse construite sur des pages.
- La récupération a son propre délai (`WEB_RETRIEVAL_TIMEOUT_MS`, 5 s depuis l'ADR 0068), dans l'échéance de la question. Un échec ou un
  délai dépassé ne fait pas échouer la question : aucune page, refus actuel d'une source externe et limite « La
  recherche web locale n'a pas abouti. ». L'annulation ou l'échéance de la question interrompt la récupération et
  aucune inférence ne part ensuite.
- Le résultat porte `retrieval` (résidence du port, statut `used`, `empty` ou `failed`, nombre de documents, durée),
  jamais de texte de page ; l'erreur du port n'est ni relancée ni tracée.
- Une relance ne réutilise pas les pages d'un tour précédent : chaque tour récupère de nouveau, sans historique
  implicite.

## Alternatives écartées

- Exposer la recherche comme un outil du modèle local : il ajouterait un outil hors des contrats vidéo (ADR 0004) et
  laisserait le petit modèle décider de chercher.
- Replier vers Codex quand la question demande le web : la voie locale ne déclenche aucun repli distant (ADR 0057).
- Accepter une URL proposée par le modèle sans qu'elle ait été récupérée : contraire à la règle des pages ouvertes.
- Activer la capacité par défaut : la composition et le réglage relèvent d'un ticket séparé ; sans port, l'existant
  reste exact.

## Conséquences

La voie locale peut répondre aux questions web et mixtes avec des sources vérifiables, sans changer DeepAsk ni les
outils vidéo. Un port de résidence `hybrid` (par exemple un moteur de recherche distant) fait sortir la requête de la
machine : une telle question est hybride et doit être relevée comme telle dans les essais. Limites connues : avec
`auto` et `always`, la requête est la question brute, sans reformulation (le déclencheur `model` de l'ADR 0067 la fait
écrire par le modèle) ; l'extrait d'une source n'est pas comparé au texte de la page ; une
récupération abandonnée sur délai peut encore tourner dans un port qui ignore son signal.

## Protégée par

`tests/ollama-question-agent.test.cjs` : question web répondue depuis les pages jusqu'au résultat de DeepAsk, source non
récupérée rejetée, réponse mixte, absence de récupération hors chat web avec prompt inchangé, réglage `always`,
rebornage des pages, récupération vide, en échec, hors délai et annulée.
