import Player from "./Player.js";
import { ensureEmscFileWithData, ensureEmscFileWithUrl, pathJoin } from '../util';
import { CATALOG_PREFIX } from '../config';
import pathe from 'pathe';
import autoBind from 'auto-bind';

const fileExtensions = [
  'miniusf',
];
const MOUNTPOINT = '/n64';
// Fork: 32768 (not 32767) is the correct normalization divisor for signed 16-bit (-32768..+32767).
const INT16_MAX = Math.pow(2, 15);

export default class N64Player extends Player {
  paramDefs = [
    {
      id: 'indefinitePlayback',
      label: 'Indefinite Playback',
      type: 'toggle',
      hint: 'Ignore track length metadata for looping tracks and loop indefinitely.',
      defaultValue: false,
    },
  ];

  constructor(...args) {
    super(...args);
    autoBind(this);

    // Initialize N64 filesystem
    this.core.FS.mkdirTree(MOUNTPOINT);
    this.core.FS.mount(this.core.FS.filesystems.IDBFS, {}, MOUNTPOINT);

    this.playerKey = 'n64';
    this.name = 'N64 Player';
    this.fileExtensions = fileExtensions;
    this.buffer = this.core._malloc(this.bufferSize * 4); // 2 ch, 16-bit
  }

  loadData(data, filename, persistedSettings) {
    // Fork: the Sequencer calls suspend() (not stop()) between songs, so
    // _n64_shutdown() would not otherwise run. Without this, the emulator
    // keeps accumulating audio samples from the previous song into its
    // internal buffer, which then leak into the start of the new song.
    this.core._n64_shutdown();

    // N64Player reads song data from the Emscripten filesystem,
    // rather than loading bytes from memory like other players.
    let err;
    this.filepathMeta = Player.metadataFromFilepath(filename);

    const decoder = new TextDecoder('latin1');
    const miniusfStr = decoder.decode(data);
    const usflibs = miniusfStr.match(/_lib=([^\n]+)/).slice(1);
    if (usflibs.length === 0) {
      throw new Error(`No .usflib references found`);
    }

    const dir = pathe.dirname(filename);
    const fsFilename = pathJoin(MOUNTPOINT, filename);
    const filePromises = [
      ensureEmscFileWithData(this.core, fsFilename, data),
      ...usflibs.map(usflib => {
        const fsUsflibFilename = pathJoin(MOUNTPOINT, dir, usflib);
        const url = pathJoin(CATALOG_PREFIX, dir, usflib);
        return ensureEmscFileWithUrl(this.core, fsUsflibFilename, url);
      }),
    ];

    return Promise.all(filePromises)
      .then(() => {
        // Heavy synchronous init blocks the main thread; suspend the audio
        // context so the output doesn't glitch meanwhile.
        return this.muteAudioDuringCall(this.audioNode, () => {
          err = this.core.ccall(
            'n64_load_file', 'number',
            ['string', 'number', 'number', 'number'],
            [fsFilename, this.buffer, this.bufferSize, this.sampleRate],
          );

          if (err !== 0) {
            console.error('n64_load_file failed. error code: %d', err);
            throw Error('n64_load_file failed');
          }

          this.resolveParamValues(persistedSettings);
          this.metadata = { title: pathe.basename(filename) };

          this.resume();
          this.emit('playerStateUpdate', {
            ...this.getBasePlayerState(),
            isStopped: false,
          });
        });
      });
  }

  processAudioInner(channels) {
    let i, ch;

    if (this.paused) {
      for (ch = 0; ch < channels.length; ch++) {
        channels[ch].fill(0);
      }
      return;
    }

    const samplesWritten = this.core._n64_render_audio(this.buffer, this.bufferSize);
    if (samplesWritten <= 0) {
      this.stop();
    }

    for (ch = 0; ch < channels.length; ch++) {
      for (i = 0; i < this.bufferSize; i++) {
        channels[ch][i] = this.core.getValue(
          this.buffer +           // Interleaved channel format
          i * 2 * 2 +             // frame offset   * bytes per sample * num channels +
          ch * 2,                 // channel offset * bytes per sample
          'i16'                   // the sample values are signed 16-bit integers
        ) / INT16_MAX;
      }
    }
  }

  getPositionMs() {
    return this.core._n64_get_position_ms();
  }

  getDurationMs() {
    return this.core._n64_get_duration_ms();
  }

  getMetadata() {
    return this.metadata;
  }

  isPlaying() {
    return !this.isPaused();
  }

  seekMs(positionMs) {
    this.muteAudioDuringCall(this.audioNode, () => this.core._n64_seek_ms(positionMs));
  }

  setParameter(id, value) {
    switch (id) {
      case 'indefinitePlayback':
        value = !!value;
        this.params[id] = value;
        this.core._n64_set_indefinite_playback(value);
        break;
      default:
    }
  }

  stop() {
    this.suspend();
    this.core._n64_shutdown();
    console.debug('N64Player.stop()');
    this.emit('playerStateUpdate', { isStopped: true });
  }
}
