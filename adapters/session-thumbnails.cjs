const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

// Reduced images have a session lifetime independent from the five-minute raw buffer.
class SessionThumbnails {
  constructor(root) {
    this.root = root;
    this.pending = Promise.resolve();
    this.closed = false;
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
      });
    this.pending = operation;
    return operation;
  }
  read(id) {
    if (this.closed) throw Error("Session terminée.");
    return fs.readFile(this.file(id));
  }
  async clear() {
    this.closed = true;
    await this.pending.catch(() => {});
    await fs.rm(this.root, { recursive: true, force: true });
  }
}
module.exports = { SessionThumbnails };
