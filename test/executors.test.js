import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_KEYS, keyFromEvent, formatHotkey } from '../shared/keys.js';
import { hotkeyToSequence } from '../server/executors/windows.js';
import { hotkeyToXdotool, splitArgs } from '../server/executors/linux.js';
import { hotkeyToAppleScript } from '../server/executors/macos.js';

test('chaque touche canonique est prise en charge par Windows et Linux', () => {
  for (const { id } of ALL_KEYS) {
    assert.doesNotThrow(() => hotkeyToSequence({ key: id, modifiers: [] }), `Windows : ${id}`);
    assert.doesNotThrow(() => hotkeyToXdotool({ key: id, modifiers: [] }), `Linux : ${id}`);
  }
});

test('Windows : modificateurs enfoncés avant la touche, codes VK corrects', () => {
  assert.deepEqual(hotkeyToSequence({ key: 'K', modifiers: ['shift', 'ctrl'] }), [
    [0x11, false],
    [0x10, false],
    [0x4b, false],
  ]);
  assert.deepEqual(hotkeyToSequence({ key: 'F13', modifiers: [] }), [[0x7c, false]]);
  assert.deepEqual(hotkeyToSequence({ key: 'ArrowUp', modifiers: ['meta'] }), [
    [0x5b, true],
    [0x26, true],
  ]);
});

test('Linux : chaîne xdotool', () => {
  assert.equal(hotkeyToXdotool({ key: 'T', modifiers: ['ctrl', 'alt'] }), 'ctrl+alt+t');
  assert.equal(hotkeyToXdotool({ key: 'PageDown', modifiers: ['meta'] }), 'super+Next');
});

test('macOS : AppleScript avec échappement', () => {
  assert.equal(
    hotkeyToAppleScript({ key: 'S', modifiers: ['meta', 'shift'] }),
    'tell application "System Events" to keystroke "s" using {shift down, command down}',
  );
  assert.equal(hotkeyToAppleScript({ key: 'Enter', modifiers: [] }), 'tell application "System Events" to key code 36');
  assert.match(hotkeyToAppleScript({ key: 'Backslash', modifiers: [] }), /keystroke "\\\\"/);
});

test('touche inconnue refusée', () => {
  assert.throws(() => hotkeyToSequence({ key: 'Nope', modifiers: [] }));
});

test('capture navigateur : AZERTY', () => {
  // Touche « A » d'un clavier AZERTY (position physique Q)
  assert.equal(keyFromEvent({ key: 'a', code: 'KeyQ' }), 'A');
  // Ctrl+1 sur AZERTY : key vaut « & », on garde la position physique
  assert.equal(keyFromEvent({ key: '&', code: 'Digit1' }), '1');
  assert.equal(keyFromEvent({ key: 'F5', code: 'F5' }), 'F5');
  assert.equal(keyFromEvent({ key: ' ', code: 'Space' }), 'Space');
  assert.equal(keyFromEvent({ key: 'Control', code: 'ControlLeft' }), null);
  // Alt+lettre sur macOS produit un caractère spécial : on retombe sur la position
  assert.equal(keyFromEvent({ key: 'œ', code: 'KeyO' }), 'O');
});

test('affichage des raccourcis', () => {
  assert.equal(formatHotkey({ key: 'C', modifiers: ['ctrl', 'shift'] }), 'Ctrl + Maj + C');
  assert.equal(formatHotkey({ key: 'C', modifiers: ['meta'] }, { mac: true }), '⌘C');
});

test('découpage des arguments', () => {
  assert.deepEqual(splitArgs('--a "b c" \'d e\' f'), ['--a', 'b c', 'd e', 'f']);
  assert.deepEqual(splitArgs(''), []);
});
