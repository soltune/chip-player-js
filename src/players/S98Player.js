import autoBind from 'auto-bind';
import Player from "./Player.js";

const fileExtensions = [
  's98',
];
const rhythmPath = '/rhythm';

const SAMPLES_PER_BUFFER = 16384; // allowed: buffer sizes: 256, 512, 1024, 2048, 4096, 8192, 16384
const S98_CHANNEL_COUNT = 2; // S98 always outputs interleaved stereo (L/R/L/R...)
const CHANNELS = {
  'PSG': ['PSG 1', 'PSG 2', 'PSG 3'],                                                 // X1, MSX, many others
  'OPN': ['FM 1', 'FM 2', 'FM 3', 'PSG 1', 'PSG 2', 'PSG 3'],                         // PC-8801(NORMAL), PC-9801(26)
  'OPNA': ['FM 1', 'FM 2', 'FM 3', 'FM 4', 'FM 5', 'FM 6', 'PSG 1', 'PSG 2', 'PSG 3', // PC-8801(SB2), PC-9801(86)
    'ADPCM', 'Bass drum', 'Snare', 'Cymbal', 'Hi-hat', 'Tom-tom', 'Rim shot'],
  'OPN2': ['FM 1', 'FM 2', 'FM 3', 'FM 4', 'FM 5', 'FM 6'],                           // MegaDrive, FM-TOWNS
  'OPM': ['FM 1', 'FM 2', 'FM 3', 'FM 4', 'FM 5', 'FM 6', 'FM 7', 'FM 8'],            // X1(FM)
  'OPLL': ['FM 1', 'FM 2', 'FM 3', 'FM 4', 'FM 5', 'FM 6', 'FM 7', 'FM 8', 'FM 9',    // MasterSystem(FM), MSX2(FM)
    'Hi-hat', 'Cymbal', 'Tom-tom', 'Snare', 'Bass Drum'],
  'OPL': [],
  'OPL2': [],
  'OPL3': [],
  'SNG': [],
};

class S98LibWrapper {
  constructor(chipCore) {
    this.s98Lib = chipCore;
    this.fs = this.s98Lib.FS;
    this.currentFile = null;
  }

  getAudioBuffer() {
    const ptr = this.s98Lib.ccall('s98_get_audio_buffer', 'number');
    // make it a this.Module.HEAP16 pointer
    return ptr >> 1;	// 2 x 16 bit samples
  }

  getAudioBufferLength() {
    return this.s98Lib.ccall('s98_get_audio_buffer_length', 'number');
  }

  computeAudioSamples() {
    return this.s98Lib.ccall('s98_compute_audio_samples', 'number');
  }

  getMaxPlaybackPosition() {
    return this.s98Lib.ccall('s98_get_max_position', 'number');
  }

  getPlaybackPosition() {
    return this.s98Lib.ccall('s98_get_current_position', 'number');
  }

  seekPlaybackPosition(pos) {
    this.s98Lib.ccall('s98_seek_position', 'number', ['number'], [pos]);
  }

  getSampleRate() {
    return this.s98Lib.ccall('s98_get_sample_rate', 'number');
  }

  getDeviceCount() {
    return this.s98Lib.ccall('s98_get_device_count', 'number');
  }

  getDeviceName(deviceIndex) {
    const tokens = this.s98Lib.ccall('s98_get_device_name', 'string', ['number'], [deviceIndex]).split('_');
    return tokens[tokens.length - 1];
  }

  setChannelMask(deviceIndex, mask) {
    if (this.getDeviceName(deviceIndex) === 'OPN') {
      // seem to require a padding only for OPN, according to opna.cpp
      mask = (mask & 0b0111) + ((mask >> 3) << 6);
    }
    this.s98Lib.ccall('s98_set_channel_mask', null, ['number', 'number'], [deviceIndex, mask]);
  }

  setVolumes(deviceIndex, psgDb, fmDb, rhythmDb, adpcmDb) {
    this.s98Lib.ccall('s98_set_volumes', null, ['number', 'number', 'number', 'number', 'number'],
      [deviceIndex, psgDb, fmDb, rhythmDb, adpcmDb]);
  }

  getPathAndFilename(filename) {
    const sp = filename.split('/');
    const fn = sp[sp.length - 1];
    let path = filename.substring(0, filename.lastIndexOf("/"));
    if (path.length) path = path + "/";

    return [path, fn];
  }

  teardown() {
    this.s98Lib.ccall('s98_teardown', 'number');	// just in case
  }

  close() {
    this.s98Lib.ccall('s98_close');
    this.currentFile = null;
  }

  isClosed() {
    return this.currentFile === null;
  }

  getDelegate() {
    return this.s98Lib;
  }

  loadMusicData(sampleRate, filenameWithPath, data) {
    this.teardown();

    const filename = this.getPathAndFilename(filenameWithPath)[1];

    let buf = this.s98Lib._malloc(data.length);
    this.s98Lib.HEAPU8.set(data, buf);
    const result = this.s98Lib.ccall('s98_load_file', 'number', ['string', 'number', 'number'], [filename, buf, data.length]);
    this.s98Lib._free(buf);

    if (result === 0) { // result -> 0: success, 1: error
      this.currentFile = filename;

    }
    return result;
  }
}

export default class S98Player extends Player {
  constructor(...args) {
    super(...args);
    autoBind(this);

    this.playerKey = 's98';
    this.name = 'S98 Player';

    this.s98lib = new S98LibWrapper(this.core);
    this.fs = this.s98lib.fs;
    this.inputSampleRate = this.s98lib.getSampleRate();
    this.channels = [];

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
    this.isPC98System = false;

    this.params = {};
    this.voiceMask = [];

    // register rhythm data for OPNA
    this.registerRhythmData();
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
    const fadeoutTimeMs = 2000;
    this.numberOfSamplesRendered = 0;

    while (this.numberOfSamplesRendered < outSize) {
      if (this.numberOfSamplesToRender === 0) {

        this.currentPlaytime = this.getPositionMs();
        const detectLoop = this.s98lib.computeAudioSamples();
        if (!this.isFadingOut && detectLoop > 0 && this.getDurationMs() <= this.currentPlaytime) {
          this.setFadeout(this.currentPlaytime);
        }

        if ((detectLoop === -1 && this.currentPlaytime >= this.getDurationMs() )  // without loop
           || this.currentPlaytime >= (this.getDurationMs() + fadeoutTimeMs) ) {  // with loop
          this.fillEmpty(outSize);
          this.stop();
          return;
        }

        // refresh just in case they are not using one fixed buffer..
        this.sourceBuffer = this.s98lib.getAudioBuffer();
        this.sourceBufferLen = this.s98lib.getAudioBufferLength();

        this.numberOfSamplesToRender = this.getResampledAudio();
        this.sourceBufferIdx = 0;

        // Fading out
        if (this.isFadingOut && this.currentPlaytime >= this.fadeOutStartMs) {
          const current = this.currentPlaytime - this.getDurationMs();
          const ratio = Math.max((fadeoutTimeMs - current) / fadeoutTimeMs, 0);
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

  registerRhythmData() {
    [
      '2608_BD.WAV',
      '2608_HH.WAV',
      '2608_RIM.WAV',
      '2608_SD.WAV',
      '2608_TOM.WAV',
      '2608_TOP.WAV',
    ].forEach((rhythmFile) => {
      if (!this.existsFileData(rhythmPath, rhythmFile)) {
        const remoteRhythmAbsolutePath = this.getAbsolutePath([rhythmPath, rhythmFile]);
        fetch(remoteRhythmAbsolutePath, {method: 'GET',})
          .then(response => {
            if (!response.ok) {
              throw Error(response.statusText);
            }
            return response.arrayBuffer();
          })
          .then(buffer => {
            this.registerFileData(rhythmPath, rhythmFile, buffer);
          })
          .catch(e => {
            //console.log(e);
          });
      }
    });
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
      this.fs.mkdir(path);
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
    return (this.s98lib.getDelegate().HEAP16[buffer + idx]) / 0x8000;
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
    const ratio = len / resampleLen;
    for (let i = 0; i < resampleLen; i++) {
      const pos = i * ratio;
      const index = Math.floor(pos);
      const frac = pos - index;

      // Use S98_CHANNEL_COUNT as the input stride (S98 always outputs interleaved stereo),
      // independent of the output channel count (channels.length).
      const i0 = Math.max(index - 1, 0);
      const i1 = index;
      const i2 = Math.min(index + 1, len - 1);
      const i3 = Math.min(index + 2, len - 1);

      const p0 = this.readFloatSample(inputPtr, (i0 * S98_CHANNEL_COUNT) + channelId);
      const p1 = this.readFloatSample(inputPtr, (i1 * S98_CHANNEL_COUNT) + channelId);
      const p2 = this.readFloatSample(inputPtr, (i2 * S98_CHANNEL_COUNT) + channelId);
      const p3 = this.readFloatSample(inputPtr, (i3 * S98_CHANNEL_COUNT) + channelId);

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

  init(fullFilename, data) {
    this.resetSampleRate(this.sampleRate, this.s98lib.getSampleRate());
    this.currentPlaytime = 0;
    this.isFadingOut = false;
    this.fadeOutStartMs = 0;
    this.params = {};

    const pathTokens = fullFilename.split('/');
    this.metadata = this.createMetadata(pathTokens[pathTokens.length - 1]);
    if (this.metadata.system.indexOf('9801') > -1 || this.metadata.system.indexOf('9821') > -1) {
      // we need a tweak for the volume balance, as default setting seems to be referenced by PC-8801.
      this.setVolumeFix(true);
      this.isPC98System = true;
    } else {
      this.isPC98System = false;
    }
    // Keep the UI checkbox in sync with the applied state.
    this.params.pc98fix = this.isPC98System;
  }

  setVolumeFix(isPc9801Fix) {
    const volPsg = isPc9801Fix? -14 : 0;
    for (let i = 0; i < this.s98lib.getDeviceCount(); i++) {
      if (['OPN', 'OPNA'].indexOf(this.s98lib.getDeviceName(i) > -1)) {
        this.s98lib.setVolumes(i, volPsg, 0, 0, 0);
      }
    }
  }

  // overrided methods from Player
  restart() {
    this.s98lib.seekPlaybackPosition(0);
    this.resume();
  }

  loadData(data, filepath, persistedSettings = {}) {
    if (this.s98lib.currentFile) {
      this.s98lib.close();
    }

    const status = this.s98lib.loadMusicData(this.sampleRate, filepath, data);
    if (status !== 0) {
      throw Error('s98_load_file failed');
    }
    this.voiceMask = Array(this.getNumVoices()).fill(true);
    this.init(filepath, data);
    this.resume();

    this.emit('playerStateUpdate', {
      ...this.getBasePlayerState(),
      isStopped: false,
    });
  }

  createMetadata(fullFilename) {
    const module = this.s98lib.getDelegate();
    const numOfInfo = 9;
    const trackInfo = module.ccall('s98_get_track_info', 'number');

    const info = module.HEAP32.subarray(trackInfo >> 2, (trackInfo >> 2) + numOfInfo);
    return {
      title: module.UTF8ToString(info[0]),
      artist: module.UTF8ToString(info[1]),
      game: module.UTF8ToString(info[2]),
      year: module.UTF8ToString(info[3]),
      genre: module.UTF8ToString(info[4]),
      comment: module.UTF8ToString(info[5]),
      copyright: module.UTF8ToString(info[6]),
      s98by: module.UTF8ToString(info[7]),
      system: module.UTF8ToString(info[8]),
    };
  }

  getNumSubtunes() {
    return 1;  // s98 should contain only one track.
  }

  getSubtune() {
    return 0; // S98 does not have subtunes.
  }

  getPositionMs() {
    return this.isPaused()? 0 : this.s98lib.getPlaybackPosition();
  }

  getDurationMs() {
    return this.s98lib.getMaxPlaybackPosition();
  }

  getMetadata() {
    return this.metadata;
  }

  getParameter(id) {
    return this.params[id];
  }

  getParamDefs() {
    let px98fix = {};
    if (! this.s98lib.isClosed()) { // avoid illegal memory access because this method is also called on end of list
      px98fix = {
        id: 'pc98fix',
        label: 'PC-9801 Volume Balance Fix',
        hint: 'Fix volume balance for PC-9801.',
        type: 'toggle',
        defaultValue: this.isPC98System,
      };
    }
    return [
      px98fix,
    ];
  }

  setParameter(id, value) {
    switch (id) {
      case 'pc98fix':
        this.setVolumeFix(value);
        break;
      default:
        console.warn('S98Player has no parameter with id "%s".', id);
    }
    this.params[id] = value;
  }

  isPlaying() {
    return !this.isPaused() && this.s98lib.getPlaybackPosition() < this.s98lib.getMaxPlaybackPosition();
  }

  setTempo(val) {
    //console.error('Unable to set speed for this file format.');
  }

  setFadeout(startMs) {
    this.isFadingOut = true;
    this.fadeOutStartMs = startMs;
  }

  getAvailableChannelsOf(deviceIndex) {
    const deviceName = this.s98lib.getDeviceName(deviceIndex);
    return CHANNELS[deviceName];
  }

  getAvailableChannels() {
    let _channels = [];
    for (let i = 0; i < this.s98lib.getDeviceCount(); i++) {
      Array.prototype.push.apply(_channels, this.getAvailableChannelsOf(i));
    }
    return _channels;
  }

  getVoiceName(index) {
    return this.getAvailableChannels()[index];
  }

  getNumVoices() {
    return this.getAvailableChannels().length;
  }

  setVoiceMask(voices) {
    let shift = 0;
    for (let deviceIndex = 0; deviceIndex < this.s98lib.getDeviceCount(); deviceIndex++) {
      const availableChannels = this.getAvailableChannelsOf(deviceIndex).length;
      let voicesOfDevice = voices.slice(shift, shift + availableChannels);
      let mask = 0;
      voicesOfDevice.forEach((isEnabled, j) => {
        if (!isEnabled) {
          mask += (1 << j);
        }
      });
      this.s98lib.setChannelMask(deviceIndex, mask);
      shift += availableChannels;
    }
    this.voiceMask = voices;
  }

  getVoiceMask() {
    return this.voiceMask;
  }

  seekMs(positionMs) {
    this.s98lib.seekPlaybackPosition(positionMs);
  }

  stop() {
    this.suspend();
    this.s98lib.close();

    console.debug('S98Player.stop()');
    this.emit('playerStateUpdate', { isStopped: true });
  }
}