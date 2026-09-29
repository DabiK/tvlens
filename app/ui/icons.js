/** Fixed application glyphs; no model output or external SVG is interpreted. */
const paths = {
  bookmark: 'M6 3h12v18l-6-4-6 4z',
  pause: 'M8 5v14M16 5v14',
  play: 'm8 4 12 8-12 8z',
  chat: 'M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5Z',
  check: 'm5 12 4 4L19 6',
};
export function setIcon(node, name, label = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'ui-icon');
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7'); svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', paths[name]); svg.append(path);
  node.replaceChildren(svg, ...(label ? [document.createTextNode(label)] : []));
}
