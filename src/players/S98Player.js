import Player from "./Player.js";
import promisify from "../promisifyXhr";

const fileExtensions = [
  's98',
];
const rhythmPath = '/rhythm';

const SAMPLES_PER_BUFFER = 16384; // allowed: buffer sizes: 256, 512, 1024, 2048, 4096, 8192, 16384
const CHANNELS = {
  'PSG': ['PSG1', 'PSG2', 'PSG3'],                                                    // X1, MSX, many others
  'OPN': ['FM1', 'FM2', 'FM3', 'PSG1', 'PSG2', 'PSG3'],                               // PC-8801(NORMAL), PC-9801(26)
  'OPNA': ['FM1', 'FM2', 'FM3', 'FM4', 'FM5', 'FM6', 'PSG1', 'PSG2', 'PSG3', 'ADPCM', // PC-8801(SB2), PC-9801(86)
    'Bass drum', 'Snare', 'Cymbal', 'Hi-hat', 'Tom-tom', 'Rim shot'],
  'OPN2': ['FM1', 'FM2', 'FM3', 'FM4', 'FM5', 'FM6'],                                 // MegaDrive, FM-TOWNS
  'OPM': ['FM1', 'FM2', 'FM3', 'FM4', 'FM5', 'FM6', 'FM7', 'FM8'],                    // X1(FM)
  'OPLL': ['FM1', 'FM2', 'FM3', 'FM4', 'FM5', 'FM6', 'FM7', 'FM8', 'FM9',
    'Hi-hat', 'Cymbal', 'Tom-tom', 'Snare', 'Bass Drum'],                             // MasterSystem(FM), MSX2(FM)
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
  constructor(audioCtx, destNode, chipCore, onPlayerStateUpdate) {
    super(audioCtx, destNode, chipCore, onPlayerStateUpdate);
    this.setParameter = this.setParameter.bind(this);
    this.getParameter = this.getParameter.bind(this);
    this.getParamDefs = this.getParamDefs.bind(this);

    this.s98lib = new S98LibWrapper(chipCore);
    this.fs = this.s98lib.fs;
    this.sampleRate = audioCtx.sampleRate;
    this.inputSampleRate = this.s98lib.getSampleRate();
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

    // register rhythm data for OPNA
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
      this.numberOfSamplesRendered = 0;

      while (this.numberOfSamplesRendered < outSize) {
        if (this.numberOfSamplesToRender === 0) {

          let finished = false;
          this.currentPlaytime = Math.max(this.getPositionMs(), this.currentPlaytime);
          if (this.currentPlaytime > 0 && this.getPositionMs() === 0) {
            finished = true;  // detected the termination of non-looped tune
          } else {
            finished = (this.s98lib.computeAudioSamples() === 1);
            if (!this.isFadingOut && this.getDurationMs() - this.currentPlaytime <= 2000) {
              this.setFadeout(this.currentPlaytime);
            }
          }

          if (finished) {
            // no frame left
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
            const duration = this.getDurationMs() - this.fadeOutStartMs;
            const current = this.currentPlaytime - this.fadeOutStartMs;
            const ratio = (duration - current) / duration;
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
        const fileRequest = promisify(new XMLHttpRequest());
        fileRequest.responseType = 'arraybuffer';
        fileRequest.open('GET', rhythmPath + '/' + rhythmFile);
        fileRequest.send()
          .then(xhr => xhr.response)
          .then(buffer => {
            this.registerFileData(rhythmPath, rhythmFile, buffer);
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
    }
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

  loadData(data, filepath) {
    if (this.s98lib.currentFile) {
      this.s98lib.close();
    }

    const status = this.s98lib.loadMusicData(this.sampleRate, filepath, data);
    if (status === 0) {
      this.init(filepath, data);
      this.connect();
      this.resume();

      this.onPlayerStateUpdate(!this.isPlaying());
    }
  }

  createMetadata(fullFilename) {
    const module = this.s98lib.getDelegate();
    const numOfInfo = 9;
    const trackInfo = module.ccall('s98_get_track_info', 'number');

    const info = module.HEAP32.subarray(trackInfo >> 2, (trackInfo >> 2) + numOfInfo);
    const parseMeta = function (input) {
      try {
        // TODO: We need converting Japanese Texts to UTF-8 from SJIS (S98 V3 allows both UTF-8 and SJIS encodings)
        return window.atob(module.UTF8ToString(input));
      } catch (e) {
        return module.UTF8ToString(input);
      }
    };

    return {
      title: parseMeta(info[0]),
      artist: parseMeta(info[1]),
      game: parseMeta(info[2]),
      year: parseMeta(info[3]),
      genre: parseMeta(info[4]),
      comment: parseMeta(info[5]),
      copyright: parseMeta(info[6]),
      s98by: parseMeta(info[7]),
      system: parseMeta(info[8]),
    };
  }

  getNumSubtunes() {
    return 1;  // s98 should contain only one track.
  }

  getSubtune() {
    return 0; // S98 does not have subtunes.
  }

  getPositionMs() {
    return this.s98lib.getPlaybackPosition();
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
      if (['OPN', 'OPNA'].indexOf(this.s98lib.getDeviceName()) > -1 && this.metadata.system.indexOf('9801') === -1) {
        px98fix = {
          id: 'pc98fix',
          label: 'PC-9801 Volume Balance Fix',
          hint: 'Fix volume balance for PC-9801.',
          type: 'toggle',
          defaultValue: false,
        };
      }
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

  setVoices(voices) {
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
  }

  seekMs(positionMs) {
    this.s98lib.seekPlaybackPosition(positionMs);
  }

  stop() {
    this.suspend();
    this.s98lib.close();

    console.debug('S98Player.stop()');
    this.onPlayerStateUpdate(true);
  }
}