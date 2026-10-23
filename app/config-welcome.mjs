import { bindConfigWelcome } from './ui/config-welcome.mjs';
bindConfigWelcome({ get: id => globalThis.document.getElementById(id), choose: action => globalThis.configuration.choose(action) });
