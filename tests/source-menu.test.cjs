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

async function pickerStage(t, load) {
  const { createMacDocument } = require('./helpers/mac-document.cjs');
  const { bindSourcePicker } = await menu();
  const document = createMacDocument();
  const previous = global.document;
  global.document = document;
  t.after(() => {
    if (previous === undefined) delete global.document;
    else global.document = previous;
  });
  const get = id => document.getElementById(id);
  const dialog = get('source-picker-dialog');
  dialog.close = () => { dialog.open = false; dialog.onclose(); };
  const state = { locked: false, selected: { id: 'old', name: 'Ancienne fenêtre' }, choices: [] };
  const picker = bindSourcePicker({
    get, load, locked: () => state.locked, selected: () => state.selected,
    choose: (id, result) => state.choices.push({ id, result }),
  });
  return { picker, get, state, dialog };
}
const catalog = { permission: 'granted', sources: [
  { id: 'new', name: '<Nouvelle fenêtre>', thumbnail: 'data:image/png;base64,aGVsbG8=' },
  { id: 'screen', name: 'Écran' },
] };

test('visual source choice shows names and previews and only commits the clicked source', async t => {
  const f = await pickerStage(t, async options => {
    assert.deepEqual(options, { previews: true });
    return catalog;
  });
  await f.picker.open();
  const cards = f.get('source-picker-grid').querySelectorAll('.source-choice');
  assert.equal(cards.length, 2);
  assert.match(cards[0].textContent, /<Nouvelle fenêtre>/);
  const preview = cards[0].children[0];
  assert.equal(preview.children[1].src, catalog.sources[0].thumbnail);
  preview.children[1].onerror();
  assert.equal(preview.children[0].hidden, false);
  assert.equal(f.state.choices.length, 0);
  cards[1].onclick();
  assert.deepEqual(f.state.choices, [{ id: 'screen', result: catalog }]);
  assert.equal(f.dialog.open, false);
});

test('source picker cancellation and late results cannot change the selected source', async t => {
  const { deferred } = require('./helpers/wait.cjs');
  const pending = deferred();
  const f = await pickerStage(t, () => pending.promise);
  const opening = f.picker.open();
  assert.match(f.get('source-picker-status').textContent, /Chargement/);
  f.dialog.close();
  pending.resolve(catalog);
  await opening;
  assert.equal(f.get('source-picker-grid').children.length, 0);
  assert.equal(f.state.selected.id, 'old');
  assert.deepEqual(f.state.choices, []);
});

test('source picker guards capture locks and denied permissions and can retry listing errors', async t => {
  let result = null;
  const f = await pickerStage(t, async () => {
    if (!result) throw Error('listing failed');
    return result;
  });
  f.state.locked = true;
  await f.picker.open();
  assert.notEqual(f.dialog.open, true);
  f.state.locked = false;
  await f.picker.open();
  assert.match(f.get('source-picker-status').textContent, /ne peut pas lister/);
  result = { ...catalog, permission: 'denied' };
  await f.picker.refresh();
  let button = f.get('source-picker-grid').querySelectorAll('.source-choice')[0];
  assert.equal(button.disabled, true);
  button.onclick();
  assert.equal(f.state.choices.length, 0);
  result = catalog;
  await f.picker.refresh();
  button = f.get('source-picker-grid').querySelectorAll('.source-choice')[0];
  assert.equal(button.disabled, false);
  f.state.locked = true;
  f.picker.update();
  assert.equal(button.disabled, true);
  button.onclick();
  assert.equal(f.state.choices.length, 0);
});

test('source picker closes on backdrop but keeps clicks inside its bounds', async t => {
  const f = await pickerStage(t, async () => catalog);
  await f.picker.open();
  f.dialog.getBoundingClientRect = () => ({ left: 100, right: 500, top: 100, bottom: 600 });
  f.dialog.onclick({ target: f.dialog, clientX: 110, clientY: 110 });
  assert.equal(f.dialog.open, true);
  f.dialog.onclick({ target: f.dialog, clientX: 50, clientY: 50 });
  assert.equal(f.dialog.open, false);
  assert.deepEqual(f.state.choices, []);
});

test('an authorized native failure does not ask to grant access again', async () => {
  const { describeSourceListing } = await menu();
  const result = { permission: 'granted', sources: [], error: 'TVLENS_SOURCE_LIST_FAILED' };
  const view = describeSourceListing({ result });
  assert.match(view.status, /Écran autorisé/);
  assert.match(view.notice, /capture.*indisponible/);
  assert.doesNotMatch(view.notice, /autorise l’app/);
});
