const PUBLICATION_FAILED = 'TVLENS_STATE_PUBLICATION_FAILED';

// Une notification ne possède pas la transition : son refus ne doit interrompre ni le travail ni sa sauvegarde.
function publishState(publish, onPublicationError, context) {
  try {
    publish();
  } catch (error) {
    try {
      onPublicationError({ code: PUBLICATION_FAILED, ...context, error });
    } catch {
      // Le diagnostic peut lui aussi être perdu ; aucune réémission ni tentative récursive.
    }
  }
}

module.exports = { publishState };
