import { DIRECTIONS } from './quality/metrics.mjs';

function suppressionCounts(suppressions, problems) {
  const counts = new Map();
  for (const [file, rules] of Object.entries(suppressions)) {
    for (const [rule, value] of Object.entries(rules)) {
      const key = `${file}:${rule}`;
      if (!Number.isInteger(value?.count) || value.count < 0) problems.push(`Gel invalide : ${key}`);
      counts.set(key, value?.count);
    }
  }
  return counts;
}

export function compareQualityPolicy(before, current) {
  const problems = [];
  const keys = new Set([...Object.keys(before.baseline), ...Object.keys(current.baseline)]);
  for (const key of keys) {
    const previous = before.baseline[key], now = current.baseline[key], direction = DIRECTIONS[key];
    if (!direction || !Number.isFinite(now) || now < 0) {
      problems.push(`Plancher absent ou invalide : ${key}`);
    } else if (previous !== undefined && (direction === 'max' ? now > previous : now < previous)) {
      problems.push(`Plancher relâché : ${key} : ${previous} → ${now}`);
    }
  }
  const oldCounts = suppressionCounts(before.suppressions, problems);
  for (const [key, count] of suppressionCounts(current.suppressions, problems)) {
    if (!oldCounts.has(key) || count > oldCounts.get(key)) problems.push(`Gel augmenté : ${key}`);
  }
  return problems;
}

export function validateFullCheck(report) {
  const problems = [];
  const steps = report?.steps ?? [];
  if (report?.ok !== true || steps.some(step => step.status !== 'ok')) problems.push('Contrôle incomplet ou en échec.');
  for (const name of ['règles par fichier', 'format', 'lint', 'gel du lint', 'cliquet', 'tests Python']) {
    if (!steps.some(step => step.name === name && step.status === 'ok')) problems.push(`Étape manquante : ${name}`);
  }
  if (!steps.some(step => /^tests JS \([1-9]\d* fichier\(s\)\)$/.test(step.name) && step.status === 'ok')) {
    problems.push('La suite JavaScript complète doit avoir été exécutée.');
  }
  return problems;
}
