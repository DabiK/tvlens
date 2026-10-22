import { cleanError } from './text.mjs';

// macOS applies a screen access granted while the app runs only once it is reopened.
const SCREEN_ACCESS = 'autorise l’app dans Réglages Système › Confidentialité et sécurité › Enregistrement de l’écran, '
  + 'puis quitte-la et rouvre-la.';

/**
 * What the source menu, the status and the notice say once the capture sources are listed, or once their listing fails.
 * The menu never keeps its loading wording; a missing screen access goes to the notice, the line every view shows.
 */
export function describeSourceListing({ result, error }) {
  if (error) {
    return {
      placeholder: 'Fenêtres inaccessibles',
      status: `Capture indisponible : ${cleanError(error)}`,
      notice: `TVLens ne peut pas lister les fenêtres : ${SCREEN_ACCESS}`,
    };
  }
  if (result.permission !== 'granted') {
    return {
      placeholder: 'Écran non autorisé',
      status: `Autorisation écran : ${result.permission} · Vérifie les autorisations`,
      notice: `TVLens n’a pas accès à l’écran : ${SCREEN_ACCESS}`,
    };
  }
  if (!result.sources.length) return { placeholder: 'Aucune fenêtre trouvée', status: 'Écran autorisé · Aucune source', notice: '' };
  return { placeholder: 'Choisir une fenêtre ou un écran…', status: 'Écran autorisé · Choisis une source', notice: '' };
}
