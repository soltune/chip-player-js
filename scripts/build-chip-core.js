const { spawn, execSync } = require('child_process');
const fs = require('fs');
const chalk = require('chalk');
const paths = require('../config/paths');

/**
 * Compile the C libraries with emscripten.
 */
var compiler = process.env.EMPP_BIN || 'em++';

var gme_dir = './game-music-emu/gme';
// var unrar_dir = './unrar';
// var source_files = source_files.concat(glob.sync(gme_dir + '/*.cpp'));

var source_files = [
  'Ay_Apu.cpp',
  'Ay_Core.cpp',
  'Ay_Cpu.cpp',
  'Ay_Emu.cpp',
  'blargg_common.cpp',
  'blargg_errors.cpp',
  'Blip_Buffer.cpp',
  'Bml_Parser.cpp',
  'c140.c',
  'C140_Emu.cpp',
  'Classic_Emu.cpp',
  'dac_control.c',
  'Data_Reader.cpp',
  // 'dbopl.cpp', // Currently using later version of dbopl.cpp from libADLMIDI
  'Downsampler.cpp',
  'Dual_Resampler.cpp',
  'Effects_Buffer.cpp',
  'Fir_Resampler.cpp',
  'fm.c',
  'fm2612.c',
  'fmopl.cpp',
  'Gb_Apu.cpp',
  'Gb_Cpu.cpp',
  'Gb_Oscs.cpp',
  'Gbs_Core.cpp',
  'Gbs_Cpu.cpp',
  'Gbs_Emu.cpp',
  'gme.cpp',
  'Gme_File.cpp',
  'Gme_Loader.cpp',
  'Gym_Emu.cpp',
  'Hes_Apu.cpp',
  'Hes_Apu_Adpcm.cpp',
  'Hes_Core.cpp',
  'Hes_Cpu.cpp',
  'Hes_Emu.cpp',
  'higan/dsp/dsp.cpp',
  'higan/dsp/SPC_DSP.cpp',
  'higan/processor/spc700/spc700.cpp',
  'higan/smp/memory.cpp',
  'higan/smp/smp.cpp',
  'higan/smp/timing.cpp',
  'k051649.c',
  'K051649_Emu.cpp',
  'k053260.c',
  'K053260_Emu.cpp',
  'k054539.c',
  'K054539_Emu.cpp',
  'Kss_Core.cpp',
  'Kss_Cpu.cpp',
  'Kss_Emu.cpp',
  'Kss_Scc_Apu.cpp',
  'M3u_Playlist.cpp',
  'Multi_Buffer.cpp',
  'Music_Emu.cpp',
  'Nes_Apu.cpp',
  'Nes_Cpu.cpp',
  'Nes_Fds_Apu.cpp',
  'Nes_Fme7_Apu.cpp',
  'Nes_Namco_Apu.cpp',
  'Nes_Oscs.cpp',
  'Nes_Vrc6_Apu.cpp',
  'Nes_Vrc7_Apu.cpp',
  'Nsf_Core.cpp',
  'Nsf_Cpu.cpp',
  'Nsf_Emu.cpp',
  'Nsf_Impl.cpp',
  'Nsfe_Emu.cpp',
  'okim6258.c',
  'Okim6258_Emu.cpp',
  'okim6295.c',
  'Okim6295_Emu.cpp',
  'Opl_Apu.cpp',
  'pwm.c',
  'Pwm_Emu.cpp',
  'qmix.c',
  'Qsound_Apu.cpp',
  'Resampler.cpp',
  'Rf5C164_Emu.cpp',
  'rf5c68.c',
  'Rf5C68_Emu.cpp',
  'Rom_Data.cpp',
  'Sap_Apu.cpp',
  'Sap_Core.cpp',
  'Sap_Cpu.cpp',
  'Sap_Emu.cpp',
  'scd_pcm.c',
  'segapcm.c',
  'SegaPcm_Emu.cpp',
  'Sgc_Core.cpp',
  'Sgc_Cpu.cpp',
  'Sgc_Emu.cpp',
  'Sgc_Impl.cpp',
  'Sms_Apu.cpp',
  'Sms_Fm_Apu.cpp',
  'Spc_Emu.cpp',
  'Spc_Filter.cpp',
  'Spc_Sfm.cpp',
  'Track_Filter.cpp',
  'Upsampler.cpp',
  'Vgm_Core.cpp',
  'Vgm_Emu.cpp',
  'ym2151.c',
  'Ym2151_Emu.cpp',
  'Ym2203_Emu.cpp',
  'ym2413.c',
  'Ym2413_Emu.cpp',
  'Ym2608_Emu.cpp',
  'Ym2610b_Emu.cpp',
  'Ym2612_Emu.cpp',
  // 'Ym2612_Emu_MAME.cpp',
  // 'Ym2612_Emu_Gens.cpp',
  'Ym3812_Emu.cpp',
  'ymdeltat.cpp',
  'Ymf262_Emu.cpp',
  'ymz280b.c',
  'Ymz280b_Emu.cpp',
  'Z80_Cpu.cpp',
].map(file => gme_dir + '/' + file);


const libADLMIDI_files = [
  'chips/dosbox_opl3.cpp',
  'chips/dosbox/dbopl.cpp',
  // 'chips/opal_opl3.cpp',
  // 'chips/java_opl3.cpp',
  'wopl/wopl_file.c',
  'adldata.cpp',
  'adlmidi.cpp',
  'adlmidi_load.cpp',
  'adlmidi_midiplay.cpp',
  'adlmidi_opl3.cpp',
  'adlmidi_private.cpp',
].map(file => 'libADLMIDI/src/' + file);

source_files = source_files.concat(libADLMIDI_files);

const v2m_files = [
  'ronan.cpp',
  'scope.cpp',
  'v2mplayer.cpp',
  'v2mconv.cpp',
  'synth_core.cpp',
  'sounddef.cpp',
  'v2mwrapper.cpp',
].map(file => 'farbrausch-v2m/' + file);

source_files = source_files.concat(v2m_files);

// Complete LibXMP build:
// source_files.push('libxmp/lib/libxmp.a');
source_files.push('libxmp/libxmp-lite-stagedir/lib/libxmp-lite.a');
source_files.push('fluidlite/build/libfluidlite.a');
source_files.push('tinysoundfont/tinyplayer.c');
source_files.push('tinysoundfont/showcqtbar.c');

const s98_files = [
  'mame/fmopl.c',
  'mame/ymf262.c',
  'emu2413/emu2413.c',
  'fmgen/file.cpp',
  'fmgen/fmgen.cpp',
  'fmgen/fmtimer.cpp',
  'fmgen/opm.cpp',
  'fmgen/opna.cpp',
  'fmgen/psg.cpp',

  's98mame.cpp',
  's98fmgen.cpp',
  's98opll.cpp',
  's98sng.cpp',
  's_logtbl.c',
  's_sng.c',
].map(file => 'webS98/src/device/' + file);

source_files = source_files.concat(s98_files);
source_files.push('webS98/src/m_s98.cpp');
source_files.push('webS98/emscripten/adapter.cpp');

const pmdmini_files = [
  // 'fmgen/file.cpp',  // same as webS98
  // 'fmgen/fmgen.cpp',
  // 'fmgen/fmtimer.cpp',
  // 'fmgen/opm.cpp',
  // 'fmgen/opna.cpp',
  // 'fmgen/psg.cpp',
  'pmdwin/opnaw.cpp',
  'pmdwin/p86drv.cpp',
  'pmdwin/pmdwin.cpp',
  'pmdwin/ppsdrv.cpp',
  'pmdwin/ppz8l.cpp ',
  'pmdwin/table.cpp',
  'pmdwin/util.cpp',
  'pmdmini.c',
].map(file => 'webMDX/pmdmini/src/' + file);

source_files = source_files.concat(pmdmini_files);

const mdxmini_files = [
  'mdx2151.c',
  'mdxfile.c',
  'mdxmini.c',
  'mdxmml_ym2151.c',
  'pcm8.c',
  'pdxfile.c',
  'ym2151.c'
].map(file => 'webMDX/mdxmini/src/' + file);

source_files = source_files.concat(mdxmini_files);
source_files.push('webMDX/emscripten/adapter.cpp');

const fmplayer_files = [
  'fmdriver/fmdriver_fmp.c',
  'fmdriver/fmdriver_common.c',
  'fmdriver/ppz8.c',
  'common/fmplayer_work_opna.c',
 // 'common/fmplayer_file.c',
  'libopna/opna.c',
  'libopna/opnafm.c',
  'libopna/opnaadpcm.c',
  'libopna/opnatimer.c',
  'libopna/opnadrum.c',
  'libopna/opnassg.c',
  'libopna/opnassg-sinc-c.c',
].map(file => 'fmplayer/fmplayer/' + file);

source_files = source_files.concat(fmplayer_files);
source_files.push('fmplayer/fmplayer_wrapper.cpp');

const psfplayer_files = [
  'Core/psx.c',
  'Core/ioptimer.c',
  'Core/iop.c',
  'Core/bios.c',
  'Core/r3000dis.c',
  'Core/r3000asm.c',
  'Core/r3000.c',
  'Core/vfs.c',
  'Core/spucore.c',
  'Core/spu.c',
  'Core/mkhebios.c',
  'psflib/psf2fs.c',
  'psflib/psflib.c',
  'emscripten/heplug.c',
  'emscripten/adapter.cpp',
].map(file => 'webpsx/' + file);

source_files = source_files.concat(psfplayer_files);

const ndsplayer_files = [
  'psflib/dspsflib.c',
  'psflib/dspsf2fs.c',
  'vio2sf/desmume/arm_instructions.c',
  'vio2sf/desmume/armcpu.c',
  'vio2sf/desmume/barray.c',
  'vio2sf/desmume/bios.c',
  'vio2sf/desmume/cp15.c',
  'vio2sf/desmume/FIFO.c',
  'vio2sf/desmume/GPU.c',
  'vio2sf/desmume/isqrt.c',
  'vio2sf/desmume/matrix.c',
  'vio2sf/desmume/mc.c',
  'vio2sf/desmume/MMU.c',
  'vio2sf/desmume/NDSSystem.c',
  'vio2sf/desmume/resampler.c',
  'vio2sf/desmume/state.c',
  'vio2sf/desmume/thumb_instructions.c',
  'vio2sf/desmume/SPU.cpp',
  'emscripten/twosfplug.cpp',
  'emscripten/adapter.cpp',
].map(file => 'webDS/' + file);

source_files = source_files.concat(ndsplayer_files);

const gsfplayer_files = [
  // 'psflib/psflib.c',  // same as psfplayer
  // 'psflib/psf2fs.c',
  // 'zlib/adler32.c',
  // 'zlib/compress.c',
  // 'zlib/crc32.c',
  // 'zlib/gzio.c',
  // 'zlib/uncompr.c',
  // 'zlib/deflate.c',
  // 'zlib/trees.c',
  // 'zlib/zutil.c',
  // 'zlib/inflate.c',
  // 'zlib/infback.c',
  // 'zlib/inftrees.c',
  // 'zlib/inffast.c',
  'mgba/src/third-party/blip_buf/blip_buf.c',
  'mgba/src/arm/arm.c',
  'mgba/src/arm/decoder.c',
  'mgba/src/arm/decoder-arm.c',
  'mgba/src/arm/decoder-thumb.c',
  'mgba/src/arm/isa-arm.c',
  'mgba/src/arm/isa-thumb.c',
  'mgba/src/gb/renderers/cache-set.c',
  'mgba/src/gb/renderers/software.c',
  'mgba/src/gb/audio.c',
  'mgba/src/gb/cheats.c',
  'mgba/src/gb/core.c',
  'mgba/src/gb/gb.c',
  'mgba/src/gb/io.c',
  'mgba/src/gb/mbc.c',
  'mgba/src/gb/memory.c',
  'mgba/src/gb/overrides.c',
  'mgba/src/gb/serialize.c',
  'mgba/src/gb/sio.c',
  'mgba/src/gb/timer.c',
  'mgba/src/gb/video.c',
  'mgba/src/gba/rr/vbm.c',
  'mgba/src/gba/rr/rr.c',
  'mgba/src/gba/rr/mgm.c',
  'mgba/src/gba/cheats/parv3.c',
  'mgba/src/gba/cheats/codebreaker.c',
  'mgba/src/gba/cheats/gameshark.c',
  'mgba/src/gba/audio.c',
  'mgba/src/gba/bios.c',
  'mgba/src/gba/cheats.c',
  'mgba/src/gba/core.c',
  'mgba/src/gba/dma.c',
  'mgba/src/gba/gba.c',
  'mgba/src/gba/hardware.c',
  'mgba/src/gba/hle-bios.c',
  'mgba/src/gba/input.c',
  'mgba/src/gba/io.c',
  'mgba/src/gba/memory.c',
  'mgba/src/gba/overrides.c',
  'mgba/src/gba/savedata.c',
  'mgba/src/gba/serialize.c',
  'mgba/src/gba/sharkport.c',
  'mgba/src/gba/sio.c',
  'mgba/src/gba/timer.c',
  'mgba/src/gba/vfame.c',
  'mgba/src/gba/video.c',
  'mgba/src/gb/sio/printer.c',
  'mgba/src/gb/sio/lockstep.c',
  'mgba/src/gba/sio/joybus.c',
  'mgba/src/gba/sio/lockstep.c',
  'mgba/src/util/vfs/vfs-mem.c',
  'mgba/src/util/crc32.c',
  'mgba/src/util/circle-buffer.c',
  'mgba/src/util/configuration.c',
  'mgba/src/util/elf-read.c',
  'mgba/src/util/export.c',
  'mgba/src/util/formatting.c',
  'mgba/src/util/gui.c',
  'mgba/src/util/hash.c',
  'mgba/src/util/patch.c',
  'mgba/src/util/patch-fast.c',
  'mgba/src/util/patch-ips.c',
  'mgba/src/util/patch-ups.c',
  'mgba/src/util/ring-fifo.c',
  'mgba/src/util/string.c',
  'mgba/src/util/table.c',
  'mgba/src/util/text-codec.c',
  'mgba/src/util/vfs.c',
  'mgba/src/gba/renderers/cache-set.c',
  'mgba/src/gba/renderers/software-bg.c',
  'mgba/src/gba/renderers/software-mode0.c',
  'mgba/src/gba/renderers/software-obj.c',
  'mgba/src/gba/renderers/video-software.c',
  'mgba/src/core/cache-set.c',
  'mgba/src/core/cheats.c',
  'mgba/src/core/config.c',
  'mgba/src/core/core.c',
  'mgba/src/core/directories.c',
  'mgba/src/core/input.c',
  'mgba/src/core/interface.c',
  'mgba/src/core/library.c',
  'mgba/src/core/lockstep.c',
  'mgba/src/core/log.c',
  'mgba/src/core/map-cache.c',
  'mgba/src/core/mem-search.c',
  'mgba/src/core/rewind.c',
  'mgba/src/core/scripting.c',
  'mgba/src/core/serialize.c',
  'mgba/src/core/sync.c',
  'mgba/src/core/tile-cache.c',
  'mgba/src/core/timing.c',
  'emscripten/gsfplug.cpp',
  'emscripten/adapter.cpp',
].map(file => 'webGSF/' + file);

source_files = source_files.concat(gsfplayer_files);

var js_file = 'src/chip-core.js';
var wasm_file = 'src/chip-core.wasm';
var wasm_dir = paths.appPublic;

var exported_functions = [
  '_gme_open_data',
  '_gme_play',
  '_gme_delete',
  '_gme_mute_voices',
  '_gme_track_count',
  '_gme_track_ended',
  '_gme_voice_count',
  '_gme_track_info',
  '_gme_start_track',
  '_gme_open_data',
  '_gme_ignore_silence',
  '_gme_set_tempo',
  '_gme_seek_scaled',
  '_gme_tell_scaled',
  '_gme_set_fade',
  '_gme_voice_name',

  '_xmp_create_context',
  '_xmp_start_player',
  '_xmp_play_buffer',
  '_xmp_get_frame_info',
  '_xmp_end_player',
  '_xmp_inject_event',
  '_xmp_get_module_info',
  '_xmp_get_format_list',
  '_xmp_stop_module',
  '_xmp_restart_module',
  '_xmp_seek_time',
  '_xmp_channel_mute',
  '_xmp_get_player',
  '_xmp_load_module_from_memory',

  '_new_fluid_settings',
  '_new_fluid_synth',
  '_fluid_settings_setint',
  '_fluid_settings_setnum',
  '_fluid_settings_setstr',
  '_fluid_synth_sfload',
  '_fluid_synth_noteon',
  '_fluid_synth_noteoff',
  '_fluid_synth_all_notes_off',
  '_fluid_synth_all_sounds_off',
  '_fluid_synth_write_float',
  '_fluid_synth_set_reverb',

  '_tp_write_audio',
  '_tp_open',
  '_tp_init',
  '_tp_unload_soundfont',
  '_tp_load_soundfont',
  '_tp_add_soundfont',
  '_tp_stop',
  '_tp_seek',
  '_tp_set_speed',
  '_tp_get_duration_ms',
  '_tp_get_position_ms',
  '_tp_set_reverb',
  '_tp_get_channel_in_use',
  '_tp_get_channel_program',
  '_tp_set_channel_mute',
  '_tp_set_bank',
  '_tp_set_synth_engine',

  '_tp_note_on',
  '_tp_note_off',
  '_tp_program_change',
  '_tp_pitch_bend',
  '_tp_control_change',
  '_tp_channel_pressure',
  '_tp_render',
  '_tp_panic',
  '_tp_panic_channel',
  '_tp_reset',

  '_adl_init',
  '_adl_panic',
  '_adl_generate',
  '_adl_getBankNames',
  '_adl_getBanksCount',
  '_adl_setBank',
  '_adl_getNumChips',
  '_adl_setNumChips',
  '_adl_setSoftPanEnabled',
  '_adl_rt_controllerChange',
  '_adl_rt_channelAfterTouch',
  '_adl_rt_noteOff',
  '_adl_rt_noteOn',
  '_adl_rt_patchChange',
  '_adl_rt_pitchBend',
  '_adl_rt_resetState',

  '_v2m_open',
  '_v2m_write_audio',
  '_v2m_get_position_ms',
  '_v2m_get_duration_ms',
  '_v2m_seek_ms',
  '_v2m_set_speed',
  '_v2m_close',

  '_s98_load_file',
  '_s98_teardown',
  '_s98_get_current_position',
  '_s98_seek_position',
  '_s98_get_max_position',
  '_s98_get_track_info',
  '_s98_get_sample_rate',
  '_s98_get_audio_buffer',
  '_s98_get_audio_buffer_length',
  '_s98_compute_audio_samples',
  '_s98_get_device_count',
  '_s98_get_device_name',
  '_s98_set_channel_mask',
  '_s98_set_volumes',

  '_mdx_load_file',
  '_mdx_teardown',
  '_mdx_get_current_position',
  '_mdx_seek_position',
  '_mdx_get_max_position',
  '_mdx_get_track_info',
  '_mdx_get_sample_rate',
  '_mdx_get_audio_buffer',
  '_mdx_get_audio_buffer_length',
  '_mdx_compute_audio_samples',
  '_mdx_has_loop',
  '_mdx_set_rhythm_with_ssg',
  '_mdx_get_pcm_filename',
  '_mdx_reload_pcm',
  '_mdx_get_voices',
  '_mdx_set_voices',

  '_fmp_get_sample_rate',
  '_fmp_load_file',
  '_fmp_teardown',
  '_fmp_get_audio_buffer',
  '_fmp_get_audio_buffer_length',
  '_fmp_compute_audio_samples',
  '_fmp_get_current_position',
  '_fmp_get_max_position',
  '_fmp_has_loop',
  '_fmp_get_pcm_filenames',
  '_fmp_load_pvi',
  '_fmp_load_ppz',
  '_fmp_get_track_info',
  '_fmp_set_mask',

  '_psf_setup',
  '_psf_init',
  '_psf_teardown',
  '_psf_get_current_position',
  '_psf_seek_position',
  '_psf_get_max_position',
  '_psf_get_track_info',
  '_psf_get_sample_rate',
  '_psf_get_audio_buffer',
  '_psf_get_audio_buffer_length',
  '_psf_compute_audio_samples',
  '_psf_get_psf_version',
  '_psf_set_mask',
  '_psf_set_reverb',

  '_nds_setup',
  '_nds_init',
  '_nds_teardown',
  '_nds_get_current_position',
  '_nds_seek_position',
  '_nds_get_max_position',
  '_nds_get_track_info',
  '_nds_get_sample_rate',
  '_nds_get_audio_buffer',
  '_nds_get_audio_buffer_length',
  '_nds_compute_audio_samples',
  '_nds_set_mask',

  // From showcqtbar.c
  '_cqt_init',
  '_cqt_calc',
  '_cqt_render_line',
  '_cqt_bin_to_freq',
];

var runtime_methods = [
  'ALLOC_NORMAL',
  'FS',
  'UTF8ToString',
  'allocate',
  'ccall',
  'getValue',
  'setValue',
];

var flags = [
  // '--closure', '1',       // causes TypeError: lib.FS.mkdir is not a function
  // '--llvm-lto', '3',
  // '--clear-cache',        // sometimes Emscripten cache gets "poisoned"
  '--no-heap-copy',
  '-s', 'EXPORTED_FUNCTIONS=[' + exported_functions.join(',') + ']',
  '-s', 'EXPORTED_RUNTIME_METHODS=[' + runtime_methods.join(',') + ']',
  '-s', 'ALLOW_MEMORY_GROWTH=1',
  '-s', 'ASSERTIONS=0',      // assertions increase runtime size about 100K
  '-s', 'MODULARIZE=1',
  '-s', 'EXPORT_NAME=CHIP_CORE',
  '-s', 'ENVIRONMENT=web',
  '-s', 'USE_ZLIB=1',
  '-s', 'BINARYEN_TRAP_MODE=clamp',
  '-s', 'EXPORT_ES6=0',
  '-Os',
  '-o', js_file,

  '-DVGM_YM2612_MAME=1',     // fast and accurate, but suffers on some GYM files
  // '-DVGM_YM2612_NUKED=1', // slow but very accurate
  // '-DVGM_YM2612_GENS=1',  // very fast but inaccurate
  '-DHAVE_ZLIB_H',
  '-DHAVE_STDINT_H',
  '-DHAVE_LIMITS_H',

  '-IlibADLMIDI/include',
  '-DBWMIDI_DISABLE_XMI_SUPPORT',
  '-DBWMIDI_DISABLE_MUS_SUPPORT',
  '-DADLMIDI_DISABLE_MIDI_SEQUENCER',
  '-DADLMIDI_DISABLE_NUKED_EMULATOR',
  '-DADLMIDI_DISABLE_JAVA_EMULATOR',
  '-DADLMIDI_DISABLE_OPAL_EMULATOR',
  // '-DADLMIDI_DISABLE_DOSBOX_EMULATOR', // DOSBOX is recommended OPL3 core

  '-Qunused-arguments',
  '-Wno-deprecated',
  '-Wno-logical-op-parentheses',
  '-Wno-c++11-extensions',
  '-Wno-inconsistent-missing-override',
  '-Wno-c++11-narrowing',
  '-std=c++11',

  // V2M
  '-flto',
  '-fno-asynchronous-unwind-tables',
  '-fno-stack-protector',
  '-ffunction-sections',
  '-fdata-sections',
  '-DRONAN',
  '-s', 'SAFE_HEAP=0',

  // webS98
  '-DEMSCRIPTEN',
  '-IwebS98/src/',
  '-IwebS98/src/device',

  // webMDX
  '-IwebS98/src/device/fmgen',
  '-IwebMDX/mdxmini/src/ ',

  // FMPlayer
  '-Ifmplayer/fmplayer',

  // PSFPlayer
  '-Iwebpsx/Core',
  '-Iwebpsx/psflib',
  '-DEMU_COMPILE',
  '-DEMU_LITTLE_ENDIAN',
  '-DBUILTIN_HEBIOS', // build-in bios enabled
  '--js-library', 'webpsx/psf_callback.js',

  // DSPlayer
  '--js-library', 'webDS/nds_callback.js',
  '-IwebDS/vio2sf/desmume/',
  '-IwebDS/psflib',

  // GSFPlayer
  '-IwebGSF/mgba/include',
  '-IwebGSF/mgba/src',
  '-DM_CORE_GB',
  '-DM_CORE_GBA',
  '-DHAVE_CRC32',
  '-DDISABLE_THREADING',
  '-DMINIMAL_CORE=3',

];
var args = [].concat(flags, source_files);

console.log('Compiling to %s...', js_file);
console.log(`Invocation:\n${compiler} ${chalk.blue(flags.join(' '))} ${chalk.gray(source_files.join(' '))}\n`);
var build_proc = spawn(compiler, args, {stdio: 'inherit'});
build_proc.on('exit', function (code) {
  if (code === 0) {
    console.log('Moving %s to %s.', wasm_file, wasm_dir);
    execSync(`mv ${wasm_file} ${wasm_dir}`);

    // Don't use --pre-js because it can get stripped out by closure.
    const eslint_disable = '/*eslint-disable*/\n';
    console.log('Prepending %s with %s.', js_file, eslint_disable.trim());
    const data = fs.readFileSync(js_file);
    const fd = fs.openSync(js_file, 'w+');
    const insert = new Buffer(eslint_disable);
    fs.writeSync(fd, insert, 0, insert.length, 0);
    fs.writeSync(fd, data, 0, data.length, insert.length);
    fs.close(fd, (err) => {
      if (err) throw err;
    });
  }
});
