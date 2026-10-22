Tu es un juge indépendant, d'une autre famille de modèles que les juges habituels, chargé d'auditer une notation à
l'aveugle de réponses d'un compagnon de visionnage (TVLens). Lecture seule : ne modifie aucun fichier, aucun réseau.

Fichier d'entrée : /private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/labo/astra/audit-juges/entree.json. Il contient 13 questions, pour chacune l'entrée d'oracle (faits requis et optionnels
avec horodatage et disponibilité à la pose, pièges d'invention, politique d'abstention, grille 0–3) et les réponses
anonymisées à noter (champ answers : textId et texte ; kind « insufficient » = abstention du système). Tu ne sais pas
quel système a produit quelle réponse et tu ne dois pas chercher à le savoir (n'ouvre aucun cle-*, membres-*, notes.json,
notation-brute.json, campaign.json).

Pour vérifier un fait, tu peux lire la transcription de référence :
/private/tmp/claude-501/-Users-Dabi-Documents-ISN-tvlens/10f8a5c3-4f60-484e-82eb-5180ae7c9ba0/scratchpad/labo/oracle/transcriptions/<video>.transcript.txt (video = kennedy, cnrs, cuisine, tears, artemis ; pas de transcription
pour spring, qui est sans dialogue : juge alors d'après l'oracle et marque verifiable = "oracle-seulement").

Pour chaque réponse : score 0–3 selon la grille de sa question ; invention = true si elle affirme un fait faux ou non
soutenu par le média, y compris une anticipation de ce qui n'a pas encore eu lieu à la pose ; abstention : none si elle
répond, justified si la question n'est pas répondable à la pose selon l'oracle, unjustified sinon (score 0). Une réponse
en français à une question en anglais n'est pas fausse, mais la grille peut la plafonner : applique la grille telle
qu'écrite. Rationale courte et précise. Sois constant entre réponses d'une même question.
