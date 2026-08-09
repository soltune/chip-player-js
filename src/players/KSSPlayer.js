import Player from './Player.js';
import autoBind from 'auto-bind';

// Fork: MSX .mgs playback via libkss (side-by-side clone, see
// scripts/build-libs.sh). The MGSDRV driver binary is bundled inside libkss
// and runs on its Z80 emulation. .kss itself stays on GMEPlayer for now;
// libkss also understands .bgm/.opx/.mpk/.mbm if ever needed.
const fileExtensions = [
  'mgs',
];

const FADEOUT_TIME_MS = 2000;

// OPLL mask bit layout of emu2413: bit 0-8 = FM ch 1-9, then HH, CYM, TOM, SD, BD.
const OPLL_VOICES = [
  'FM 1', 'FM 2', 'FM 3', 'FM 4', 'FM 5', 'FM 6', 'FM 7', 'FM 8', 'FM 9',
  'Hi-Hat', 'Cymbal', 'Tom', 'Snare', 'Bass Drum',
];

export default class KSSPlayer extends Player {
  paramDefs = [
    {
      id: 'default_duration',
      label: 'Default Duration (sec)',
      hint: 'MGS files have no length metadata; play this long before fading out.',
      type: 'number',
      min: 60,
      max: 600,
      step: 10,
      defaultValue: 150,
    },
    {
      id: 'indefinitePlayback',
      label: 'Indefinite Playback',
      type: 'toggle',
      hint: 'Ignore the default duration and loop indefinitely.',
      defaultValue: false,
    },
  ];

  constructor(...args) {
    super(...args);
    autoBind(this);

    this.playerKey = 'kss';
    this.name = 'LibKSS Player';
    this.fileExtensions = fileExtensions;
    this.buffer = this.core._malloc(this.bufferSize * 2 * 2); // int16 stereo
    this.kssCtx = this.core._lkss_init(this.sampleRate);
    this.voiceGroups = [];
    this.voiceMask = [];
    this.isFadingOut = false;
  }

  readSjisString(ptr) {
    if (!ptr) return '';
    const heap = this.core.HEAPU8;
    let end = ptr;
    while (heap[end] !== 0) end++;
    return new TextDecoder('shift-jis').decode(heap.subarray(ptr, end));
  }

  loadData(data, filepath, persistedSettings) {
    const dataPtr = this.copyToHeap(data);
    const pathPtr = this.core.stringToNewUTF8(filepath);
    const err = this.core._lkss_load_data(this.kssCtx, dataPtr, data.byteLength, pathPtr);
    this.core._free(dataPtr);
    this.core._free(pathPtr);

    if (err !== 0) {
      console.error('lkss_load_data failed. error code: %d', err);
      throw Error('Unable to load this file!');
    }

    const filepathMeta = Player.metadataFromFilepath(filepath);
    const title = this.readSjisString(this.core._lkss_get_title(this.kssCtx));
    this.metadata = {
      title: title || filepathMeta.title,
      system: 'MSX',
      formatted: {
        title: title || filepathMeta.title,
        subtitle: 'MSX',
      },
    };

    const mgsText = this.readSjisString(this.core._lkss_get_mgs_text(this.kssCtx));
    this.infoTexts = mgsText ? [mgsText] : [];

    this.buildVoiceGroups();
    this.isFadingOut = false;
    this.resolveParamValues(persistedSettings);

    this.resume();
    this.emit('playerStateUpdate', {
      ...this.getBasePlayerState(),
      isStopped: false,
    });
  }

  buildVoiceGroups() {
    // PSG and SCC are always present on the emulated MSX; OPLL (MSX-MUSIC)
    // only when the song declares FM usage.
    const groups = [
      {
        device: 0, // KSS_DEVICE_PSG
        name: 'PSG',
        voices: ['PSG 1', 'PSG 2', 'PSG 3'],
      },
      {
        device: 1, // KSS_DEVICE_SCC
        name: 'SCC',
        voices: ['SCC 1', 'SCC 2', 'SCC 3', 'SCC 4', 'SCC 5'],
      },
    ];
    if (this.core._lkss_get_fmpac(this.kssCtx)) {
      groups.push({
        device: 2, // KSS_DEVICE_OPLL
        name: 'OPLL (MSX-MUSIC)',
        voices: OPLL_VOICES.slice(),
      });
    }

    let idx = 0;
    this.voiceGroups = groups.map(group => ({
      name: group.name,
      icon: true,
      device: group.device,
      voices: group.voices.map(name => ({ idx: idx++, name })),
    }));
    this.voiceMask = new Array(idx).fill(true);
    this.applyVoiceMask();
  }

  applyVoiceMask() {
    for (const group of this.voiceGroups) {
      let mask = 0;
      for (let i = 0; i < group.voices.length; i++) {
        if (!this.voiceMask[group.voices[i].idx]) {
          mask |= 1 << i;
        }
      }
      this.core._lkss_set_channel_mask(this.kssCtx, group.device, mask);
    }
  }

  processAudioInner(channels) {
    let i, ch;

    if (this.paused || this.stopped) {
      for (ch = 0; ch < channels.length; ch++) {
        channels[ch].fill(0);
      }
      return;
    }

    this.core._lkss_render(this.kssCtx, this.buffer, this.bufferSize);

    const positionMs = this.getPositionMs();
    const durationMs = this.getDurationMs();
    const indefinite = this.params.indefinitePlayback;

    // The driver flags a natural (non-looping) end of music.
    if (this.core._lkss_get_stop_flag(this.kssCtx)) {
      for (ch = 0; ch < channels.length; ch++) {
        channels[ch].fill(0);
      }
      this.stop();
      return;
    }

    let fadeRatio = 1;
    if (!indefinite && positionMs >= durationMs) {
      this.isFadingOut = true;
      fadeRatio = Math.max((FADEOUT_TIME_MS - (positionMs - durationMs)) / FADEOUT_TIME_MS, 0);
      if (fadeRatio === 0) {
        for (ch = 0; ch < channels.length; ch++) {
          channels[ch].fill(0);
        }
        this.stop();
        return;
      }
    }

    for (ch = 0; ch < channels.length; ch++) {
      for (i = 0; i < this.bufferSize; i++) {
        channels[ch][i] = fadeRatio * this.core.getValue(
          this.buffer +   // Interleaved stereo int16
          i * 2 * 2 +     // frame offset * bytes per sample * num channels
          ch * 2,         // channel offset * bytes per sample
          'i16'
        ) / 32768;
      }
    }
  }

  getPositionMs() {
    if (this.kssCtx)
      return this.core._lkss_get_position_ms(this.kssCtx);
    return 0;
  }

  getDurationMs() {
    return (this.params.default_duration || 150) * 1000;
  }

  seekMs(seekMs) {
    if (this.kssCtx) {
      this.core._lkss_seek_ms(this.kssCtx, Math.max(0, Math.floor(seekMs)));
      this.isFadingOut = false;
    }
  }

  getMetadata() {
    return this.metadata;
  }

  isPlaying() {
    return !this.isPaused() && !this.stopped;
  }

  getVoiceGroups() {
    return this.voiceGroups.map(({ name, icon, voices }) => ({ name, icon, voices }));
  }

  getVoiceMask() {
    return this.voiceMask;
  }

  setVoiceMask(voiceMask) {
    this.voiceMask = voiceMask.slice();
    this.applyVoiceMask();
  }

  stop() {
    this.suspend();
    if (this.kssCtx) this.core._lkss_stop(this.kssCtx);
    console.debug('KSSPlayer.stop()');
    this.emit('playerStateUpdate', { isStopped: true });
  }
}
