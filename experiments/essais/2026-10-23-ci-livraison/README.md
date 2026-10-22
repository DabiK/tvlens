# CI, contenu du paquet et identité — 23 octobre 2026

## Question et configuration

Vérifier localement le premier incrément de livraison : CI complète, paquet Mac limité aux fichiers utiles, identité embarquée accessible aux deux hôtes.

Mac Apple Silicon du développeur, Node 24.12.0, npm 11.6.2, Python 3.14.2, Electron 44.4.5, packager 20.3.0, ASAR 4.3.1, sharp 0.35.5. Aucun modèle Ollama chargé au démarrage des contrôles. Fournisseurs simulés, aucune TV ni aucun VPS contacté.

Base initiale : `960a7744c3088b9515a416c9c6b92297932c89bb`. Pendant le travail, une autre activité a ajouté le commit documentaire `6b140b7` (rapport GX10). Les modifications préexistantes de README et les fichiers de recherche ne font pas partie de cet incrément. À la clôture de cette validation locale, aucun commit ou push n’avait encore été réalisé par cette tâche.

## Contrôles et résultats

- Référence avant intégration : contrôle complet vert, 3 034 tests JS, 71 Python (`preuves/baseline.json`).
- Tests ciblés finaux : 65 réussis, incluant métadonnées/CLI, refus CI sur fixture commitée propre, contenu ASAR, refus des fichiers natifs inattendus, route authentifiée et contrat IPC Mac (`preuves/focused-final.txt`).
- Python télécommande : 42 réussis ; avertissement préexistant `ResourceWarning` de fermeture de fichier dans `test_panel.py` conservé (`preuves/python-remote.txt`).
- Contrôles statiques complets : verts, sans modification du harnais ou de ses seuils (`preuves/static-final.json`).
- Index documentaire : 12 réussis (`preuves/docs.txt`).
- Contrôle complet : vert, 3 054 tests JS et 71 Python (`preuves/final-quality.json`). Les correctifs effectués pendant cette exécution ont aussi été revérifiés par les tests ciblés et le contrôle statique final.
- Comparaison des fichiers et des seuils à la base initiale : aucune infraction (`preuves/base-final.json`). Refus d’une construction CI sale observé (`preuves/dirty-refusal.txt`).
- Installation isolée `npm ci` depuis les deux manifestes actuels : réussie, 232 paquets installés (`preuves/npm-ci.txt`).
- Analyse syntaxique YAML : réussie (`preuves/workflow-parse.txt`), distincte d’un run GitHub.
- Smoke Electron final : deux résultats PASS (parcours complet et refus pour manque d’espace), après correction expliquée ci-dessous (`preuves/electron-smoke-final.txt`).
- Smoke identité : PASS, propriété `build` reçue par IPC et « Construction inconnue » visible dans l’interface de développement sans fichier généré (`preuves/electron-identity.txt`).
- Correctif du simulateur : 88 tests associés puis 70 tests de ses autres consommateurs réussis ; le contrôle complet précédent précède ce correctif, ces reprises ciblées et le smoke final le suivent.
- Paquet final : 3 607 fichiers dont 160 sources vérifiées ; ASAR de 16 342 700 octets, identité `6b140b7b6b48758e4a33bb9df118295f667a5d43`, `dirty: true`. Electron 44.4.5 et sharp 0.35.5 chargés depuis le paquet. Inventaire et empreinte dans `preuves/package-report.json`.
- Intégrité ZIP : `unzip -t -qq` réussi, code 0, aucune erreur. Empreinte de l’artefact conservée dans `preuves/SHA256SUMS`.
- Artefact local : `dist/ci-validation/TVLens-mac-arm64.zip`, accompagné de `SHA256SUMS` et `package-report.json`. Le précédent paquet dans `dist/TVLens-darwin-arm64` n’est pas remplacé.

## Incidents conservés

Les sorties `*-red.txt` sont les échecs attendus du développement tests d’abord. Le premier test d’assets visait à tort `app/ui/audio-worklet.js` : le fichier est `app/audio-worklet.js`, résolu depuis le document. La fixture ASAR initiale contenait aussi des répertoires vides que le filtre réel ne copie pas ; elle a été alignée sur un arbre source contenant des fichiers utiles.

La relecture a identifié les règles par fichier inactives sur un checkout CI propre : `ci-changes.mjs` compare maintenant à la base Git, avec une fixture commitée qui démontre le refus. Les erreurs des nouveaux outils portent des codes stables. Les tests du lecteur d’identité ont été complétés et revérifiés.

Une vérification du premier paquet a refusé une divergence de `app/main.cjs` : les trois ajouts de raccordement de l’identité avaient disparu du fichier de travail. Leur origine n’est pas établie. Ils ont été réappliqués, les contrats IPC revérifiés, et un smoke dédié vérifie désormais la propriété `build` via le vrai pont Electron et son affichage. Le commit documentaire concurrent impose aussi une reconstruction de l’identité. Le contrôle d’égalité des sources a ainsi empêché de présenter l’ancien paquet comme le résultat final.

Le premier smoke Electron échoue sur `signals.seq >= 1` (délai de 65 s), sortie conservée dans `preuves/electron-smoke.txt`. Le scénario demande un signal sur les images puis une vérification chiffrée. La perception simulée produit à la fois une transcription (« Un cercle se déplace… ») et du visuel (« 2 images reçues. »), mais le simulateur de surveillance lisait `transcript || visual` : dès que la parole existait, aucun signal images ni chiffre ne pouvait être détecté. Le test `simulated-surveillance.test.cjs` reproduit ce refus sans Electron (`preuves/simulation-red.txt`). Le correctif parcourt les phrases des deux champs séparément et déduplique une citation identique ; les assertions et les délais du smoke restent inchangés. Les tests du simulateur et de ses consommateurs sont revérifiés avant le second smoke.

## Lecture et limites

Ces preuves décrivent la validation locale sur macOS, avant publication. À cette étape, le YAML est analysable et les jobs sont définis ; aucun run GitHub ni runner Linux n’avait encore été exécuté depuis cette tâche. La protection de branche reste à configurer après publication. Les tests UI utilisent les sources et une capture synthétique ; la sonde du paquet charge Electron et sharp en mode Node. Ni ces contrôles ni le ZIP n’établissent les permissions macOS, la capture réelle ou l’installation sur une machine vierge.

Le paquet reste une construction locale modifiée, sans signature de distribution Apple ni notarisation. FFmpeg, Whisper, son modèle et Codex restent externes. Les métadonnées n’exposent aucun identifiant privé et ne supposent pas Git installé à l’exécution.

## Alertes de dépendances observées

`npm audit` signale quatre paquets : SDK MCP (haut), Electron, Hono et ip-address (modéré). Les versions concernées existaient dans le lockfile avant cet incrément ; l’ajout d’ASAR comme dépendance directe de développement ne les met pas à jour. Le JSON brut est conservé dans `preuves/npm-audit.json`. Ces alertes n’ont pas été masquées, ni corrigées par une mise à jour automatique non qualifiée ; elles restent un chantier de maintenance avant diffusion publique. La CI ajoutée vérifie les règles et les tests, elle n’introduit pas de gate `npm audit`.

Les deux avis hauts du SDK MCP concernent un serveur HTTP : [épuisement mémoire à la validation](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-46jr-4wx8-v453) et [partage des tâches expérimentales](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-22jm-h49p-29qw). Leur précondition n’est pas présente dans l’intégration inspectée : `mcp/server.cjs` utilise `StdioServerTransport`, sans `taskStore`, et les racines Mac n’importent pas ce SDK. Cette lecture limite l’exposition à ces deux scénarios précis ; elle ne qualifie pas toutes les alertes et ne vaut pas audit de sécurité complet. Electron reste volontairement à la version des preuves de capture existantes ; sa mise à jour nécessite sa propre recette.
