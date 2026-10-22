Tu es Codex Astra, en lecture seule. Dabi, propriétaire de TVLens, a l'impression que la recherche web de la voie locale
est devenue une « usine à gaz ». Il demande ton conseil franc : avons-nous sur-construit ? Pouvait-on réutiliser des
briques existantes ? Réponds en français, en une page au plus, avec des tableaux courts.

Contexte :
- TVLens est un compagnon de visionnage. Le spectateur pose une question pendant une vidéo ; un modèle local,
  gemma4:26b-a4b sous Ollama sur une GX10, répond depuis la transcription et les images.
- Contraintes : promesse « local » (le web passe par SearXNG auto-hébergé, sans clé ni quota, choix de Dabi) ; réponse
  en moins de 15 s ; règle produit : une source web n'est citée que si la page a été ouverte (docs/domaine.md, ADR
  0066) ; dépôt public ; dernier jour d'essais vendredi 23/10.
- Ce qui est construit, branche d'essai (ce checkout) : tickets T308 à T315 (docs/travail/tickets/308-* à 315-*),
  ADR 0066 et 0067, environ 1 100 lignes ajoutées dans core/, adapters/, runtime/ et scripts/, sans les tests :
  - core/web-retrieval.cjs : règles, déclencheur par mots-clés, extrait de page ;
  - adapters/web/searxng.cjs : recherche, ouverture de 5 pages, redirections, limites ;
  - adapters/web/html-text.cjs : extraction de texte HTML écrite à la main ;
  - adapters/web/frozen-corpus.cjs : corpus figé pour les essais ;
  - runtime/local-web-retrieval.cjs : configuration ;
  - adapters/ollama/question-agent.cjs : décision par un appel court au modèle, puis pages injectées avant la réponse ;
  - scripts/local-stream-* : rejeux et rapports.
- Mesures (dossiers dans /Users/Dabi/Documents/ISN/tvlens/experiments/essais/) :
  - H1 (2026-10-22-web-outils-hors-ligne-gx10) : pages injectées, W/M de 0 à 26 pertinentes sur 60, +1,5 s.
    L'outil search_web appelé par le modèle en deux temps casse avec gemma4 : boucles, JSON invalide, 4 réponses
    sourcées sur 60.
  - H2 (2026-10-22-decision-web-hors-ligne-gx10) : la décision par appel court prend 0,65 s et marque 30 W/M sur 30 ;
    la règle de mots-clés n'en marquait que 8.
  - Le produit gardait le début de page : le fait n'y est que pour 18 questions sur 27 ; début + fenêtre lexicale
    (T315) : 23 sur 27.
  - SearXNG s'est fait suspendre par Brave, DuckDuckGo et Google après une rafale de requêtes
    (2026-10-22-searxng-gx10).

Questions :
1. Verdict : usine à gaz ou non ? Distingue ce qui est nécessaire (contraintes ci-dessus) de ce qui est en trop. Lis
   le code avant de juger.
2. Briques existantes qui auraient pu remplacer une partie, avec ce qu'elles imposent :
   - la recherche web d'Ollama (service en ligne, clé) ;
   - OpenCode et ses outils webfetch ou websearch ;
   - Mozilla Readability ou trafilatura pour l'extraction de texte ;
   - les fonctions de SearXNG elles-mêmes ;
   - une bibliothèque de « web loader » ou de recherche locale.
   Dis ce qui garderait la promesse locale et la règle des pages ouvertes.
3. Ce que tu simplifierais, ou remplacerais, AVANT vendredi soir sans risque, et ce qu'il faut laisser tel quel.
   Sois concret : fichiers et fonctions.
4. Ce qu'il ne faut surtout pas faire maintenant.
