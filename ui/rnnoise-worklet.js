// RNNoise (open-source ML noise suppression, runs locally, no account needed),
// running on the audio rendering thread as an AudioWorklet. The main thread
// never touches audio samples, so a busy UI can't make your mic glitch, and
// processing happens in the browser's 128-sample render quanta — the only
// added delay is the one 480-sample RNNoise frame being collected (10 ms at
// 48 kHz), versus ~85 ms for the 4096-sample ScriptProcessorNode this replaced.
//
// The WASM bytes are posted in from the main thread (worklets can't fetch) and
// only when suppression is actually on, since the module reserves 16 MB up front.
// It only imports two helpers, so it's instantiated directly rather than through
// Emscripten's generated loader.

const FRAME = 480; // required by RNNoise, at 48 kHz
const FIFO_SIZE = FRAME * 4;

class RNNoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.enabled = false; // denoise, or pass straight through
    this.muted = false;
    this.wasm = null; // { exports, state, inPtr, outPtr, heap }
    this.frameIn = new Float32Array(FRAME);
    this.frameLen = 0;
    // Processed samples waiting to go out. Starts primed with one frame of
    // silence: with that head start, input in and output out at the same rate
    // can never drain it (see reset), so there's never a gap mid-stream.
    this.fifo = new Float32Array(FIFO_SIZE);
    this.reset();
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  reset() {
    this.frameLen = 0;
    this.fifo.fill(0);
    this.fifoRead = 0;
    this.fifoLen = FRAME;
  }

  async onMessage(msg) {
    if (msg.type === 'enabled') {
      this.enabled = msg.value;
      this.reset();
    } else if (msg.type === 'muted') {
      this.muted = msg.value;
    } else if (msg.type === 'reset') {
      this.reset();
    } else if (msg.type === 'wasm' && !this.wasm) {
      try {
        let memory = null;
        const { instance } = await WebAssembly.instantiate(msg.bytes, {
          a: {
            a: () => false, // emscripten_resize_heap: the fixed 16 MB is far more than RNNoise uses
            b: (dest, src, num) => new Uint8Array(memory.buffer).copyWithin(dest, src, src + num), // emscripten_memcpy_big
          },
        });
        const x = instance.exports;
        memory = x.c;
        x.d(); // static constructors
        const state = x.f(0); // rnnoise_create(default model)
        const inPtr = x.g(FRAME * 4); // malloc
        const outPtr = x.g(FRAME * 4);
        this.wasm = { process: x.j, memory, state, inPtr, outPtr, heap: new Float32Array(memory.buffer) };
        this.reset();
        this.port.postMessage({ type: 'ready' });
      } catch (err) {
        this.port.postMessage({ type: 'failed', error: String(err) });
      }
    }
  }

  denoiseFrame() {
    const w = this.wasm;
    if (w.heap.buffer !== w.memory.buffer) w.heap = new Float32Array(w.memory.buffer);
    const inBase = w.inPtr / 4;
    const outBase = w.outPtr / 4;
    // RNNoise expects roughly int16-scale samples, hence the *32768 / /32768.
    for (let i = 0; i < FRAME; i++) w.heap[inBase + i] = this.frameIn[i] * 32768;
    w.process(w.state, w.outPtr, w.inPtr);
    for (let i = 0; i < FRAME; i++) {
      this.fifo[(this.fifoRead + this.fifoLen + i) % FIFO_SIZE] = w.heap[outBase + i] / 32768;
    }
    this.fifoLen += FRAME;
  }

  process(inputs, outputs) {
    const output = outputs[0][0];
    if (!output) return true;
    const input = inputs[0][0];
    if (!input || this.muted) {
      output.fill(0); // no mic plugged in (between calls), or muted — nothing to denoise
      return true;
    }
    if (!this.enabled || !this.wasm) {
      output.set(input);
      return true;
    }
    for (let i = 0; i < input.length; i++) {
      this.frameIn[this.frameLen++] = input[i];
      if (this.frameLen === FRAME) {
        this.denoiseFrame();
        this.frameLen = 0;
      }
    }
    // frameLen + fifoLen stays at FRAME + input.length here, and frameLen is
    // always below FRAME, so the FIFO always holds more than one quantum.
    for (let i = 0; i < output.length; i++) {
      output[i] = this.fifo[this.fifoRead];
      this.fifoRead = (this.fifoRead + 1) % FIFO_SIZE;
    }
    this.fifoLen -= output.length;
    return true;
  }
}

registerProcessor('rnnoise', RNNoiseProcessor);
