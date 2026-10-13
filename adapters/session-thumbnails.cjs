const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

// Reduced images are kept with their session until it is deleted. They live in thumbs/: the cleanup
// of a former version only knows thumbnails/, which is still read when a session comes from it.
class SessionThumbnails {
  constructor(root, { legacyRoot = null } = {}) {
    this.root = root;
    this.legacyRoot = legacyRoot;
    this.pending = Promise.resolve();
    this.closed = false;
    this.bytes = 0;
  }
  file(id) {
    if (!/^moment-\d+$/.test(id))
      throw Error("Identifiant de miniature invalide.");
    return path.join(this.root, id + ".jpg");
  }
  put(id, dataUrl) {
    const operation = this.pending
      .catch(() => {})
      .then(async () => {
        if (this.closed) throw Error("Session terminée.");
        if (
          typeof dataUrl !== "string" ||
          !dataUrl.startsWith("data:image/jpeg;base64,")
        )
          throw Error("Image JPEG requise.");
        const bytes = Buffer.from(dataUrl.slice(23), "base64");
        if (bytes.length > 1500000) throw Error("Image trop volumineuse.");
        const image = await sharp(bytes, { limitInputPixels: 1920 * 1080 })
          .resize({
            width: 320,
            height: 180,
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: 65 })
          .toBuffer();
        if (this.closed) throw Error("Session terminée.");
        await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
        await fs.writeFile(this.file(id), image, { mode: 0o600 });
        this.bytes += image.length;
      });
    this.pending = operation;
    return operation;
  }
  read(id) {
    if (this.closed) throw Error("Session terminée.");
    const file = this.file(id);
    return fs.readFile(file).catch((error) => {
      if (!this.legacyRoot || error.code !== "ENOENT") throw error;
      return fs.readFile(path.join(this.legacyRoot, path.basename(file)));
    });
  }
  // End of capture: no later write, and the images stay on disk with the session.
  async close() {
    this.closed = true;
    await this.pending.catch(() => {});
  }
  // Explicit purge of this session's images, at both locations.
  async clear() {
    await this.close();
    for (const dir of [this.root, this.legacyRoot])
      if (dir) await fs.rm(dir, { recursive: true, force: true });
    this.bytes = 0;
  }
}
module.exports = { SessionThumbnails };
