import Player from "./Player.js";
const encoding = require('encoding-japanese');

const fileExtensions = [
  'mp3', 'ogg'  // vgm stream has various type of format. They can be converted to mp3 as it's not realistic to support all of them on the web...
];

export default class StreamPlayer extends Player {
  constructor(audioCtx, destNode, chipCore, onPlayerStateUpdate) {
    super(audioCtx, destNode, chipCore, onPlayerStateUpdate);
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

      for (let channel = 0; channel < this.channels.length; channel++) {
        const sourceChannel = (channel > 0 && this.buffer.numberOfChannels < 2)? 0 : channel;
        for (let i = 0; i < this.bufferSize && i + this.processedFrame < this.buffer.getChannelData(0).length; i++) {
          this.channels[channel][i] = this.buffer.getChannelData(sourceChannel)[i + this.processedFrame];
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
    this.audioCtx.decodeAudioData(data.buffer, (buffer) => {
      this.buffer = buffer;
      this.connect();
      this.resume();
      this.onPlayerStateUpdate(!this.isPlaying());
    });
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
    return {
      title: title,
      artist: artist,
    };
  }

  getID3v1String(u8arrData, tagOffset, length) {
    let offset = (u8arrData.length - 128) + tagOffset;  // 128 bytes from the end of the file
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

  setVoices(voices) {}

  seekMs(positionMs) {
    this.processedFrame = Math.floor(positionMs * this.sampleRate / 1000);
  }

  stop() {
    this.suspend();
    this.init();

    this.onPlayerStateUpdate(true);
  }
}
