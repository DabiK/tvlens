---
id: T244
titre: Place independent saved moments in the library context
statut: a-faire
bloque_par: T240
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Les moments gardés relèvent de la Bibliothèque et restent des copies autonomes après déchargement
ou suppression de leur session. Leur transcription reçoit les dépendances de la session visée
par injection, sans changer de transcripteur au gré d'une mutation de l'hôte.

## Sources

- `docs/domaine.md`, sections 3 Bibliothèque, 6, 7, 9 et 10 ; ADR 0029/0030.
  T235 crée la sous-zone Bibliothèque ; T240 raccorde l'accès à l'agent et est le précédent lot qui modifie
  les compositions Mac et serveur, après T227 et la fin Mac T239.
- Code vérifié à `1d8aa48` : `core/saved-moments.cjs:4` sélectionne les 30 dernières secondes
  disponibles ; `:8` prend un bail et `:9` transcrit si besoin puis sauvegarde les métadonnées.
  Le constructeur reçoit déjà un transcripteur, mais utilise aussi Date.now et AbortSignal.timeout (`:3`, `:9`).
- `app/main.cjs:109` compose le magasin hors des sessions, `:113` lui donne la session chargée,
  puis `:316` remplace `saved.transcriber` à chaque adoption. Le repère du plan vers 307 est décalé.
- `adapters/saved-moment-store.cjs:7` copie physiquement chaque WebM et prépare sa preview ;
  `:8` écrit saved.json puis renomme le dossier temporaire ; `:26` sert la copie depuis son propre dossier.
  L'indépendance média existe déjà, elle n'est pas une fonctionnalité absente à inventer.
- `tests/viewing-features.test.cjs:21` prouve déjà la survie après suppression,
  `tests/session-delete.test.cjs:57` et `:98` conservent les moments gardés,
  `tests/architecture-f10.test.cjs:164` prouve les lectures Range de la copie sans sa session.
- `tests/architecture.test.cjs:39` gèle deux accès au temps de ce module ; un déplacement
  ne transporte pas ces exceptions. Appelants lus : main, preload, tests de suppression,
  viewing-features et architecture-f10 ; ports de conservation à `core/ports.cjs:40`.

## Périmètre

- Placer le modèle/service de domaine propre dans `core/library/`, exporté par son index T235.
  Garder l'adaptateur de disque dans `adapters/` : le plan ne permet aucun accès disque ou
  import de LocalSessionStore depuis `core/library/`. Pas de rangement général des adaptateurs.
- Donner au cas d'usage sous `runtime/library/` la vue publique et les ports de la session
  nommée, son transcripteur et les dépendances temporelles. Capturer ces dépendances à l'entrée
  de keep ; ne plus affecter `saved.transcriber` lors de l'adoption. Le modèle ne lit pas le
  domaine Mémoire : la coordination traduit les faits nécessaires depuis sa vue publique.
- Conserver sélection des passages, ancrage, bornes, copies de texte et observations, ainsi que
  la transcription manquante et ses limites. Une copie détachée n'enrichit pas la mémoire source
  par effet de référence. Les médias sont copiés sous bail, rendu en succès comme en erreur.
- Si la transcription reste dans le service de domaine, temps et signal de plafond sont injectés ;
  sinon les fournir depuis le cas d'usage applicatif. Garder la borne actuelle de 15 s et la
  gestion existante des erreurs, sans accès global au temps dans le nouveau fichier de domaine.
- Conserver octets et noms historiques : `saved.json`, `moments`, `moment-N`, identifiants de
  sauvegarde, champ `sessionId`, valeur de rétention et URL `tvlens-saved://`. Le magasin copie
  effectivement ses fichiers ; aucune référence au dossier source ne remplace une copie durable.
  Les anciens saved.json restent lisibles sans réécriture ni migration sur place.
- Corriger tous les importeurs réels du module déplacé et retirer l'ancienne adresse après
  migration. Compléter permissions et tests de garde T205 : aucune permission générale entre
  domaines, aucun stock de temps ou gel transféré. Élaguer les suppressions devenues inutiles.
- Ajouter un ADR court sur la propriété, les copies et l'injection, lié dans `docs/architecture.md`,
  section Décisions, et tout index nécessaire. Ne pas ajouter de fonctionnalité moments gardés
  sur la TV, de format versionné nouveau ou de refonte de la politique de suppression.

## Critères d'acceptation

1. Garder un moment, décharger puis supprimer sa session permet encore de lister ses observations,
   sa preview et de rejouer exactement les octets copiés, y compris par Range. Une nouvelle
   instance du magasin les retrouve sans mémoire de la session source ; supprimer la copie reste explicite.
2. Avec transcription de A retenue et adoption de B entre-temps, keep utilise exclusivement
   transcripteur et médias de A, sans altérer A ni B par partage d'observation. Le retour ne
   produit aucune copie des médias de B sous les identifiants de A.
3. Une transcription ou copie refusée rend le bail et retire le dossier temporaire selon le
   contrat actuel. Aucun moment partiellement enregistré n'est annoncé comme gardé ; la copie
   déjà conservée et les dossiers voisins restent lisibles.
4. Une sauvegarde existante, écrite avant le déplacement, se liste et se lit avec ses noms et
   valeurs historiques. Le test ne la fabrique pas avec le seul nouveau sérialiseur pour prouver sa compatibilité.
5. Le module passe par `core/library/index.cjs`, sans import étranger ni horloge globale ;
   l'ancienne mutation de transcripteur a disparu. La garde retire les deux exceptions temporelles
   inutiles du chemin source et n'en ajoute aucune au chemin cible.
6. À l'implémentation, jouer en séquentiel viewing-features, session-delete, architecture-f10,
   mac-ipc-contract, les nouveaux tests de moments gardés et la garde, puis `node scripts/check.mjs`.
   Aucun scénario existant, compteur ou plancher n'est supprimé ou affaibli.

## Test d'acceptation attendu

Créer `tests/saved-moments.test.cjs` pour les dépendances injectées et le changement A/B pendant
transcription. Étendre les preuves existantes avec un nouveau magasin après suppression de la
session et une lecture des vrais fichiers/Range sur disque temporaire. Garder un témoin ancien
de saved.json indépendant du nouveau code ; le banc Mac vérifie le vrai raccord de keepMoment.

## Hypothèses bloquantes

Aucune décision n'est attendue.

La survie à la suppression est déjà établie par le code et les tests lus, pas par une exécution
pendant le découpage. Ce lot préserve et renforce cette garantie en changeant de propriétaire.
Le modèle va dans core/library ; son adaptateur reste dans adapters conformément aux frontières.
T240 implique T227 pour main et la garde, ainsi que le contexte créé par T235 via T236.

## Journal
