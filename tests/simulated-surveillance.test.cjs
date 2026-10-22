const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SimulatedSurveillanceAgent } = require('../adapters/simulated-surveillance-agent.cjs');
const { simulatedPerception } = require('../adapters/simulated-providers.cjs');

test('simulated surveillance reads visual evidence even when speech is present', async () => {
  const perception = simulatedPerception();
  const speech = await perception.transcribe({ audio: Buffer.from('synthetic audio') });
  const vision = await perception.observeVisual({ frames: ['one', 'two'], observation: speech.observation });
  const passages = [{ id: 'moment-1', ...vision.observation }];
  const agent = new SimulatedSurveillanceAgent();
  const signal = await agent.detect({ instruction: 'Préviens-moi quand on parle d’images', passages });
  assert.deepEqual(signal.claims.map(c => [c.action, c.quote]), [['signal', '2 images reçues.']]);
  const verified = await agent.detect({ instruction: 'Vérifie les chiffres annoncés.', passages });
  assert.deepEqual(verified.claims.map(c => [c.action, c.quote]), [['verify', '2 images reçues.']]);
  const spoken = await agent.detect({ instruction: 'Préviens-moi quand on parle de cercle', passages });
  assert.deepEqual(spoken.claims.map(c => c.quote), ['Un cercle se déplace sur un fond bleu.']);
});

test('the same simulated quote in speech and vision is proposed only once', async () => {
  const agent = new SimulatedSurveillanceAgent(), quote = 'Le taux est de 12 pour cent.';
  const { claims } = await agent.detect({ instruction: 'Vérifie les chiffres.', passages: [{ id: 'moment-1', transcript: quote, visual: quote }] });
  assert.deepEqual(claims.map(c => c.quote), [quote]);
});
