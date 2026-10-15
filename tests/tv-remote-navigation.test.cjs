const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTvPage, KEYS } = require('./helpers/tv-page.cjs');

// The column of the chat panel with its buttons switched on, as a paired panel would leave them.
function loadColumn() {
  const page = loadTvPage();
  for (const id of ['send', 'capture', 'transcription-language']) page.el(id).disabled = false;
  return page;
}

function walk(page, steps) {
  for (const [from, key, expected] of steps) {
    page.el(from).focus();
    page.press(KEYS[key]);
    assert.equal(page.activeId(), expected, from + ' ' + key);
  }
}

test('an unpaired panel starts with the focus on dictate and says that pairing is required', () => {
  const page = loadTvPage();
  assert.equal(page.activeId(), 'dictate');
  assert.equal(page.el('connection').textContent, 'Appairage requis sur cet appareil.');
  assert.equal(page.el('send').disabled, true);
  assert.equal(page.body.dataset.mode, 'chat');
  assert.equal(page.el('capture-state').textContent, 'Appairage requis pour la capture.');
});

test('an unpaired panel starts no timer and no request', () => {
  const page = loadTvPage();
  assert.equal(page.calls.timers, 0);
  assert.equal(page.calls.requests, 0);
});

test('dictate and send walk across the question row, down to capture and up to the conversation', () => {
  const page = loadColumn();
  walk(page, [
    ['dictate', 'right', 'send'],
    ['send', 'left', 'dictate'],
    ['send', 'up', 'conversation'],
    ['dictate', 'left', 'conversation'],
    ['dictate', 'up', 'conversation'],
    ['dictate', 'down', 'capture'],
  ]);
});

test('capture and the transcription language lead to each other', () => {
  const page = loadColumn();
  walk(page, [
    ['capture', 'down', 'transcription-language'],
    ['capture', 'right', 'transcription-language'],
    ['capture', 'left', 'transcription-language'],
    ['transcription-language', 'right', 'transcription-language'],
    ['transcription-language', 'up', 'capture'],
    ['capture', 'up', 'dictate'],
  ]);
});

test('the conversation leads up to the header buttons and down to dictate', () => {
  const page = loadColumn();
  walk(page, [
    ['conversation', 'up', 'show-timeline'],
    ['conversation', 'down', 'dictate'],
    ['conversation', 'right', 'dictate'],
  ]);
});

test('the header buttons lead to each other and down to the conversation', () => {
  const page = loadColumn();
  walk(page, [
    ['show-timeline', 'right', 'show-surveillance'],
    ['show-surveillance', 'left', 'show-timeline'],
    ['show-timeline', 'down', 'conversation'],
    ['show-surveillance', 'down', 'conversation'],
  ]);
});

test('the cancel button sits between the question row and capture while a question runs', () => {
  const page = loadColumn();
  page.el('cancel-question').hidden = false;
  walk(page, [
    ['dictate', 'down', 'cancel-question'],
    ['cancel-question', 'down', 'capture'],
    ['cancel-question', 'right', 'cancel-question'],
    ['cancel-question', 'up', 'dictate'],
    ['capture', 'up', 'cancel-question'],
  ]);
});

test('the button that detaches a moment leads down to dictate and up to the conversation', () => {
  const page = loadColumn();
  walk(page, [
    ['clear-moment', 'down', 'dictate'],
    ['clear-moment', 'up', 'conversation'],
  ]);
});

test('a disabled target keeps the focus where it is', () => {
  const page = loadTvPage();
  walk(page, [
    ['dictate', 'right', 'dictate'],
    ['dictate', 'down', 'dictate'],
  ]);
});

test('the conversation announces how to read, scrolls by 180 while reading and gives the focus back on Back', () => {
  const page = loadColumn();
  const conversation = page.el('conversation');
  const hint = page.el('navigation-hint');
  conversation.focus();
  assert.equal(hint.textContent, 'OK · lire les messages');
  const ok = page.press(KEYS.ok);
  assert.equal(ok.defaultPrevented, true);
  assert.equal(conversation.dataset.reading, 'true');
  assert.equal(hint.textContent, 'Haut / Bas · lire — Retour · actions');
  page.press(KEYS.down);
  assert.equal(conversation.scrollTop, 180);
  page.press(KEYS.up);
  assert.equal(conversation.scrollTop, 0);
  assert.equal(page.activeId(), 'conversation');
  page.press(KEYS.back);
  assert.equal(page.activeId(), 'dictate');
  assert.equal(conversation.dataset.reading, 'false');
  assert.equal(hint.textContent, 'Retour · fermer');
  assert.equal(page.calls.close, 0);
});

test('up and down in the question field go back to dictate while the LG keyboard is hidden', () => {
  const page = loadColumn();
  for (const key of ['up', 'down']) {
    page.el('question').focus();
    const event = page.press(KEYS[key]);
    assert.equal(page.activeId(), 'dictate', key);
    assert.equal(event.defaultPrevented, true, key);
  }
});

test('down in the question field stays there without preventing the key while the LG keyboard is shown', () => {
  const page = loadColumn();
  page.keyboard(true);
  page.el('question').focus();
  const event = page.press(KEYS.down);
  assert.equal(page.activeId(), 'question');
  assert.equal(event.defaultPrevented, false);
});

test('Back in the question field returns to dictate and the keyboard counts as hidden again', () => {
  for (const back of [KEYS.back, KEYS.escape]) {
    const page = loadColumn();
    page.keyboard(true);
    page.el('question').focus();
    page.press(back);
    assert.equal(page.activeId(), 'dictate');
    assert.equal(page.calls.close, 0);
    page.el('dictate').click();
    assert.equal(page.activeId(), 'question');
    page.press(KEYS.down);
    assert.equal(page.activeId(), 'dictate');
  }
});

test('Back anywhere but in the conversation and the question field closes the panel', () => {
  const page = loadColumn();
  for (const [id, back] of [['dictate', KEYS.back], ['capture', KEYS.escape], ['show-timeline', KEYS.back]]) {
    const before = page.calls.close;
    page.el(id).focus();
    const event = page.press(back);
    assert.equal(page.calls.close, before + 1, id);
    assert.equal(event.defaultPrevented, true, id);
  }
});

test('in a dialog right and left walk its buttons in a loop and skip a disabled one', () => {
  const page = loadColumn();
  page.openDialog('end-session-dialog');
  assert.equal(page.activeId(), 'end-cancel');
  page.press(KEYS.right);
  assert.equal(page.activeId(), 'end-confirm');
  page.press(KEYS.right);
  assert.equal(page.activeId(), 'end-cancel');
  page.press(KEYS.left);
  assert.equal(page.activeId(), 'end-confirm');
  page.el('end-session-dialog').open = false;

  page.el('archive-new').disabled = true;
  page.openDialog('archive-capture-dialog');
  page.press(KEYS.right);
  assert.equal(page.activeId(), 'archive-resume');
  page.press(KEYS.right);
  assert.equal(page.activeId(), 'archive-cancel');
  page.press(KEYS.left);
  assert.equal(page.activeId(), 'archive-resume');
});

test('in a dialog a focus outside its buttons goes back to the first one', () => {
  const page = loadColumn();
  page.openDialog('end-session-dialog');
  for (const key of ['right', 'left']) {
    page.el('dictate').focus();
    const event = page.press(KEYS[key]);
    assert.equal(page.activeId(), 'end-cancel', key);
    assert.equal(event.defaultPrevented, true, key);
  }
});

test('in a dialog Back clicks its cancel button and does not close the panel', () => {
  for (const back of [KEYS.back, KEYS.escape]) {
    const page = loadColumn();
    page.openDialog('end-session-dialog');
    page.el('end-confirm').focus();
    const event = page.press(back);
    assert.equal(page.el('end-cancel').clicks, 1);
    assert.equal(page.el('end-confirm').clicks, 0);
    assert.equal(page.calls.close, 0);
    assert.equal(event.defaultPrevented, true);
  }
});

test('a press on the bare background does not take the focus away from a control', () => {
  const page = loadColumn();
  for (const target of [page.body, page.documentElement]) {
    page.el('dictate').focus();
    assert.equal(page.mousedown(target).defaultPrevented, true);
  }
});

test('a press on the bare background leaves the question field its usual behaviour', () => {
  const page = loadColumn();
  page.el('question').focus();
  assert.equal(page.mousedown(page.body).defaultPrevented, false);
});

test('a press on a control is left to the browser', () => {
  const page = loadColumn();
  page.el('dictate').focus();
  assert.equal(page.mousedown(page.el('send')).defaultPrevented, false);
});
