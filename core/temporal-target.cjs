function resolveTemporalTarget(question, segments, anchorMs) {
  const q = question.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const numbers = { une: 1, un: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
    dix: 10, quinze: 15, vingt: 20, trente: 30, quarante: 40, cinquante: 50 };
  const relative = q.match(new RegExp(
    "(?:il y a|y a|depuis)\\s+(\\d+(?:[.,]\\d+)?|une?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix" +
    "|quinze|vingt|trente|quarante|cinquante)\\s*(minute|seconde|min|sec)"
  ));
  const absolute = q.match(/(?:a|vers|moment)\s+(\d{1,3}):(\d{2})/);
  let target;
  if (relative) target = anchorMs - (numbers[relative[1]] ?? Number(relative[1].replace(',', '.'))) * (relative[2].startsWith('min') ? 60000 : 1000);
  if (absolute) target = (Number(absolute[1]) * 60 + Number(absolute[2])) * 1000;
  if (target !== undefined) return target;
  if (/premier passage|tout debut/.test(q) && segments.length) return segments[0].startMs + 1;
}
module.exports = { resolveTemporalTarget };
