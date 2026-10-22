# Revues indépendantes par Codex Astra

Codex Astra (`codex exec -m gpt-6-astra`, raisonnement élevé, bac à sable en lecture seule) relit les expériences
GX10 avec un regard neuf. Il ne modifie rien ; Claude vérifie ses affirmations chiffrées avant d'agir et trace ce qui
est appliqué ou écarté dans les dossiers d'essais.

- `astra-2026-10-22-*` : première revue (vérification des chiffres de la nuit et d'E7, méthode, plan), demandée le 22/10.
  Elle a fait harmoniser l'âge des faits, corriger le compte de l'oracle v3 et réordonner la file GX10.
- Depuis le 22/10 vers 12 h (heure de Paris), une revue de la feuille de route a lieu toutes les deux heures, à la demande
  du propriétaire. Le script [`revue_astra.sh`](revue_astra.sh) photographie la file GX10, le plan courant et la revue
  précédente, puis demande à Astra : dérive ou insistance sur un goulot secondaire, arrêter / continuer / commencer,
  file GX10, suivi de la revue précédente, au plus une décision humaine. Chaque revue est archivée ici avec sa
  consigne (`periodique-<horodatage>-*`).
- La même tâche rappelle aussi la règle de fin de phase demandée le 22/10 : toute phase close est committée (bruts
  compressés, fichiers de la session seulement) et poussée sur main.

## Audit des juges par Codex Astra (22/10, 12:50 UTC)

Astra, d'une autre famille de modèles que les juges Claude, a renoté à l'aveugle 13 questions fixes (2 par vidéo,
plus `cuisine-07`) du paquet N5–N6 : 51 textes distincts, 52 réponses de GPS, N2, N5 et N6. Mêmes oracle, grille et
interdits ; il pouvait lire les transcriptions de référence (Spring, sans dialogue : oracle seulement, 8 textes).
Fichiers : [`audit-juges-2026-10-22/`](audit-juges-2026-10-22/).

| Accord Astra / juges Claude (51 textes) | Valeur |
| --- | ---: |
| Même statut pertinent ou non | 46 (90 %) |
| Même note 0–3 | 47 |
| Écart de note au plus 1 point | 51 |
| Même étiquette « invention » | 45 |
| Réponses pertinentes : Claude / Astra | 38 / 37 |

Les 5 désaccords de statut portent tous sur l'étiquette « invention » pour un détail limite (une « biscotte »
non prouvée, des cicatrices hors oracle, un cadrage approximatif des 50 ans), jamais sur la note. Les totaux par
configuration diffèrent d'au plus une réponse (GPS 10/10, N2 10/9, N5 10/11, N6 9/8). L'accord de deux familles de
modèles ne remplace pas une vérité humaine, mais il écarte un biais propre aux juges Claude.
