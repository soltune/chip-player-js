import autoBind from 'auto-bind';
import Player from "./Player.js";
import {CATALOG_PREFIX} from "../config";
const encoding = require('encoding-japanese');

const fileExtensions = [
  '2sf', 'mini2sf'
];

const SAMPLES_PER_BUFFER = 16384; // allowed: buffer sizes: 256, 512, 1024, 2048, 4096, 8192, 16384
const NDS_CHANNEL_COUNT = 2; // NDS always outputs interleaved stereo (L/R/L/R...)

// Pre-render queue ("prebuffer"). DS emulation runs on the main thread inside
// the ScriptProcessor callback and heavy titles (streaming drivers like World
// Destruction/Soma Bringer) render near real time, so any main-thread jank
// (GC, React renders) starves the ~2-buffer slack Chrome gives us and
// crackles. Keeping this much audio pre-rendered decouples emulation from the
// audio deadline; refill happens opportunistically at the end of each
// callback, time-boxed so a callback never blocks the thread for long.
const PREBUFFER_TARGET_MS = 500;
// Fraction of the callback period the callback may spend in total (drain +
// refill). Steady state needs production ≈ consumption (that cost is the
// song's, not the queue's); the remaining headroom above that rebuilds the
// queue after a main-thread stall at roughly (utilization - realtime cost)
// per callback.
const PREBUFFER_REFILL_UTILIZATION = 0.8;
const PREBUFFER_PREFILL_BUDGET_MS = 1500; // during (muted) load/seek
const FADEOUT_MS = 2000;

class DSLibWrapper {
  constructor(chipCore) {
    this.ndslib = chipCore;
    this.fs = this.ndslib.FS;
    this.currentFile = null;
  }

  getAudioBuffer() {
    var ptr = this.ndslib.ccall('nds_get_audio_buffer', 'number');
    // make it a this.Module.HEAP16 pointer
    return ptr >> 1;	// 2 x 16 bit samples
  }

  getAudioBufferLength() {
    return this.ndslib.ccall('nds_get_audio_buffer_length', 'number');
  }

  computeAudioSamples() {
    return this.ndslib.ccall('nds_compute_audio_samples', 'number');
  }

  getMaxPlaybackPosition() {
    return this.ndslib.ccall('nds_get_max_position', 'number');
  }

  getPlaybackPosition() {
    return this.ndslib.ccall('nds_get_current_position', 'number');
  }

  seekPlaybackPosition(ms) {
    this.ndslib.ccall('nds_seek_position', 'number', ['number'], [ms]);
  }

  getMetaData() {
    const metaData = [];
    const numOfInfo = 7;
    const trackInfo = this.ndslib.ccall('nds_get_track_info', 'number');

    const info = this.ndslib.HEAP32.subarray(trackInfo >> 2, (trackInfo >> 2) + numOfInfo);
    for (let i = 0; i < numOfInfo; i++) {
      const raw = [];
      for (let j = 0; j < 256; j++) {
        let char = this.ndslib.getValue(info[i] + j, 'i8');
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
    const result = this.ndslib.ccall('nds_init', 'number', ['string', 'string'], [path, filename]);
    if (result === 0) { // result -> 0: success, -1: error
      this.currentFile = filename;
    }

    return result;
  }

  teardown() {
    this.currentFile = null;
    this.ndslib.ccall('nds_teardown', 'number');	// just in case
  }

  getSampleRate() {
    return this.ndslib.ccall('nds_get_sample_rate', 'number');
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
    this.ndslib.ccall('nds_set_mask', null, ['number'], [voices]);
  }

  getVoices() {
    return this.ndslib.ccall('nds_get_mask');
  }

  setInterpolation(mode) {
    this.ndslib.ccall('nds_set_interpolation', null, ['number'], [mode]);
  }

  getInterpolation() {
    return this.ndslib.ccall('nds_get_interpolation', 'number');
  }

  setTempo(tempo) {
    //this.mdxpmdlib.ccall('nds_set_tempo', null, ['number'], [tempo]);
  }

  getDelegate() {
    return this.ndslib;
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

export default class NDSPlayer extends Player {
  // SPUInterpolationMode values (vio2sf SPU.h); lower = less CPU.
  paramDefs = [
    {
      id: 'nds_interpolation',
      label: 'Interpolation',
      hint: 'SPU channel interpolation quality. Lower settings reduce CPU load.',
      type: 'enum',
      options: [{
        label: 'Interpolation',
        items: [
          { label: 'None (fastest)', value: '0' },
          { label: 'Linear',         value: '2' },
          { label: 'Cubic',          value: '3' },
          { label: 'Sinc (best)',    value: '4' },
        ],
      }],
      defaultValue: '3',
    },
  ];

  constructor(...args) {
    super(...args);
    autoBind(this);

    this.playerKey = 'nds';
    this.name = 'NDS Player';
    this.core.ndsFileRequestCallback = this.fileRequestCallback.bind(this);

    this.lib = new DSLibWrapper(this.core);
    this.fs = this.lib.fs;
    this.inputSampleRate = this.lib.getSampleRate();
    this.channels = [];
    this.lastLoadedFilename = null;

    this.resampleBuffer = this.allocResampleBuffer(0);
    this.isStereo = true; // updated per callback in processAudioInner

    this.paused = true;
    this.fileExtensions = fileExtensions;
    this.pendingFileRequests = new Set();
    this.tempo = 1.0;
    this.isFadingOut = false;
    this.fadeOutStartMs = 0;
    this.currentPlaytime = 0;

    this.sourceBuffer = null;
    this.sourceBufferLen = 0;

    // pre-render queue: Float32Array chunks of interleaved stereo at the
    // output sample rate; fifoHeadOffset counts the frames consumed so far
    // from fifo[0], queuedFrames the total unconsumed frames across the queue
    this.fifo = [];
    this.fifoHeadOffset = 0;
    this.queuedFrames = 0;
    this.producerFinished = false;

    this.params = {};
    this.persistedSettings = {};

  }

  // ---- pre-render queue (producer side) ----

  flushPrebuffer() {
    this.fifo = [];
    this.fifoHeadOffset = 0;
    this.queuedFrames = 0;
    this.producerFinished = false;
  }

  queuedMs() {
    return this.queuedFrames / this.sampleRate * 1000;
  }

  // Renders one emulator chunk, resamples it to output rate (interleaved
  // stereo) and appends it to the queue. Returns false once the song (tag
  // length + fadeout) has ended; no chunk is queued in that case.
  produceChunk() {
    if (this.producerFinished) {
      return false;
    }
    // this.currentPlaytime tracks the emulator-side position (which runs
    // ahead of the audible position by queuedMs)
    this.currentPlaytime = Math.max(this.lib.getPlaybackPosition(), this.currentPlaytime);
    const duration = this.getDurationMs();

    let finished = (this.currentPlaytime >= duration + FADEOUT_MS);
    if (!finished) {
      if (this.currentPlaytime >= duration && !this.isFadingOut) {
        this.setFadeout(this.currentPlaytime);
      }
      finished = (this.lib.computeAudioSamples() === 1);
    }
    if (finished) {
      this.producerFinished = true;
      return false;
    }

    // refresh just in case they are not using one fixed buffer..
    this.sourceBuffer = this.lib.getAudioBuffer();
    this.sourceBufferLen = this.lib.getAudioBufferLength();

    const frames = this.getResampledFloats(this.sourceBuffer, this.sourceBufferLen, this.sampleRate, this.inputSampleRate);

    let ratio = 1.0;
    if (this.isFadingOut) {
      const current = this.currentPlaytime - duration;
      ratio = Math.max((FADEOUT_MS - current) / FADEOUT_MS, 0);
    }
    const chunk = new Float32Array(frames * NDS_CHANNEL_COUNT);
    for (let i = 0; i < chunk.length; i++) {
      chunk[i] = this.resampleBuffer[i] * ratio;
    }
    this.fifo.push(chunk);
    this.queuedFrames += frames;
    return true;
  }

  // Fills the queue up to the target depth (time-boxed). Call the expensive
  // initial fill only under muteAudioDuringCall (load/seek); the audio
  // callback itself tops the queue up with a much smaller budget.
  prefillAudio(budgetMs = PREBUFFER_PREFILL_BUDGET_MS) {
    const t0 = performance.now();
    while (this.queuedMs() < PREBUFFER_TARGET_MS &&
           (performance.now() - t0) < budgetMs) {
      if (!this.produceChunk()) break;
    }
  }

  // ---- audio callback (consumer side) ----

  // Copies up to wantFrames from the queue head into the output channels.
  consumeFromFifo(channels, destOffset, wantFrames) {
    const head = this.fifo[0];
    const headFrames = head.length / NDS_CHANNEL_COUNT - this.fifoHeadOffset;
    const take = Math.min(headFrames, wantFrames);
    const base = this.fifoHeadOffset * NDS_CHANNEL_COUNT;
    if (channels.length === 2) {
      for (let i = 0; i < take; i++) {
        channels[0][destOffset + i] = head[base + i * 2];
        channels[1][destOffset + i] = head[base + i * 2 + 1];
      }
    } else {
      for (let i = 0; i < take; i++) {
        channels[0][destOffset + i] = head[base + i * 2];
      }
    }
    this.fifoHeadOffset += take;
    if (this.fifoHeadOffset * NDS_CHANNEL_COUNT >= head.length) {
      this.fifo.shift();
      this.fifoHeadOffset = 0;
    }
    this.queuedFrames -= take;
    return take;
  }

  processAudioInner(channels) {
    this.channels = channels;
    this.isStereo = channels.length === 2;

    if (this.paused) {
      for (let i = 0; i < channels.length; i++) {
        channels[i].fill(0);
      }
      return;
    }

    const t0 = performance.now();
    const outSize = channels[0].length;
    let rendered = 0;

    while (rendered < outSize) {
      if (this.queuedFrames === 0) {
        if (this.producerFinished) {
          for (let i = 0; i < channels.length; i++) {
            channels[i].fill(0, rendered);
          }
          this.stop();
          return;
        }
        // queue underrun: render synchronously (pre-queue behavior)
        this.produceChunk();
        continue;
      }
      rendered += this.consumeFromFifo(channels, rendered, outSize - rendered);
    }

    // refill toward the target with whatever is left of this callback's time
    // budget, so transient main-thread stalls drain the queue instead of
    // causing an audible glitch and the deficit is rebuilt afterwards
    const callbackBudget = (outSize / this.sampleRate) * 1000 * PREBUFFER_REFILL_UTILIZATION;
    while (!this.producerFinished &&
           this.queuedMs() < PREBUFFER_TARGET_MS &&
           (performance.now() - t0) < callbackBudget) {
      if (!this.produceChunk()) break;
    }
  }

  getCopiedAudio(input, len, resampleOutput) {
    // just copy the rescaled values so there is no need for special handling in playback loop
    for (let i = 0; i < len * NDS_CHANNEL_COUNT; i++) {
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

  // Always produces interleaved stereo at the output rate (the queue format),
  // regardless of the output node's channel count.
  getResampledFloats(input, len, sampleRate, inputSampleRate) {
    let resampleLen = Math.round(len * sampleRate / inputSampleRate);
    const bufSize = resampleLen * NDS_CHANNEL_COUNT;

    if (bufSize > this.resampleBuffer.length) {
      this.resampleBuffer = this.allocResampleBuffer(bufSize);
    }

    if (sampleRate === inputSampleRate) {
      resampleLen = this.getCopiedAudio(input, len, this.resampleBuffer);
    } else {
      this.resampleToFloat(0, input, len, this.resampleBuffer, resampleLen);
      this.resampleToFloat(1, input, len, this.resampleBuffer, resampleLen);
    }
    return resampleLen;
  }

  resampleToFloat(channelId, inputPtr, len, resampleOutput, resampleLen) {
    const ratio = len / resampleLen;
    for (let i = 0; i < resampleLen; i++) {
      const pos = i * ratio;
      const index = Math.floor(pos);
      const frac = pos - index;

      // Use NDS_CHANNEL_COUNT as the input stride (NDS always outputs interleaved stereo),
      // independent of the output channel count (channels.length).
      const i0 = Math.max(index - 1, 0);
      const i1 = index;
      const i2 = Math.min(index + 1, len - 1);
      const i3 = Math.min(index + 2, len - 1);

      const p0 = this.readFloatSample(inputPtr, (i0 * NDS_CHANNEL_COUNT) + channelId);
      const p1 = this.readFloatSample(inputPtr, (i1 * NDS_CHANNEL_COUNT) + channelId);
      const p2 = this.readFloatSample(inputPtr, (i2 * NDS_CHANNEL_COUNT) + channelId);
      const p3 = this.readFloatSample(inputPtr, (i3 * NDS_CHANNEL_COUNT) + channelId);

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
      resampleOutput[(i * NDS_CHANNEL_COUNT) + channelId] = Math.max(-1.0, Math.min(1.0, sample));
    }
  }

  resetSampleRate(sampleRate, inputSampleRate) {
    if (sampleRate > 0) {
      this.sampleRate = sampleRate;
    }
    if (inputSampleRate > 0) {
      this.inputSampleRate = inputSampleRate;
    }

    const s = Math.round(SAMPLES_PER_BUFFER * (this.sampleRate / this.inputSampleRate)) * NDS_CHANNEL_COUNT;

    if (s > this.resampleBuffer.length) {
      this.resampleBuffer = this.allocResampleBuffer(s);
    }
  }

  init() {
    this.resetSampleRate(this.sampleRate, this.lib.getSampleRate());
    this.currentPlaytime = 0;
    this.isFadingOut = false;
    this.fadeOutStartMs = 0;
    this.params = {};
    this.lastLoadedFilename = null;

    this.metadata = this.createMetadata();
  }

  // overrided methods from Player
  restart() {
    this.seekMs(0);
    this.resume();
  }

  loadData(data, filepath, persistedSettings = {}) {
    this.suspend();

    if (!this.lib.isClosed()) {
      this.lib.teardown();
    }

    this.resampleBuffer = this.allocResampleBuffer(0);
    this.sourceBuffer = null;
    this.sourceBufferLen = 0;
    this.flushPrebuffer();
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
    this.persistedSettings = persistedSettings;

    // nds_init blocks the main thread for a long time on heavy 2sf data;
    // suspend the audio context so the output doesn't glitch meanwhile.
    return this.muteAudioDuringCall(this.audioNode, () => {
      if (this.lib.loadMusicData(this.sampleRate, path, filename) === 0) {
        this.voiceMask = Array(this.getNumVoices()).fill(true);
        this.init();
        this.resolveParamValues(persistedSettings);
        this.prefillAudio();

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
    // the emulator runs ahead of the audible position by the queued amount
    return this.isPaused()? 0 : Math.max(0, this.lib.getPlaybackPosition() - this.queuedMs());
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

  setParameter(id, value) {
    switch (id) {
      case 'nds_interpolation':
        this.lib.setInterpolation(parseInt(value, 10));
        break;
      default:
        console.warn('NDSPlayer has no parameter with id "%s".', id);
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
    return "Ch " + (index + 1);
  }

  getNumVoices() {
    return 16;
  }

  setVoiceMask(voices) {
    let mask = 0;
    voices.forEach((enabled, i) => {
      if (!enabled) {
        mask += (1 << i);
      }
    });
    this.lib.setVoices(mask);
  }

  getVoiceMask() {
    const mask = this.lib.getVoices();

    let voiceMask = [];
    for (let i = 0; i < this.getNumVoices(); i++) {
      voiceMask[i] = ((mask << i) & 1) === 0;
    }
    return voiceMask;
  }

  seekMs(positionMs) {
    // Seeking re-renders audio synchronously (a backward seek reloads the ROM
    // and can block for many seconds); without suspending the context, the
    // ScriptProcessor callbacks queued during the block fire in a burst
    // afterwards and skip playback far past the seek target.
    return this.muteAudioDuringCall(this.audioNode, () => {
      this.flushPrebuffer(); // queued chunks are pre-seek audio
      this.lib.seekPlaybackPosition(positionMs);
      this.prefillAudio();
    });
  }

  stop() {
    this.suspend();
    this.flushPrebuffer();
    this.lib.teardown();

    console.debug('NDSPlayer.stop()');
    this.emit('playerStateUpdate', { isStopped: true });
  }

  // called from twosf_request_file (webDS/emscripten/twosfplug.cpp, EM_JS) via core.ndsFileRequestCallback
  fileRequestCallback(p_filename) {
    const fullFilename = this.lib.getDelegate().UTF8ToString(p_filename);
    const [path, filename] = this.lib.getPathAndFilename(fullFilename);

    if (this.lib.existsFileData(path, filename)) {
      return 0;
    }

    // Rapid repeated loads (e.g. double click) can request the same _lib
    // several times before the first fetch lands; only the first fetch should
    // re-init, the rest would tear down the already-playing song.
    if (this.pendingFileRequests.has(fullFilename)) {
      return -1;
    }
    this.pendingFileRequests.add(fullFilename);

    const remotePath = this.lib.getAbsolutePath([CATALOG_PREFIX, fullFilename]);
    fetch(remotePath, {method: 'GET',})
      .then(response => {
        if (!response.ok) { // 404, 500.. missing pcm can be ignored for playing
          throw Error(response.statusText);
        }
        return response.arrayBuffer();
      })
      .then(buffer => {
        this.pendingFileRequests.delete(fullFilename);
        this.lib.registerFileData(path, filename, buffer);
        if (!this.lastLoadedFilename) {
          // no load is waiting on this file anymore (a later init already
          // succeeded and cleared it); don't tear down the playing song
          return;
        }
        this.suspend();

        this.resampleBuffer = this.allocResampleBuffer(0);
        this.sourceBuffer = null;
        this.sourceBufferLen = 0;
        this.flushPrebuffer();
        this.currentPlaytime = 0;
        this.isFadingOut = false;
        this.fadeOutStartMs = 0;

        if (this.channels) {
          for (let i = 0; i < this.channels.length; i++) {
            this.channels[i].fill(0);
          }
        }

        return this.muteAudioDuringCall(this.audioNode, () => {
          if (this.lib.loadMusicData(this.sampleRate, path, this.lastLoadedFilename) === 0) {
            this.init();
            this.resolveParamValues(this.persistedSettings);
            this.prefillAudio();

            this.resume();

            this.emit('playerStateUpdate', {
              ...this.getBasePlayerState(),
              isStopped: false,
            });
          }
        });
      })
      .catch(e => {
        this.pendingFileRequests.delete(fullFilename);
      });

    return -1;
  }
}