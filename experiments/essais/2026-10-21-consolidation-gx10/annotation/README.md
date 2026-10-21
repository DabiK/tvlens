# Annotation aveugle des deux confirmations GX10

Générer à nouveau les quatre fichiers depuis la racine du dépôt :

```sh
python3 experiments/essais/2026-10-21-consolidation-gx10/annotation_aveugle.py
```

Annoter uniquement `questions-pause.json` et `observations-images.json`. Chaque question ou bloc
présente quatre sorties dans un ordre mélangé et reproductible. Les champs de notation sont vides.
Pour les questions, `note0a3` attend une note humaine de 0 à 3 ; renseigner aussi l'invention, la
preuve et la justification. Pour les observations, relever OCR, action brève, faits utiles et invention.
Vérifier les preuves et les attendus contre les médias et fiches humaines validées, indépendamment
des réponses du modèle.

Les fichiers `apres-notation/` relient chaque identifiant aveugle à sa source et son SHA-256, à son
bras, son passage et son délai. Les ouvrir seulement après la notation. Les délais des questions sont
les durées soumission–réponse HTTP ; ceux des observations sont les durées de requête client du
fichier `mesures.json`. Les deux paquets restent `readyForScoring=false` tant que les références
humaines ne sont pas validées et que les notes ne sont pas remplies. Aucun média, image, contenu
base64 ni oracle déduit des sorties du modèle n'est exporté.
