class TVLensPCM extends AudioWorkletProcessor {
  constructor() {
    super(); this.buffer = new Float32Array(4096); this.offset = 0;
    this.port.onmessage = event => {
      if (event.data.type === 'flush') { this.flush(); this.port.postMessage({ type: 'flushed', id: event.data.id }); }
    };
  }
  flush() {
    if (!this.offset) return;
    const samples = this.buffer.slice(0, this.offset);
    const rms = Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);
    this.port.postMessage({ type: 'samples', samples, rms }, [samples.buffer]);
    this.offset = 0;
  }
  process(inputs) {
    const channels = inputs[0];
    if (channels?.length) {
      for (let i = 0; i < channels[0].length; i++) {
        let value = 0;
        for (const channel of channels) value += channel[i];
        this.buffer[this.offset++] = value / channels.length;
        if (this.offset === this.buffer.length) this.flush();
      }
    }
    return true;
  }
}
registerProcessor('tvlens-pcm', TVLensPCM);
