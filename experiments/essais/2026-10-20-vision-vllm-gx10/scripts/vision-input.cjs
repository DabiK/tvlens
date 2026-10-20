const path = require('node:path');

const CAPTURED = Symbol('prompt-captured');

async function capturePrompt(segment, repo) {
  const { CodexPerception } = require(path.join(repo, 'adapters/codex-perception.cjs'));
  const { LocalVlmAgent } = require(path.join(repo, 'adapters/local-vlm-agent.cjs'));
  let request;
  const agent = {
    prepareInstructions: LocalVlmAgent.prototype.prepareInstructions,
    answer: async input => {
      request = input;
      throw CAPTURED;
    },
    close: async () => {},
  };
  const perception = new CodexPerception({ agent });
  try {
    await perception.observeVisual(segment);
  } catch (error) {
    if (error !== CAPTURED) throw error;
  }
  if (!request) throw Error('PROMPT_CAPTURE_FAILED');
  return {
    instructions: request.instructions,
    outputSchema: request.outputSchema,
    frames: request.mediaInput.map(frame => frame.url),
  };
}

async function prepareCases(manifestPath, repo) {
  const { readJson, loadCase, sha256 } = require(path.join(repo, 'scripts/perception-replay-input.cjs'));
  const manifest = await readJson(manifestPath);
  if (manifest.value?.version !== 1 ||
      (manifest.value?.preparation !== undefined && manifest.value.preparation.complete !== true) ||
      !Array.isArray(manifest.value.cases) || manifest.value.cases.length < 1 || manifest.value.cases.length > 24) {
    throw Error('MANIFEST_INVALID');
  }
  const ids = new Set();
  const cases = [];
  for (const item of manifest.value.cases) {
    if (ids.has(item.id)) throw Error('DUPLICATE_ID');
    ids.add(item.id);
    const loaded = await loadCase(item, path.dirname(manifestPath));
    const prompt = await capturePrompt(loaded.segment, repo);
    cases.push({
      id: item.id,
      startMs: item.startMs,
      endMs: item.endMs,
      input: loaded.input,
      prompt,
      promptSha256: sha256(prompt.instructions),
      frameSha256: prompt.frames.map(sha256),
    });
  }
  return { manifestSha256: manifest.sha256, cases };
}

module.exports = { capturePrompt, prepareCases };
