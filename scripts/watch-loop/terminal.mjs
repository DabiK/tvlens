import { plain } from "./text.mjs";
// Cycle de vie du terminal ; les effets sont injectés par le point d’entrée.
const REFRESH_MS = 1000;
const ENTER_SCREEN = "\x1b[?1049h\x1b[?25l";
const LEAVE_SCREEN = "\x1b[?25h\x1b[?1049l";
const CURSOR_HOME = "\x1b[H";
const CLEAR_LINE = "\x1b[K";
const CLEAR_BELOW = "\x1b[J";
const SIGNAL_EXIT_CODES = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 };

function leaveOnExit(output, lifecycle, reportError) {
  let active = true;
  const enter = () => {
    if (active) return;
    active = true;
    output.write(ENTER_SCREEN);
  };
  const leave = () => {
    if (!active) return;
    active = false;
    output.write(LEAVE_SCREEN);
  };
  lifecycle.on("exit", leave);
  for (const [signal, code] of Object.entries(SIGNAL_EXIT_CODES)) lifecycle.on(signal, () => lifecycle.exit(code));
  lifecycle.on("uncaughtException", (error) => {
    leave();
    reportError(error);
    lifecycle.exit(1);
  });
  return { enter, leave, isActive: () => active };
}

export function watch(frame, { output, lifecycle, schedule, reportError, stop }) {
  output.write(ENTER_SCREEN);
  const screen = leaveOnExit(output, lifecycle, reportError);
  const draw = () => {
    if (!screen.isActive()) return;
    let lines;
    try {
      lines = frame();
    } catch (error) {
      // Un fichier lu au moment où la boucle l'écrit : l'écran le dit et la seconde suivante réessaie.
      lines = [`Lecture impossible : ${plain(error.message)}`];
    }
    const visible = lines.slice(0, Math.max(1, (output.rows || Infinity) - 1));
    output.write(CURSOR_HOME + CLEAR_BELOW + visible.map((line) => CLEAR_LINE + line).join("\n"));
  };
  lifecycle.on("SIGTSTP", () => {
    screen.leave();
    stop();
  });
  lifecycle.on("SIGCONT", () => {
    screen.enter();
    draw();
  });
  draw();
  schedule(draw, REFRESH_MS);
}
