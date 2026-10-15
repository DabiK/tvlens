---
id: T181
titre: Remove the ambient capture gate
statut: a-faire
bloque_par: T166
adr: non
installe: non
harnais: non
supprime_tests: oui
niveau: sensible
---

## Ce que le ticket livre

Après décision écrite du propriétaire et retrait du superviseur, la capture TV ne consulte plus de
gate ambient et ne produit plus ses métadonnées d’occultation. Elle conserve images selon la géométrie
vidéo, son, transport, limites et refus explicites, avec leurs preuves génériques.

## Sources

- `docs/audit-points-chauds.md`, section D « Coupes », ambient panneau fermé.
  Décision du propriétaire, le 15/10 : retirer le gate après superviseur/relais/routes, avant la page.
- Repères vérifiés à `e92c6a6`, avant les suppressions T165/T166 :
  - `tv/capture.py:7` importe le gate depuis ambient ; `tv/capture.py:37` définit `safe_crop`,
    `tv/capture.py:52` `frame_decision` et `tv/capture.py:73` `settle_block` ;
  - `tv/capture.py:115` prépare le chemin du gate ; `tv/capture.py:184` et `tv/capture.py:186`
    le lisent autour des clichés ; le rapport et les blocs portent les métadonnées d’occultation ;
  - `tv/ambient.py:120` définit les chemins et `tv/ambient.py:169` la lecture du gate ; T166
    conserve seulement les primitives nécessaires à la capture et à ses tests, à supprimer ici ;
  - `tests/test_tv_capture_gate.py:21` importe ambient ; les cas génériques commencent à
    `tests/test_tv_capture_gate.py:235` (sans fichier de gate), `:256` (stockage plein),
    `:266` (lecture seule), `:274` (arrêt au démarrage), `:294` (idle), `:306` (géométrie)
    et `:341` (durée). Les aides `Server` et `CaptureRun` sont à `:156` et `:182` ;
  - `tests/tv_fakes/luna-send:57` simule aussi les changements de gate pendant un cliché ;
    ses autres réponses et le faux `arecord` servent les tests génériques ;
  - `tv/app/sessions-view.js:337` affiche encore les compteurs retirés et
    `tests/tv-panel.test.cjs:517` en vérifie un libellé : T182 possède leur nettoyage.
- Appliquer et citer l’ADR de retrait livré par T165, qui prévoit cette étape et le maintien de
  `/v1/surveillance/overlay`. `adr: non` : aucun nouvel ADR ni nouvelle décision d’architecture ici.

## Périmètre

- Retirer de `tv/capture.py` import et lecture du gate, états/epochs, recadrage d’occultation et
  métadonnées dédiées : `gate`, `gatePath`, `gateStale`, `framesCropped`, `framesWithheld`,
  `withheldReasons`, `overlay` de bloc/frame et causes uniquement liées aux cartes.
- Supprimer le reliquat `tv/ambient.py` conservé par T166. Conserver les coordonnées `frames[].crop`
  de géométrie vidéo, `framesMoved`, audio, timestamps, file d’envoi et transport, verrou, bornes,
  arrêt et changement de session. Une modification du rectangle pendant un cliché coûte seulement
  cette image ; un changement de contexte vidéo garde le refus de bloc actuel.
- `supprime_tests: oui`, après décision : avant de supprimer `tests/test_tv_capture_gate.py`,
  transférer ses aides et preuves génériques dans `tests/test_tv_capture.py` (à créer). Conserver
  leurs titres, attentes et assertions sur les comportements maintenus ; retirer seulement les
  assertions sur les champs du gate abandonnés. Inventorier chaque cas supprimé ou transféré.
- Adapter les seuls crochets de gate de `tests/tv_fakes/luna-send`, sans retirer ses capacités
  génériques ni changer les assertions de transport, saturation, arrêt ou géométrie.
- Laisser présentations TV et documents à T182 ; les vues tolèrent déjà l’absence des champs.
  Ne pas modifier le contrat serveur d’ingestion ou celui de `/v1/surveillance/overlay`.
- Les suppressions de cas sont exclusivement Python : aucun cas JavaScript `test(` n’est supprimé,
  donc n = 0. Le plancher `cas_de_test` ne bouge pas et le harnais reste fermé ; aucune modification
  de `scripts/quality/baseline.json`, aucun test de remplissage, aucune installation ou opération TV/VPS.

## Critères d'acceptation

1. `tv/ambient.py` et `tests/test_tv_capture_gate.py` sont absents. Une recherche `rg -n` de
   `AmbientPaths|read_gate|frame_decision|safe_crop|gatePath|gateStale|framesCropped|framesWithheld|withheldReasons`
   dans `tv/capture.py`, `tests/test_tv_capture.py` et `tests/tv_fakes/` ne trouve aucun lecteur ou
   producteur actif du gate. Classer les éventuels tests d’absence ; les présentations attendent T182.
2. Le vrai programme de capture, avec `tests/tv_fakes/` et un récepteur local, transmet images,
   son, timestamps et transport comme avant sans lire de fichier de gate. Un ancien fichier de gate
   fermé placé dans l’arbre temporaire n’a aucun effet sur les images ou le rapport.
3. Les cas transférés gardent stockage plein, lecture seule, arrêt pendant le démarrage, idle,
   durée bornée et rectangle changeant pendant un cliché avec `framesMoved`. Les causes des pertes
   et limites restent explicites ; le changement de contexte vidéo refuse toujours le bloc.
4. Le journal relie chaque cas générique à son nouvel emplacement et chaque retrait à la capacité
   abandonnée. Aucun cas JavaScript n’est retiré : n = 0. Le journal consigne les mesures initiales
   M et P et le comptage final, égal à M. Le plancher P ne bouge pas ;
   `git diff --exit-code -- scripts/quality/baseline.json` rend 0, sortie consignée au journal.
5. Les tests de capture, transport et contrôle sont lancés en séquentiel, puis
   `node scripts/check.mjs` est vert. Pas de scénario au rythme réel, smoke natif, TV ou fournisseur.

## Test d'acceptation attendu

`tests/test_tv_capture.py` conduit le vrai `capture.py` dans un processus isolé avec faux Luna/arecord
et récepteur local. Ses preuves génériques proviennent du fichier mixte supprimé ; un cas de gate
résiduel prouve l’absence de consultation sans comparer le texte du programme.

## Hypothèses bloquantes

Décision du propriétaire, le 15/10 (« Oui », en réponse à la question posée) : oui. Supprimer définitivement l’affichage ambient panneau fermé, son superviseur, son relais et ses outils dédiés, tout en conservant la surveillance et les cartes du panneau ouvert.

La décision doit être inscrite dans cette section, même si T165 et T166 ont été tranchés. Les
suppressions sont Python : n = 0 et le plancher JavaScript ne bouge pas. T182 achève page et documents ;
les tests simulés ne prouvent pas les propriétés matérielles d’une TV installée.

## Journal
