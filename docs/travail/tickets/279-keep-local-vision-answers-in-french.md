---
id: T279
titre: Keep local vision answers in French
statut: a-faire
bloque_par: T278
adr: non
installe: non
harnais: non
supprime_tests: non
niveau: standard
---

## Ce que le ticket livre

Un modèle vision local (Ollama) répond en français, comme Codex, même quand la vidéo ou ses paroles sont dans une autre
langue. Une réponse rendue dans une autre langue est redemandée une seule fois ; si elle le reste, elle est publiée
avec une limite nommée et une mesure, jamais corrigée ni remplacée en silence.

## Sources

- Contrôle réel T273, le 18/10, au commit `c13fd0e` : par le runner de rejeu, `gemma3:4b` a répondu en anglais sur 2
  des 9 blocs du discours de Kennedy (`media/samples/kennedy-rice-7min.mp4`), malgré la consigne « Décris en
  français ». Sur le live français du 17/10 (T272), il a répondu en français 4 fois sur 4. Codex n'a jamais dévié.
  Trace : `experiments/essais/2026-10-18-conversion-video-mac/`.
- Décision du propriétaire, le 18/10 : renforcer ce cas « soit par le prompt soit par la configuration ».
- Code à `c13fd0e` :
  - `adapters/codex-perception.cjs:201-205` : la consigne commune « Décris en français le passage ACTUEL uniquement »
    est envoyée à Codex comme à l'agent local ;
  - `adapters/local-vlm-agent.cjs:74-90` : `LocalVlmAgent.run` reçoit `instructions` et les envoie à Ollama ;
    le même agent sert la perception de fond et le réexamen (T265).

## Périmètre

- À modifier : `adapters/local-vlm-agent.cjs`, une règle pure de détection de langue sous `core/` si elle est utile,
  leurs tests ; la composition seulement si l'agent en a besoin.
- Pour le seul backend local : une consigne de langue renforcée, placée en dernier dans les instructions envoyées à
  Ollama (« Réponds uniquement en français, même si la vidéo ou ses paroles sont dans une autre langue. »). La
  consigne commune et le chemin Codex ne changent pas : la référence Codex de G1 et G2 reste comparable.
- Après une réponse valide, ses champs de texte rédigés (`summary`, `visual`, `topic`, `uncertainty`) sont jugés par
  une règle simple et déterministe, sans modèle ni réseau. Une réponse jugée non française est redemandée une seule
  fois, avec la même borne de temps. Si la seconde l'est encore, elle est publiée telle quelle, avec une limite en
  français dans `uncertainty` et une mesure `language` (langue jugée, nombre de tentatives) dans les métriques.
- Un texte cité tel qu'il apparaît à l'écran ou dans les paroles (entre guillemets) ne compte pas comme une réponse en
  autre langue.
- À ne pas toucher : le prompt et le chemin Codex, l'agent de questions Ollama (T263), la transcription Whisper, les
  schémas d'observation, le harnais.

## Critères d'acceptation

1. Par la vraie perception et un faux Ollama, la requête locale finit par la consigne de langue renforcée ; une
   requête Codex doublée reste identique à celle d'avant ce ticket.
2. Un faux Ollama qui répond d'abord en anglais puis en français : deux appels, la réponse française est publiée, la
   mesure indique deux tentatives.
3. Un faux Ollama qui répond deux fois en anglais : deux appels seulement, réponse publiée avec sa limite en français
   et la langue jugée dans les métriques ; aucune troisième tentative, aucun repli sur Codex.
4. Une réponse française qui cite un titre anglais entre guillemets : un seul appel.
5. La seconde tentative respecte la borne de temps et l'annulation de la première.
6. `node scripts/check.mjs`.

## Test d'acceptation attendu

Dans le test de l'agent local : réponse anglaise puis française d'un faux Ollama, deux appels, réponse française
publiée et mesure des tentatives.

## Hypothèses bloquantes

Aucune décision n'est attendue.

## Journal

