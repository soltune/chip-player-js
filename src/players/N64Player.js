import Player from "./Player.js";
import { ensureEmscFileWithData, ensureEmscFileWithUrl } from '../util';
import { CATALOG_PREFIX } from '../config';
import path from 'path';

const fileExtensions = [
  'miniusf',
];
const MOUNTPOINT = '/n64';
const INT16_MAX = Math.pow(2, 16) - 1;

export default class N64Player extends Player {
  constructor(audioCtx, destNode, chipCore, bufferSize) {
    super(audioCtx, destNode, chipCore, bufferSize);
    this.loadData = this.loadData.bind(this);

    // Initialize N64 filesystem
    chipCore.FS.mkdirTree(MOUNTPOINT);
    chipCore.FS.mount(chipCore.FS.filesystems.IDBFS, {}, MOUNTPOINT);

    this.lib = chipCore;
    this.fileExtensions = fileExtensions;
    this.buffer = chipCore._malloc(this.bufferSize * 4); // 2 ch, 16-bit
    this.setAudioProcess(this.n64AudioProcess);
  }

  loadData(data, filename) {
    // The Sequencer calls suspend() (not stop()) between songs, so
    // _n64_shutdown() would not otherwise run. Without this, the emulator
    // keeps accumulating audio samples from the previous song into its
    // internal buffer, which then leak into the start of the new song.
    this.lib._n64_shutdown();

    let err;
    this.filepathMeta = Player.metadataFromFilepath(filename);

    const miniusfStr = String.fromCharCode.apply(null, data);
    const usflibs = miniusfStr.match(/_lib=([^\n]+)/).slice(1);
    if (usflibs.length === 0) {
      throw new Error(`No .usflib references found`);
    }

    const dir = path.dirname(filename);
    const fsFilename = path.join(MOUNTPOINT, filename);
    const promises = [
      ensureEmscFileWithData(this.lib, fsFilename, data),
      ...usflibs.map(usflib => {
        const fsFilename = path.join(MOUNTPOINT, dir, usflib);
        const url = CATALOG_PREFIX + path.join(dir, usflib);
        return ensureEmscFileWithUrl(this.lib, fsFilename, url);
      }),
    ];

    return Promise.all(promises)
      .then(([fsFilename]) => {
        err = this.lib.ccall(
          'n64_load_file', 'number',
          ['string', 'number', 'number', 'number'],
          [fsFilename, this.buffer, this.bufferSize, this.audioCtx.sampleRate],
        );

        if (err !== 0) {
          console.error("n64_load_file failed. error code: %d", err);
          throw Error('n64_load_file failed');
        }

        this.metadata = { title: filename };

        // Disconnect any prior connection so old audio frames are not left in
        // the hardware pipeline when we suspend below. Throws if not connected
        // (e.g. first load), which is safe to ignore.
        try { this.audioNode.disconnect(); } catch (e) {}

        // audioCtx.suspend() freezes whatever frames are currently in the
        // hardware buffer; if old audio committed before paused=true was set
        // is still in the pipeline, it will replay on resume(). We must wait
        // long enough for the pipeline to fully drain with silence before
        // calling suspend(). The drain time is two buffer durations (one for
        // the silence callback to fire, one for it to reach hardware) plus
        // the hardware output latency. If enough time has already elapsed
        // since suspend() was called (e.g. during a network fetch), no wait
        // is added.
        const baseLatency = this.audioCtx.baseLatency || 0.02;
        const drainMs = (2 * this.bufferSize / this.audioCtx.sampleRate + baseLatency) * 1000 + 50;
        const elapsed = this._suspendedAt !== undefined
          ? performance.now() - this._suspendedAt
          : Infinity;
        const waitMs = Math.max(0, drainMs - elapsed);
        return new Promise(resolve => setTimeout(resolve, waitMs));
      })
      .then(() => this.audioCtx.suspend())
      .then(() => {
        this.connect();
        this.resume();
        return this.audioCtx.resume();
      })
      .then(() => {
        this.emit('playerStateUpdate', {
          ...this.getBasePlayerState(),
          isStopped: false,
        });
      });
  }

  n64AudioProcess(e) {
    let i, channel;
    const channels = [];
    for (channel = 0; channel < e.outputBuffer.numberOfChannels; channel++) {
      channels[channel] = e.outputBuffer.getChannelData(channel);
    }

    if (this.paused) {
      for (channel = 0; channel < channels.length; channel++) {
        channels[channel].fill(0);
      }
      return;
    }

    const samplesWritten = this.lib._n64_render_audio(this.buffer, this.bufferSize);
    if (samplesWritten <= 0) {
      this.stop();
    }

    for (channel = 0; channel < channels.length; channel++) {
      for (i = 0; i < this.bufferSize; i++) {
        channels[channel][i] = this.lib.getValue(
          this.buffer +           // Interleaved channel format
          i * 2 * 2 +             // frame offset   * bytes per sample * num channels +
          channel * 2,            // channel offset * bytes per sample
          'i16'                   // the sample values are signed 16-bit integers
        ) / INT16_MAX;
      }
    }
  }

  // setTempo(val) {
  //   return this.lib._v2m_set_speed(val);
  //   // console.error('Unable to set speed for this file format.');
  // }

  getPositionMs() {
    return this.lib._n64_get_position_ms();
  }

  getDurationMs() {
    return this.lib._n64_get_duration_ms();
  }

  getMetadata() {
    return this.metadata;
  }

  isPlaying() {
    return !this.isPaused();
  }

  seekMs(seekMs) {
    this.muteAudioDuringCall(this.audioNode, () =>
      this.lib._n64_seek_ms(seekMs)
    );
  }

  suspend() {
    super.suspend();
    // Record the time paused=true took effect so loadData() can calculate
    // how long to wait for the hardware pipeline to drain before suspend().
    this._suspendedAt = performance.now();
  }

  stop() {
    this.suspend();
    this.lib._n64_shutdown();
    console.debug('N64Player.stop()');
    this.emit('playerStateUpdate', { isStopped: true });
  }
}
