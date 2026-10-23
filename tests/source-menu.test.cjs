const { test } = require('node:test');
const assert = require('node:assert/strict');

const menu = () => import('../app/ui/source-menu.mjs');
const SCREEN_ACCESS = /Réglages Système › Confidentialité et sécurité › Enregistrement de l’écran.*quitte-la et rouvre-la/;

test('a failed listing leaves the loading wording and says in the notice how to give screen access', async () => {
  const { describeSourceListing } = await menu();
  const failed = describeSourceListing({ error: new Error('Failed to get sources.') });
  assert.equal(failed.placeholder, 'Fenêtres inaccessibles');
  assert.equal(failed.status, 'Capture indisponible : Failed to get sources.');
  assert.match(failed.notice, /ne peut pas lister les fenêtres/);
  assert.match(failed.notice, SCREEN_ACCESS);
});

test('a listing without screen access says so in the menu and in the notice', async () => {
  const { describeSourceListing } = await menu();
  for (const permission of ['denied', 'not-determined', 'restricted']) {
    const refused = describeSourceListing({ result: { permission, sources: [], preferredSourceId: null } });
    assert.equal(refused.placeholder, 'Écran non autorisé');
    assert.equal(refused.status, `Autorisation écran : ${permission} · Vérifie les autorisations`);
    assert.match(refused.notice, /n’a pas accès à l’écran/);
    assert.match(refused.notice, SCREEN_ACCESS);
  }
});

test('a granted listing invites a choice, or says that no window was found, with no notice', async () => {
  const { describeSourceListing } = await menu();
  const film = { id: 'window:1', name: 'Film' };
  assert.deepEqual(describeSourceListing({ result: { permission: 'granted', sources: [film], preferredSourceId: null } }), {
    placeholder: 'Choisir une fenêtre ou un écran…', status: 'Écran autorisé · Choisis une source', notice: '',
  });
  assert.deepEqual(describeSourceListing({ result: { permission: 'granted', sources: [], preferredSourceId: null } }), {
    placeholder: 'Aucune fenêtre trouvée', status: 'Écran autorisé · Aucune source', notice: '',
  });
});

test('an authorized native failure does not ask to grant access again', async () => {
  const { describeSourceListing } = await menu();
  const result = { permission: 'granted', sources: [], error: 'TVLENS_SOURCE_LIST_FAILED' };
  const view = describeSourceListing({ result });
  assert.match(view.status, /Écran autorisé/);
  assert.match(view.notice, /capture.*indisponible/);
  assert.doesNotMatch(view.notice, /autorise l’app/);
});
