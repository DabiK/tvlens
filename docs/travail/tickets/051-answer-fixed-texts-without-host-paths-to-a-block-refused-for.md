---
id: T051
titre: Answer fixed texts without host paths to a block refused for its content
statut: a-faire
bloque_par: T201
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: sensible
---

## Ce que le ticket livre

Un refus de contenu média répond un texte public fixe en français, sans sortie d'outil, chemin
temporaire ou erreur brute de bibliothèque. Le détail original reste dans la cause côté serveur.
Les trois cas concernés gardent le statut 400 et les codes stables livrés par T201.

## Sources

- `docs/audit-architecture.md`, rapport A, B4 et D4 ; rapport B, B2.
  Décision du propriétaire, le 16/10 : retirer les dépendances inutiles T028, T038 et T145 ;
  attendre T201, puis T188/T124/T199/T178 transitivement. T038 n'est pas nécessaire : les vrais
  bancs HTTP et le transport Python existants suffisent à prouver les refus de contenu.
- Code vérifié à `8340014` : `adapters/remote-media.cjs:62` concatène stderr au message
  « Préparation média échouée : … » ; `adapters/remote-media.cjs:76` laisse remonter l'erreur
  d'encodage d'image ; `adapters/remote-media.cjs:34` déréférence chaque frame sans garde d'objet.
  Pour un bloc autrement valide, une frame null atteint donc un TypeError avant le refus voulu.
  C'est une déduction du contrôle de flux, distincte du TypeError Mac infirmé dans la synthèse.
- `adapters/remote-media.cjs:43` et `adapters/remote-media.cjs:45` classent déjà les pannes
  d'outil/espace temporaire en 503 media-unavailable. `adapters/remote-media.cjs:95` attend les
  travaux commencés et conserve la première erreur ; `adapters/remote-media.cjs:114` nettoie
  ensuite. Le ticket conserve ces garanties et la priorité de l'annulation.
- L'appel passe désormais par `server/ingest-routes.cjs:7` ; le repli HTTP est à
  `server/http.cjs:89`, plus aux anciennes lignes 275 à 290.
- Tests qui épinglent les deux anciens textes : `tests/architecture-f06.test.cjs:360` et
  `tests/media-asr-options.test.cjs:68`. `tests/architecture-f06.test.cjs:479` protège le
  nettoyage et l'erreur primaire. Relire les adaptations de T188/T201 avant de renforcer ces attentes.
- `tv/transport.py:76` lit statut/code ; `tv/transport.py:85` abandonne un 400 sans exploiter
  le message. Test client existant : `tests/test_tv_control.py`, cas d'archive en lecture seule et
  de conflit ordinaire. ADR 0006, 0021 et 0023 : possession du bloc et ordre du transport inchangés.

## Périmètre

- Modifier `adapters/remote-media.cjs` et ses preuves dans `tests/architecture-f06.test.cjs`,
  `tests/media-asr-options.test.cjs`, `tests/remote-media.test.cjs` si nécessaire et
  `tests/test_tv_control.py`. Réutiliser le refus explicite à statut/code introduit par T188,
  avec les codes d'émetteur de T201.
- Remplacer stderr concaténé par « Préparation média échouée. » ; le détail de l'outil reste dans
  cause. Envelopper seulement la construction/transformation sharp jusqu'à toBuffer par
  « Image illisible. », avec l'erreur d'origine en cause. Ne pas envelopper avec ce refus les
  écritures scratch ni la raison d'annulation : elles gardent leur statut et leur identité.
- Avant toute lecture des propriétés d'une frame, refuser null ou une valeur non objet par
  « Ordre des images invalide. ». Ce refus est explicite, sans dépendre du repli générique du serveur.
- Renforcer les deux attentes HTTP et les trois attentes directes qui épinglent les anciens textes :
  message public exact, code de T201 conservé et cause originale contrôlée pour l'appel direct.
  Retirer la réduction du message sharp à un fragment technique dans le test HTTP.
- Garder audio WAV requis, déclarations d'images masquées tant qu'elles existent, statut 400,
  réponses 503/507, annulation, réadmission et nettoyage. Pas de nouveau contrat de transport, de nouveau code ad hoc ou de
  changement HTTP/TV produit ; T052 traite ensuite le repli inattendu et T189 les lecteurs TV.

## Critères d'acceptation

1. Par POST /v1/segments, une image indécodable répond 400 avec error exactement « Image illisible. »
   et le code `image-unreadable` (`TVLENS_MEDIA_IMAGE_UNREADABLE`). Le refus d'outil répond 400
   « Préparation média échouée. » avec `media-tool-refused` (`TVLENS_MEDIA_TOOL_REFUSED`).
   Aucun corps ne contient stderr, le chemin fictif de test ou le détail sharp.
2. Un bloc autrement valide avec frames contenant null ou une valeur non objet répond 400
   « Ordre des images invalide. » avec `invalid-media-block` (`TVLENS_MEDIA_BLOCK_INVALID`), sans TypeError.
3. L'appel direct à RemoteMedia.assemble garde la cause sharp ou la sortie de l'outil, sous le texte
   public fixe. Si un nettoyage échoue aussi, l'erreur primaire reste la réponse.
4. Les cas existants WAV, 503 media-unavailable, 507 storage-full, réadmission et annulation
   gardent statut, code et attentes ; ceux de déclaration d'images masquées les gardent tant
   qu'elle existe, T194 pouvant l'avoir déjà retirée. Tous les travaux commencés se règlent avant nettoyage.
5. Le vrai transport Python devant son faux serveur abandonne le 400 image et note HTTP 400, sans
   renvoi. Ni sa politique de reprise ni son code produit ne changent.
6. À l'implémentation, exécuter architecture-f06, media-asr-options, remote-media et
   server-ingest-path en séquentiel, puis la suite Python test_tv_control et `node scripts/check.mjs`.
   Les seules attentes de texte remplacées sont nommées au journal ; les nouvelles sont plus strictes.

## Test d'acceptation attendu

Le cas HTTP existant d'architecture-f06 utilise le vrai RemoteServer et le vrai RemoteMedia avec
un faux outil qui échoue. Les tests directs de media-asr-options vérifient les causes, que la réponse
HTTP ne publie pas. Le cas Python prouve le maintien du rejet définitif d'un 400 de contenu.

## Hypothèses bloquantes

Aucune décision n'est attendue.

T201 fournit les trois codes nommés ci-dessus et implique le transport T188. Ces refus restent
explicitement des 400 après T052, sans classification de leurs messages. La présence possible de chemins dans stderr est établie comme voie de propagation ;
aucune sortie réelle de ffmpeg contenant un chemin n'a été produite pendant ce rafraîchissement.
Aucun jalon contrat-fil non livré n'est requis.

## Journal
