// Decorates an inspector that can be told to serve nothing more. Once revoked, a call is refused before it
// reaches the decorated inspector, cached answers included; a call still running is told through its signal,
// and whatever it brings back all the same is refused and left out of the cache of the decorated inspector.
class RevocableInspector {
  #decorated;
  #message;
  #revocation = new AbortController();

  constructor(decorated, message) {
    this.#decorated = decorated;
    this.#message = message;
  }

  // What a host reads from the inspector of a session stays the same through the decorator.
  get inner() {
    return this.#decorated.inner;
  }

  get cache() {
    return this.#decorated.cache;
  }

  get hits() {
    return this.#decorated.hits;
  }

  get misses() {
    return this.#decorated.misses;
  }

  async inspect(input) {
    this.#refuseWhenRevoked();
    const signal = input.signal
      ? AbortSignal.any([input.signal, this.#revocation.signal])
      : this.#revocation.signal;
    let result;
    try {
      result = await this.#decorated.inspect({ ...input, signal });
    } catch (error) {
      // A revoked call is refused with the message, whatever failure the decorated inspector reports.
      this.#refuseWhenRevoked();
      throw error;
    }
    this.#refuseWhenRevoked();
    return result;
  }

  // Synchronous on purpose: the cache is already empty when the caller goes on, before any call in flight ends.
  revoke() {
    if (this.#revocation.signal.aborted) return;
    this.#revocation.abort(new Error(this.#message));
    this.#emptyCache();
  }

  #refuseWhenRevoked() {
    if (!this.#revocation.signal.aborted) return;
    this.#emptyCache();
    throw new Error(this.#message);
  }

  #emptyCache() {
    this.#decorated.cache?.clear?.();
  }
}

module.exports = { RevocableInspector };
