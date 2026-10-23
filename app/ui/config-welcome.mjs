export function bindConfigWelcome({ get, choose }) {
  let busy = false;
  async function select(action) {
    if (busy) return;
    busy = true;
    get('restore').disabled = get('skip').disabled = true;
    get('feedback').textContent = action === 'restore' ? 'Déverrouillage demandé…' : 'Ouverture de TVLens…';
    try {
      const result = await choose(action);
      get('feedback').textContent = result?.error || 'Ouverture de TVLens…';
      if (result?.ready) return;
    } catch {
      get('feedback').textContent = 'La demande n’a pas abouti. Tu peux réessayer ou continuer sans charger les réglages.';
    }
    busy = false;
    get('restore').disabled = get('skip').disabled = false;
  }
  get('restore').onclick = () => select('restore');
  get('skip').onclick = () => select('skip');
}
