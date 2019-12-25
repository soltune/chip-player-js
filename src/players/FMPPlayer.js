import Player from "./Player.js";
import {CATALOG_PREFIX} from "../config";

const fileExtensions = [
  'opi', 'ovi', 'ozi'
];

const rhythmPath = '/rhythm';
const rhythmFile = 'ym2608_adpcm_rom.bin';
const internalPCMPath = '/fmppcm';  // on the remote, pcm files should be located where fmp files present

const SAMPLES_PER_BUFFER = 16384; // allowed: buffer sizes: 256, 512, 1024, 2048, 4096, 8192, 16384
const CHANNELS = {
  "OPNA": [
    'FM 1', 'FM 2', 'FM 3', 'FM 4', 'FM 5', 'FM 6', 'PSG 1', 'PSG 2', 'PSG 3',
    'Bass dr', 'Snare', 'Cymbal', 'Hi-hat', 'Tom-tom', 'Rim shot', 'ADPCM' ],
  "PPZ": ['PPZ8 1', 'PPZ8 2', 'PPZ8 3', 'PPZ8 4', 'PPZ8 5', 'PPZ8 6', 'PPZ8 7', 'PPZ8 8']
};


class FMPLibWrapper {
  constructor(chipCore) {
    this.fmplib = chipCore;
    this.fs = this.fmplib.FS;
    this.currentFile = null;
    this.pcmFilenames = null;
  }

  getAudioBuffer() {
    var ptr = this.fmplib.ccall('fmp_get_audio_buffer', 'number');
    // make it a this.Module.HEAP16 pointer
    return ptr >> 1;	// 2 x 16 bit samples
  }

  getAudioBufferLength() {
    return this.fmplib.ccall('fmp_get_audio_buffer_length', 'number');
  }

  computeAudioSamples() {
    return this.fmplib.ccall('fmp_compute_audio_samples', 'number');
  }

  getMaxPlaybackPosition() {
    const msLength = this.fmplib.ccall('fmp_get_max_position', 'number');
    return Math.max(msLength, 2000);
  }

  getPlaybackPosition() {
    return this.fmplib.ccall('fmp_get_current_position', 'number');
  }

  seekPlaybackPosition(pos) {
    this.fmplib.ccall('fmp_seek_position', 'number', ['number'], [pos]);
  }

  getPcmFilenames() {
    if (!this.pcmFilenames) {
      this.pcmFilenames = ['', ''];
      const numOfInfo = 2;
      const p = this.fmplib.ccall('fmp_get_pcm_filenames', 'number');

      const rawNames = this.fmplib.HEAP32.subarray(p >> 2, (p >> 2) + numOfInfo);
      for (let i = 0; i < numOfInfo; i++) {
        const str = this.fmplib.UTF8ToString(rawNames[i]);
        if (str) {
          this.pcmFilenames[i] = (str + '.PVI'); // fmp.pvi_name and fmp.ppz_name has no ext
        }
      }
    }
    return this.pcmFilenames; // pcmFilenames : 0 -> pvi, 1 -> ppz
  }

  loadPvi(pviAbsolutePath) {
    return this.fmplib.ccall('fmp_load_pvi', 'number', ['string'], [pviAbsolutePath]);
  }

  loadPpz(ppzAbsolutePath) {
    return this.fmplib.ccall('fmp_load_ppz', 'number', ['string'], [ppzAbsolutePath]);
  }

  getMetaData() {
    const metaData = [];
    const numOfInfo = 3;
    const p = this.fmplib.ccall('fmp_get_track_info', 'number');
    const info = this.fmplib.HEAP32.subarray(p / 4, p / 4 + numOfInfo);

    for (let i = 0; i < numOfInfo; i++) {
      metaData.push(this.fmplib.UTF8ToString(info[i]));
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

  async fetchAndStorePcm(remotePath, pcmFilename) {
    let hasPcm = this.existsFileData(internalPCMPath, pcmFilename);
    if (!hasPcm) { // there's no cache - try fetching from remote
      const remotePcmAbsolutePath = this.getAbsolutePath([CATALOG_PREFIX, remotePath, pcmFilename]);
      hasPcm = await fetch(remotePcmAbsolutePath, {method: 'GET',})
        .then(response => {
          if (!response.ok) { // 404, 500.. missing pcm can be ignored for playing
            throw Error(response.statusText);
          }
          return response.arrayBuffer();
        })
        .catch(e => {
          return false;
        })
        .then((buf) => {
          if (!buf) return false;
          return this.registerFileData(internalPCMPath, pcmFilename, buf);
        });
    }
    return hasPcm;
  }

  async loadMusicData(sampleRate, path, filename, data, onMusicLoadFinished) {
    let buf = this.fmplib._malloc(data.length);
    this.fmplib.HEAPU8.set(data, buf);
    const result = this.fmplib.ccall('fmp_load_file', 'number',
      ['string', 'number', 'number'], [filename, buf, data.length]);
    this.fmplib._free(buf);
    if (result === 0) { // result -> 0: success, 1: error
      this.currentFile = filename;
    }

    const [pviFilename, ppzFilename] = this.getPcmFilenames();
    console.log('pvi: ' + pviFilename);
    console.log('ppz: ' + ppzFilename);
    if (pviFilename) {
      if (await this.fetchAndStorePcm(path, pviFilename)) {
        this.loadPvi(this.getAbsolutePath([internalPCMPath, pviFilename]));
      }
    }
    if (ppzFilename) {
      if (await this.fetchAndStorePcm(path, ppzFilename)) {
        this.loadPpz(this.getAbsolutePath([internalPCMPath, ppzFilename]));
      }
    }
    return result;
  }

  teardown() {
    this.currentFile = null;
    this.pcmFilenames = null;
    this.fmplib.ccall('fmp_teardown', 'number');	// just in case
  }

  getCurrentFilename() {
    return this.currentFile;
  }

  getSampleRate() {
    return this.fmplib.ccall('fmp_get_sample_rate', 'number');
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

  hasLoop() {
    let loop = this.fmplib.ccall('fmp_has_loop', 'number');
    return loop === 1;
  }

  setVoices(voices) {
    this.fmplib.ccall('fmp_set_mask', null, ['number'], [voices]);
  }

  setTempo(tempo) {
    //this.mdxpmdlib.ccall('mdx_set_tempo', null, ['number'], [tempo]);
  }

  getDelegate() {
    return this.fmplib;
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

export default class FMPPlayer extends Player {
  constructor(audioCtx, destNode, chipCore, onPlayerStateUpdate) {
    super(audioCtx, destNode, chipCore, onPlayerStateUpdate);
    this.setParameter = this.setParameter.bind(this);
    this.getParameter = this.getParameter.bind(this);
    this.getParamDefs = this.getParamDefs.bind(this);

    this.lib = new FMPLibWrapper(chipCore);
    this.fs = this.lib.fs;
    this.sampleRate = audioCtx.sampleRate;
    this.inputSampleRate = this.lib.getSampleRate();
    this.channels = [];

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

    this.registerRhythmData();

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
      const fadeoutTimeMs = 2000;
      this.numberOfSamplesRendered = 0;

      while (this.numberOfSamplesRendered < outSize) {
        if (this.numberOfSamplesToRender === 0) {

          this.currentPlaytime = this.getPositionMs();
          if (this.lib.hasLoop()) {
            if (!this.isFadingOut && this.getDurationMs() < this.currentPlaytime) {
              this.setFadeout(this.currentPlaytime);
            }
          }

          if (this.currentPlaytime > this.getDurationMs() + fadeoutTimeMs) {
            // no frame left
            this.fillEmpty(outSize);
            this.stop();
            return;
          }
          this.lib.computeAudioSamples();

          // refresh just in case they are not using one fixed buffer..
          this.sourceBuffer = this.lib.getAudioBuffer();
          this.sourceBufferLen = this.lib.getAudioBufferLength();

          this.numberOfSamplesToRender = this.getResampledAudio();
          this.sourceBufferIdx = 0;

          // Fading out
          if (this.isFadingOut) {
            const current = this.currentPlaytime - this.getDurationMs();
            const ratio = Math.max((fadeoutTimeMs - current) / fadeoutTimeMs, 0);
            this.resampleBuffer = this.resampleBuffer.map((value) => {
              return value * ratio
            });
          }
        }
        if (this.getPositionMs() < 20)
          this.resampleBuffer = this.resampleBuffer.map((value) => { return 0; }); //workaround to avoid noise...
        if (this.isStereo) {
          this.copySamplesStereo();
        } else {
          this.copySamplesMono();
        }
      }
    });
  }

  registerRhythmData() {
    if (!this.lib.existsFileData(rhythmPath, rhythmFile)) {
      const remoteRhythmAbsolutePath = this.lib.getAbsolutePath([rhythmPath, rhythmFile]);
      fetch(remoteRhythmAbsolutePath, {method: 'GET',})
        .then(response => {
          if (!response.ok) {
            throw Error(response.statusText);
          }
          return response.arrayBuffer();
        })
        .then(buffer => {
          this.lib.registerFileData(rhythmPath, rhythmFile, buffer);
        })
        .catch(e => {
          //console.log(e);
        });
    }
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
    this.resampleBuffer = this.resampleBuffer.map((value) => { return 0 });
  }

  init(fullFilename, data) {
    this.resetSampleRate(this.sampleRate, this.lib.getSampleRate());
    this.currentPlaytime = 0;
    this.isFadingOut = false;
    this.fadeOutStartMs = 0;
    this.params = {};

    this.metadata = this.createMetadata();
  }

  // overrided methods from Player
  restart() {
    this.lib.seekPlaybackPosition(0);
    this.resume();
  }

  loadData(data, filepath) {
    this.suspend();
    if (!this.lib.isClosed()) {
      this.lib.teardown();
    }

    const [path, filename] = this.lib.getPathAndFilename(filepath); // eslint-disable-line
    this.lib.loadMusicData(this.sampleRate, path, filepath, data)
      .then((status) => {
        if (status !== 0) {
          return;
        }
        this.init(filepath, data);
        this.connect();
        this.resume();
        this.onPlayerStateUpdate(!this.isPlaying());
      });
  }

  createMetadata() {
    const metaData = this.lib.getMetaData();
    return {
      title: metaData[0] ? metaData[0] : this.lib.getCurrentFilename(),
      copyright: metaData[1],
      artist: metaData[2]
    };
  }

  getNumSubtunes() {
    return 1;  // FMP should contain only one track.
  }

  getSubtune() {
    return 0; // FMP does not have subtunes.
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
    let params = {};
    return [
      params,
    ];
  }

  setParameter(id, value) {
    switch (id) {
      default:
        console.warn('S98Player has no parameter with id "%s".', id);
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

  getChannels() {
    if (this.lib.isClosed()) {
      return [];
    }
    if (!this.lib.getPcmFilenames()[1]) {  // has ppz?
      return CHANNELS['OPNA'];
    } else {
      return CHANNELS['OPNA'].concat(CHANNELS['PPZ']);
    }
  }

  getVoiceName(index) {
    return this.getChannels()[index];
  }

  getNumVoices() {
    return this.getChannels().length;
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

    this.onPlayerStateUpdate(true);
  }
}