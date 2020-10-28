import Player from "./Player.js";
import {CATALOG_PREFIX} from "../config";
const encoding = require('encoding-japanese');

const fileExtensions = [
  'gsf', 'minigsf'
];

const SAMPLES_PER_BUFFER = 16384; // allowed: buffer sizes: 256, 512, 1024, 2048, 4096, 8192, 16384

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
    //this.gbalib.ccall('gba_set_mask', null, ['number'], [voices]);
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
  constructor(audioCtx, destNode, chipCore, onPlayerStateUpdate) {
    super(audioCtx, destNode, chipCore, onPlayerStateUpdate);
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

  resampleToFloat(channels, channelId, inputPtr, len, resampleOutput, resampleLen) {
    // Bresenham (line drawing) algorithm based resampling
    let x0 = 0;
    let y0 = 0;
    let x1 = resampleLen - 0;
    let y1 = len - 0;

    let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, e2;

    let i;
    for (; ;) {
      i = (x0 * channels.length) + channelId;
      resampleOutput[i] = this.readFloatSample(inputPtr, (y0 * channels.length) + channelId);

      if (x0 >= x1 && y0 >= y1) {
        break;
      }
      e2 = 2 * err;
      if (e2 > dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  copySamplesStereo() {
    let i, l = 0, r = 0;
    const outSize = this.channels[0].length;
    if (this.numberOfSamplesRendered + this.numberOfSamplesToRender > outSize) {
      const availableSpace = outSize - this.numberOfSamplesRendered;

      for (i = 0; i < availableSpace; i++) {
        l = this.resampleBuffer[this.sourceBufferIdx++];
        r = this.resampleBuffer[this.sourceBufferIdx++];

        this.channels[0][i + this.numberOfSamplesRendered] = l;
        this.channels[1][i + this.numberOfSamplesRendered] = r;
      }

      this.numberOfSamplesToRender -= availableSpace;
      this.numberOfSamplesRendered = outSize;
    } else {
      for (i = 0; i < this.numberOfSamplesToRender; i++) {
        l = this.resampleBuffer[this.sourceBufferIdx++];
        r = this.resampleBuffer[this.sourceBufferIdx++];

        this.channels[0][i + this.numberOfSamplesRendered] = l;
        this.channels[1][i + this.numberOfSamplesRendered] = r;
      }
      this.numberOfSamplesRendered += this.numberOfSamplesToRender;
      this.numberOfSamplesToRender = 0;
    }
  }

  copySamplesMono() {
    let o = 0;
    const outSize = this.channels[0].length;
    if (this.numberOfSamplesRendered + this.numberOfSamplesToRender > outSize) {
      let availableSpace = outSize - this.numberOfSamplesRendered;

      for (let i = 0; i < availableSpace; i++) {
        o = this.resampleBuffer[this.sourceBufferIdx++];
        this.channels[0][i + this.numberOfSamplesRendered] = o;
      }
      this.numberOfSamplesToRender -= availableSpace;
      this.numberOfSamplesRendered = outSize;
    } else {
      for (let i = 0; i < this.numberOfSamplesToRender; i++) {
        o = this.resampleBuffer[this.sourceBufferIdx++];
        this.channels[0][i + this.numberOfSamplesRendered] = o;
      }
      this.numberOfSamplesRendered += this.numberOfSamplesToRender;
      this.numberOfSamplesToRender = 0;
    }
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
    this.params = {};
    this.lastLoadedFilename = null;

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

    const [path, filename] = this.lib.getPathAndFilename(filepath);
    this.lib.registerFileData(path, filename,  data);
    this.lastLoadedFilename = filename;

    if (this.lib.loadMusicData(this.sampleRate, path, filename) === 0) {
      this.init();
      this.connect();
      this.resume();

      this.onPlayerStateUpdate(!this.isPlaying());
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
    // let params = {
    //   id: 'spu_reverb',
    //   label: 'Enable SPU Reverb',
    //   hint: 'Enable SPU reverb',
    //   type: 'toggle',
    //   defaultValue: true,
    // };
    return [
      // params,
    ];
  }

  setParameter(id, value) {
    switch (id) {
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
    return "Ch " + (index + 1);
  }

  getNumVoices() {
    return 16;
  }

  setVoices(voices) {
    let mask = 0;
    voices.forEach((enabled, i) => {
      if (!enabled) {
        mask += (1 << i);
      }
    });
    this.lib.setVoices(mask);
  }

  seekMs(positionMs) {
    this.lib.seekPlaybackPosition(positionMs);
  }

  stop() {
    this.suspend();
    this.lib.teardown();
    this.resampleBuffer.fill(0);

    console.debug('GBAPlayer.stop()');
    this.onPlayerStateUpdate(true);
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
        this.lib.registerFileData(path, filename, buffer);
        if (this.lib.loadMusicData(this.sampleRate, path, this.lastLoadedFilename) === 0) {
          this.init();
          this.connect();
          this.resume();

          this.onPlayerStateUpdate(!this.isPlaying());
        }
      })
      .catch(e => {});

    return -1;
  }
}