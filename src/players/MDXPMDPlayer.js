import Player from "./Player.js";
import promisify from "../promisifyXhr";

const fileExtensions = [
  'mdx', 'm', 'm2', 'mz'   // MDX, PMD
];

const rhythmPath = '/rhythm';
const remotePCMPath = '';
const internalPCMPath = '/MDXPMDPCM';

const SAMPLES_PER_BUFFER = 16384; // allowed: buffer sizes: 256, 512, 1024, 2048, 4096, 8192, 16384

class MDXPMDLibWrapper {
  constructor(chipCore) {
    this.mdxpmdlib = chipCore;
    this.fs = this.mdxpmdlib.FS;
    this.currentFile = null;
  }

  getAudioBuffer() {
    var ptr = this.mdxpmdlib.ccall('mdx_get_audio_buffer', 'number');
    // make it a this.Module.HEAP16 pointer
    return ptr >> 1;	// 2 x 16 bit samples
  }

  getAudioBufferLength() {
    return this.mdxpmdlib.ccall('mdx_get_audio_buffer_length', 'number');
  }

  computeAudioSamples() {
    return this.mdxpmdlib.ccall('mdx_compute_audio_samples', 'number');
  }

  getMaxPlaybackPosition() {
    return this.mdxpmdlib.ccall('mdx_get_max_position', 'number');
  }

  getPlaybackPosition() {
    return this.mdxpmdlib.ccall('mdx_get_current_position', 'number');
  }

  seekPlaybackPosition(pos) {
    this.mdxpmdlib.ccall('mdx_seek_position', 'number', ['number'], [pos]);
  }

  isMdxMode() {
    return this.mdxpmdlib.ccall('mdx_get_mdx_mode', 'number') === 1;
  }

  // registerFileData(pathFilenameArray, data) {
  //   return this.registerEmscriptenFileData(pathFilenameArray, data);
  // }

  loadMusicData(sampleRate, filename, data) {
    let buf = this.mdxpmdlib._malloc(data.length);
    this.mdxpmdlib.HEAPU8.set(data, buf);
    const result = this.mdxpmdlib.ccall('mdx_load_file', 'number',
      ['string', 'number', 'number'], [filename, buf, data.length]);
    this.mdxpmdlib._free(buf);

    if (result === 0) { // result -> 0: success, 1: error
      this.currentFile = filename;
    }
    return result;
  }

  // evalTrackOptions(options) {
  //   if (typeof options.timeout != 'undefined') {
  //     ScriptNodePlayer.getInstance().setPlaybackTimeout(options.timeout*1000);
  //   } else {
  //     ScriptNodePlayer.getInstance().setPlaybackTimeout(-1);	// reset last songs setting
  //   }
  //   var id= (options && options.track) ? options.track : -1;	// by default do not set track
  //   var boostVolume= (options && options.boostVolume) ? options.boostVolume : 0;
  //   return this.Module.ccall('emu_set_subsong', 'number', ['number', 'number'], [id, boostVolume]);	// not used here..
  // }

  teardown() {
    this.currentFile = null;
    this.mdxpmdlib.ccall('mdx_teardown', 'number');	// just in case
  }

  getSampleRate() {
    return this.mdxpmdlib.ccall('mdx_get_sample_rate', 'number');
  }

  setChannelMask(deviceIndex, mask) {
    // if (this.getDeviceName(deviceIndex) === 'OPN') {
    //   // seem to require a padding only for OPN, according to opna.cpp
    //   mask = (mask & 0b0111) + ((mask >> 3) << 6);
    // }
    // this.s98Lib.ccall('s98_set_channel_mask', null, ['number', 'number'], [deviceIndex, mask]);
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

  getDelegate() {
    return this.mdxpmdlib;
  }
}

export default class MDXPMDPlayer extends Player {
  constructor(audioCtx, destNode, chipCore, onPlayerStateUpdate) {
    super(audioCtx, destNode, chipCore, onPlayerStateUpdate);
    this.setParameter = this.setParameter.bind(this);
    this.getParameter = this.getParameter.bind(this);
    this.getParamDefs = this.getParamDefs.bind(this);

    this.lib = new MDXPMDLibWrapper(chipCore);
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
            finished = (this.lib.computeAudioSamples() === 1);
            if (!this.lib.isMdxMode() && !this.isFadingOut && this.getDurationMs() - this.currentPlaytime <= 2000) {
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
          this.sourceBuffer = this.lib.getAudioBuffer();
          this.sourceBufferLen = this.lib.getAudioBufferLength();

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

  init(fullFilename, data) {
    this.resetSampleRate(this.sampleRate, this.lib.getSampleRate());
    this.currentPlaytime = 0;
    this.isFadingOut = false;
    this.fadeOutStartMs = 0;
    this.params = {};

    const pathTokens = fullFilename.split('/');
    this.metadata = this.createMetadata(pathTokens[pathTokens.length - 1]);
  }

  // overrided methods from Player
  restart() {
    this.lib.seekPlaybackPosition(0);
    this.resume();
  }

  loadData(data, filepath) {
    if (this.lib.currentFile) {
      this.lib.teardown();
    }

    // Cの内部的にはすべて小文字と思っているので、ここで一律直してしまう
    filepath = filepath.toLowerCase();
    const [path, filename] = this.lib.getPathAndFilename(filepath);
    this.registerFileData(path, filename,  data);

    const status = this.lib.loadMusicData(this.sampleRate, filepath, data);
    if (status === 0) {
      this.init(filepath, data);
      this.connect();
      this.resume();

      this.onPlayerStateUpdate(!this.isPlaying());
    }
  }

  createMetadata(fullFilename) {
    // const module = this.s98lib.getDelegate();
    // const numOfInfo = 9;
    // const trackInfo = module.ccall('s98_get_track_info', 'number');
    //
    // const info = module.HEAP32.subarray(trackInfo >> 2, (trackInfo >> 2) + numOfInfo);
    // const parseMeta = function (input) {
    //   try {
    //     // TODO: We need converting Japanese Texts to UTF-8 from SJIS (S98 V3 allows both UTF-8 and SJIS encodings)
    //     return window.atob(module.UTF8ToString(input));
    //   } catch (e) {
    //     return module.UTF8ToString(input);
    //   }
    // };

    return {
      // title: parseMeta(info[0]),
      // artist: parseMeta(info[1]),
      // game: parseMeta(info[2]),
      // year: parseMeta(info[3]),
      // genre: parseMeta(info[4]),
      // comment: parseMeta(info[5]),
      // copyright: parseMeta(info[6]),
      // s98by: parseMeta(info[7]),
      // system: parseMeta(info[8]),
      title: 'test',
    };
  }

  getNumSubtunes() {
    return 1;  // MDX/PMD/FMP should contain only one track.
  }

  getSubtune() {
    return 0; // MDX/PMD/FMP does not have subtunes.
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
      // case 'pc98fix':
      //   this.setVolumeFix(value);
      //   break;
      default:
        console.warn('S98Player has no parameter with id "%s".', id);
    }
    this.params[id] = value;
  }

  isPlaying() {
    return !this.isPaused() && this.lib.getPlaybackPosition() < this.lib.getMaxPlaybackPosition();
  }

  setTempo(val) {
    //console.error('Unable to set speed for this file format.');
  }

  setFadeout(startMs) {
    this.isFadingOut = true;
    this.fadeOutStartMs = startMs;
  }

  getVoiceName(index) {
    return 'hoge'; //TODO: 実装
  }

  getNumVoices() {
    return 1;   //TODO 実装
  }

  setVoices(voices) {
    // TODO 実装
  }

  seekMs(positionMs) {
    this.lib.seekPlaybackPosition(positionMs);
  }

  stop() {
    this.suspend();
    //this.lib.close();
    this.lib.teardown(); // loadよりも、stop()のところで呼んだ方が確実な気がする

    console.debug('MDXPMDPlayer.stop()');
    this.onPlayerStateUpdate(true);
  }
}