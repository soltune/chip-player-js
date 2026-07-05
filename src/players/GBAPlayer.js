import autoBind from 'auto-bind';
import Player from "./Player.js";
import {CATALOG_PREFIX} from "../config";
const encoding = require('encoding-japanese');

const fileExtensions = [
  'gsf', 'minigsf'
];
const CHANNEL_NAME = ['Square', 'Square', 'Wave', 'Noise', 'PCM', 'PCM'];
const SAMPLES_PER_BUFFER = 16384; // allowed: buffer sizes: 256, 512, 1024, 2048, 4096, 8192, 16384
// Total MEMFS budget for registered catalog files (minigsf/gsflib). Files are
// kept as a refetch-avoidance cache but wasm memory never shrinks, so playing
// many different games would otherwise grow the heap unboundedly.
const MAX_MEMFS_BYTES = 64 * 1024 * 1024;
const GBA_CHANNEL_COUNT = 2; // GBA DirectSound always outputs interleaved stereo (L/R/L/R...)
const SOUND_ENHANCE_PRESETS = {
  '0': { treble:  0, presence: 0, exciter: 0 }, // Off
  '1': { treble:  4, presence: 2, exciter: 3 }, // Light
  '2': { treble:  7, presence: 4, exciter: 6 }, // Medium
  '3': { treble: 11, presence: 6, exciter: 9 }, // Strong
};

// RBJ audio-EQ-cookbook biquad (Direct Form 1). Replaces the former Web Audio
// BiquadFilterNodes: under the upstream player architecture, players render
// into a shared ScriptProcessorNode and cannot own graph nodes.
class Biquad {
  constructor() {
    this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0;
    this.reset();
  }

  reset() {
    this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0;
  }

  setPeaking(sampleRate, freq, q, gainDb) {
    const A = Math.pow(10, gainDb / 40);
    const w0 = 2 * Math.PI * freq / sampleRate;
    const alpha = Math.sin(w0) / (2 * q);
    const cosw0 = Math.cos(w0);
    const a0 = 1 + alpha / A;
    this.b0 = (1 + alpha * A) / a0;
    this.b1 = (-2 * cosw0) / a0;
    this.b2 = (1 - alpha * A) / a0;
    this.a1 = (-2 * cosw0) / a0;
    this.a2 = (1 - alpha / A) / a0;
  }

  setHighShelf(sampleRate, freq, gainDb) {
    const A = Math.pow(10, gainDb / 40);
    const w0 = 2 * Math.PI * freq / sampleRate;
    const cosw0 = Math.cos(w0);
    const S = 1; // shelf slope, matches BiquadFilterNode default behavior closely enough
    const alpha = Math.sin(w0) / 2 * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2);
    const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;
    const a0 = (A + 1) - (A - 1) * cosw0 + twoSqrtAAlpha;
    this.b0 = (A * ((A + 1) + (A - 1) * cosw0 + twoSqrtAAlpha)) / a0;
    this.b1 = (-2 * A * ((A - 1) + (A + 1) * cosw0)) / a0;
    this.b2 = (A * ((A + 1) + (A - 1) * cosw0 - twoSqrtAAlpha)) / a0;
    this.a1 = (2 * ((A - 1) - (A + 1) * cosw0)) / a0;
    this.a2 = ((A + 1) - (A - 1) * cosw0 - twoSqrtAAlpha) / a0;
  }

  process(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2
      - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

class GBALibWrapper {
  constructor(chipCore) {
    this.gbalib = chipCore;
    this.fs = this.gbalib.FS;
    this.currentFile = null;
    // fullpath -> byte size; Map insertion order doubles as LRU recency order.
    this.fileLRU = new Map();
  }

  touchFileLRU(fullpath, size) {
    const known = this.fileLRU.get(fullpath);
    this.fileLRU.delete(fullpath);
    const s = (size !== undefined) ? size : known;
    if (s !== undefined) {
      this.fileLRU.set(fullpath, s);
    }
  }

  evictLRUFiles() {
    let total = 0;
    this.fileLRU.forEach(size => { total += size; });
    // Keep at least 2 entries: the current track and its lib are always the
    // most recently touched files.
    for (const [fullpath, size] of this.fileLRU) {
      if (total <= MAX_MEMFS_BYTES || this.fileLRU.size <= 2) break;
      try {
        this.fs.unlink(fullpath);
      } catch (e) {
        // already gone; just drop the entry
      }
      this.fileLRU.delete(fullpath);
      total -= size;
    }
  }

  getAudioBuffer() {
    var ptr = this.gbalib.ccall('gba_get_audio_buffer', 'number');
    // make it a this.Module.HEAP16 pointer
    return ptr >> 1;	// 2 x 16 bit samples
  }

  getAudioBufferLength() {
    return this.gbalib.ccall('gba_get_audio_buffer_length', 'number');
  }

  computeAudioSamples() {
    return this.gbalib.ccall('gba_compute_audio_samples', 'number');
  }

  getMaxPlaybackPosition() {
    return this.gbalib.ccall('gba_get_max_position', 'number');
  }

  getPlaybackPosition() {
    return this.gbalib.ccall('gba_get_current_position', 'number');
  }

  seekPlaybackPosition(ms) {
    this.gbalib.ccall('gba_seek_position', 'number', ['number'], [ms]);
  }

  getMetaData() {
    const metaData = [];
    const numOfInfo = 7;
    const trackInfo = this.gbalib.ccall('gba_get_track_info', 'number');

    const info = this.gbalib.HEAP32.subarray(trackInfo >> 2, (trackInfo >> 2) + numOfInfo);
    for (let i = 0; i < numOfInfo; i++) {
      const raw = [];
      for (let j = 0; j < 256; j++) {
        let char = this.gbalib.getValue(info[i] + j, 'i8');
        if (char === 0) {
          break;
        }
        raw.push(char & 0xFF);
      }
      let value = encoding.convert(raw, {to: 'UNICODE', type: 'string'});
      if (i === 0 && !value.length) {
        [value, value] = this.getPathAndFilename(this.currentFile);
      }
      metaData.push(value);
    }
    return metaData;
  }

  getAbsolutePath(paths) {
    const delimiter = '/';
    let absolutePath = '';

    paths.forEach((path, index) => {
      if (index === 0) {
        if (path.startsWith('http') || path.startsWith(delimiter)) {
          absolutePath += path;
        } else {
          absolutePath += delimiter + path;
        }
      } else {
        if (absolutePath.endsWith(delimiter) || path.startsWith(delimiter)) {
          absolutePath += path;
        } else {
          absolutePath += delimiter + path;
        }
      }
    });
    return absolutePath;
  }

  loadMusicData(sampleRate, path, filename) {
    //filename = this.getAbsolutePath([path, filename]);
    const result = this.gbalib.ccall('gba_init', 'number', ['string', 'string'], [path, filename]);
    if (result === 0) { // result -> 0: success, -1: error
      this.currentFile = filename;
    }

    return result;
  }

  teardown() {
    this.currentFile = null;
    this.gbalib.ccall('gba_teardown', 'number');	// just in case
  }

  getSampleRate() {
    return this.gbalib.ccall('gba_get_sample_rate', 'number');
  }

  getPathAndFilename(filename) {
    const sp = filename.split('/');
    const fn = sp[sp.length - 1];
    let path = filename.substring(0, filename.lastIndexOf("/"));
    if (path.length) path = path + "/";

    return [path, fn];
  }

  isClosed() {
    return this.currentFile === null;
  }

  setVoices(voices) {
    this.gbalib.ccall('gba_set_mask', null, ['number'], [voices]);
  }

  setTempo(tempo) {
  }

  getDelegate() {
    return this.gbalib;
  }

  existsFileData(path, filename) {
    try {
      const exists = this.fs.readdir(path).includes(filename);
      if (exists) {
        this.touchFileLRU(path + '/' + filename);
      }
      return exists;
    } catch (e) {
      return false; // given path does not exist
    }
  }

  registerFileData(path, filename, data) {
    try {
      let parent = '.';
      path.split('/').forEach((pathToken) => {  // create directories recursive
        if (pathToken.length > 0 && this.fs.readdir(parent).indexOf(pathToken) < 0) {
          this.fs.mkdir(parent + '/' + pathToken);
        }
        parent += '/' + pathToken;
      });
    } catch (ignore) {
    }
    try {
      this.fs.writeFile(path + '/' + filename, new Uint8Array(data));
    } catch (e) {
      // file may already exist, e.g. drag/dropped again.. just keep entry
      this.touchFileLRU(path + '/' + filename);
      return false;
    }
    this.touchFileLRU(path + '/' + filename, data.byteLength);
    this.evictLRUFiles();
    return true;
  }
}

export default class GBAPlayer extends Player {
  constructor(...args) {
    super(...args);
    autoBind(this);
    this.core.gbaFileRequestCallback = this.fileRequestCallback;

    this.playerKey = 'gba';
    this.name = 'GBA Player';

    this.lib = new GBALibWrapper(this.core);
    this.fs = this.lib.fs;
    this.inputSampleRate = this.lib.getSampleRate();
    this.channels = [];
    this.lastLoadedFilename = null;

    // EQ filter chain (Approach 1) - in-process biquads, one pair per channel
    this.eqPresence = [new Biquad(), new Biquad()];
    this.eqTreble = [new Biquad(), new Biquad()];
    this.eqActive = false;

    this.resampleBuffer = this.allocResampleBuffer(0);
    this.isStereo = true; // updated per callback in processAudioInner

    this.paused = true;
    this.fileExtensions = fileExtensions;
    this.tempo = 1.0;
    this.isFadingOut = false;
    this.fadeOutStartMs = 0;
    this.currentPlaytime = 0;

    this.numberOfSamplesToRender = 0;
    this.sourceBufferIdx = 0;
    this.sourceBuffer = null;
    this.sourceBufferLen = 0;

    this.params = {};
    this.voiceMask = [];

  }

  processAudioInner(channels) {
    this.channels = channels;
    this.isStereo = channels.length === 2;

    if (this.paused) {
      for (let i = 0; i < this.channels.length; i++) {
        this.channels[i].fill(0);
      }
      return;
    }

    const outSize = this.channels[0].length;
    this.numberOfSamplesRendered = 0;
    const fadeOutMs = 2000;

    while (this.numberOfSamplesRendered < outSize) {
      if (this.numberOfSamplesToRender === 0) {

        let finished = false;
        this.currentPlaytime = Math.max(this.getPositionMs(), this.currentPlaytime);
        const duration = this.getDurationMs();

        finished = (this.currentPlaytime >= duration + fadeOutMs);
        if (!finished) {
          if (this.currentPlaytime >= duration && !this.isFadingOut) {
            this.setFadeout(this.currentPlaytime);
          }
          finished = (this.lib.computeAudioSamples() === 1);
        }

        if (finished) {
          // no frame left
          this.fillEmpty(outSize);
          this.stop();
          return;
        }

        // refresh just in case they are not using one fixed buffer..
        this.sourceBuffer = this.lib.getAudioBuffer();
        this.sourceBufferLen = this.lib.getAudioBufferLength();

        this.numberOfSamplesToRender = this.getResampledAudio();
        this.applyExciter(this.resampleBuffer, this.numberOfSamplesToRender);
        this.sourceBufferIdx = 0;

        if (this.isFadingOut) {
          const current = this.currentPlaytime - duration;
          const ratio = Math.max((fadeOutMs - current) / fadeOutMs, 0);
          // In-place: .map() would allocate a new Float32Array per audio
          // callback, causing GC churn on the audio path.
          const buf = this.resampleBuffer;
          const n = this.numberOfSamplesToRender * this.channels.length;
          for (let i = 0; i < n; i++) {
            buf[i] *= ratio;
          }
        }
      }

      if (this.isStereo) {
        this.copySamplesStereo();
      } else {
        this.copySamplesMono();
      }
    }

    // EQ pass over the rendered block (replaces the old BiquadFilterNode chain).
    this.applyEQ(channels);
  }

  applyEQ(channels) {
    if (!this.eqActive) return;
    for (let ch = 0; ch < channels.length; ch++) {
      const pf = this.eqPresence[ch];
      const tf = this.eqTreble[ch];
      const buf = channels[ch];
      for (let i = 0; i < buf.length; i++) {
        buf[i] = tf.process(pf.process(buf[i]));
      }
    }
  }

  getResampledAudio(input, len) {
    return this.getResampledFloats(this.sourceBuffer, this.sourceBufferLen, this.sampleRate, this.inputSampleRate);
  }

  getCopiedAudio(input, len, resampleOutput) {
    // just copy the rescaled values so there is no need for special handling in playback loop
    // HEAP16 is re-fetched per block: memory growth may detach an old view,
    // but no wasm call happens inside the loop, so a block-local view is safe.
    const heap = this.lib.getDelegate().HEAP16;
    for (let i = 0; i < len * this.channels.length; i++) {
      resampleOutput[i] = heap[input + i] / 0x8000;
    }
    return len;
  }

  readFloatSample(buffer, idx) {
    return (this.lib.getDelegate().HEAP16[buffer + idx]) / 0x8000;
  }

  allocResampleBuffer(s) {
    return new Float32Array(s);
  }

  getResampledFloats(input, len, sampleRate, inputSampleRate) {
    let resampleLen = Math.round(len * sampleRate / inputSampleRate);
    const bufSize = resampleLen * this.channels.length;	// for each of the x channels

    if (bufSize > this.resampleBuffer.length) {
      this.resampleBuffer = this.allocResampleBuffer(bufSize);
    }

    if (sampleRate === inputSampleRate) {
      resampleLen = this.getCopiedAudio(input, len, this.resampleBuffer);
    } else {
      // only mono and interleaved stereo data is currently implemented..
      this.resampleToFloat(this.channels, 0, input, len, this.resampleBuffer, resampleLen);
      if (this.isStereo) {
        this.resampleToFloat(this.channels, 1, input, len, this.resampleBuffer, resampleLen);
      }
    }
    return resampleLen;
  }

  applyExciter(buffer, numSamples) {
    const preset = SOUND_ENHANCE_PRESETS[this.params.sound_enhance] || SOUND_ENHANCE_PRESETS['0'];
    const mixLevel = preset.exciter / 10 * 0.4; // 0..1 scaled to 0..0.4
    if (mixLevel === 0) return;

    const numChannels = this.isStereo ? 2 : 1;
    // Derive HPF coefficient from target cutoff fc and actual device sample rate.
    // Formula: α = fs / (fs + 2π × fc), gives consistent ~2500Hz cutoff at any sample rate.
    const fc = 2500;
    const alpha = this.sampleRate / (this.sampleRate + 2 * Math.PI * fc);

    for (let i = 0; i < numSamples; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const idx = i * numChannels + ch;
        const x = buffer[idx];

        // 1-pole high-pass: y[n] = α * (y[n-1] + x[n] - x[n-1])
        const hf = alpha * (this.hpfState[ch] + x - this.hpfPrev[ch]);
        this.hpfPrev[ch] = x;
        this.hpfState[ch] = hf;

        // Soft clipping generates odd harmonics; drive=3 gives subtle saturation
        const drive = 3.0;
        const excited = Math.tanh(hf * drive) / drive;

        buffer[idx] = x + excited * mixLevel;
      }
    }
  }

  resampleToFloat(channels, channelId, inputPtr, len, resampleOutput, resampleLen) {
    const ratio = len / resampleLen;
    // Block-local heap view: per-sample readFloatSample() calls cost a
    // this.lib.getDelegate().HEAP16 property chain 4x per output sample.
    // No wasm call happens inside the loop, so the view cannot detach.
    const heap = this.lib.getDelegate().HEAP16;
    const base = inputPtr + channelId;
    for (let i = 0; i < resampleLen; i++) {
      const pos = i * ratio;
      const index = Math.floor(pos);
      const frac = pos - index;

      // Use GBA_CHANNEL_COUNT as the input stride (GBA always outputs interleaved stereo),
      // independent of the output channel count (channels.length).
      const i0 = Math.max(index - 1, 0);
      const i1 = index;
      const i2 = Math.min(index + 1, len - 1);
      const i3 = Math.min(index + 2, len - 1);

      const p0 = heap[base + i0 * GBA_CHANNEL_COUNT] / 0x8000;
      const p1 = heap[base + i1 * GBA_CHANNEL_COUNT] / 0x8000;
      const p2 = heap[base + i2 * GBA_CHANNEL_COUNT] / 0x8000;
      const p3 = heap[base + i3 * GBA_CHANNEL_COUNT] / 0x8000;

      // Catmull-Rom cubic interpolation (4-point)
      const t = frac;
      const t2 = t * t;
      const t3 = t2 * t;
      const sample = 0.5 * (
        (2 * p1) +
        (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3
      );

      // Catmull-Rom can overshoot at sharp transients, so clamp to valid range.
      resampleOutput[(i * channels.length) + channelId] = Math.max(-1.0, Math.min(1.0, sample));
    }
  }

  copySamplesStereo() {
    const outSize = this.channels[0].length;
    const availableSpace = Math.min(this.numberOfSamplesToRender, outSize - this.numberOfSamplesRendered);
    
    for (let i = 0; i < availableSpace; i++) {
      const l = this.resampleBuffer[this.sourceBufferIdx++];
      const r = this.resampleBuffer[this.sourceBufferIdx++];
      
      // クリッピング防止
      this.channels[0][i + this.numberOfSamplesRendered] = Math.max(-1.0, Math.min(1.0, l));
      this.channels[1][i + this.numberOfSamplesRendered] = Math.max(-1.0, Math.min(1.0, r));
    }
    
    this.numberOfSamplesToRender -= availableSpace;
    this.numberOfSamplesRendered += availableSpace;
  }

  copySamplesMono() {
    const outSize = this.channels[0].length;
    const availableSpace = Math.min(this.numberOfSamplesToRender, outSize - this.numberOfSamplesRendered);
    
    for (let i = 0; i < availableSpace; i++) {
      const sample = this.resampleBuffer[this.sourceBufferIdx++];
      // クリッピング防止
      this.channels[0][i + this.numberOfSamplesRendered] = Math.max(-1.0, Math.min(1.0, sample));
    }
    
    this.numberOfSamplesToRender -= availableSpace;
    this.numberOfSamplesRendered += availableSpace;
  }

  fillEmpty(outSize) {
    const availableSpace = outSize - this.numberOfSamplesRendered;

    for (let i = 0; i < availableSpace; i++) {
      for (let j = 0; j < this.channels.length; j++) {
        this.channels[j][i + this.numberOfSamplesRendered] = 0;
      }
    }
    this.numberOfSamplesToRender = 0;
    this.numberOfSamplesRendered = outSize;
  }

  resetSampleRate(sampleRate, inputSampleRate) {
    if (sampleRate > 0) {
      this.sampleRate = sampleRate;
    }
    if (inputSampleRate > 0) {
      this.inputSampleRate = inputSampleRate;
    }

    const s = Math.round(SAMPLES_PER_BUFFER * (this.sampleRate / this.inputSampleRate)) * this.channels.length;

    if (s > this.resampleBuffer.length) {
      this.resampleBuffer = this.allocResampleBuffer(s);
    }
  }

  init() {
    this.resetSampleRate(this.sampleRate, this.lib.getSampleRate());
    this.currentPlaytime = 0;
    this.isFadingOut = false;
    this.fadeOutStartMs = 0;
    // Preserve sound_enhance across song loads; fall back to 'Light' on first load.
    const presetId = this.params?.sound_enhance ?? '1';
    this.params = { sound_enhance: presetId };
    this._applyEnhancePreset(presetId);
    this.lastLoadedFilename = null;

    // HPF state for harmonic exciter (Approach 2), one per channel
    this.hpfPrev = [0, 0];
    this.hpfState = [0, 0];
    // Clear EQ filter memory so the previous song's tail does not ring into the new one.
    this.eqPresence.forEach(f => f.reset());
    this.eqTreble.forEach(f => f.reset());

    this.metadata = this.createMetadata();
  }

  // overrided methods from Player
  restart() {
    this.lib.seekPlaybackPosition(0);
    this.resume();
  }

  loadData(data, filepath, persistedSettings = {}) {
    if (!this.lib.isClosed()) {
      this.lib.teardown();
    }

    this.resampleBuffer = this.allocResampleBuffer(0);
    this.numberOfSamplesToRender = 0;
    this.sourceBufferIdx = 0;
    this.sourceBuffer = null;
    this.sourceBufferLen = 0;
    this.currentPlaytime = 0;
    this.isFadingOut = false;
    this.fadeOutStartMs = 0;

    if (this.channels) {
      for (let i = 0; i < this.channels.length; i++) {
        this.channels[i].fill(0);
      }
    }

    const [path, filename] = this.lib.getPathAndFilename(filepath);
    this.lib.registerFileData(path, filename,  data);
    this.lastLoadedFilename = filename;

    // Heavy synchronous init blocks the main thread; suspend the audio
    // context so the output doesn't glitch meanwhile.
    return this.muteAudioDuringCall(this.audioNode, () => {
      if (this.lib.loadMusicData(this.sampleRate, path, filename) === 0) {
        this.voiceMask = Array(this.getNumVoices()).fill(true);
        this.init();
        this.resume();

        this.emit('playerStateUpdate', {
          ...this.getBasePlayerState(),
          isStopped: false,
        });
      }
    });
  }

  createMetadata() {
    const metaData = this.lib.getMetaData();
    return {
      title: metaData[0],
      artist: metaData[1],
      game: metaData[2],
      year: metaData[3],
      genre: metaData[4],
      copyright: metaData[5],
      psfby: metaData[6],
    };
  }

  getNumSubtunes() {
    return 1;
  }

  getSubtune() {
    return 0;
  }

  getPositionMs() {
    return this.lib.getPlaybackPosition();
  }

  getDurationMs() {
    return this.lib.getMaxPlaybackPosition();
  }

  getMetadata() {
    return this.metadata;
  }

  getParameter(id) {
    return this.params[id];
  }

  getParamDefs() {
    return [
      {
        id: 'sound_enhance',
        label: 'Enhancement',
        hint: 'Audio enhancement preset: EQ (treble/presence) + harmonic exciter',
        type: 'enum',
        options: [{
          label: 'Enhancement',
          items: [
            { label: 'Off',    value: '0' },
            { label: 'Light',  value: '1' },
            { label: 'Medium', value: '2' },
            { label: 'Strong', value: '3' },
          ],
        }],
        defaultValue: '1',
      },
    ];
  }

  _applyEnhancePreset(presetId) {
    const preset = SOUND_ENHANCE_PRESETS[presetId];
    if (!preset) return;
    this.eqActive = preset.presence !== 0 || preset.treble !== 0;
    for (let ch = 0; ch < 2; ch++) {
      this.eqPresence[ch].setPeaking(this.sampleRate, 3000, 1.0, preset.presence);
      this.eqTreble[ch].setHighShelf(this.sampleRate, 6000, preset.treble);
    }
    // exciter intensity is read dynamically from params by applyExciter()
  }

  setParameter(id, value) {
    switch (id) {
      case 'sound_enhance':
        this._applyEnhancePreset(value);
        break;
      default:
        console.warn('GBAPlayer has no parameter with id "%s".', id);
    }
    this.params[id] = value;
  }

  isPlaying() {
    return !this.isPaused() && this.lib.getPlaybackPosition() < this.lib.getMaxPlaybackPosition();
  }

  setTempo(val) {
    this.lib.setTempo(val);
  }

  setFadeout(startMs) {
    this.isFadingOut = true;
    this.fadeOutStartMs = startMs;
  }

  getVoiceName(index) {
    return CHANNEL_NAME[index];
  }

  getNumVoices() {
    return CHANNEL_NAME.length;
  }

  setVoiceMask(voices) {
    let mask = 0;
    voices.forEach((enabled, i) => {
      if (!enabled) {
        mask += (1 << i);
      }
    });
    this.lib.setVoices(mask);
    this.voiceMask = voices;
  }

  getVoiceMask() {
    return this.voiceMask;
  }

  seekMs(positionMs) {
    this.lib.seekPlaybackPosition(positionMs);
  }

  stop() {
    this.suspend();
    this.lib.teardown();

    console.debug('GBAPlayer.stop()');
    this.emit('playerStateUpdate', { isStopped: true });
  }

  // called from gsf_request_file (webGSF/emscripten/gsfplug.cpp, EM_JS) via core.gbaFileRequestCallback
  fileRequestCallback(p_filename) {
    const fullFilename = this.lib.getDelegate().UTF8ToString(p_filename);
    const [path, filename] = this.lib.getPathAndFilename(fullFilename);

    if (this.lib.existsFileData(path, filename)) {
      return 0;
    }

    const remotePath = this.lib.getAbsolutePath([CATALOG_PREFIX, fullFilename]);
    fetch(remotePath, {method: 'GET',})
      .then(response => {
        if (!response.ok) { // 404, 500.. missing pcm can be ignored for playing
          throw Error(response.statusText);
        }
        return response.arrayBuffer();
      })
      .then(buffer => {
        this.suspend();

        this.resampleBuffer = this.allocResampleBuffer(0);
        this.numberOfSamplesToRender = 0;
        this.sourceBufferIdx = 0;
        this.sourceBuffer = null;
        this.sourceBufferLen = 0;
        this.currentPlaytime = 0;
        this.isFadingOut = false;
        this.fadeOutStartMs = 0;

        if (this.channels) {
          for (let i = 0; i < this.channels.length; i++) {
            this.channels[i].fill(0);
          }
        }

        this.lib.registerFileData(path, filename, buffer);
        return this.muteAudioDuringCall(this.audioNode, () => {
          if (this.lib.loadMusicData(this.sampleRate, path, this.lastLoadedFilename) === 0) {
            this.init();

            this.resume();

            this.emit('playerStateUpdate', {
              ...this.getBasePlayerState(),
              isStopped: false,
            });
          }
        });
      })
      .catch(e => {});

    return -1;
  }
}