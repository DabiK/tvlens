// Une instance par source : une poussée ou une nouvelle lecture dépasse toutes les lectures déjà parties.
export function createFreshness() {
  let revision = 0;

  function pushed() {
    revision++;
  }

  function beginRead() {
    const own = ++revision;
    return () => own === revision;
  }

  return { pushed, beginRead };
}
