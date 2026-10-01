import { copyFileSync, mkdirSync } from "node:fs";
const destination = new URL("../public/screens/", import.meta.url);
mkdirSync(destination, { recursive: true });
for (const file of [
  "direct.png",
  "memory.png",
  "floating-bar.png",
  "floating-chat.png",
]) {
  copyFileSync(
    new URL(`../../screenshots/current/${file}`, import.meta.url),
    new URL(file, destination),
  );
}
copyFileSync(
  new URL("../../screenshots/lg/chat.png", import.meta.url),
  new URL("lg-chat.png", destination),
);
copyFileSync(
  new URL("../../screenshots/lg/timeline.png", import.meta.url),
  new URL("lg-timeline.png", destination),
);
console.log("Presentation assets copied.");
