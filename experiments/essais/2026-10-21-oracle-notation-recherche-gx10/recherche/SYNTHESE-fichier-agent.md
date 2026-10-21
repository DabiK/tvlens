# Synthèse des trois revues : programme GX10 des 48 h et architectures

Rédigée le 21 octobre 2026 vers 11:45 UTC par le sous-agent researcher (Claude). Ce document repose sur trois
revues indépendantes : latence des questions, coût de la perception, mémoire et transcription. S'y ajoutent des
vérifications faites ici en lecture seule :
- code figé `2035a2f` (git grep) ;
- bruts déjà rapatriés (`memoire-asr/mesures.json`, `ollama-tags-after.json` de l'essai `2026-10-21-reprise-bras-qwen`) ;
- documentation Ollama via ctx7 (`draft_num_predict`) ;
- résumés arXiv des articles postérieurs à 2025 cités ci-dessous.

**Statut.** Aucune inférence, aucune connexion au GX10, aucune charge GPU, aucun commit. Aucune piste n'est
validée. Les six fiches restent `readyForScoring: false` et l'oracle v2 est automatique, sans relecture
humaine (limite acceptée par le propriétaire) : aucun classement de pertinence n'est possible aujourd'hui.

Étiquettes utilisées :
- **[GX10]** : mesuré sur le GX10 (archives) ;
- **[Code]** : lu dans `2035a2f` ;
- **[Doc]** : documentaire, autre matériel ou autres modèles ;
- **[Supposé]** : compatibilité ou effet non vérifié ;
- **[Inféré]** : déduction de mesures, à confirmer.

---

## Résumé

1. Le plafond de pertinence se situe dans la mémoire, pas dans la vitesse.
   - Le modèle de questions ne voit que les 6 derniers passages (48 s) [Code].
   - Il n'a appelé aucun outil sur 150 questions archivées [GX10].
   - D'après les fiches provisoires, la preuve de 11 questions sur 30 commence plus de 48 s avant la pose.

   Accélérer ne réglera pas ces cas. L'essai de mémoire injectée (G2) est le plus important pour la pertinence.
2. Le résumé cumulatif `topicSummary` est la principale cause de la longueur des sorties de vision (r = 0,81)
   [GX10]. Il n'est pourtant **jamais transmis au modèle de questions** : le contexte et les outils passent par
   `passageText` (summary, visual, transcript) [Code]. Le réduire est le levier de perception le moins risqué
   pour les réponses. Il réduit aussi la contention avec les questions.
3. Le 27B décode à 27–32 jetons/s seul [GX10]. C'est 1,5 à 2 fois au-dessus du plafond de bande passante
   d'un modèle dense de 17,7 Go sur ~273 Go/s. Le décodage spéculatif MTP est donc **probablement déjà actif**
   dans le tag produit [Inféré]. À vérifier sans GPU (`ollama show`), puis par un essai court (G3), avant
   d'interpréter le bras « dense-mtp » d'E2.
4. Seul, le décodage domine (6–9 s, contre 2–3 s de préremplissage). Dans le flux, la contention avec la
   vision double à peu près le temps par jeton [GX10, régression grossière n = 10].
5. Ordre proposé :
   - E1 → E2 → E3, déjà en file, sans les modifier ;
   - A0 : analyse d'E1 sans GPU ;
   - un créneau de rejeux courts : G1 (format et outils), G3 (MTP), G4 (sortie de la vision) ;
   - G2 : mémoire injectée ;
   - notation à l'aveugle ;
   - E4 : une ou deux variations dans le flux.
6. Cinq propositions d'architecture :
   - A1 : mémoire à deux étages injectée ;
   - A2 : ordonnanceur à priorité question ;
   - A3 : perception allégée et consolidation découplée ;
   - A4 : répondeur rapide à deux phases avec repli ;
   - A5 : voie audio résidente et filtrée.

   Aucune n'est validée. Chacune a un plan de validation incrémental.

---

## 0. Base commune : faits, mesures et suppositions

| # | Constat | Nature | Source |
| --- | --- | --- | --- |
| F1 | Contexte des questions : 6 derniers passages utilisables, 120 pour un récapitulatif. Chaque passage = summary + visual + transcript, tronqué à 1200 caractères | [Code] | `core/video-tools.cjs` (`context`, `limit`), `core/shared/passage-text.cjs` |
| F2 | `topicSummary` (≤ 1600 caractères) est relu par l'appel de vision suivant et par la vue mémoire, pas par le contexte des questions ni par `remember()` | [Code] | `core/perception-context.cjs`, `core/memory/memory-view.cjs`, `core/memory/topic-summary.cjs` |
| F3 | Chaque appel du modèle de questions envoie à la fois `tools` et `format` (schéma complet), avec `stream:false`, température 0 et `think` réglable | [Code] | `adapters/ollama/http-client.cjs:50`, `adapters/ollama/question-agent.cjs:90` |
| F4 | 0 appel d'outil sur 150 questions (30 campagnes) ; 129 `observation`, 21 `insufficient` | [GX10] | `memoire-asr/mesures.json` (`toolUse`) |
| F5 | Sonde seule du 27B : 1552–2207 jetons de prompt ; préremplissage 2,07–2,92 s au premier passage, 0,14–0,16 s au second (prompt identique) ; 181–259 jetons générés en 5,99–8,91 s, soit **26,8–31,7 jetons/s** ; client 8,3–11,9 s | [GX10] | `memoire-asr/mesures.json` (`questionProbe`) |
| F6 | Tag `qwen3.8:27b` : 17,74 Go, 27,3 B, Q4_K_M, famille `qwen35`, capacités `vision` et `tools`, runner llamacpp | [GX10] | `…/reprise-qwen-arm-20261021T002414Z/results/ollama-tags-after.json` |
| F7 | Dans le flux : 10 réponses en 12,8–27,9 s, un seul appel, aucun outil ; pente ≈ 65 ms par jeton estimé, r = 0,84 | [GX10] + estimation | revue latence |
| F8 | Vision gemma3:4b, 414 appels réels (Kennedy et Spring) : génération 56,4 % et préremplissage 41,2 % du temps fournisseur. 91 appels au-delà de 8 s : 56 sont trop longs (médiane 352 jetons contre 197), 35 ralentis par une question (< 45 jetons/s, minimum 19) | [GX10] | `perception/mesures-derivees.json` |
| F9 | Jetons générés par la vision : corrélation 0,81 avec la longueur de `topicSummary`, 0,29 avec summary+visual | [GX10] | idem |
| F10 | 5 → 3 images : 48/48 paires plus rapides, −1,5 s en médiane à froid. Coût estimé par image : ~0,48 s d'encodeur et ~0,07 s de jetons LLM | [GX10] + [Inféré] | idem |
| F11 | Pause de la vision pendant une question : médiane Kennedy 18,78 → 11,21 s ; couverture visuelle Spring 91,4 % → 82,8–89,7 % | [GX10] | contexte commun |
| F12 | Whisper, un processus par bloc : `base` p50 1,29–1,65 s (dont ~0,6 s hors whisper et ~0,31 s de chargement), turbo p50 2,43–2,73 s (chargement ~1,1 s) | [GX10] | `memoire-asr/mesures.json` (`whisper`) |
| F13 | Spring sans dialogue : texte d'apparence parlée dans 16/58 passages avec turbo, 2/58 avec small et 3/58 avec base | [GX10] | idem (`springNonSpeech`) |
| F14 | Fin non analysée au départ de la question : médiane 8,0 s | [GX10] | idem (`freshness`) |
| F15 | Preuve commençant plus de 48 s avant la pose : 11/30 questions (CNRS 5/5, cuisine 5/5, spring-06) | fiches provisoires, non validées | revue mémoire |
| F16 | Transcription du préfixe jusqu'à la dernière question : ~0,1 k jetons (Spring) à ~5,7 k (Artemis) ; le texte visuel est 3 à 9 fois plus gros | [GX10] | `memoire-asr/mesures.json` |
| F17 | Avec Ollama, les tenseurs MTP embarqués ne servent que si `draft_num_predict` est réglé ; 0 désactive les brouillons | [Doc] | ctx7 `/ollama/ollama`, `docs/modelfile.mdx` |

### Quatre constats qui changent l'ordre des essais

1. **Le débit du 27B dépasse le plafond de bande passante d'un modèle dense** (F5, F6).
   - Un modèle dense relit tous ses poids à chaque jeton. Avec 15 à 17 Go de poids texte (le tag de 17,74 Go
     inclut probablement la tour vision), le plafond est de ~16–18 jetons/s à 273 Go/s, et de ~14–16 jetons/s
     au débit effectif de ~238 Go/s mesuré par llama.cpp sur GB10. La mesure donne 27–32 jetons/s.
   - Hypothèse la plus probable [Inféré] : le décodage spéculatif MTP est déjà actif par défaut dans le tag
     produit, comme l'affirme une source secondaire citée par la revue latence.
   - Conséquences : le bras « dense-mtp » d'E2, qui ne change que le tag, risque de ne rien montrer ; Q1 devient
     une vérification ; l'écart attendu avec un MoE passe de « 5–7× » à environ 2–3× en génération.
   - La revue latence avait estimé 12–14 jetons/s à partir du banc : c'est cette estimation qui ne tient pas
     face à F5.
2. **`topicSummary` coûte cher à la vision et n'apporte rien aux réponses** (F2, F8, F9).
   - La revue perception craignait qu'en le retirant, on dégrade le rappel ancien. Pour le chemin des
     questions, ce risque n'existe pas aujourd'hui : le modèle de questions ne le lit pas.
   - Les risques réels portent sur la continuité de sujet de la perception (`perception-context`) et sur
     l'affichage de la vue mémoire.
   - À l'inverse, A1 pourrait faire de ce résumé une mémoire utile, à condition de le produire hors de la voie
     vision (A3).
3. **Le rappel ancien est structurellement impossible dans les archives** (F1, F3, F4, F15).
   - Contexte FIFO de 48 s et aucun outil exercé : vitesse et choix du modèle ne corrigent pas ces cas.
   - Mécanisme proposé par la revue mémoire : avec `think=false`, la grammaire de `format` contraint toute la
     sortie dès le premier jeton et interdit la balise d'appel d'outil. C'est le code source d'Ollama `main` ;
     sur 0.40.6, c'est [Supposé].
4. **Le cache de préfixe fonctionne sur un prompt identique ; la réutilisation partielle reste inconnue.**
   - La revue latence supposait un recalcul complet (modèle hybride, Marconi arXiv:2411.19379). La mesure F5
     montre une réutilisation exacte : 0,15 s contre 2,1–2,9 s.
   - L'ordre actuel du prompt (question et marqueur aléatoire avant les données) empêche toute réutilisation
     d'une question à l'autre, sauf du rôle.
   - Ce point ne compte vraiment que si A1 allonge le contexte : un journal en ajout seul placé avant la
     question devient alors réutilisable (A1, M8).

---

## 1. Programme d'essais classé pour les 48 h restantes

### 1.1 État et règles d'exécution

- **En cours ou en file, à ne pas modifier.** E1 (référence instrumentée, échéance absolue 14:30 UTC le 21/10
  d'après `plan-e1.json`), puis la file `file-e2-e3.sh`.
  - E2 rejoue les 30 requêtes de premier tour sur 7 bras : 27B au début et à la fin, tag MTP, deux MoE Qwen
    (avec et sans MTP), MoE Gemma, MoE Qwen MTP avec raisonnement.
  - E3 rejoue 36 blocs (6 par vidéo) sur 8 bras : gemma3:4b au début et à la fin, qwen3-vl 2b, 4b (F16), 8b et
    30b-a3b, gemma4:e4b, et gemma3:4b à 3 images.
  - Je n'ai pas vérifié l'état réel sur le GX10 : ce constat vient des scripts du labo.
- **Lacunes connues d'E2/E3, à combler par des essais complémentaires sans modifier la file :**
  - aucun bras ne règle `draft_num_predict` ;
  - un passage par bras, encadré par la référence au début et à la fin : c'est une exploration, pas une
    confirmation ;
  - `prompt_eval_cached_count` n'est pas relevé ;
  - les appels d'outils sont enregistrés mais pas exécutés ;
  - E3 ne fait varier ni la résolution ni le schéma, et garde un bras F16 dont on sait déjà qu'il est lent.
- **Règles.**
  - Un seul essai GPU à la fois. Les essais G1, G3 et G4 sont **distincts et séquentiels**, chacun avec son
    dossier `experiments/essais/2026-10-2x-<sujet>/`, son plan figé par horodatage et SHA-256, et la prise des
    verrous `night.lock`, `execution.lock` et `followup-gpu.lock`.
  - Avant chaque charge : vérifier les campagnes actives, les verrous, la fin des téléchargements
    (`candidats-*/pulls.txt`) et `/api/tags` (digests).
  - Aucun `pull` pendant une campagne (incident du 19/10).
  - Aucune charge CPU lourde sur le GX10 pendant un essai chronométré (OCR, banc Whisper sur CPU). Les mesures de
    qualité seule (ASR, OCR) peuvent tourner sur le Mac, boucle arrêtée et sans contrôle chronométré.
  - Une file éventuelle est explicite, bornée et sans relance automatique, comme `file-e2-e3.sh`.
  - Aucun commit.
- **Évaluation commune** (PROGRAMME.md) : part pertinente sous 20 s et sous 15 s par vidéo, tous les délais
  individuels, inventions, abstentions. Avec 5 questions par vidéo, le p95 n'est que le maximum : ne rien en
  conclure seul.

### 1.2 Tableau classé

Le rang combine la valeur de décision pour la pertinence sous 20 s, le coût et les dépendances. L'ordre
d'exécution réel est au §1.4.

| Rang | Essai | Hypothèse (courte) | Variation unique | GPU | Décide |
| --- | --- | --- | --- | --- | --- |
| 1 | **A0** Ventilation d'E1 + C0 lecture des paramètres | Génération ≥ 60 % ; cache ≈ 0 entre questions ; MTP déjà actif | aucune | 0 | ordre et conditions de G1, G3 et Q3/Q4 ; lecture d'E2 |
| 2 | **G2** Mémoire injectée (rejeu) | Un journal causal compact ou un rappel par la question convertit les échecs de rappel ancien sans dégrader le « maintenant » | contenu du contexte (A / B journal / C rappel) | ~45 min | ticket A1, variante B ou C |
| 3 | **G1** Format et outils (rejeu) | `format` avec `think=false` bloque les outils | présence de `format` (+ témoin sans `tools`) | ~15 min | A4 à deux phases ; explication de F4 |
| 4 | **G4** Sortie de la vision (rejeu) | Plafonner ou retirer `topicSummary` réduit d'au moins 25 % les jetons générés sans perte d'OCR ni d'actions | schéma `format` de la vision | ~30 min | E4 avec proxy (plafond) ; ticket A3 |
| 5 | **G3** MTP du tag produit (rejeu) | Les ~30 jetons/s viennent d'un MTP déjà actif | `options.draft_num_predict` (défaut contre 0) | ~20 min | lecture d'E2 « dense-mtp » ; levier MTP restant |
| 6 | **E4** Confirmation dans le flux | Le gagnant d'un composant améliore la part pertinente sous 20 s sur la majorité des vidéos | une variation par passage A/B/B/A | 2 h par variation | recommandation produit |
| 7 | **G2b** Fraîcheur (rejeu) | Attendre ≤ 2,5 s la transcription du dernier bloc améliore les questions « maintenant » | Δ ∈ {0 ; 2,5 s} | ~12 min | ticket d'attente bornée |
| 8 | **G5** Calibration du coût par image | L'encodeur représente ≥ 70 % du coût d'une image (gemma3:4b) | nombre d'images, puis préredimensionnement | ~15 min | grille (perc-03) ou résolution |
| 9 | **E5** Whisper résident ou sur CPU | Le coût fixe par bloc disparaît ; la contention GPU baisse | mode d'exécution de Whisper | ~15 min de banc + ~30 min de flux | A5 ; Whisper meilleur au coût actuel |

Hors GPU, en parallèle : notation à l'aveugle (porte de toute décision), simulation de l'ordonnanceur (A2,
étape 1), qualité ASR et OCR sur le Mac, annotation des VTT de StreamingVLM (en dernier).

### 1.3 Fiches des essais

#### A0 : ventilation d'E1 et lecture des paramètres (0 GPU), dès la clôture d'E1

- **Hypothèses préenregistrées.**
  - Q : la génération représente au moins 60 % du temps fournisseur du rôle `questions`.
  - Q : `prompt_eval_cached_count` est proche de 0 entre deux questions différentes.
  - Q : sous chevauchement avec la vision, le débit de génération tombe sous 70 % de celui de la sonde seule (F5).
  - V : sur les 6 vidéos, `topicSummary` pèse au moins 30 % des caractères générés par la vision.
  - O : E1 ne contient aucun appel d'outil.
- **Variation.** Aucune.
- **Référence.** Journaux du proxy d'E1 et sonde seule F5.
- **Métriques.**
  - Questions, par appel : compteurs Ollama complets (y compris `prompt_eval_cached_count` s'il existe),
    `load_duration`, `upstreamMs` contre `endToEndMs` (file), recouvrement avec les appels de vision, outils,
    jetons par champ JSON (tokenizer approché, déclaré comme tel).
  - Vision, par bloc : jetons générés, part de `topicSummary`, appels au-delà de 8 s, publications perdues.
  - Pour toutes les questions : fraîcheur au départ.
- **C0, en lecture seule, sans charger de modèle.**
  - `ollama --version`.
  - `ollama show <tag> --modelfile` et `--parameters` pour `qwen3.8:27b`, `qwen3.8:27b-mtp-q4_K_M` et
    `qwen3.6:35b-a3b(-mtp)-q4_K_M` : `draft_num_predict` est-il réglé ? les digests de base coïncident-ils ?
  - `/api/show` (capacités, niveaux de raisonnement).
- **Coût.** 0 GPU. Copier E1 sur le Mac entre deux essais, ou pendant E2 avec une note : copie légère, à consigner.
- **Arrêt.** Sans objet. Si E1 est incomplet, analyser ce qui existe, sans relance.
- **Décisions préenregistrées.**
  - Si E1 contient au moins un appel d'outil, l'hypothèse de G1 est réfutée : on n'exécute pas G1 et on le consigne.
  - Si C0 montre `draft_num_predict` réglé dans le tag produit, ou si le débit seul dépasse 20 jetons/s, G3 teste
    « défaut contre 0 » ; sinon G3 teste « 0 contre 3 » sur le tag `-mtp`.
  - Si le préremplissage atteint au moins 25 % et que le cache est proche de 0, Q4/M8 entre dans la liste
    conditionnelle ; sinon Q4 n'est pas lancé dans la fenêtre.
  - Si la part de `topicSummary` atteint au moins 30 % sur au moins 4 vidéos, G4 est confirmé tel quel.

#### G1 : le format JSON bloque-t-il les outils ? (rejeu, ~15 min)

- **Hypothèse.** Avec `think=false`, le champ `format` empêche toute émission d'appel d'outil par le 27B.
- **Variation unique.** Le bras B retire `format` de la requête capturée. Le bras C est un témoin qui garde
  `format` et retire `tools`, une seule variation par bras.
- **Référence.** Bras A : requêtes E1 renvoyées octet pour octet.
- **Cas.**
  - Six questions à preuve ancienne : spring-06, cuisine-02, cuisine-05, cuisine-07, cnrs-04 et cnrs-06.
  - Quatre questions « maintenant » : kennedy-01, spring-02, tears-03 et kennedy-08.
  - Les fiches servent uniquement à choisir les cas ; rien n'en entre dans les requêtes.
- **Déroulement.** Ordre A B C C B A, soit 60 appels. Les outils sont enregistrés, pas exécutés.
- **Métriques.** `tool_calls` (nom, arguments, intervalle), validité JSON stricte (équivalent de `readAnswer`),
  jetons, durées, délai client.
- **Arrêt.** 3 erreurs consécutives, ou 20 min.
- **Décision préenregistrée.**
  - Si B appelle un outil sur au moins 2 des 6 questions à preuve ancienne et A sur aucune, le blocage est
    confirmé. A4 (deux phases) est alors justifié, et la part de JSON valide sans `format` en B fixe son
    architecture : rendu contraint systématique ou seulement en cas d'échec.
  - Si B n'appelle aucun outil, la cause est ailleurs (consigne ou modèle) et le rappel passe par la seule
    injection (A1).

#### G4 : sortie de la vision, `topicSummary` (rejeu, ~30 min)

- **Pré-contrôle** (2 appels, ~5 min) : `maxLength` dans le schéma `format` est-il respecté par Ollama 0.40.6,
  sans chute du débit ? Si ce n'est pas le cas, le bras V3 est abandonné et consigné.
- **Hypothèse.** V3 (plafond) ou V2 (retrait) réduisent d'au moins 25 % la médiane des jetons générés par bloc
  et la part des appels au-delà de 8 s à vide. L'OCR et les actions de summary et visual ne sont pas dégradées.
- **Variation unique, par bras.**
  - R : requête capturée.
  - V2 : `topicSummary` retiré du schéma et de la consigne.
  - V3 : `topicSummary` plafonné par `maxLength` ≈ 300 caractères dans le schéma seul. Ce bras garde le contrat
    applicatif.
- **Référence.** R, sur 48 corps de requêtes vision d'E1 : 8 par vidéo, stratifiés par longueur du
  `topicSummary` en entrée et par fenêtres OCR et actions. Sélection figée par SHA-256 avant exécution.
  gemma3:4b, digest vérifié.
- **Déroulement.** Ordre R V2 V3 V3 V2 R, nonce en tête contre le cache de préfixe, froid et chaud séparés.
- **Métriques.** `eval_count`, `eval_duration`, préremplissage, total, validité JSON, longueur de chaque champ.
  Annotation à l'aveugle de summary et visual contre les images de l'oracle v2 : OCR, actions brèves, inventions.
- **Arrêt.** Échec du pré-contrôle (V3 abandonné), 3 erreurs consécutives, ou 40 min.
- **Décision.**
  - V3 passe en E4 par le proxy si la médiane des jetons baisse d'au moins 25 % et que l'annotation n'est pas
    inférieure à R sur la majorité des vidéos.
  - V2 alimente le ticket A3.
- **Limite déclarée.** Le rejeu à contexte figé ne reproduit pas la rétroaction : les contextes de vision
  suivants raccourcissent aussi. L'effet sur le préremplissage est donc sous-estimé.

#### G3 : MTP du tag produit (rejeu, ~20 min)

- **Hypothèse** (si C0 indique MTP actif). Avec `draft_num_predict=0`, le débit seul tombe sous ~18 jetons/s
  et le texte reste identique à température 0.
- **Variation unique.** `options.draft_num_predict` : défaut du tag (P) contre 0 (P0). Variante préenregistrée
  si C0 montre le paramètre absent : 0 contre 3 sur le tag `-mtp`.
- **Référence.** P, sur 15 requêtes E1 de premier tour (Kennedy, CNRS et Spring, 5 chacune).
- **Déroulement.** Ordre P P0 P0 P, chauffe exclue et consignée, GPU sans autre charge, vision et Whisper arrêtés.
- **Métriques.** Jetons/s de génération, total, `load_duration` (pour détecter un rechargement), correspondance
  exacte de `message.content` entre bras, validité JSON, identifiants cités.
- **Arrêt.** 3 erreurs consécutives, rechargements répétés, ou 30 min.
- **Décision.**
  - Si P0 descend à 0,6 × P ou moins, MTP est déjà actif : le bras « dense-mtp » d'E2 compare le même
    mécanisme, Q1 est clos et le levier restant est le modèle (A4).
  - Si P0 ≈ P, MTP n'est pas actif et l'anomalie F5 reste à expliquer : consigner et ne rien conclure sur la
    bande passante.
  - Un balayage 1/2/4 n'est envisagé qu'ensuite, sur 5 requêtes.

#### G2 : mémoire injectée (rejeu, ~45 min), et G2b : fraîcheur (~12 min)

- **Préparation CPU, sur le Mac pendant E2 et E3.**
  - Constructeur de contexte causal à partir des journaux E1 : seulement les révisions avec
    `publishedAtMs ≤ anchorMs` et `endMs ≤ anchorMs`.
  - Bras B : journal compact plafonné à 2,5 k jetons, une ligne par bloc (transcription), une ligne visuelle
    seulement si elle change, les deux premiers blocs toujours gardés.
  - Bras C : k = 6 passages anciens retrouvés par `qwen3-embedding:0.6b`, la question servant de requête.
  - **Mesure sans modèle préenregistrée, le « rappel de preuve » :** part des questions dont l'intervalle de
    preuve de l'oracle v2 figure dans le contexte de A, B ou C. Elle est calculée après la construction et ne
    sert jamais à la construire.
- **Hypothèse.** B ou C augmentent la part pertinente sur les questions à preuve ancienne, sans baisse sur les
  questions « maintenant ». Coût : moins de 3 s de délai à vide.
- **Variation unique.** Contenu du contexte injecté : A capturé, B ou C. Prompt, schéma et options identiques.
- **Référence.** A.
- **Déroulement.** 30 questions × 3 bras × 2 passages contrebalancés, soit 180 appels, 27B seul.
- **Métriques.** Jetons de prompt, préremplissage, génération, délai client ; nombre de `insufficient` ;
  citations hors contexte. Notation à l'aveugle par vidéo : part pertinente sous 15 et 20 s, inventions,
  abstentions justifiées. Tous les délais publiés.
- **Arrêt.** 45 min, ou 3 erreurs consécutives.
- **Décision.** Ouvrir un ticket A1 (journal ou rappel, et validation des preuves élargie aux passages injectés)
  si B ou C progresse sur les questions anciennes, majoritairement par vidéo, sans hausse des inventions ni perte
  sur le « maintenant ». Sinon, publier la frontière sans gagnant.
- **G2b**, essai distinct dans le même créneau.
  - Variation : contexte A avec Δ ∈ {0 ; 2,5 s} de publication audio après la pose ; 30 × 2 = 60 appels.
  - Comptage préalable sur CPU des questions qui récupèrent leur dernier bloc.
  - Décision : ticket « attente bornée de la transcription du dernier bloc » si les questions concernées
    progressent.

#### E4 : confirmation dans le flux (2 h par variation)

- **Candidats, dans l'ordre préenregistré.** Chacun n'entre que si sa porte est franchie.
  1. Plafond de `topicSummary` par le proxy (V3), si G4 passe.
  2. Changement du modèle de questions, si E2 noté à l'aveugle montre un MoE non inférieur au 27B sur la
     majorité des vidéos, sans hausse des inventions, et plus rapide.
  3. `draft_num_predict` injecté par le proxy, si G3 montre un gain et qu'il n'est pas déjà actif.
- **Protocole.** Une variation par passage A/B/B/A sur Kennedy, Spring et CNRS (anglais, sans dialogue,
  français avec texte à l'écran), avec la configuration produit et la validation des preuves.
- **Métriques.** Celles du programme, plus la couverture visuelle, les publications perdues et la fraîcheur.
- **Arrêt.** Règles du programme : premier échec non corrigible, plafond, échéance. Sorties partielles conservées.
- **Décision.** Une configuration n'est recommandée que si sa part pertinente sous 20 s progresse sur la
  majorité des vidéos sans hausse des inventions. Le prototype par proxy reste un prototype ; le produit passe
  par un ticket.

#### G5 : calibration du coût par image (optionnel, ~15 min)

- **Hypothèse.** Pour gemma3:4b, au moins 70 % du coût de préremplissage d'une image vient de l'encodeur et du
  prétraitement, pas des 256 jetons côté LLM.
- **Variation.**
  - 0, 1, 3 et 5 images avec `num_predict=1` ;
  - puis JPEG 1280×720 contre 896×896 redimensionnés à l'avance ;
  - seulement sur gemma3:4b et sur le meilleur candidat d'E3.
- **Arrêt.** 20 min.
- **Décision.** Investir ou non dans la grille 1 + 2×2 (perc-03) ou dans la résolution d'entrée (Qwen-VL).

#### E5 : voie audio (si le temps le permet)

- **Banc composant** sur les WAV figés, hors essai chronométré, ~15 min de GPU et 45–60 min de CPU :
  processus GPU (référence), serveur résident GPU, `-ng` sur CPU, `-ac` réduit.
- **Flux.** Le gagnant contre la référence, A/B/B/A sur Kennedy.
- **Décision.** Suite d'A5.

### 1.4 Calendrier indicatif (UTC, à ajuster selon l'état réel)

| Créneau | GPU | En parallèle, sans GPU |
| --- | --- | --- |
| 21/10, jusqu'à 14:30 au plus tard | E1 (en cours) | préparer les plans G1, G3 et G4 (rejouer_* avec une seule modification chacun, SHA) ; constructeur causal G2 ; grille d'annotation de la perception si elle manque ; oracle v2 |
| 21/10, ~14:30 à ~16:30 | E2 puis E3 (file existante, ~1 à 1,5 h estimées) | A0 et C0 sur le Mac (copie d'E1 consignée) ; notation à l'aveugle d'E1 |
| 21/10, ~16:30 à ~18:30 | G1 (si A0 le justifie), G3, G4 : trois essais l'un après l'autre | notation d'E2 et annotation d'E3 |
| nuit du 21 au 22/10 ou matin du 22/10 | G2 puis G2b (~1 h), G5 en option | rappel de preuve calculé avant G2 ; Mac éveillé, file bornée sans relance |
| 22/10, journée | libre ou E5 (banc composant) | notation de G1, G2 et G4 ; simulation de l'ordonnanceur (A2) ; qualité ASR sur le Mac |
| 22/10 soir au 23/10 matin | E4, variation 1 (2 h), puis variation 2 si sa porte est franchie | dépouillement |
| 23/10 | E5 dans le flux si le temps le permet ; sinon rapatriement et synthèse | index `experiments/essais/README.md`, boucle arrêtée |

Nouveau GPU après E3 : environ 5 à 7,5 h, E4 compris. Ce qui limite vraiment, ce sont la notation à l'aveugle
et la préparation des rejeux, pas le GPU. Agents : quatre au plus en même temps, parent compris. Les
inventaires volumineux (journaux d'E1) vont à `luna_worker`.

### 1.5 Ce que le programme permettra ou non de décider le 23/10

- **Possible.**
  - Savoir si MTP est déjà actif.
  - Savoir si un MoE est non inférieur à l'aveugle sur la majorité des vidéos, avec un classement provisoire
    sous l'oracle automatique.
  - Savoir si l'injection de mémoire convertit les échecs de rappel.
  - Savoir si le plafond de `topicSummary` libère la vision.
  - Avoir une à deux confirmations dans le flux.
- **Impossible.**
  - Un classement « validé » : l'oracle v2 vient de modèles, sans relecture humaine.
  - Un p95 robuste : 5 questions par vidéo.
  - Des gains produit pour A1, A2, A3 ou A5 : ils passent par des tickets.
  - Une conclusion sur des vidéos non utilisées pour choisir.

---

## 2. Propositions d'architecture

Toutes les propositions reposent sur le même argument propre au GB10. À batch 1, la **génération est limitée par
la bande passante** (~273 Go/s), alors que le **préremplissage est limité par le calcul**, abondant sur
Blackwell : ~1 ms par jeton de prompt contre ~33 ms par jeton généré pour le 27B seul (F5). Sur cette machine,
il vaut mieux :
- ajouter du contexte que générer davantage ;
- générer moins par appel que faire plus d'appels ;
- ne jamais faire tourner deux générations à la fois (elles se partagent la bande passante, F8 et F11).

### A1 : mémoire à deux étages injectée en un seul appel

```
bloc 8 s ─► Whisper ─► ligne de transcription [id, t0–t1, texte]          (publiée dès la fin, cf. A5)
        └─► VLM ─────► observation courte du bloc
                │
   Consolidateur CPU déterministe : fusion des voisins similaires (embeddings déjà calculés),
   deux premiers blocs gardés, plafond ~2,5 k jetons ─► JOURNAL CAUSAL (ajout seul, horodaté)
   Index qwen3-embedding:0.6b (existant) ─► k passages anciens proches de la question

Prompt = [rôle + outils : stable] [JOURNAL : préfixe croissant] [k rappels] [6 passages récents]
         [DEMANDE + REPÈRES + marqueur]
   ─► modèle de questions, 1 appel ─► validation des preuves (élargie aux passages injectés)
```

- **Mécanisme.**
  - Remplace la FIFO de 48 s (F1) et les outils jamais appelés (F4) par une mémoire toujours présente,
    horodatée et bornée.
  - La fenêtre fine garde le « maintenant » ; le journal et le rappel couvrent l'ancien.
  - Placer le journal avant la question rend le préfixe réutilisable d'une question à l'autre. La réutilisation
    exacte est mesurée (F5) ; la réutilisation partielle sur ce modèle hybride reste à vérifier (Marconi).
- **Gains attendus et pourquoi sur GB10.**
  - Pertinence d'abord : jusqu'à 11/30 questions concernées (F15, provisoire). Les insufficient de rappel
    (spring-06, cuisine-07) deviennent réparables.
  - Coût à vide : +0,1 à 2 s sur Spring, Tears, Kennedy et Bœuf ; borné à environ +2,5 s sur CNRS et Artemis
    par le plafond. Cela équivaut à 40 à 75 jetons générés : le contexte coûte peu sur GB10.
  - Aucun tour d'outil (chaque tour coûte 5 à 10 s sur le 27B).
- **Risques pour la pertinence.**
  - Dilution, et information perdue au milieu d'un long contexte.
  - Résumés VLM confabulés entrant dans la mémoire.
  - Le rappel par embeddings rate les questions temporelles (« depuis le début ») : d'où les deux premiers
    blocs gardés.
  - Les erreurs de l'ASR `base` en français se propagent.
  - Régression possible sur le « maintenant ».
- **Papiers.**
  - StreamForest, arXiv:2509.24871 : à budget égal, la FIFO perd face à une mémoire d'événements persistante.
  - VideoStreaming, arXiv:2405.16009 : sélection par la question et horodatages.
  - Video-RAG, arXiv:2411.13093 : ~1,9 k jetons ASR/OCR retrouvés, une seule récupération.
  - MA-LMM, arXiv:2404.05726 : fusion des voisins similaires contre la FIFO.
  - LLoVi, arXiv:2312.17235.
  - ReKV, arXiv:2503.00540 : le rappel des bons segments pilote l'exactitude.
  - Lost in the Middle, arXiv:2307.03172.
  - Memory Helps, but Confabulation Misleads, arXiv:2502.15457.
  - Marconi, arXiv:2411.19379.
- **Validation incrémentale.**
  1. CPU : contextes causaux et rappel de preuve (G2, préparation). Prédiction falsifiable : A plafonne autour de
     19/30, B et C dépassent 27/30.
  2. Rejeu G2 et notation à l'aveugle.
  3. Pas de prototype fidèle par proxy : la validation des preuves de TVLens refuserait les citations de passages
     injectés. Passer par un ticket, derrière un drapeau, avec tests (journal, rappel, validation élargie).
  4. E4 A/B/B/A sur CNRS et Bœuf (rappel) plus Kennedy (témoin).
  5. Session longue sur des vidéos non utilisées pour choisir.

### A2 : ordonnanceur GPU à priorité question, perception à dette bornée

```
voie vision (file bornée) ─┐
                           ├─► ORDONNANCEUR ─► Ollama (un GPU, génération limitée par la bande passante)
question ──────────────────┘  (priorité absolue)
 1. question en cours ⇒ aucun nouveau départ vision (mécanisme existant de pause)
 2. appel vision en cours dont le reste attendu dépasse X s ⇒ annulé puis remis en file (à prototyper)
 3. après la réponse : rattrapage de la dette en mode dégradé (3 images, sortie plafonnée cf. A3),
    le bloc le plus récent d'abord, puis les plus anciens tant que leur âge reste sous un seuil
 4. transcription jamais suspendue (CPU ou résidente, A5) : la fraîcheur audio est garantie
```

- **Mécanisme.** Deux générations simultanées se partagent la bande passante : la vision descend à 19 jetons/s
  pendant une question (F8), la question perd environ la moitié de son débit (F5 contre F7). Exécuter chaque
  appel jusqu'au bout crée un blocage en tête de file. Préempter et rattraper déplace le coût de la perception
  hors du délai des questions. La couverture est préservée par le mode dégradé plutôt que par l'abandon.
- **Gains attendus et pourquoi sur GB10.**
  - Délai des questions rapproché de la sonde seule (8,3–11,9 s pour le 27B).
  - La pause seule a déjà fait passer la médiane Kennedy de 18,78 à 11,21 s (F11). La préemption retirerait
    le reste de l'appel vision en cours, estimé à quelques secondes [Inféré].
  - La perte de couverture (Spring 91,4 → 82,8–89,7 %) serait compensée par le rattrapage à 3 images
    (−1,5 s médiane, F10) et à sortie courte.
- **Risques pour la pertinence.**
  - Fraîcheur des questions « maintenant » : le dernier bloc n'est pas vu par la vision pendant la question.
  - OCR dégradée en mode rattrapage.
  - Calcul perdu par les annulations.
  - Publications hors d'ordre dans la mémoire.
- **Papiers.**
  - FastServe, arXiv:2305.05920 : préemption au jeton et blocage en tête de file.
  - StreamAhead, arXiv:2610.25551 : arbitrage entre précalcul du flux et calcul au moment de la question,
    sous contrainte de cadence ; jusqu'à 10,4× moins de TTFT, sur leur matériel.
  - Dispider, arXiv:2501.03218.
  - Flash-VStream, arXiv:2406.08085 : mise à jour continue de la mémoire, questions asynchrones.
- **Validation incrémentale.**
  1. CPU : simulation à événements discrets, alimentée par les durées par bloc et les instants de question d'E1.
     Elle doit d'abord reproduire les pertes et délais observés en E1 avant toute lecture. Politiques
     comparées : actuelle, pause, pause plus préemption, pause plus rattrapage dégradé ; sorties par vidéo.
  2. Prototype par proxy, présenté comme tel : retenir au proxy les requêtes vision pendant une question et
     réécrire les requêtes en retard (3 images, plafond). Pas d'annulation par le proxy : elle ferait perdre une
     publication.
  3. Dans le flux, A/B/B/A sur Kennedy et Spring : pause seule contre pause plus rattrapage dégradé.
  4. Ticket pour la préemption dans l'application.

### A3 : perception légère et consolidation découplée

```
bloc ─► [CPU] différence de miniatures (existante, shadow) + OCR léger (PP-OCRv5 mobile, optionnel)
     ─► VLM : champs du BLOC seulement (summary, visual, uncertainty plafonnés par la grammaire)
              + texte OCR fourni comme donnée non fiable ─► publication immédiate
     ─► blocs « statiques » : allégés (1 image, sortie courte, marqués « inchangé »), jamais sautés en silence

CONSOLIDATEUR DE SUJET (hors voie vision, quand le GPU est libre, cf. A2) :
     à une transition de sujet ou tous les N blocs, un modèle texte (gemma3:4b sans image,
     ou le modèle de questions inactif) réécrit topicSummary depuis les lignes publiées
     ─► alimente la continuité de la perception, la vue mémoire et, si A1 le retient, le journal
```

- **Mécanisme.**
  - La génération fait 56 % du coût de la vision (F8), et la longueur de sortie suit `topicSummary` (F9). Ce
    champ est réécrit toutes les 8 s alors que le modèle de questions ne le lit pas (F2).
  - Le consolider une fois par sujet, par un modèle texte et hors du créneau de 8 s, retire la principale cause
    de la traîne au-delà de 8 s.
  - L'OCR sur CPU rend sûrs les leviers qui réduisent les images (3 images, grille), et fournit un signal de
    changement de diapositive pour l'allègement des blocs statiques.
- **Gains attendus et pourquoi sur GB10.**
  - Estimations (revue perception) : −1 à −2,5 s par bloc en médiane, jusqu'à −7 s sur la traîne ; appels
    au-delà de 8 s (22 %) en forte baisse.
  - Effet système : moins de bande passante prise aux questions.
  - Sur GB10, les jetons générés sont la ressource chère ; l'OCR utilise les 20 cœurs ARM inoccupés.
- **Risques pour la pertinence.**
  - Continuité de sujet de la perception moins fraîche (`perception-context`).
  - Vue mémoire moins à jour.
  - Résumé consolidé confabulé, s'il entre dans A1.
  - OCR bruitée qui injecte de fausses chaînes, ou du texte à l'écran contenant des instructions, déjà traité
    comme non fiable.
  - Texte de diapositive changeant sous le seuil des miniatures (CNRS).
- **Papiers.**
  - Dispider, arXiv:2501.03218.
  - XGrammar, arXiv:2411.15100 : coût de la grammaire selon le moteur.
  - Gemma 3, arXiv:2503.19786 : 896², 256 jetons, texte dégradé sur les formats non carrés.
  - TimeChat-Online, arXiv:2504.17343 : redondance entre images consécutives.
  - StreamMind, arXiv:2503.06220 : invocation sur événement.
  - PaddleOCR 3.0, arXiv:2507.05595.
  - arXiv:2507.11730 : OCR embarqué contre VLM.
- **Validation incrémentale.**
  1. CPU : part de `topicSummary` dans les sorties des 6 vidéos (A0). Consommateurs de `topicSummary` déjà
     établis pour `2035a2f`.
  2. Rejeu G4 et annotation à l'aveugle.
  3. Prototype par proxy V3 (plafond par `maxLength`, contrat préservé) en E4 A/B/B/A.
  4. Qualité de l'OCR sur le Mac, contre le texte annoté de l'oracle (CNRS, Artemis, Bœuf), puis latence sur le
     GX10 hors essais chronométrés.
  5. Ticket pour la consolidation découplée, puis E4.

### A4 : répondeur rapide à deux phases, vérification et repli

```
question + contexte (A1)
  ─► PHASE 1 : modèle MoE (~3–4 B actifs), SANS `format`, outils proposés, schéma compact décrit dans la consigne
        • appel d'outil ─► exécuté par TVLens ─► retour en phase 1 (1 tour au plus)
        • sinon JSON compact {answer, kind, citations:[id…], limitesPropres}
  ─► si JSON invalide : PHASE 2 = rendu contraint (`format`), court
  ─► APPLICATION : reconstruit startMs/endMs depuis les identifiants, ajoute l'avertissement générique,
                   valide les preuves
  ─► si refus de validation, ou insufficient sur une question de rappel, et budget restant suffisant :
     repli sur le 27B
```

- **Mécanisme.**
  1. Bande passante : un A3B lit environ 8 fois moins d'octets par jeton que le 27B dense.
  2. Le conflit entre `format` et outils disparaît (G1), et un tour d'outil devient abordable : environ 2 à 3 s
     sur un MoE contre 5 à 10 s sur le 27B.
  3. Sortie plus courte. Estimations par tokenisation approchée : les citations font ~36 % des jetons,
     l'avertissement générique ~13 %.
  4. La validation des preuves de TVLens joue le rôle de vérificateur d'une cascade.
- **Gains attendus et pourquoi sur GB10.**
  - Banc llama.cpp DGX Spark : 61 jetons/s pour un 30B-A3B en Q8. Face aux ~30 jetons/s mesurés du 27B, déjà
    probablement accéléré par MTP, on attend une génération ~2–3 fois plus rapide, et non 5–7 fois.
  - Réponse estimée à 4–7 s à vide. Sensibilité moindre à la vision concurrente, puisque le MoE lit moins
    d'octets.
  - Le repli ajoute la traîne seulement sur les cas renvoyés.
- **Risques pour la pertinence.**
  - Le MoE peut être moins bon : le rapport Qwen3 place l'A3B sans raisonnement au niveau d'un 14B dense.
  - JSON invalide sans grammaire (mesuré par G1, bras B).
  - Traîne au-delà de 20 s en cas de repli.
  - Quatre modèles chargés contre `MAX_LOADED_MODELS=3`, d'où des évictions. Les 121 Gio permettent de relever
    cette limite ; c'est un changement de service à consigner.
- **Papiers.**
  - Qwen3 Technical Report, arXiv:2505.09388.
  - Saxena et al., arXiv:2506.20675 : la spéculation sur un MoE peut ralentir jusqu'à 1,5×.
  - EcoSpec, arXiv:2607.12696.
  - Let Me Speak Freely, arXiv:2408.02442.
  - CRANE, arXiv:2502.09061 : une grammaire augmentée préserve le raisonnement sous contrainte.
  - JSONSchemaBench, arXiv:2501.10868.
  - RouteLLM, arXiv:2406.18665.
  - Language Model Cascades, arXiv:2404.10136.
  - https://github.com/ggml-org/llama.cpp/blob/master/benches/dgx-spark/dgx-spark.md
- **Validation incrémentale.**
  1. E2 (en file) et notation à l'aveugle : non-infériorité du MoE par vidéo.
  2. G1 : taux d'appels d'outils et de JSON valide sans `format`, sur le 27B ; à répliquer sur le MoE retenu.
  3. CPU : simulation de règles de routage et de repli sur les sorties notées d'E2, descriptive et sans
     ajustement sur les mêmes questions.
  4. Prototype par proxy, présenté comme tel : changement de modèle, schéma compact et reconstruction des bornes
     avant retour à l'application. Puis E4 A/B/B/A.
  5. Ticket.

### A5 : voie audio résidente et filtrée

```
bloc audio ─► VAD Silero (whisper.cpp --vad) ─► segments parlés seulement
           ─► whisper-server RÉSIDENT (modèle chargé une fois ; GPU, ou CPU avec -ng)
                 option : invite = ~30 derniers mots confirmés ; langue fixée si connue
           ─► ligne de transcription publiée dès sa fin, indépendamment de la vision
              (fraîcheur des questions « maintenant », G2b)
```

- **Mécanisme.**
  - Le coût fixe d'un processus par bloc (chargement et initialisation) représente 60 à 75 % du temps par
    bloc (F12).
  - Le non-parlé produit des paroles inventées (F13).
  - `base` est faible en français : WER MLS 26,6 contre 16,2 pour small et 7,3 pour large-v2 (papier Whisper).
- **Gains attendus et pourquoi sur GB10.**
  - Supposé : ~0,4–0,8 s par bloc en résident, contre 1,3–2,7 s. Cela permet small ou turbo au coût actuel de
    `base`, et une attente bornée de moins d'1 s pour la fraîcheur.
  - Sur CPU, avec les 20 cœurs ARM, plus aucune bande passante GPU n'est prise à la vision ni aux questions.
- **Risques pour la pertinence.**
  - Le VAD coupe des répliques courtes ou de la parole sur musique.
  - turbo invente sans VAD.
  - L'invite peut provoquer des boucles (déjà observées avec small).
  - Contention CPU avec ffmpeg.
  - Parakeet : détection de langue incertaine sur 8 s.
- **Papiers.**
  - Whisper, arXiv:2212.04356.
  - Whisper-Streaming, arXiv:2307.14743.
  - WhisperX, arXiv:2303.00747.
  - How to Reduce Whisper Hallucination, arXiv:2609.32560 : mesurer à la fois l'invention et la parole perdue.
  - arXiv:2501.11378.
  - Canary-1B-v2 et Parakeet-TDT-0.6B-v3, arXiv:2509.14128 : effet du chevauchement des tranches.
  - arXiv:2605.17443 : propagation des erreurs ASR vers les réponses.
- **Validation incrémentale.**
  1. Sur le Mac, qualité seule, boucle arrêtée : WER et CER contre des références indépendantes (SRT de Tears,
     texte officiel Kennedy, extraits français vérifiés par le propriétaire ; jamais l'oracle v2, issu de turbo).
     Paroles inventées sur Spring avec et sans VAD.
  2. Banc de latence sur le GX10, hors essais chronométrés (E5).
  3. Rejeu des questions avec seul le champ transcription remplacé (harnais G2).
  4. E5 dans le flux, A/B/B/A sur Kennedy.
  5. Ticket.

### Interactions entre propositions

- A3 et A5 réduisent la contention : ils rendent A2 moins nécessaire et améliorent tous les délais de questions.
- A1 ajoute du préremplissage : il se combine bien avec A4 (génération plus rapide) et avec un préfixe stable
  (journal avant la question).
- A4 rend les outils abordables. A1 les rend moins nécessaires ; `inspect_clip` reste le seul accès aux détails
  visuels anciens.
- A3 peut nourrir A1 avec des résumés de sujet consolidés, avec le risque de confabulation.
- Ordre de maturité :
  - A3 (prototype par proxy possible dès G4) ;
  - A4 (après E2, G1 et notation) ;
  - A1 (après G2, ticket nécessaire) ;
  - A2 (simulation d'abord) ;
  - A5 (sur le Mac puis E5).

---

## 3. Ce qu'il ne faut PAS faire maintenant

1. **Modifier, arrêter ou compléter E1, ou la file E2/E3, pour y ajouter des bras** (`draft_num_predict`,
   schémas, résolutions). Les compléments sont des essais distincts, lancés après.
2. **Conclure d'E2 que « MTP ne sert à rien »** : le bras dense-mtp ne règle pas `draft_num_predict`, et le
   tag produit tourne probablement déjà en MTP (F5, F6, F17). Il faut d'abord C0 et G3.
3. **Déclarer un classement**, un gagnant ou un « gain produit » avant l'oracle v2 et la notation à l'aveugle,
   ou à partir d'un seul composant sans E4. Ne pas tirer de conclusion robuste d'un p95 sur 5 questions.
4. **Retirer `format` du produit**, ou ouvrir une boucle d'agent avec outils sur le 27B, pour « réparer » F4.
   Chaque tour coûte 5 à 10 s et le JSON sans grammaire peut être invalide. Le correctif se décide après G1
   et G2 (A1 ou A4).
5. **Injecter tout le préfixe sans plafond ni ordre stable** : CNRS et Artemis feraient 4 à 6 k jetons de
   transcription, et le texte visuel est 3 à 9 fois plus gros. Ne pas utiliser non plus de compression par
   suppression de jetons (LLMLingua-2, arXiv:2403.12968), qui détruit identifiants et nombres.
6. **Élagage de jetons visuels** (FastV, VisionZip, PruMerge) : il vise l'étape la moins chère (~0,07 s par
   image, F10), suppose un moteur modifié et reste incompatible avec Flash Attention pour FastV
   (arXiv:2502.11501).
7. **Nouveau moteur ou format dans la fenêtre.**
   - NVFP4 sur MLX : comparaison de pile dont la prise en charge est incertaine.
   - vLLM, Cosmos/VSS : Ollama a déjà été mesuré plus rapide sur les piles testées.
   - StreamingVLM sur GPU : 0,616× le temps réel.
   Ce sont des pistes après la fenêtre, pas des essais de 48 h.
8. **Passer à Whisper turbo sans VAD** (16/58 passages inventés sur Spring), ou juger la WER contre l'oracle v2
   issu de turbo (raisonnement circulaire).
9. **Télécharger ou mettre à jour un modèle pendant une campagne** (incident du 19/10). Ne pas télécharger les
   poids Parakeet sans autorisation explicite.
10. **Charges CPU lourdes sur le GX10 pendant un essai chronométré** (OCR, banc Whisper sur CPU). **Modèle local
    ou charge lourde sur le Mac pendant un contrôle** ou une boucle.
11. **Changer les réglages du service Ollama** (`MAX_LOADED_MODELS`, `NUM_PARALLEL`, cache KV) pendant E1 à E3.
    Tout changement ultérieur est consigné, comme une variation à part entière.
12. **Laisser une donnée d'attendu entrer dans une requête** : fiches, oracle et intervalles de preuve servent
    à choisir les cas et à mesurer, jamais à construire les contextes. **Relancer un essai instable** jusqu'à
    un passage réussi. **Committer.**

---

## 4. Limites de cette synthèse

- Aucune mesure nouvelle sur le GX10. E1 n'était pas clos ; ses données décideront l'ordre réel (A0).
- Vérifiés ici :
  - la sonde seule du 27B (F5) ;
  - les métadonnées du tag (F6) ;
  - les chemins de code F1 à F3 à `2035a2f` ;
  - la documentation de `draft_num_predict` ;
  - les résumés arXiv de StreamAhead, Don't Break the Cache, Saxena, EcoSpec, How to Reduce Whisper
    Hallucination, StreamForest, ReKV, CRANE et FastServe.

  Les autres chiffres sont repris des revues tels quels.
- L'hypothèse « MTP déjà actif » est une inférence de bande passante. D'autres explications restent possibles,
  notamment des poids actifs par jeton inférieurs à la taille du tag : C0 et G3 tranchent.
- Les chiffres des articles portent sur d'autres modèles, d'autres GPU et d'autres bancs, souvent en anglais.
- Les gains chiffrés des propositions sont des estimations.
- F15 vient des fiches provisoires. Les rejeux à contexte figé ne reproduisent ni la rétroaction de la
  perception ni la validation des preuves : E4 reste nécessaire.
- L'état réel du GX10 (avancement d'E1, file E2/E3, téléchargements) n'a pas été vérifié par moi.

## Fichiers

- Synthèse : `/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/labo/recherche/SYNTHESE.md`
- Revues sources :
  - `/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/labo/recherche/questions/latence-reponse-llm.md`
  - `/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/labo/recherche/perception/`
  - `/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/labo/recherche/memoire-asr/`
- File existante, non modifiée :
  - `/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/labo/file-e2-e3.sh`
  - `/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/labo/construire_plans.py`
- Programme préenregistré : `/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/labo/PROGRAMME.md`
