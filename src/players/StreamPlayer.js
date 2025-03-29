import Player from "./Player.js";
const encoding = require('encoding-japanese');

const fileExtensions = [
  'mp3', 'ogg'  // vgm stream has various type of format. They can be converted to mp3 as it's not realistic to support all of them on the web...
];

export default class StreamPlayer extends Player {
  constructor(audioCtx, destNode, chipCore, bufferSize) {
    super(audioCtx, destNode, chipCore, bufferSize);
    this.setParameter = this.setParameter.bind(this);
    this.getParameter = this.getParameter.bind(this);
    this.getParamDefs = this.getParamDefs.bind(this);

    this.sampleRate = audioCtx.sampleRate;
    this.channels = [];

    this.paused = true;
    this.fileExtensions = fileExtensions;
    this.tempo = 1.0;
    this.buffer = null;
    this.processedFrame = 0;
    this.durationMs = 0;

    this.params = {};
    this.setAudioProcess((e) => {
      for (let i = 0; i < e.outputBuffer.numberOfChannels; i++) {
        this.channels[i] = e.outputBuffer.getChannelData(i);
      }

      if (this.paused || this.buffer === null) {
        for (let channel = 0; channel < this.channels.length; channel++) {
          this.channels[channel].fill(0);
        }
        return;
      }

      if (this.getPositionMs() >= this.getDurationMs()) {
        for (let channel = 0; channel < this.channels.length; channel++) {
          this.channels[channel].fill(0);
        }
        this.stop();
        return;
      }

      const sourceData = this.buffer.getChannelData(0);
      const sourceLength = sourceData.length;

      // TypedArrayを使用して効率的にコピー
      for (let channel = 0; channel < this.channels.length; channel++) {
        const sourceChannel = (channel > 0 && this.buffer.numberOfChannels < 2) ? 0 : channel;
        const sourceData = this.buffer.getChannelData(sourceChannel);
        const targetData = this.channels[channel];
        
        for (let i = 0; i < this.bufferSize && i + this.processedFrame < sourceLength; i++) {
          targetData[i] = sourceData[i + this.processedFrame];
        }
      }
      this.processedFrame += this.bufferSize;
    });
  }

  restart() {
    this.seekMs(0);
    this.resume();
  }

  loadData(data, filepath) {
    this.init();
    this.metadata = this.createMetadata(data, filepath);
    
    // Safari doesn't support decodeAudioData() as promise based
    this.audioCtx.decodeAudioData(data.buffer, 
      (buffer) => {
        if (this.buffer) {
          // 古いバッファを解放
          this.buffer = null;
        }
        this.buffer = buffer;
        this.connect();
        this.resume();
        this.emit('playerStateUpdate', {
          ...this.getBasePlayerState(),
          isStopped: false,
          metadata: this.metadata,
        });
      },
      (error) => {
        console.error('Error decoding audio data:', error);
        this.emit('playerError', 'Failed to decode audio data');
      }
    );
  }

  init() {
    this.durationMs = 0;
    this.processedFrame = 0;
    this.buffer = null;
  }

  createMetadata(u8arrData, filepath) {
    let offset = 0;
    let title = '', artist = '';
    if (this.getID3v1String(u8arrData, offset, 3) === 'TAG') {
      offset += 3;
      title = this.getID3v1String(u8arrData, offset, 30);
      offset += 30;
      artist = this.getID3v1String(u8arrData, offset, 30);
    }
    if (!title) {
      const sp = filepath.split('/');
      title = sp[sp.length - 1];
    }
    this.metadata = {
      title: title,
      artist: artist,
    };
    return this.metadata;
  }

  getID3v1String(u8arrData, tagOffset, length) {
    if (u8arrData.length < 128) {
      return '';
    }
    
    let offset = (u8arrData.length - 128) + tagOffset;
    if (offset < 0 || offset + length > u8arrData.length) {
      return '';
    }

    const raw = [];
    for (let i = 0; i < length; i++) {
      const char = u8arrData[offset + i];
      if (char === 0) {
        break;
      }
      raw.push(char);
    }
    return encoding.convert(raw, {to: 'UNICODE', type: 'string'});
  }

  getNumSubtunes() {
    return 1;
  }

  getSubtune() {
    return 0;
  }

  getPositionMs() {
    return this.processedFrame * 1000 / this.sampleRate;
  }

  getDurationMs() {
    if (!this.durationMs) {
      this.durationMs = this.buffer.getChannelData(0).length * 1000 / this.sampleRate;
    }
    return this.durationMs;
  }

  getMetadata() {
    return this.metadata;
  }

  getParameter(id) {
    return this.params[id];
  }

  getParamDefs() {
    return [];
  }

  setParameter(id, value) {
    switch (id) {
      default:
        console.warn('StreamPlayer has no parameter with id "%s".', id);
    }
    this.params[id] = value;
  }

  isPlaying() {
    return !this.isPaused() && this.getPositionMs() < this.getDurationMs();
  }

  setTempo(val) {
  }

  setFadeout(startMs) {}

  getVoiceName(index) {
    return "";
  }

  getNumVoices() {
    return 0;
  }

  setVoiceMask(voices) {}

  getVoiceMask() {
    return [];
  }

  seekMs(positionMs) {
    this.processedFrame = Math.floor(positionMs * this.sampleRate / 1000);
  }

  stop() {
    this.suspend();
    if (this.buffer) {
      this.buffer = null;
    }
    console.debug('StreamPlayer.stop()');
    this.emit('playerStateUpdate', {
      ...this.getBasePlayerState(),
      isStopped: true,
      metadata: this.metadata,
    });
  }
}
