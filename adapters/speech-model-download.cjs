const fs = require('node:fs/promises');
const { createReadStream, createWriteStream } = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin';
const MODEL_SHA256 = '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe';
const MAX_BYTES = 200 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;

async function fileHash(file) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest('hex');
}

async function installSpeechModel(destination, {
  fetchModel = fetch, expected = MODEL_SHA256, signal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
} = {}) {
  if (await fileHash(destination).catch(() => null) === expected) return destination;
  const temporary = `${destination}.${randomUUID()}.partial`;
  let problem;
  try {
    await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    const response = await fetchModel(MODEL_URL, { signal });
    if (!response.ok || !response.body) throw new Error('download unavailable');
    let total = 0;
    const bounded = new Transform({ transform(bytes, encoding, callback) {
      total += bytes.length;
      callback(total > MAX_BYTES ? new Error('download too large') : null, bytes);
    } });
    await pipeline(Readable.fromWeb(response.body), bounded, createWriteStream(temporary, { flags: 'wx', mode: 0o600 }), { signal });
    if (await fileHash(temporary) !== expected)
      throw Object.assign(new Error('Empreinte du modèle inattendue. Le fichier a été écarté.'), { code: 'TVLENS_MODEL_HASH_MISMATCH' });
    await fs.rename(temporary, destination);
  } catch (error) {
    problem = error;
  }
  try { await fs.rm(temporary, { force: true }); }
  catch (error) { problem ||= error; }
  if (problem) {
    if (problem.code === 'TVLENS_MODEL_HASH_MISMATCH') throw problem;
    throw Object.assign(new Error('Téléchargement interrompu. Vérifie la connexion et l’espace disque, puis réessaie.'), {
      code: 'TVLENS_MODEL_DOWNLOAD_FAILED', cause: problem,
    });
  }
  return destination;
}

module.exports = { installSpeechModel, MODEL_URL, MODEL_SHA256 };
