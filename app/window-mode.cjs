const FLOAT_WIDTH = 420;
const FLOAT_MIN_HEIGHT = 96;
const FLOAT_COMPACT_HEIGHT = 64;
const FLOAT_EXPANDED_HEIGHT = 620;
const FLOAT_RIGHT_MARGIN = 20;
const FLOAT_TOP_MARGIN = 60;
const FULL_MIN_WIDTH = 1000;
const FULL_MIN_HEIGHT = 720;

function createWindowMode({ window, screen }) {
  let fullBounds = window.getBounds();
  let floating = false;
  return value => {
    if (!value || typeof value.floating !== 'boolean' || typeof value.expanded !== 'boolean') {
      throw new Error('Mode de fenêtre invalide.');
    }
    if (value.floating) {
      if (!floating) fullBounds = window.getBounds();
      window.setMinimumSize(FLOAT_WIDTH, FLOAT_MIN_HEIGHT);
      window.setAlwaysOnTop(true, 'floating');
      const area = screen.getDisplayMatching(window.getBounds()).workArea;
      const chromeHeight = window.getBounds().height - window.getContentBounds().height;
      const height = value.expanded ? Math.min(FLOAT_EXPANDED_HEIGHT + chromeHeight, area.height) : FLOAT_COMPACT_HEIGHT + chromeHeight;
      const old = window.getBounds();
      window.setBounds({
        x: Math.max(area.x, Math.min(floating ? old.x : area.x + area.width - FLOAT_WIDTH - FLOAT_RIGHT_MARGIN, area.x + area.width - FLOAT_WIDTH)),
        y: Math.max(area.y, Math.min(floating ? old.y : area.y + FLOAT_TOP_MARGIN, area.y + area.height - height)),
        width: FLOAT_WIDTH,
        height,
      });
    } else {
      window.setAlwaysOnTop(false);
      window.setMinimumSize(FULL_MIN_WIDTH, FULL_MIN_HEIGHT);
      window.setBounds(fullBounds);
    }
    floating = value.floating;
    return value;
  };
}

module.exports = { createWindowMode };
