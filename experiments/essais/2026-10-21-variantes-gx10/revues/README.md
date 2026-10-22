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
