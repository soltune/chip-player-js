import Player from "./Player.js";
import {CATALOG_PREFIX} from "../config";
const encoding = require('encoding-japanese');

const fileExtensions = [
  'gsf', 'minigsf'
];
const CHANNEL_NAME = ['Square', 'Square', 'Wave', 'Noise', 'PCM', 'PCM'];
const SAMPLES_PER_BUFFER = 16384; // allowed: buffer sizes: 256, 512, 1024, 2048, 4096, 8192, 16384
const GBA_CHANNEL_COUNT = 2; // GBA DirectSound always outputs interleaved stereo (L/R/L/R...)
const SOUND_ENHANCE_PRESETS = {
  '0': { treble:  0, presence: 0, exciter: 0 }, // Off
  '1': { treble:  4, presence: 2, exciter: 3 }, // Light
  '2': { treble:  7, presence: 4, exciter: 6 }, // Medium
  '3': { treble: 11, presence: 6, exciter: 9 }, // Strong
};

class GBALibWrapper {
  constructor(chipCore) {
    this.gbalib = chipCore;
    this.fs = this.gbalib.FS;
    this.currentFile = null;
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
      return this.fs.readdir(path).includes(filename);
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
      return false;
    }
    return true;
  }
}

export default class GBAPlayer extends Player {
  constructor(audioCtx, destNode, chipCore, bufferSize) {
    super(audioCtx, destNode, chipCore, bufferSize);
    this.setParameter = this.setParameter.bind(this);
    this.getParameter = this.getParameter.bind(this);
    this.getParamDefs = this.getParamDefs.bind(this);
    window.gba_fileRequestCallback　= this.fileRequestCallback.bind(this);

    this.lib = new GBALibWrapper(chipCore);
    this.fs = this.lib.fs;
    this.sampleRate = audioCtx.sampleRate;
    this.inputSampleRate = this.lib.getSampleRate();
    this.channels = [];
    this.lastLoadedFilename = null;

    // EQ filter chain (Approach 1)
    this.presenceFilter = audioCtx.createBiquadFilter();
    this.presenceFilter.type = 'peaking';
    this.presenceFilter.frequency.value = 3000;
    this.presenceFilter.Q.value = 1.0;
    this.presenceFilter.gain.value = 2;

    this.trebleFilter = audioCtx.createBiquadFilter();
    this.trebleFilter.type = 'highshelf';
    this.trebleFilter.frequency.value = 6000;
    this.trebleFilter.gain.value = 4;

    this.resampleBuffer = this.allocResampleBuffer(0);
    this.isStereo = destNode.channelCount === 2;

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

    this.setAudioProcess((e) => {
      for (let i = 0; i < e.outputBuffer.numberOfChannels; i++) {
        this.channels[i] = e.outputBuffer.getChannelData(i);
      }

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
            this.resampleBuffer = this.resampleBuffer.map((value) => {
              return value * ratio
            });
          }
        }

        if (this.isStereo) {
          this.copySamplesStereo();
        } else {
          this.copySamplesMono();
        }
      }
    });
  }

  getResampledAudio(input, len) {
    return this.getResampledFloats(this.sourceBuffer, this.sourceBufferLen, this.sampleRate, this.inputSampleRate);
  }

  getCopiedAudio(input, len, resampleOutput) {
    // just copy the rescaled values so there is no need for special handling in playback loop
    for (let i = 0; i < len * this.channels.length; i++) {
      resampleOutput[i] = this.readFloatSample(input, i);
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

      const p0 = this.readFloatSample(inputPtr, (i0 * GBA_CHANNEL_COUNT) + channelId);
      const p1 = this.readFloatSample(inputPtr, (i1 * GBA_CHANNEL_COUNT) + channelId);
      const p2 = this.readFloatSample(inputPtr, (i2 * GBA_CHANNEL_COUNT) + channelId);
      const p3 = this.readFloatSample(inputPtr, (i3 * GBA_CHANNEL_COUNT) + channelId);

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
    this.params = { sound_enhance: '1' }; // default: Light
    this._applyEnhancePreset('1');
    this.lastLoadedFilename = null;

    // HPF state for harmonic exciter (Approach 2), one per channel
    this.hpfPrev = [0, 0];
    this.hpfState = [0, 0];

    this.metadata = this.createMetadata();
  }

  // overrided methods from Player
  restart() {
    this.lib.seekPlaybackPosition(0);
    this.resume();
  }

  loadData(data, filepath) {
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

    if (this.lib.loadMusicData(this.sampleRate, path, filename) === 0) {
      this.voiceMask = Array(this.getNumVoices()).fill(true);
      this.init();
      this.connect();
      this.resume();

      this.emit('playerStateUpdate', {
        ...this.getBasePlayerState(),
        isStopped: false,
      });
    }
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
    this.trebleFilter.gain.value = preset.treble;
    this.presenceFilter.gain.value = preset.presence;
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

  connect() {
    this.audioNode.connect(this.presenceFilter);
    this.presenceFilter.connect(this.trebleFilter);
    this.trebleFilter.connect(this.destinationNode);
  }

  stop() {
    this.suspend();
    this.lib.teardown();

    console.debug('GBAPlayer.stop()');
    this.emit('playerStateUpdate', { isStopped: true });
  }

  // callback in gsf_request_file(gsfplug.cpp) -> gba_fileRequestCallback(gba_callback.js)
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
        if (this.lib.loadMusicData(this.sampleRate, path, this.lastLoadedFilename) === 0) {
          this.init();
          this.connect();

          this.resume();

          this.emit('playerStateUpdate', {
            ...this.getBasePlayerState(),
            isStopped: false,
          });
        }
      })
      .catch(e => {});

    return -1;
  }
}