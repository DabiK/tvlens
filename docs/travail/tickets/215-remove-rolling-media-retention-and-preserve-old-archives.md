---
id: T215
titre: Stop reading the rolling retention setting on both hosts and keep old archives readable
statut: termine
bloque_par: T208
adr: oui
installe: non
harnais: non
supprime_tests: non
niveau: critique
---

## Ce que le ticket livre

Les deux hôtes conservent les nouveaux médias jusqu'à suppression explicite et cessent de lire
le réglage de rétention glissante. Les anciennes archives gardent textes et motifs d'indisponibilité,
et leur reprise ne réactive aucune fenêtre. L'élagage interne restant sera retiré par T223.

## Sources

- Décision du propriétaire du 16/10 (Q18) ; `docs/domaine.md`, sections 9 et 10 ; ADR 0029/0030.
  Coupe selon relecture B, constats 1, 4 et 7 : réglages/compatibilité avant retrait du cœur.
  T208 livre le convertisseur et relit le corpus étendu T222/T037 ; relire leurs livraisons.
- Code vérifié à `dd5efc9` : `app/main.cjs:75-79` lit option smoke et environnement, `:258`
  publie la configuration, `:296` transmet la durée ; `:312-315` balaie aussi pour rafraîchir
  l'horloge de capture. `server/main.cjs:17-18` lit le réglage serveur.
- `runtime/session-runtime.cjs:41-42`, `:63-71` et `:167` reçoivent, valident et transmettent
  la durée ; `runtime/headless-runtime.cjs:158-165` possède le timer de balayage.
  `core/session.cjs:443` distingue l'ancien format, `:453` conserve les motifs média, `:486`
  ne protège aujourd'hui que `until-deleted` à la reprise. Ce comportement doit changer explicitement.
- `app/ui/sessions-view.mjs:31-46` affiche la conservation ; `tv/app/chat-view.js:21` dit
  « vidéo expirée » pour rolling. Ne pas publier une politique rolling quand rien n'expire plus.
- Outils seulement à adapter : `scripts/probe-video-chat-live.mjs:9`, `scripts/smoke-electron.mjs:39`.
  Documents actifs : `.env.example:33-35`, `deploy/server.env.example:20-21`, `README.md:195`,
  `docs/installation.md:180-182`, `:209-210`, `:226`, `docs/server-installation.md:125`,
  `docs/architecture.md:37`.
- Tests mixtes d'hôte : mac-ipc-contract (`:461`, `:543`, `:729`), server-sessions (`:357`),
  remote-server (`:11-45`), architecture-f10 (`:75`, `:265-267`), architecture-f05 (`:612`),
  architecture-f07 (`:208`), session-manifest (`:285`), mac-ui (`:515-522`), chacun sous
  `tests/`, suffixe `.test.cjs`. Aucun de ces cas n'est dédié au seul élagage : les conserver.
- ADR 0002/0003/0004/0006/0008/0023 : barrières, coalescence, baux, admission et unique nouvel essai.

## Périmètre

- Retirer les lectures `TVLENS_MEDIA_RETENTION_MS` et `--retention-ms=`, la validation et la
  transmission de durée dans les compositions citées. La configuration Mac publie les constantes
  `retention:'until-deleted'`, `retentionMs:null`. Les nouvelles sessions d'hôte sont durables.
- Retirer le balayage périodique serveur inutile, en gardant les autres maintenances. Sur Mac,
  garder les rafraîchissements de l'horloge pendant capture et les occasions de cadence du
  manifeste que T209 migre, sans attendre un passage prêt ; la pause durable ne pousse rien.
- Une archive ancienne rouverte publie `retention:'until-deleted'`, `retentionMs:null`, y compris
  si son document portait rolling ou aucune retention. Décoder d'abord l'absence historique pour
  distinguer not-kept d'expired : ne pas normaliser le document avant ce décodage. L'ouverture
  reste sans écriture ; les valeurs historiques restent lisibles, leurs fichiers restent intacts.
- Compléter le corpus figé par une archive réellement élaguée avant ce lot : textes dans history,
  médias expirés/absents et média encore présent, avec sommes, attentes et provenance. Le cœur
  historique accepte encore une fenêtre jusqu'à T223 : documenter cette génération hors des
  réglages d'hôte supprimés, puis figer le témoin ; ne pas le régénérer dans un test.
- Après reprise, nouveaux médias gardés et anciens manquants toujours indisponibles. Conserver
  motifs distincts, trous, identifiants, révisions, compteurs et questions. Retirer les réglages
  des six documents et des deux scripts cités ; aucun script `*:live` ou Electron réel lancé.
- Adapter les cas mixtes d'hôte : conserver délais de questions, réglages disque, reprise,
  durabilité, inspection, cadence et pause. Le 410 de `/v1/media` et les plages média de F10
  sont désormais prouvés par l'archive historique, avec baux jusqu'au retour réel.
- Jusqu'à T195, `tests/mac-ipc-contract.test.cjs:87-128` lit le texte du câblage Mac. Ne pas
  réécrire ces motifs pour suivre le nouveau câblage ; si l'un casse, s'arrêter.
- L'API de rétention du cœur et ses tests directs restent jusqu'à T223, ainsi que simulateurs et
  calculs internes des lignes de session. Aucun test supprimé ni plancher abaissé ici. Écrire
  l'ADR du retrait en deux lots et élaguer seulement les suppressions ESLint devenues inutiles.

## Critères d'acceptation

1. Sur Mac et serveur, l'ancienne variable ou option n'active plus de fenêtre. Une grande avance
   de temps en capture puis en pause ne retire aucun média nouveau. La configuration et la
   session publiée disent until-deleted/null ; l'horloge Mac et la cadence manifeste restent actives.
2. La variante historique est lisible en bibliothèque, ouverte en lecture seule puis reprise.
   Les médias manquants ne deviennent pas disponibles, leurs motifs restent distincts, les textes
   restent cherchables et les trous visibles. La politique publiée est until-deleted/null ; les
   nouveaux passages persistent au-delà de l'ancienne durée, sans réutiliser d'identifiant.
3. L'ouverture seule n'écrit ni n'appelle de fournisseur. Reprise puis fin gardent barrière et
   confirmation du manifeste ; un refus disque ne confirme pas l'archive. Le corpus T037 reste intact.
4. Le 410 historique, les plages et abandons média, les baux d'inspection, la suppression explicite
   et le scellement restent prouvés. Disque plein suspend l'admission sans rien supprimer.
5. Tous les cas d'hôte cités restent présents avec leurs garanties utiles. Le journal relie chaque
   attente de rétention changée à la décision et à sa preuve d'archive ; aucun motif source Mac
   n'est adapté pour suivre le câblage avant T195.
6. À l'implémentation, jouer en séquentiel les suites d'hôte citées, archive-compat, session-durable,
   session-lifecycle et session-manifest, puis `node scripts/check.mjs`. Harnais inchangé, aucun cas retiré.

## Test d'acceptation attendu

`tests/archive-compat.test.cjs` ouvre la copie historique via bibliothèque/runtime réels, la reprend,
admet un nouveau passage, avance le temps et compare inventaire, médias, motifs et compteurs avant
fermeture/réouverture. Les bancs Mac et serveur prouvent l'absence d'activation par ancien réglage.

## Hypothèses bloquantes

Aucune décision n'est attendue.

Le retrait produit est décidé (Q18). L'autorisation « ok go » pour les tests et leur plancher est
portée uniquement par T223, qui retire l'élagage ; ce premier lot ne consomme pas cette autorisation.
Les témoins historiques servent à la compatibilité et ne réintroduisent aucun réglage actif d'hôte.

## Journal

- Exploration sur `5e3f479` : lectures des compositions, restauration, persistance et corpus existants.
  Le rafraîchissement Mac alimente aussi le manifeste ; il sera conservé pendant la capture.
  État et écarts prévus dans `.harness-state/tickets/T215/`. Témoin hooks présent ; aucun rapport à reprendre.
  Le nouveau corpus sera indépendant ; les corpus T037/T222 restent figés.

- Corpus : `node --test --test-name-pattern='the pruned archive is a frozen witness' tests/archive-compat.test.cjs`
  rouge sur `0 !== 1` (`red-corpus.log`), puis vert après la génération unique
  `node scripts/fixtures/write-pruned-archive.cjs tests/fixtures/archives/pruned-v1` (code 0).
  Producteur : cœur de `5e3f479`, fenêtre injectée directement, avant modification produit.
  Deux passages réellement élagués, un trou d'analyse, une paire retirée après confirmation et une
  paire conservée ; provenance, attentes et sommes figées. Aucun générateur appelé par un test.
- Restauration : `node --test --test-name-pattern='reopening settles' tests/session-durable.test.cjs`
  rouge sur rolling/1000 au lieu de until-deleted/null, puis vert (`red-restore.log`, `green-restore.log`).
  Le décodage de not-kept précède toujours la normalisation. L'API directe de prune reste intacte.
- Réglages serveur : rouge de `server host reads its reversible` sur retentionMs encore publié ;
  rouge du cas `an archive kept until deletion keeps that contract on a host` sur une session neuve rolling.
  Après retrait des lectures, validation, transmission et timer d'élagage, les trois cas ciblés passent
  (`red-server-settings.log`, `red-runtime-settings.log`, `green-server-runtime.log`).
- Mac : rouges des cas de configuration sur rolling et du banc `retired Mac retention` ; puis six cas
  ciblés verts (`red-mac-settings.log`, `red-mac-clock.log`, `green-mac.log`). Une horloge injectée avance
  d'une heure en capture, puis d'une heure en pause : médias conservés, manifeste rafraîchi sans analyse
  prête, pause sans publication ni écriture. Les valeurs invalides de l'ancienne option sont ignorées.
  Le cas des canaux IPC passe ; aucun motif source Mac n'a été modifié.
- Affichage : `node --test --test-concurrency=1 tests/mac-ui.test.cjs tests/tv-chat-view.test.cjs`
  rouge sur l'ancien libellé de durée et l'expiration déduite de rolling, puis vert (`red-ui.log`, `green-ui.log`).
  Les motifs explicites expired, missing et not-kept restent distincts.

### Correspondance des attentes modifiées avec Q18

| Cas conservés | Changement de rétention | Preuve conservée ou ajoutée |
| --- | --- | --- |
| mac-ipc-contract : réglages, reprise, cadence et pause | Ancienne variable/option sans effet, sessions neuves durables | Délais de questions, seuils disque, inspection et fichiers initiaux conservés ; nouveau banc d'horloge et manifeste |
| server-sessions : réglages et reprise sur ancien réglage | Plus de durée validée, sessions neuves durables | Relecture, inspection et lecture HTTP après une heure ; pause et refus disque conservés |
| session-durable : restauration mixte et coût d'une capture longue | Archives rolling ou sans retention durables ; ancien paramètre invalide ignoré | Motifs, révisions, interruptions et numérotation conservés ; tests directs d'élagage inchangés |
| remote-server et architecture-f10 | Le 410 ne provient plus de l'expiration d'une capture neuve | Copie de pruned-v1 via le vrai runtime ; 410 avant lecture de plage, octets exacts, abandon et fermeture du descripteur |
| mac-ui et tv-chat-view | Aucune promesse d'expiration active, aucune déduction depuis rolling | Motifs historiques explicitement affichés ; conservation durable annoncée |
| architecture-f05, architecture-f07, session-manifest | Aucune attente à changer dans le code livré courant | Cas inchangés : baux jusqu'au retour réel, admission, suppression, scellement et priorité des patches historiques |

- `archive-compat` : 27/27 (`archive-refusal.log`). Lecture seule sans fournisseur ni réécriture,
  textes cherchables, reprise ajoutant moment-5, anciennes paires intactes, compteurs et questions
  préservés, puis fermeture/réouverture. Refus de session.json ou manifest.json : `archived: false`.
- Documents actifs et deux scripts adaptés ; scripts Electron et live non lancés conformément au périmètre.
  ADR 0048 écrit ; le second lot T223 conserve la responsabilité de retirer l'élagage interne.
- `node scripts/check.mjs --changed` : vert, 197/197 tests lors du premier passage
  (`check-changed-first.log`). Règles, format, lint, gel et cliquet verts ; aucune suppression ESLint à élaguer.
- Suites imposées exécutées séparément et en séquentiel, commande `node --test tests/<nom>.test.cjs` :
  mac-ipc-contract 32/32, server-sessions 29/29, remote-server 3/3, architecture-f10 10/10,
  architecture-f05 15/15, architecture-f07 26/26, session-manifest 7/7, mac-ui 52/52,
  archive-compat 27/27, session-durable 24/24, session-lifecycle 15/15, tv-chat-view 23/23.
  Tous codes 0 ; commandes et résumés dans `suites.json`, sorties dans `suite-*.log` du dossier d'état.

- Premier contrôle complet `node scripts/check.mjs` : rouge, 2449/2452 tests JS verts et
  47/47 Python verts (`check-full.log`). Trois échecs reproduits avec
  `node --test --test-concurrency=1 --test-name-pattern='a rolling window still expires|published documentation indexes|every saved state' tests/clip-unreadable.test.cjs tests/documentation-index.test.cjs tests/session-archive.test.cjs`
  (`red-full-regressions.log`) : test de purge encore composé par le runtime, ADR absent de la
  section Décisions, corpus supposé entièrement non versionné.
- Corrections : le cas illisible compose directement le cœur et le stockage réel avec fenêtre,
  conserve ses deux assertions de purge ; l'index explique l'ADR ; le round-trip couvre aussi
  l'enveloppe versionnée, sans changer les octets figés ni les comparaisons de toutes les clés du modèle.
  `node --test --test-concurrency=1 tests/clip-unreadable.test.cjs tests/documentation-index.test.cjs tests/session-archive.test.cjs`
  : 34/34, code 0 (`green-full-regressions.log`). Aucun cas retiré, aucun motif source Mac changé.
- `node scripts/check.mjs --changed` après corrections : vert, 222/222 tests JS, code 0
  (`check-changed-final.log`). Les dix fichiers de tests modifiés gardent chacun au moins leur
  nombre de cas initial (`test-counts.json`). Harnais et gel ESLint inchangés.
- Intégrité revérifiée : 148 fichiers des anciens corpus identiques à HEAD ; toutes les sommes
  de durable-v1 (23), historical-v1 (123) et pruned-v1 (11) valides (`integrity.json`).
  `git diff --check` : code 0. Les trois scripts adaptés/ajoutés passent `node --check`.
  Le générateur a servi une seule fois à figer le témoin ; les scripts Electron et live ont
  seulement été contrôlés en syntaxe, sans lancer Electron ni les fournisseurs réels.
- Contrôle final `node scripts/check.mjs` : vert, code 0 (`check-full-final.log`) :
  règles, format, lint, gel et cliquet verts ; 2452/2452 tests JS dans 137 fichiers et 47/47 Python.
  Verdict `TERMINÉ` écrit dans `.harness-state/tickets/T215/verdict.json` ; aucune réserve restante.
  Aucun commit ni push ; relecture et intégration laissées à la boucle.

### Reprise après relecture 1

- Rapport, ticket/journal, écarts, statut et diff relus sur `d246657` ; nouveau témoin hooks présent.
  Constat mineur 1 accepté : retirer les trois options mortes des fixtures de listage HTTP,
  sans toucher aux scénarios ni à leurs assertions. Aucun changement produit requis.
- Avant correction :
  `node --test --test-name-pattern='HTTP session listing keeps the entry session facts|HTTP .* keeps A while the library waits|HTTP .* freezes flags and figures' tests/server-sessions.test.cjs`
  : 7/7, code 0 (`reprise-1-before.log`). Ce nettoyage de montage ne révèle pas de défaut
  comportemental : aucun nouveau rouge revendiqué, aucune comparaison de source ajoutée.
- Constat 1 corrigé : les trois montages utilisent `fixture(t)` ; les sept variantes de listage
  gardent toutes leurs assertions, dont la politique durable de l'archive ouverte. Les cas dédiés
  à l'ancienne option ignorée restent en place. `node --test tests/server-sessions.test.cjs` :
  29/29, code 0 (`reprise-1-server-sessions.log`).
- `node scripts/check.mjs --changed` : vert, 222/222 tests JS, règles, format, lint, gel et cliquet
  verts, code 0 (`reprise-1-check-changed.log`). `git diff --check` : code 0.
- `node scripts/check.mjs` après correction : vert, code 0 (`reprise-1-check-full.log`) :
  2452/2452 tests JS dans 137 fichiers, 47/47 Python ; règles, format, lint, gel et cliquet verts.
  Nouveau verdict `TERMINÉ`, constat mineur 1 corrigé sans réserve propre. Aucun commit ni push.

### Réserves à la clôture

- .harness-state/tickets/T215/relecture-2.md : 1. `docs/night-features-delivery.md:237`, `:842` (hors périmètre, réserve)

  - **Ce qui ne va pas :** ce constat vient de la relecture 1 et il est toujours vrai. Ce livrable du 13/10 présente encore `TVLENS_MEDIA_RETENTION_MS` comme un réglage réversible, dans le texte et dans le tableau « environnement du processus ». Il ne fait pas partie des six documents actifs nommés par le ticket.
  - **Ce qui est attendu :** le reporter en réserve. Deux suites possibles : une note « réglage retiré depuis ADR 0048 », ou rien si ce livrable est considéré comme figé.
