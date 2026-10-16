// Wording shared by the views of the TV panel: a position in the video and a counted noun. A classic
// script, not a module: index.html loads it before its first consumer, and Node tests read it through
// CommonJS.
(function (root) {
  "use strict";
  function finite(value) {
    return typeof value === "number" && isFinite(value);
  }
  function two(value) {
    return String(value).padStart(2, "0");
  }
  // Position in the video or elapsed time: 12:40, and 1:32:15 past the hour. Anything that is not a
  // finite number reads as 0:00.
  function clock(ms) {
    var s = Math.max(0, Math.floor((finite(ms) ? ms : 0) / 1000)),
      h = Math.floor(s / 3600),
      m = Math.floor(s / 60) % 60;
    return (h ? h + ":" + two(m) : String(m)) + ":" + two(s % 60);
  }
  // "1 passage", "0 passage", "2 passages"; without a plural form, the singular takes an s.
  function plural(count, one, many) {
    return count + " " + (count > 1 ? many || one + "s" : one);
  }
  var api = { finite: finite, clock: clock, plural: plural };
  root.TVLensText = api;
  if (typeof module === "object" && module && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
