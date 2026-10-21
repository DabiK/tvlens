# Latence de la réponse aux questions (LLM local) — revue et essais proposés

Rédigé le 21 octobre 2026 par le sous-agent researcher (Claude), lecture seule sur le dépôt, aucune charge GPU,
aucune connexion au GX10. Rien de ce qui suit n'a été mesuré sur GX10, sauf les dix délais déjà archivés cités en §1.

## Question

Quels leviers réduisent le délai complet d'une réponse du rôle `questions` (aujourd'hui `qwen3.8:27b` Q4_K_M,
dense, raisonnement coupé, `format` JSON + outils, `/api/chat` non streamé) sur un GB10 limité par la bande passante,
sans perte de pertinence, d'abstentions justifiées ni de validité des citations ?

## Ce que montrent le code et les données existantes (faits)

- `adapters/ollama/question-agent.cjs` envoie **un seul message utilisateur** ; `adapters/companion-prompt.cjs`
  (`buildLocalPrompt`) l'ordonne : rôle fixe → lignes MODE LOCAL → `DEMANDE` (question) → `REPÈRES` → bloc de
  données avec un **marqueur aléatoire tiré à chaque tour** → contexte JSON (6 derniers passages, 120 pour un
  récapitulatif). Tout ce qui suit la question change à chaque tour : seul le rôle (et les outils rendus par le
  gabarit) peut être réutilisé d'une question à l'autre.
- `adapters/ollama/http-client.cjs` : `stream: false`, `temperature: 0`, pas de `num_predict`, `format` = schéma
  complet (`answer, kind, citations[{id,startMs,endMs}], sources, limits`).
- Dix réponses archivées (Kennedy et CNRS, capture du 20/10,
  `experiments/gx10/research/2026-10-20-propositions/captures/base-*.json`) : un seul appel fournisseur, aucun
  outil, 12,8 à 27,9 s. Régression **grossière** délai ~ jetons de sortie estimés (chiffres comptés pour un jeton,
  autres caractères / 3,6) : pente ≈ 65 ms/jeton, ordonnée ≈ 6,5 s, r = 0,84 sur n = 10. Les citations pèseraient
  ≈ 36 % des jetons générés, l'avertissement générique de `limits` ≈ 13 %. Toutes les citations couvrent exactement
  un bloc de 8 s. Estimation à remplacer par `eval_count` d'E1 ; elle suggère que la génération domine.
- Le journal du proxy E1 conserve la requête et la réponse complètes du rôle questions ; `prompt_eval_cached_count`
  n'est pas dans `COUNTERS` mais reste lisible dans `response`.

## Faits documentaires utiles (non mesurés sur GX10)

- llama.cpp sur GB10 (`benches/dgx-spark`) : Qwen2.5-Coder 7B Q8_0 génère 29,4 jetons/s (≈ 238 Go/s effectifs),
  Qwen3-Coder 30B-A3B Q8_0 61 jetons/s et 2 987 jetons/s en préremplissage, gpt-oss 20B 83 et 4 506 jetons/s.
  Extrapolation (hypothèse) : 27B dense Q4_K_M ≈ 12–14 jetons/s et ≈ 600–650 jetons/s en préremplissage.
- `qwen3.8:27b` (source secondaire) : dense hybride, 48 couches Gated DeltaNet + 16 couches d'attention, tête MTP
  livrée. Ollama actuel délègue à `llama-server` ; l'option `draft_num_predict` active les tenseurs MTP embarqués
  (« embedded MTP tensors require setting this parameter »), réglable par requête dans `options`.
- Pour un modèle hybride, llama.cpp ne peut pas revenir à un préfixe arbitraire de l'état récurrent : la réutilisation
  passe par des points de reprise créés en fin de prompt ou aux frontières de messages utilisateur (chemin chat).
  Une requête `/completion` plate retombe sur un recalcul complet en cas d'échec de correspondance.
- Les formats NVFP4 d'Ollama passent par le moteur MLX (sauvegardes safetensors), optionnel sous Linux avec CUDA 13.

## Propositions, par priorité

| Id | Priorité | Levier | Gain attendu (prédiction) | Risque principal | GPU |
| --- | --- | --- | --- | --- | --- |
| Q0 | 1 | Budget par jeton depuis E1 | Décide les suivantes | Aucun | 0 |
| Q1 | 1 | MTP sur le 27B actuel | génération ×1,4–2,0, total −25 à −35 % | Activation non vérifiée, régression connue | ~30 min |
| Q2 | 1 | MoE 3–4 B actifs (E2) | total ÷4 à ÷6 à vide | Pertinence, abstention, citations | ~45 min |
| Q3 | 2 | Sortie compacte et coût de la grammaire | −35 à −50 % de jetons générés | Citation par identifiant mal choisie | ~30 min |
| Q4 | 3 | Préremplissage : cache, ordre, contexte compact | −2 à −6 s sur le 27B | Position de la question, concurrence vision | ~20 min |
| Q5 | 4 | NVFP4 du même modèle | génération ±10 % | Moteur MLX, outils, `format` | ~30 min |
| Q6 | 4 | Routage ou cascade MoE → 27B | moyenne en baisse, queue en hausse | Les cas renvoyés dépassent 20 s | 0 en plus |
| Q7 | 5 | Streaming du champ `answer` | premier texte lisible ≈ −40 à −60 % | Texte affiché puis refusé | ~10 min |

Le détail (mécanisme, sources, protocole, arrêt) est dans la sortie structurée du sous-agent ; chaque essai suit
`research-autoresearch` : plan figé par SHA-256, ordre contrebalancé, tous les délais individuels publiés, toutes
les sorties conservées, notation à l'aveugle avant toute conclusion de pertinence.

## Limites

Aucune mesure GX10 nouvelle. Débits GB10 tirés d'un banc llama.cpp public (autres modèles) et extrapolés.
Architecture de `qwen3.8:27b`, comportement MTP par défaut des tags Ollama et régression #18541 : sources
secondaires ou non reproduites. La régression sur dix réponses mélange préremplissage, génération et contention
avec la vision. Le rejeu hors ligne ne sert pas les résultats d'outils : il ne note que le premier tour.
