export function buildLabel(build) {
  if (!build) return 'Construction inconnue';
  return `TVLens ${build.version} · ${build.commit.slice(0, 12)}${build.dirty ? ' · modifiée' : ''}`;
}
