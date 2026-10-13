# Jusqu’ici — récapitulatif progressif

Le panneau Mémoire affiche un aperçu global et les trois derniers chapitres. « Tous les chapitres » et le bouton « Jusqu’ici » de la conversation ouvrent le récapitulatif complet, y compris en fenêtre flottante. Chaque horodatage référence un vrai passage rejouable. Depuis le 13 octobre 2026, les vidéos restent avec la session jusqu’à sa suppression ; si une vidéo est indisponible (session ancienne, fichier absent, fenêtre glissante réactivée), le texte et sa provenance restent conservés et le motif est dit.

## Fonctionnement

- Première synthèse après un passage analysé ; mises à jour espacées d’au moins 25 secondes, uniquement si de nouveaux textes sont disponibles.
- Agent Codex distinct, modèle d’observation choisi au démarrage, sans recherche web ni nouvelle analyse vidéo.
- Aperçu et regroupement thématique produits depuis les résumés originaux conservés, avec les chapitres précédents comme contexte. Aucune synthèse fondée uniquement sur une synthèse antérieure.
- IDs sources validés : aucune invention, duplication ou omission. Horodatages calculés par l’application.
- Questions et vérifications manuelles prioritaires : annulation de la synthèse, reprise après le travail manuel.
- Délai de 45 secondes ; erreurs affichées en conservant le dernier récapitulatif valide. Une nouvelle session annule et réinitialise le récapitulatif.
- Archive locale atomique `living-recap.json` dans le dossier de session, avec textes originaux et provenance. Elle part avec la session quand celle-ci est supprimée, et seulement alors.

## Limites

Les résumés dépendent des observations disponibles et peuvent être imprécis. Les passages non analysés et interruptions sont signalés. Le modèle reçoit tous les originaux : le coût augmente avec la durée. Au-delà de 240 000 caractères d’entrée, la mise à jour échoue explicitement sans tronquer ni prétendre couvrir les nouveaux passages. L’archive est conservée sur disque. Depuis le 13 octobre 2026, ouvrir une session archivée sur Mac recharge son récapitulatif, sans relancer de synthèse ; une correction faite après la dernière synthèse ne repart qu’avec la synthèse suivante. Le serveur TV n’a pas de récapitulatif progressif.

## Vérification

Tests unitaires : mise à jour, couverture et provenance, expiration, priorité manuelle, reset, réponses tardives, erreur et nouvelle tentative, délai maximal, conservation des originaux, limite d’entrée et déduplication des notifications. Le smoke Electron utilise une synthèse simulée et vérifie grand/petit format, relecture, archive et reset. La qualité de synthèse du fournisseur réel reste à vérifier en session connectée.
