const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openedPages } = require('../adapters/codex-confinement.cjs');
const { CodexSurveillanceAgent } = require('../adapters/codex-surveillance-agent.cjs');

// Shapes recorded on a real verification turn (codex-cli 0.160.1, 13 October 2026), trimmed.
const search = { type: 'webSearch', id: 'exec-1', query: 'tour Eiffel 330 mètres', action: { type: 'search', query: 'tour Eiffel 330 mètres', queries: null },
  results: [{ type: 'text_result', ref_id: 'turn0search0', url: 'https://www.toureiffel.paris/fr/le-monument/chiffres-cle', title: 'Hauteur, poids' }, { type: 'text_result', ref_id: 'turn0search1', url: 'https://example.org/liste', title: 'Liste' }] };
const groupedOpen = { type: 'webSearch', id: 'exec-2', query: '', action: { type: 'other' },
  results: [{ type: 'text_result', ref_id: 'turn1view0', snippet: 'Total lines: 110', url: 'https://www.toureiffel.paris/fr/le-monument/chiffres-cle' }, { type: 'text_result', ref_id: 'turn1view1', snippet: 'Total lines: 125', url: 'https://www.toureiffel.paris/fr/actualites/evenements/la-tour-eiffel-grandit-encore-pour-atteindre-330-metres' }] };

test('pages opened by reference are credited whatever the action is called; a search listing never is', () => {
  assert.deepEqual(openedPages(search), [], 'a search lists results, it opens nothing');
  assert.deepEqual(openedPages(groupedOpen), ['https://www.toureiffel.paris/fr/le-monument/chiffres-cle', 'https://www.toureiffel.paris/fr/actualites/evenements/la-tour-eiffel-grandit-encore-pour-atteindre-330-metres']);
  // An action of an unknown name that only carries search references opens nothing either.
  assert.deepEqual(openedPages({ type: 'webSearch', action: { type: 'other' }, results: search.results }), []);
  // A reference that merely ends like a view is not one.
  assert.deepEqual(openedPages({ type: 'webSearch', action: { type: 'other' }, results: [{ ref_id: 'preview0', url: 'https://example.org/x' }] }), []);
  assert.deepEqual(openedPages({ type: 'webSearch', action: { type: 'openPage', url: 'https://example.org/a' }, results: [] }), ['https://example.org/a']);
});

test('the surveillance credits a lot with the pages its own turn opened, including a grouped open reported as "other"', async () => {
  const audits = [
    [{ tool: 'web_search', action: 'search', status: 'completed' }, { tool: 'web_search', action: 'other', url: 'https://www.toureiffel.paris/fr/le-monument/chiffres-cle', opened: true, status: 'completed' }, { tool: 'web_search', action: 'other', url: 'https://www.toureiffel.paris/fr/actualites/x', opened: true, grouped: true, status: 'completed' }],
    // An entry named "other" that the client did not mark as opened proves nothing.
    [{ tool: 'web_search', action: 'search', url: 'https://example.org/liste', opened: true, status: 'completed' }, { tool: 'web_search', action: 'other', url: 'https://example.org/non-ouverte', status: 'completed' }],
  ];
  let turn = 0;
  const client = () => ({ prepare: async () => {}, close: async () => {}, rotateThread() {}, answer: async () => ({ summary: 'Ok.', verdicts: [], audit: audits[turn++] }) });
  const agent = new CodexSurveillanceAgent({ clientFactory: client });
  const first = await agent.verify({ sessionId: 's', instruction: 'Vérifie.', claims: [], signal: new AbortController().signal });
  assert.deepEqual(first.research.openedUrls, ['https://www.toureiffel.paris/fr/le-monument/chiffres-cle', 'https://www.toureiffel.paris/fr/actualites/x']);
  assert.equal(first.research.webSearches, 2, 'a further page of the same open is not another search');
  const second = await agent.verify({ sessionId: 's', instruction: 'Vérifie.', claims: [], signal: new AbortController().signal });
  assert.deepEqual(second.research.openedUrls, [], 'neither a search nor an unmarked action opens a page');
});
