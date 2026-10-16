---
id: T215
titre: Stop reading the rolling retention setting on both hosts and keep old archives readable
statut: a-faire
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
