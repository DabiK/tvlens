// Unités et fenêtre commune à la vue et au rendu.
export const MS_PER_SECOND = 1000;
export const SECONDS_PER_MINUTE = 60;
export const MINUTES_PER_HOUR = 60;
export const MS_PER_HOUR = MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND;
// Sans lancement connu, la nuit couvre les heures qui précèdent le dernier événement.
export const RECENT_WINDOW_MS = 12 * MS_PER_HOUR;
