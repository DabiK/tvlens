const { createHash } = require("node:crypto");
const { validateRemote } = require("../adapters/remote-media.cjs");
const SEGMENTS_PATH = "/v1/segments";
const FUTURE_TOLERANCE_MS = 3000;
const MAX_ACCEPTED_BLOCKS = 100;

async function ingestBlock({ runtime, media, transport }, { body, raw, send }) {
  validateRemote(body);
  // L'admission métier refuse avant tout assemblage : session obsolète, archive, capture arrêtée ou disque plein.
  const session = runtime.admit(body.sessionId);
  if (body.endMs > session.watch.now() + FUTURE_TOLERANCE_MS)
    throw Error("Horodatage futur.");
  // Une TV qui relance sa capture n'envoie pas de pause : sa nouvelle capture numérote depuis une autre origine,
  // même pour la même session. Un bloc de l'ancienne capture rejoué ensuite est refusé par la session elle-même,
  // selon l'ordre d'observation.
  if (transport.epoch !== runtime.captureEpoch) {
    transport.accepted.clear();
    transport.lastSequence = -1;
    transport.epoch = runtime.captureEpoch;
  }
  const key = body.sessionId + ":" + body.sequence;
  const hash = createHash("sha256").update(raw).digest("hex");
  const prior = transport.accepted.get(key);
  if (prior)
    return send(
      prior.hash === hash ? 200 : 409,
      prior.hash === hash
        ? { id: prior.id, duplicate: true }
        : { error: "Séquence déjà utilisée avec un autre contenu." },
    );
  if (body.sequence <= transport.lastSequence)
    return send(409, { error: "Séquence ancienne." });
  if (transport.ingesting)
    return send(429, { error: "Préparation du passage précédent." });
  // Le runtime possède le bloc avant sa préparation : la fin de sa session arrête l'outil média par ce signal.
  // La déconnexion du client ne l'annule pas : le bloc est stocké et un nouvel envoi est répondu comme doublon.
  const operation = runtime.accept(body.sessionId);
  transport.ingesting = true;
  try {
    const input = await media.assemble(body, { signal: operation.controller.signal });
    const id = await runtime.ingest(input, operation);
    // Le numéro d'un bloc d'une ancienne capture ne marque pas la capture courante.
    if (runtime.current(operation)) {
      transport.accepted.set(key, { id, hash });
      transport.lastSequence = body.sequence;
      if (transport.accepted.size > MAX_ACCEPTED_BLOCKS)
        transport.accepted.delete(transport.accepted.keys().next().value);
    }
    return send(200, { id, duplicate: false });
  } finally {
    // Le créneau n'est libre qu'une fois la préparation réglée et ses fichiers retirés.
    transport.ingesting = false;
    runtime.finish(operation);
  }
}

function createIngestRoutes(dependencies) {
  return [{ method: "POST", path: SEGMENTS_PATH, handler: (context) => ingestBlock(dependencies, context) }];
}

module.exports = { createIngestRoutes, SEGMENTS_PATH };
