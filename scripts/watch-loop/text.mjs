// Texte et largeur communs au rendu et au cycle de vie du terminal.
export const DEFAULT_COLUMNS = 100;
// Les textes de fichiers ou de sessions ne peuvent ni déplacer le curseur ni couper une ligne.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;
export const plain = (text) => String(text).replace(CONTROL_CHARACTERS, " ");
