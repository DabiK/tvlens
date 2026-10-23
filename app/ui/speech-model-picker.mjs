import { element as el } from './format.js';

const MAIN_CHOICES = ['tiny', 'base', 'small', 'medium', 'large-v3-turbo', 'large-v3'];
const size = bytes => `${Math.ceil(bytes / 1024 ** 2)} Mio`;

function modelOptions(select, models) {
  for (const [label, include] of [
    ['Modèles multilingues', model => MAIN_CHOICES.includes(model.id)],
    ['Variantes avancées : quantification, anglais et anciennes versions', model => !MAIN_CHOICES.includes(model.id)],
  ]) {
    const group = el('optgroup');
    group.label = label;
    for (const model of models.filter(include)) {
      const suffix = model.englishOnly ? ' · anglais uniquement' : '';
      const option = el('option', '', `${model.label} · ${size(model.bytes)}${suffix}${model.present ? ' · sur ce Mac' : ''}`);
      option.value = model.id;
      group.append(option);
    }
    select.append(group);
  }
}

export function speechModelPicker(speech, { button, bridge, get }) {
  const box = el('div', 'speech-model-picker');
  const label = el('label', '', 'Compromis vitesse et fidélité');
  const select = el('select');
  select.setAttribute('aria-label', 'Modèle de transcription');
  modelOptions(select, speech.models);
  select.value = speech.selectedId || 'base';
  label.append(select);
  const detail = el('p', 'hint');
  const languageLabel = el('label', '', 'Langue des paroles');
  const language = el('select');
  language.setAttribute('aria-label', 'Langue de transcription');
  for (const [value, text] of [['fr', 'Français'], ['en', 'Anglais'], ['auto', 'Détection automatique']]) {
    const option = el('option', '', text);
    option.value = value;
    language.append(option);
  }
  language.value = speech.language;
  languageLabel.append(language);
  const install = button('', () => {
    get('setup-state').textContent = 'Téléchargement ou vérification du modèle… Cela peut prendre plusieurs minutes.';
    return bridge.setupAction('download-model', { modelId: select.value, language: language.value });
  });
  const update = () => {
    const model = speech.models.find(item => item.id === select.value);
    const quantized = model.quantization ? ' Poids compressés : moins de mémoire, perte de fidélité possible.' : '';
    detail.textContent = `${model.detail}${quantized} La vitesse et la fidélité réelles dépendent du programme et du Mac.`;
    install.textContent = model.present ? 'Vérifier et utiliser ce modèle' : `Télécharger et utiliser · ${size(model.bytes)}`;
  };
  select.onchange = update;
  update();
  const actions = el('div', 'setup-actions');
  actions.append(install, button('Enregistrer la langue seule', () => bridge.setupAction('speech-language', { language: language.value })));
  box.append(label, detail, languageLabel, actions,
    el('p', 'hint', 'Pour un programme français, choisis Français et un modèle multilingue. Les variantes .en ne transcrivent que l’anglais.'),
    el('p', 'hint', 'Les modèles restent sur ce Mac pour les réutiliser. Ferme la session avant de modifier ces réglages, puis rouvre TVLens.'));
  return box;
}
