import { formatClock } from './text.mjs';

/** DOM helpers accept text, never model-provided HTML. */
export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** "12:04", and "1:30:00" past the hour: a film does not stop at 59 minutes. */
export function formatTime(ms) {
  return formatClock(ms);
}

/** A button whose effect is resolved by the renderer's single click handler: it survives any re-render of its card. */
export function action(className, text, name, data = {}) {
  const button = element('button', className, text);
  button.type = 'button';
  button.dataset.action = name;
  for (const [key, value] of Object.entries(data)) if (value !== undefined && value !== null) button.dataset[key] = String(value);
  return button;
}

/** Carries the open state of detail blocks from a replaced node to its successor. */
export function keepOpen(previous, next) {
  if (!previous) return next;
  const open = new Set([...previous.querySelectorAll('details[open][data-key]'), ...(previous.matches?.('details[open][data-key]') ? [previous] : [])].map(node => node.dataset.key));
  for (const node of [...next.querySelectorAll('details[data-key]'), ...(next.matches?.('details[data-key]') ? [next] : [])]) if (open.has(node.dataset.key)) node.open = true;
  return next;
}
