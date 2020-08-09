import Player from "./Player.js";

const fileExtensions = [
  'vgm',
  'vgz',
];
const remoteInstrumentPath = '/instruments';
const localInstrumentPath = '/';

const SAMPLES_PER_BUFFER = 16384; // allowed: buffer sizes: 256, 512, 1024, 2048, 4096, 8192, 16384
const CHIP_CHANNELS = {
  0x00: [ // SN76496
    ['PSG 1', 'PSG 2', 'PSG 3', 'PSG 4'],
  ],
  0x01: [ // YM2413
    ['FM 1', 'FM 2', 'FM 3', 'FM 4', 'FM 5', 'FM 6', 'FM 7', 'FM 8', 'FM 9', 'BD', 'SD', 'TOM', 'TC', 'HH'],
  ],
  0x02: [ // YM2612
    ['FM 1', 'FM 2', 'FM 3', 'FM 4', 'FM 5', 'FM 6', 'DAC'],
  ],
  0x03: [ // YM2151
    ['FM 1', 'FM 2', 'FM 3', 'FM 4', 'FM 5', 'FM 6', 'FM 7', 'FM 8'],
  ],
  0x04: [ // SegaPCM
    ['PCM 1', 'PCM 2', 'PCM 3', 'PCM 4', 'PCM 5', 'PCM 6', 'PCM 7', 'PCM 8',
        'PCM 9', 'PCM 10', 'PCM 11', 'PCM 12', 'PCM 13', 'PCM 14', 'PCM 15', 'PCM 16']
  ],
  0x05: [ // RF5C68
    ['PCM 1', 'PCM 2', 'PCM 3', 'PCM 4', 'PCM 5', 'PCM 6', 'PCM 7', 'PCM 8'],
  ],
  0x06: [ // YM2203
    ['FM 1', 'FM 2', 'FM 3'], ['SSG 1', 'SSG 2', 'SSG 3'], // AY8910
  ],
  0x07: [ // YM2608
    ['FM 1', 'FM 2', 'FM 3', 'FM 4', 'FM 5', 'FM 6', 'BD', 'SD', 'TC', 'HH', 'TOM', 'RIM', 'DeltaT'],
    ['SSG 1', 'SSG 2', 'SSG 3'], // AY8910
  ],
  0x08: [ // YM2610
    ['FM 1', 'FM 2', 'FM 3', 'FM 4', 'FM 5', 'FM 6', 'ADPCM 1', 'ADPCM 2', 'ADPCM 3','ADPCM 4', 'ADPCM 5', 'ADPCM 6', 'DeltaT'],
    ['SSG 1', 'SSG 2', 'SSG 3'], // AY8910
  ],
  0x09: [ // YM3812
    ['FM 1', 'FM 2', 'FM 3', 'FM 4', 'FM 5', 'FM 6', 'FM 7', 'FM 8', 'FM 9', 'BD', 'SD', 'TOM', 'TC', 'HH'],
  ],
  0x0A: [ // YM3526
    ['FM 1', 'FM 2', 'FM 3', 'FM 4', 'FM 5', 'FM 6', 'FM 7', 'FM 8', 'FM 9', 'BD', 'SD', 'TOM', 'TC', 'HH'],
  ],
  0x0B: [ // Y8950
    ['FM 1', 'FM 2', 'FM 3', 'FM 4', 'FM 5', 'FM 6', 'FM 7', 'FM 8', 'FM 9', 'BD', 'SD', 'TOM', 'TC', 'HH', 'DT'],
  ],
  0x0C: [ // YMF262
    ['FM 1', 'FM 2', 'FM 3', 'FM 4', 'FM 5', 'FM 6', 'FM 7', 'FM 8', 'FM 9', 'FM 10', 'FM 11', 'FM 12', 'FM 13', 'FM 14',
      'FM 15', 'FM 16', 'FM 17', 'FM 18','BD', 'SD', 'TOM', 'TC', 'HH', 'DT'],
  ],
  0x0D: [ // YMF278B
    ['FM 1', 'FM 2', 'FM 3', 'FM 4', 'FM 5', 'FM 6', 'FM 7', 'FM 8', 'FM 9', 'FM 10', 'FM 11', 'FM 12', 'FM 13', 'FM 14',
      'FM 15', 'FM 16', 'FM 17', 'FM 18', 'BD', 'SD', 'TOM', 'TC', 'HH', 'DT'],
    ['WT 1', 'WT 2', 'WT 3', 'WT 4', 'WT 5', 'WT 6', 'WT 7', 'WT 8', 'WT 9', 'WT 10', 'WT 11', 'WT 12', 'WT 13', 'WT 14',
      'WT 15', 'WT 16', 'WT 17', 'WT 18','WT 19', 'WT 20', 'WT 21', 'WT 22', 'WT 23', 'WT 24'],
  ],
  0x0E: [ // YMF271
    ['FM 1', 'FM 2', 'FM 3', 'FM 4', 'FM 5', 'FM 6', 'FM 7', 'FM 8', 'FM 9', 'FM 10', 'FM 11', 'FM 12'],
  ],
  0x0F: [ // YMZ280B
    ['PCM 1', 'PCM 2', 'PCM 3', 'PCM 4', 'PCM 5', 'PCM 6', 'PCM 7', 'PCM 8'],
  ],
  0x10: [ // RF5C164
    ['PCM 1', 'PCM 2', 'PCM 3', 'PCM 4', 'PCM 5', 'PCM 6', 'PCM 7', 'PCM 8'],
  ],
  0x11: [ // PWM
    ['PWM']
  ],
  0x12: [ // AY8910
    ['PSG 1', 'PSG 2', 'PSG 3'],
  ],
  0x13: [ // GameBoy
    ['CH 1', 'CH 2', 'CH 3', 'CH 4'],
  ],
  0x14: [ // NES APU
    ['Square', 'Square', 'Triangle', 'Noise', 'DPCM', 'FDS'],
  ],
  0x15: [ // MultiPCM
    ['PCM 1', 'PCM 2', 'PCM 3', 'PCM 4', 'PCM 5', 'PCM 6', 'PCM 7', 'PCM 8', 'PCM 9', 'PCM 10', 'PCM 11', 'PCM 12',
      'PCM 13', 'PCM 14', 'PCM 15', 'PCM 16', 'PCM 17', 'PCM 18', 'PCM 19', 'PCM 20', 'PCM 21', 'PCM 22', 'PCM 23', 'PCM 24',
      'PCM 25', 'PCM 26', 'PCM 27', 'PCM 28'],
  ],
  0x16: [ // UPD7759
    ['ADPCM']
  ],
  0x17: [ // OKIM6258
    ['ADPCM']
  ],
  0x18: [ // OKIM6295
    ['ADPCM 1', 'ADPCM 2', 'ADPCM 3', 'ADPCM 4'],
  ],
  0x19: [ // K051649
    ['SCC 1', 'SCC 2', 'SCC 3', 'SCC 4', 'SCC 5'],
  ],
  0x1A: [ // K054539
    ['PCM 1', 'PCM 2', 'PCM 3', 'PCM 4', 'PCM 5', 'PCM 6', 'PCM 7', 'PCM 8'],
  ],
  0x1B: [ // HuC6280
    ['WAVF 1', 'WAVF 2', 'WAVF 3', 'WAVF 4', 'WAVF 5', 'WAVF 6'],
  ],
  0x1C: [ // C140
    ['PCM 1', 'PCM 2', 'PCM 3', 'PCM 4', 'PCM 5', 'PCM 6', 'PCM 7', 'PCM 8', 'PCM 9', 'PCM 10', 'PCM 11', 'PCM 12',
      'PCM 13', 'PCM 14', 'PCM 15', 'PCM 16', 'PCM 17', 'PCM 18', 'PCM 19', 'PCM 20', 'PCM 21', 'PCM 22', 'PCM 23', 'PCM 24']
  ],
  0x1D: [ // K053260
    ['PCM 1', 'PCM 2', 'PCM 3', 'PCM 4', 'PCM 5', 'PCM 6', 'PCM 7', 'PCM 8']
  ],
  0x1E: [ // Pokey
    ['PSG 1', 'PSG 2', 'PSG 3', 'PSG 4']
  ],
  0x1F: [ // QSound
    ['CH 1', 'CH 2', 'CH 3', 'CH 4', 'CH 5', 'CH 6', 'CH 7', 'CH 8',
      'CH 9', 'CH 10', 'CH 11', 'CH 12', 'CH 13', 'CH 14', 'CH 15', 'CH 16']
  ],
  0x20: [ // SCSP (Saturn)
    ['PCM 1', 'PCM 2', 'PCM 3', 'PCM 4', 'PCM 5', 'PCM 6', 'PCM 7', 'PCM 8', 'PCM 9', 'PCM 10', 'PCM 11', 'PCM 12',
      'PCM 13', 'PCM 14', 'PCM 15', 'PCM 16', 'PCM 17', 'PCM 18', 'PCM 19', 'PCM 20', 'PCM 21', 'PCM 22', 'PCM 23', 'PCM 24',
      'PCM 25', 'PCM 26', 'PCM 27', 'PCM 28', 'PCM 29', 'PCM 30', 'PCM 31', 'PCM 32']
  ],
  0x21: [ // WonderSwan
    ['CH 1', 'CH 2', 'CH 3', 'CH 4']
  ],
  0x22: [ // VSU (Virtual Boy)
    ['CH 1', 'CH 2', 'CH 3', 'CH 4', 'CH 5', 'CH 6']
  ],
  0x23: [ // SAA1099
    ['PSG 1', 'PSG 2', 'PSG 3', 'PSG 4', 'PSG 5', 'PSG 6']
  ],
  0x24: [ // ES5503
    ['PCM 1', 'PCM 2', 'PCM 3', 'PCM 4', 'PCM 5', 'PCM 6', 'PCM 7', 'PCM 8', 'PCM 9', 'PCM 10', 'PCM 11', 'PCM 12',
      'PCM 13', 'PCM 14', 'PCM 15', 'PCM 16', 'PCM 17', 'PCM 18', 'PCM 19', 'PCM 20', 'PCM 21', 'PCM 22', 'PCM 23', 'PCM 24',
      'PCM 25', 'PCM 26', 'PCM 27', 'PCM 28', 'PCM 29', 'PCM 30', 'PCM 31', 'PCM 32']
  ],
  0x25: [ // ES5506
    ['PCM 1', 'PCM 2', 'PCM 3', 'PCM 4', 'PCM 5', 'PCM 6', 'PCM 7', 'PCM 8', 'PCM 9', 'PCM 10', 'PCM 11', 'PCM 12',
      'PCM 13', 'PCM 14', 'PCM 15', 'PCM 16', 'PCM 17', 'PCM 18', 'PCM 19', 'PCM 20', 'PCM 21', 'PCM 22', 'PCM 23', 'PCM 24',
      'PCM 25', 'PCM 26', 'PCM 27', 'PCM 28', 'PCM 29', 'PCM 30', 'PCM 31', 'PCM 32']
  ],
  0x26: [ // X1_010
    ['PCM 1', 'PCM 2', 'PCM 3', 'PCM 4', 'PCM 5', 'PCM 6', 'PCM 7', 'PCM 8', 'PCM 9', 'PCM 10', 'PCM 11', 'PCM 12',
      'PCM 13', 'PCM 14', 'PCM 15', 'PCM 16']
  ],
  0x27: [ // C352
    ['PCM 1', 'PCM 2', 'PCM 3', 'PCM 4', 'PCM 5', 'PCM 6', 'PCM 7', 'PCM 8', 'PCM 9', 'PCM 10', 'PCM 11', 'PCM 12',
      'PCM 13', 'PCM 14', 'PCM 15', 'PCM 16', 'PCM 17', 'PCM 18', 'PCM 19', 'PCM 20', 'PCM 21', 'PCM 22', 'PCM 23', 'PCM 24',
      'PCM 25', 'PCM 26', 'PCM 27', 'PCM 28', 'PCM 29', 'PCM 30', 'PCM 31', 'PCM 32']
  ],
  0x28: [ // GA20
    ['PCM 1', 'PCM 2', 'PCM 3', 'PCM 4']
  ],
};

class VGMLibWrapper {
  constructor(chipCore) {
    this.vgmLib = chipCore;
    this.fs = this.vgmLib.FS;
    this.currentFile = null;
  }

  getAudioBuffer() {
    const ptr = this.vgmLib.ccall('vgm_get_audio_buffer', 'number');
    // make it a this.Module.HEAP16 pointer
    return ptr >> 1;	// 2 x 16 bit samples
  }

  getAudioBufferLength() {
    return this.vgmLib.ccall('vgm_get_audio_buffer_length', 'number');
  }

  computeAudioSamples() {
    return this.vgmLib.ccall('vgm_compute_audio_samples', 'number');
  }

  getMaxPlaybackPosition() {
    return this.vgmLib.ccall('vgm_get_max_position', 'number');
  }

  getPlaybackPosition() {
    return this.vgmLib.ccall('vgm_get_position', 'number');
  }

  seekPlaybackPosition(pos) {
    const posInSample = pos / 1000 * this.getSampleRate();
    this.vgmLib.ccall('vgm_seek_position', 'number', ['number'], [posInSample]);
  }

  getSampleRate() {
    return this.vgmLib.ccall('vgm_get_sample_rate', 'number');
  }

  setChannelMask(chipType, chipID, mask1, mask2) {
    this.vgmLib.ccall('vgm_set_channel_mask', null,
        ['number', 'number', 'number', 'number'], [chipType, chipID, mask1, mask2]);
  }

  getPathAndFilename(filename) {
    const sp = filename.split('/');
    const fn = sp[sp.length - 1];
    let path = filename.substring(0, filename.lastIndexOf("/"));
    if (path.length) path = path + "/";

    return [path, fn];
  }

  teardown() {
    this.vgmLib.ccall('vgm_teardown', 'number');	// just in case
  }

  close() {
    this.teardown();
    this.currentFile = null;
  }

  isClosed() {
    return this.currentFile === null;
  }

  getDelegate() {
    return this.vgmLib;
  }

  loadMusicData(sampleRate, filenameWithPath, data) {
    let path, filename;
    [path, filename] = this.getPathAndFilename(filenameWithPath);

    if (!this.existsFileData(path, filename)) {
      this.registerFileData(path, filename, data);
    }

    const result = this.vgmLib.ccall('vgm_init', 'number', ['number', 'string', 'string'], [sampleRate, path, filename]);
    if (result === 0) { // result -> 0: success, 1: error
      this.currentFile = filename;
    }
    this.vgmLib.ccall('vgm_set_subsong', 'number', ['number', 'number'], [0, 0]);
    return result;
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

  getChipType(chipNum) {
    return this.vgmLib.ccall('vgm_get_chip_type', 'number', ['number'], [chipNum]);
  }

  setSurround(enableSurround) {
    const param = enableSurround? 1 : 0;
    this.vgmLib.ccall('vgm_set_surround', null, ['number'], [param]);
  }
}

export default class VGMPlayer extends Player {
  constructor(audioCtx, destNode, chipCore, onPlayerStateUpdate) {
    super(audioCtx, destNode, chipCore, onPlayerStateUpdate);
    this.setParameter = this.setParameter.bind(this);
    this.getParameter = this.getParameter.bind(this);
    this.getParamDefs = this.getParamDefs.bind(this);

    this.vgmlib = new VGMLibWrapper(chipCore);
    this.fs = this.vgmlib.fs;
    this.sampleRate = audioCtx.sampleRate;
    this.inputSampleRate = this.vgmlib.getSampleRate();
    this.channels = [];

    this.resampleBuffer = this.allocResampleBuffer(0);
    this.isStereo = destNode.channelCount === 2;

    this.paused = true;
    this.fileExtensions = fileExtensions;
    this.tempo = 1.0;
    this.currentPlaytime = 0;
    this.chips = null;
    this.channelNames = null;

    this.numberOfSamplesToRender = 0;
    this.sourceBufferIdx = 0;
    this.sourceBuffer = null;
    this.sourceBufferLen = 0;
    this.surround = false;

    this.params = {};

    // register OPL4 ROM data
    this.registerVGMInstruments();

    this.setAudioProcess((e) => {
      for (let i = 0; i < e.outputBuffer.numberOfChannels; i++) {
        this.channels[i] = e.outputBuffer.getChannelData(i);
      }

      if (this.vgmlib.isClosed() || this.paused) {
        for (let i = 0; i < this.channels.length; i++) {
          this.channels[i].fill(0);
        }
        return;
      }

      const outSize = this.channels[0].length;
      this.numberOfSamplesRendered = 0;

      while (this.numberOfSamplesRendered < outSize) {
        if (this.numberOfSamplesToRender === 0) {

          this.currentPlaytime = this.getPositionMs();
          this.vgmlib.computeAudioSamples();
          if (this.currentPlaytime >= this.getDurationMs() ) {
            this.fillEmpty(outSize);
            this.stop();
            return;
          }

          // refresh just in case they are not using one fixed buffer..
          this.sourceBuffer = this.vgmlib.getAudioBuffer();
          this.sourceBufferLen = this.vgmlib.getAudioBufferLength();

          this.numberOfSamplesToRender = this.getResampledAudio();
          this.sourceBufferIdx = 0;
        }

        if (this.isStereo) {
          this.copySamplesStereo();
        } else {
          this.copySamplesMono();
        }
      }
    });
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

  // Loading Rom for YMF278 (to /yrw801.rom in internal FS)
  registerVGMInstruments() {
    ['yrw801.rom',].forEach((instrument) => {
      if (!this.vgmlib.existsFileData(localInstrumentPath, instrument)) {
        const remoteAbsolutePath = this.getAbsolutePath([remoteInstrumentPath, instrument]);
        fetch(remoteAbsolutePath, {method: 'GET',})
          .then(response => {
            if (!response.ok) {
              throw Error(response.statusText);
            }
            return response.arrayBuffer();
          })
          .then(buffer => {
            this.registerFileData(localInstrumentPath, instrument, buffer);
          })
          .catch(e => {
            //console.log(e);
          });
      }
    });
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
    return (this.vgmlib.getDelegate().HEAP16[buffer + idx]) / 0x8000;
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
    this.resetSampleRate(this.sampleRate, this.vgmlib.getSampleRate());
    this.currentPlaytime = 0;
    this.chips = null;
    this.channelNames = null;
    this.params = {};
    this.vgmlib.setSurround(this.surround);

    const pathTokens = fullFilename.split('/');
    this.metadata = this.createMetadata(pathTokens[pathTokens.length - 1]);

    this.chips = this.getAvailableChips();
  }

  // overrided methods from Player
  restart() {
    this.vgmlib.seekPlaybackPosition(0);
    this.resume();
  }

  loadData(data, filepath) {
    if (this.vgmlib.currentFile) {
      this.vgmlib.close();
    }

    const status = this.vgmlib.loadMusicData(this.sampleRate, filepath, data);
    if (status === 0) {
      this.init(filepath, data);
      this.connect();
      this.resume();

      this.onPlayerStateUpdate(!this.isPlaying());
    }
  }

  createMetadata(filename) {
    const module = this.vgmlib.getDelegate();

    const numOfInfo = 6;
    const pTrackInfo = module.ccall('vgm_get_track_info', 'number');
    const trackInfo = module.HEAP32.subarray(pTrackInfo >> 2, (pTrackInfo >> 2) + numOfInfo);

    const getString = pointer => {
      let str = "";
      for (let i = 0; i < 256; i++) {
        let char = module.getValue(pointer + (i * 4), 'i32'); // wide char = 4 bytes
        if (char === 0) {
          break;
        }
        str += String.fromCharCode(char);
      }
      return str;
    };

    const title = getString(trackInfo[0]);
    return {
      title: title? title : filename,
      artist: getString(trackInfo[1]),
      game: getString(trackInfo[2]),
      comment: getString(trackInfo[3]),
      //copyright: getString(trackInfo[1]),
      system: getString(trackInfo[4]),
    };
  }

  getNumSubtunes() {
    return 1;  // vgm should contain only one track.
  }

  getSubtune() {
    return 0; // vgm does not have subtunes.
  }

  getPositionMs() {
    return this.vgmlib.getPlaybackPosition() * 1000 / this.sampleRate;
  }

  getDurationMs() {
    return this.vgmlib.getMaxPlaybackPosition() * 1000 / this.sampleRate;
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
        id: 'enableSurround',
        label: 'Enable Surround',
        hint: 'Inverts the waveform of the right channel to create a pseudo surround effect.',
        type: 'toggle',
        defaultValue: this.surround,
      }
    ];
  }

  setParameter(id, value) {
    switch (id) {
      case 'enableSurround':
        this.surround = value;
        this.vgmlib.setSurround(value);
        break;
      default:
        console.warn('VGMPlayer has no parameter with id "%s".', id);
    }
    this.params[id] = value;
  }

  isPlaying() {
    return !this.isPaused() && this.vgmlib.getPlaybackPosition() < this.vgmlib.getMaxPlaybackPosition();
  }

  setTempo(val) {
    //console.error('Unable to set speed for this file format.');
  }

  setFadeout(startMs) {
  }

  getAvailableChips() {
    let lastChipType = 0xFF, chipID = 0, chipNum = 0, chipType = -1;
    const chips = [];
    while ((chipType = this.vgmlib.getChipType(chipNum++)) !== 0xFF) {
      chipID = (lastChipType === chipType)? chipID + 1: 0;
      const channels = CHIP_CHANNELS[chipType];
      let numChannels = 0;
      channels.forEach(channel => {numChannels += channel.length});
      chips.push({
        chipType: chipType,
        chipID: chipID,
        channel: numChannels,
      });
      lastChipType = chipType;
    }
    return chips;
  }

  getVoiceName(index) {
    if (!this.channelNames) {
      this.channelNames = [];
      this.chips.forEach(chip => {
        CHIP_CHANNELS[chip.chipType].forEach(channel => {this.channelNames = this.channelNames.concat(channel)});
      });
    }
    return this.channelNames[index];
  }

  getNumVoices() {
    let total = 0;
    this.chips.forEach(chip => {total += chip.channel});
    return total;
  }

  setVoices(voices) {
    const toInt = booleans => {
      if (!booleans) return null;

      let intValue = 0;
      booleans.forEach((isEnabled, idx) => {
        if (!isEnabled)  {
          intValue += parseInt('1' + '0'.repeat(idx), 2); // Warning: this code may produces overflow for too many channels!
        }
      });
      return intValue;
    };
    this.getChannelMaskParams(voices).forEach(param => {
      this.vgmlib.setChannelMask(param.chipType, param.chipID, toInt(param.mask1), toInt(param.mask2));
    });
  }

  seekMs(positionMs) {
    this.vgmlib.seekPlaybackPosition(positionMs);
  }

  stop() {
    this.suspend();
    this.vgmlib.close();

    console.debug('VGMPlayer.stop()');
    this.onPlayerStateUpdate(true);
  }

  getChannelMaskParams(voices) {
    const params = [];
    let sliceBegin = 0;
    this.chips.forEach(chip => {
      const param = voices.slice(sliceBegin, sliceBegin + chip.channel);
      const channels = CHIP_CHANNELS[chip.chipType];
      if (channels.length === 2) {
        const param1 = param.slice(0, channels[0].length);
        const param2 = param.slice(channels[0].length, channels[0].length + channels[1].length)
        params.push({chipType: chip.chipType, chipID: chip.chipID, mask1: param1, mask2: param2});
      } else {
        params.push({chipType: chip.chipType, chipID: chip.chipID, mask1: param, mask2: null});
      }
      sliceBegin += chip.channel;
    });
    return params;
  }
}