import Player from "./Player.js";
import {CATALOG_PREFIX} from "../config";

const fileExtensions = [
  'opi', 'ovi', 'ozi'
];

const rhythmPath = '/rhythm';
const internalPCMPath = '/fmppcm';  // on the remote, pcm files should be located where mdx/pmd files are
const remotePCMPath = '';         // if you collect pcm files at in one place, set the path.

const SAMPLES_PER_BUFFER = 16384; // allowed: buffer sizes: 256, 512, 1024, 2048, 4096, 8192, 16384
const CHANNELS = {
  'PMD': [
    'FM 1', 'FM 2', 'FM 3', 'FM 4', 'FM 5', 'FM 6',
    'SSG 1', 'SSG 2', 'SSG 3',
    'ADPCM',
    'SSG Rhythm',
    'Ext 1', 'Ext 2', 'Ext 3',
    'FM Rhythm',
    'Eff',
    'PPZ8 1', 'PPZ8 2', 'PPZ8 3', 'PPZ8 4', 'PPZ8 5', 'PPZ8 6', 'PPZ8 7', 'PPZ8 8'
  ],
  'MDX': {
    9: [
      'FM 1', 'FM 2', 'FM 3', 'FM 4', 'FM 5', 'FM 6', 'FM 7', 'FM 8', 'ADPCM'
    ],
    16: [
      'FM 1', 'FM 2', 'FM 3', 'FM 4', 'FM 5', 'FM 6', 'FM 7', 'FM 8',
      'PCM8 1', 'PCM8 2', 'PCM8 3', 'PCM8 4', 'PCM8 5', 'PCM8 6', 'PCM8 7', 'PCM8 8'
    ],
  }
};

class FMPLibWrapper {
  constructor(chipCore) {
    this.fmplib = chipCore;
    this.fs = this.fmplib.FS;
    this.currentFile = null;
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
    //this.fmplib.ccall('mdx_seek_position', 'number', ['number'], [pos]);
  }

  getPcmFilename() {
    //return this.fmplib.ccall('mdx_get_pcm_filename', 'string');
  }

  getMetaData() {
    // const metaData = [];
    // //const module = this.mdxpmdlib.getDelegate();
    // const numOfInfo = 2;
    // const trackInfo = this.mdxpmdlib.ccall('mdx_get_track_info', 'number');
    //
    // const info = this.mdxpmdlib.HEAP32.subarray(trackInfo >> 2, (trackInfo >> 2) + numOfInfo);
    // for (let i = 0; i < numOfInfo; i++) {
    //   metaData.push(this.mdxpmdlib.UTF8ToString(info[i]));
    // }
    // return metaData;
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

  loadMusicData(sampleRate, path, filename, data, onMusicLoadFinished) {
    let buf = this.fmplib._malloc(data.length);
    this.fmplib.HEAPU8.set(data, buf);
    const result = this.fmplib.ccall('fmp_load_file', 'number',
      ['string', 'number', 'number'], [filename, buf, data.length]);
    this.fmplib._free(buf);
    if (result === 0) { // result -> 0: success, 1: error
      this.currentFile = filename;
    }
    //
    // const pcmFileName = this.getPcmFilename();
    // if (pcmFileName) {
    //   let remotePcmAbsolutePath = this.getAbsolutePath([CATALOG_PREFIX, path, pcmFileName]);
    //   if (!this.existsFileData(internalPCMPath, pcmFileName)) {
    //     fetch(remotePcmAbsolutePath, {method: 'GET',})
    //       .then(response => {
    //         if (!response.ok) { // 404, 500.. missing pcm can be ignored for playing
    //           throw Error(response.statusText);
    //         }
    //         return response.arrayBuffer();
    //       })
    //       .then(buffer => {
    //         this.registerFileData(internalPCMPath, pcmFileName, buffer);
    //         this.mdxpmdlib.ccall('mdx_reload_pcm', null, ['string'], [this.getAbsolutePath([internalPCMPath, pcmFileName])]);
    //         onMusicLoadFinished(result);
    //       })
    //       .catch(e => {
    //         // console.log(e);
    //         return e;
    //         //onMusicLoadFinished(result);
    //       })
    //       .then((e) => { // second try
    //         if (e === undefined) {
    //           return;
    //         }
    //         if (!remotePCMPath) {
    //           onMusicLoadFinished(result);
    //           return;
    //         }
    //         remotePcmAbsolutePath = this.getAbsolutePath([CATALOG_PREFIX, remotePCMPath, pcmFileName]);
    //         fetch(remotePcmAbsolutePath, {method: 'GET',})
    //           .then(response => {
    //             if (!response.ok) { // 404, 500.. missing pcm can be ignored for playing
    //               throw Error(response.statusText);
    //             }
    //             return response.arrayBuffer();
    //           })
    //           .then(buffer => {
    //             this.registerFileData(internalPCMPath, pcmFileName, buffer);
    //             this.mdxpmdlib.ccall('mdx_reload_pcm', null, ['string'], [this.getAbsolutePath([internalPCMPath, pcmFileName])]);
    //             onMusicLoadFinished(result);
    //
    //           })
    //           .catch(e => {
    //             // console.log(e);
    //             onMusicLoadFinished(result); // giving up
    //           });
    //       });
    //   } else {
    //     // file already exists
    //     this.mdxpmdlib.ccall('mdx_reload_pcm', null, ['string'], [this.getAbsolutePath([internalPCMPath, pcmFileName])]);
    //     onMusicLoadFinished(result);
    //   }
    // } else {
    //   // no additional PCM required
    //   onMusicLoadFinished(result);
    // }
    onMusicLoadFinished(result);
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
    this.fmplib.ccall('fmp_teardown', 'number');	// just in case
  }

  getSampleRate() {
    return this.fmplib.ccall('fmp_get_sample_rate', 'number');
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

  hasLoop() {
    let loop = this.fmplib.ccall('fmp_has_loop', 'number');
    // console.log(loop);
    return loop === 1;
  }

  getVoiceCount() {
    //return this.fmplib.ccall('mdx_get_voices', 'number');
    return 1;
  }

  setVoices(voices) {
    //return this.fmplib.ccall('mdx_set_voices', null, ['number'], [voices]);
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
          if (this.lib.hasLoop()) { // has loops
            if (!this.isFadingOut && this.getDurationMs() - this.currentPlaytime <= fadeoutTimeMs) {
              this.setFadeout(this.currentPlaytime);
            }
          }

          if (this.currentPlaytime > this.getDurationMs()) {
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
    const rhythmFile = 'ym2608_adpcm_rom.bin';
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
    if (!this.lib.isClosed()) {
      this.lib.teardown();
    }

    const [path, filename] = this.lib.getPathAndFilename(filepath);
    this.lib.registerFileData(path, filename,  data);

    const _onMusicLoadFinished = (status) => {
      // we will get also PCM asynchronously in `loadMusicData()` so the following impl should be given as a callback
      if (status === 0) {
        this.init(filepath, data);
        this.connect();
        this.resume();

        this.onPlayerStateUpdate(!this.isPlaying());
      }
    };
    this.lib.loadMusicData(this.sampleRate, path, filepath, data, _onMusicLoadFinished);
  }

  createMetadata() {
    const metaData = this.lib.getMetaData();
    return {
      title: "todo; title", // title
      artist: "todo: artist", //artist
    };
  }

  getNumSubtunes() {
    return 1;  // MDX/PMD/FMP should contain only one track.
  }

  getSubtune() {
    return 0; // MDX/PMD does not have subtunes.
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
      // case 'rhythmwssg':
      //   this.lib.setRhythmWithSSG(value);
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
    this.lib.setTempo(val);
  }

  setFadeout(startMs) {
    this.isFadingOut = true;
    this.fadeOutStartMs = startMs;
  }

  getVoiceName(index) {
    // if (this.lib.isMdxMode()) {
    //   return CHANNELS['MDX'][this.getNumVoices()][index];
    // } else {
    //   return CHANNELS['PMD'][index];
    // }
  }

  getNumVoices() {
    return this.lib.getVoiceCount();
  }

  setVoices(voices) {
    let mask = 0;
    voices.forEach((enabled, i) => {
      if (!enabled) {
        mask += (1 << i);
      }
    });
   // this.lib.setVoices(mask);
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