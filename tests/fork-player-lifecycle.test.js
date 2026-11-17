// Fork: lifecycle tests for the players that exist only in this fork, in the
// style of upstream's player-lifecycle.test.js. Run with
// `npm run test:fork-player-lifecycle`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import GBAPlayer from '../src/players/GBAPlayer';
import NDSPlayer from '../src/players/NDSPlayer';
import PSFPlayer from '../src/players/PSFPlayer';
import FMPPlayer from '../src/players/FMPPlayer';

const settle = () => new Promise(resolve => setImmediate(resolve));

// What Sequencer.playSong does around a load: stop the outgoing player (here
// always the same one), open a new load, then hand over the data.
function playSong(player, filepath) {
  player.stop();
  player.beginLoad();
  return player.loadData(new Uint8Array([1]), filepath, {});
}

// Enough of chip-core to construct the players. The tests replace player.lib.
const makeCore = () => ({ FS: {}, ccall: () => 44100, _malloc: () => 0, _free() {}, HEAPU8: new Uint8Array(16) });

// Holds each muted call until released, like the real muteAudioDuringCall,
// which waits for the output to ramp down before running fn.
function holdMutes(player) {
  const held = [];
  player.muteAudioDuringCall = async (_node, fn) => {
    await new Promise(resolve => held.push(resolve));
    fn();
  };
  return {
    async releaseAll() {
      while (held.length) {
        held.shift()();
        await settle();
      }
    },
  };
}

// Records loadMusicData calls. Until the lib file has been registered, a load
// requests it through the player's fileRequestCallback and reports "pending",
// like the real cores do for an uncached gsflib / 2sflib / psflib.
function stubLib(player) {
  const loads = [];
  let libReady = false;
  const requestLib = () => (player instanceof PSFPlayer
    ? player.fileRequestCallback(0, 1)
    : player.fileRequestCallback(0));
  player.lib = {
    isClosed: () => true,
    teardown() {},
    getPathAndFilename: full => {
      const i = full.lastIndexOf('/');
      return [full.slice(0, i + 1), full.slice(i + 1)];
    },
    registerFileData: (_path, filename) => { if (filename === 'game.lib') libReady = true; },
    existsFileData: () => libReady,
    getAbsolutePath: parts => parts.join('/'),
    getDelegate: () => ({ HEAP32: Int32Array.of(0), UTF8ToString: () => 'game/game.lib' }),
    loadMusicData: (_rate, _path, filename) => {
      loads.push(filename);
      if (!filename) return -1;
      if (!libReady) {
        requestLib();
        return -1;
      }
      return 0;
    },
  };
  // The real init() resolves params and metadata; it also clears
  // lastLoadedFilename, which the deferred reload relies on.
  player.init = () => { player.lastLoadedFilename = null; };
  player.getNumVoices = () => 0;
  player.getBasePlayerState = () => ({});
  player.resolveParamValues = () => {};
  player.prefillAudio = () => {};
  // A deferred reload asks for the catalog metadata again; keep that request
  // out of the fetches the tests hand-feed.
  player.fetchCatalogMetadata = () => Promise.resolve({});
  return loads;
}

// fetch that answers only when the test says so
function holdFetches() {
  const fetches = [];
  globalThis.fetch = () => new Promise(resolve => fetches.push(resolve));
  return {
    pending: () => fetches.length,
    async respondNext() {
      fetches.shift()(new Response(new Uint8Array([1])));
      await settle();
    },
  };
}

for (const PlayerClass of [GBAPlayer, NDSPlayer, PSFPlayer]) {
  test(`${PlayerClass.name} drops a load superseded during the audio mute`, async () => {
    const player = new PlayerClass(makeCore(), 44100);
    const loads = stubLib(player);
    const mutes = holdMutes(player);
    player.lib.registerFileData('game/', 'game.lib');
    playSong(player, 'game/a.x');
    playSong(player, 'game/b.x');
    await mutes.releaseAll();
    assert.deepEqual(loads, ['b.x']);
    assert.equal(player.stopped, false);
  });

  test(`${PlayerClass.name} does not start after a switch to another player during the mute`, async () => {
    const player = new PlayerClass(makeCore(), 44100);
    const loads = stubLib(player);
    const mutes = holdMutes(player);
    player.lib.registerFileData('game/', 'game.lib');
    playSong(player, 'game/a.x');
    player.stop(); // the Sequencer stops the old player before switching
    await mutes.releaseAll();
    assert.deepEqual(loads, []);
    assert.equal(player.stopped, true);
  });

  test(`${PlayerClass.name} does not start in the background when a lib arrives after a switch`, async () => {
    const player = new PlayerClass(makeCore(), 44100);
    const loads = stubLib(player);
    const mutes = holdMutes(player);
    const fetches = holdFetches();
    playSong(player, 'game/a.x');
    await mutes.releaseAll();
    assert.deepEqual(loads, ['a.x']); // waiting for game.lib
    player.stop(); // switched to another player's song
    await fetches.respondNext();
    await mutes.releaseAll();
    assert.deepEqual(loads, ['a.x']);
    assert.equal(player.stopped, true);
  });

  test(`${PlayerClass.name} loads the newest song when a lib arrives, and only once`, async () => {
    const player = new PlayerClass(makeCore(), 44100);
    const loads = stubLib(player);
    const mutes = holdMutes(player);
    const fetches = holdFetches();
    playSong(player, 'game/a.x');
    await mutes.releaseAll();
    playSong(player, 'game/b.x'); // stops, then loads the next song on the same player
    await mutes.releaseAll();
    await fetches.respondNext();
    await mutes.releaseAll();
    assert.equal(loads[loads.length - 1], 'b.x');
    assert.equal(player.stopped, false);
    // A second fetch of the same lib (GBA and PSF do not dedupe requests)
    // must not cut off the song that is already playing.
    while (fetches.pending()) {
      await fetches.respondNext();
      await mutes.releaseAll();
    }
    assert.deepEqual(loads, ['a.x', 'b.x', 'b.x']);
    assert.equal(player.stopped, false);
  });
}

test('FMPPlayer ignores a load superseded while its PCM is fetched', async () => {
  const player = new FMPPlayer(makeCore(), 44100);
  const pending = [];
  const inits = [];
  player.lib = {
    isClosed: () => true,
    teardown() {},
    getPathAndFilename: full => ['', full],
    loadMusicData: (_rate, _path, filename) => new Promise(resolve => pending.push({ filename, resolve })),
  };
  player.init = filepath => inits.push(filepath);
  player.getBasePlayerState = () => ({});
  playSong(player, 'a.opi');
  playSong(player, 'b.opi');
  pending[1].resolve(0);
  await settle();
  pending[0].resolve(0); // the old song's PCM fetch finishes last
  await settle();
  assert.deepEqual(inits, ['b.opi']);
  assert.equal(player.stopped, false);
});

test('FMP lib does not load a replaced song\'s PCM into the next one', async () => {
  for (const abort of [false, true]) {
    const lib = new FMPPlayer(makeCore(), 44100).lib;
    const loaded = [];
    let finishFetch;
    lib.getPcmFilenames = () => ['a.pvi', null];
    lib.fetchAndStorePcm = () => new Promise(resolve => { finishFetch = resolve; });
    lib.loadPvi = path => loaded.push(path);
    const controller = new AbortController();
    const loading = lib.loadMusicData(44100, 'game/', 'a.opi', new Uint8Array([1]), controller.signal);
    if (abort) controller.abort(); // a newer song was loaded meanwhile
    finishFetch(true);
    await loading;
    assert.equal(loaded.length, abort ? 0 : 1);
  }
});

// ---------------------------------------------------------------------------
// End of song. The Sequencer learns about it from 'playerSongEnd' (emitted by
// Player.handleSongEnd) and then calls stop() on the player a second time
// before loading the next song.
// ---------------------------------------------------------------------------
import Sequencer from '../src/Sequencer';
import PMDPlayer from '../src/players/PMDPlayer';
import S98Player from '../src/players/S98Player';
import KSSPlayer from '../src/players/KSSPlayer';
import MDXPlayer from '../src/players/MDXPlayer';
import StreamPlayer from '../src/players/StreamPlayer';

const silentBuffers = (n = 2048) => [new Float32Array(n), new Float32Array(n)];

// An engine that is always past the end of its song, and that records how it
// is opened and torn down. Tearing down an engine that is not open is what
// crashed the wasm heap for MDX, so it is counted separately.
function endedEngine(player) {
  const engine = { open: false, loads: [], teardowns: 0, teardownsWhileClosed: 0 };
  const open = name => { engine.loads.push(name); engine.open = true; };
  const teardown = () => {
    if (!engine.open) engine.teardownsWhileClosed++;
    engine.teardowns++;
    engine.open = false;
  };
  const base = {
    isClosed: () => !engine.open,
    teardown,
    getPathAndFilename: full => ['', full],
    registerFileData() {},
    existsFileData: () => true,
    getPlaybackPosition: () => 1e12,
    getMaxPlaybackPosition: () => 1000,
    computeAudioSamples: () => -1,
    hasLoop: () => false,
    getAudioBuffer: () => new Int16Array(0),
    getAudioBufferLength: () => 0,
  };
  if (player instanceof S98Player) {
    player.s98lib = {
      ...base,
      get currentFile() { return engine.open ? 'open' : null; },
      close: teardown,
      loadMusicData: (_rate, filepath) => { open(filepath); return 0; },
    };
  } else if (player instanceof KSSPlayer) {
    player.core._lkss_load_data = () => { open('kss'); return 0; };
    player.core._lkss_stop = () => { engine.teardowns++; engine.open = false; };
    player.core._lkss_render = () => {};
    player.core._lkss_get_stop_flag = () => 1;
    player.core._lkss_get_position_ms = () => 0;
    player.core._lkss_get_title = () => 0;
    player.core._lkss_get_mgs_text = () => 0;
    player.core.stringToNewUTF8 = () => 0;
    player.readSjisString = () => '';
    player.buildVoiceGroups = () => {};
  } else if (player instanceof FMPPlayer) {
    player.lib = { ...base, loadMusicData: async (_rate, _path, filepath) => { open(filepath); return 0; } };
  } else if (player instanceof PMDPlayer) {
    player.lib = { ...base, loadMusicData: (_rate, _path, filepath, _data, done) => { open(filepath); done(0); } };
  } else {
    player.lib = { ...base, loadMusicData: (_rate, _path, filename) => { open(filename); return 0; } };
  }
  player.muteAudioDuringCall = async (_node, fn) => fn();
  player.init = () => {};
  player.getNumVoices = () => 0;
  player.getBasePlayerState = () => ({});
  player.resolveParamValues = () => {};
  player.prefillAudio = () => {};
  return engine;
}

const kssCore = () => ({ ...makeCore(), _lkss_init: () => 1 });

for (const [PlayerClass, ext, core] of [
  [GBAPlayer, 'minigsf', makeCore], [NDSPlayer, 'mini2sf', makeCore], [PSFPlayer, 'psf', makeCore],
  [FMPPlayer, 'opi', makeCore], [PMDPlayer, 'm', makeCore], [S98Player, 's98', makeCore], [KSSPlayer, 'mgs', kssCore],
]) {
  test(`${PlayerClass.name} hands a finished song to the Sequencer, which starts the next one`, async () => {
    const player = new PlayerClass(core(), 44100);
    const engine = endedEngine(player);
    const sequencer = new Sequencer([player], { read: () => new Uint8Array([1]) }, () => ({}));
    let songEnds = 0;
    player.on('playerSongEnd', () => songEnds++);
    const songs = [`local/a.${ext}`, `local/b.${ext}`];

    sequencer.playContext(songs, 0);
    await settle();
    assert.equal(player.stopped, false, 'first song is playing');
    assert.equal(engine.loads.length, 1);

    player.processAudio(silentBuffers()); // the engine reports the end
    await settle();
    assert.equal(songEnds, 1);
    assert.equal(sequencer.getCurrSongPath(), songs[1]);
    assert.equal(engine.loads.length, 2, 'second song was loaded');
    assert.equal(player.stopped, false, 'second song is playing');
    // stop() ran twice for the first song (natural end, then the Sequencer
    // before the next load) but the engine was torn down once.
    assert.equal(engine.teardownsWhileClosed, 0);

    player.processAudio(silentBuffers()); // last song of the context ends
    await settle();
    assert.equal(songEnds, 2);
    assert.equal(sequencer.isEjected(), true);
    assert.equal(player.stopped, true);
    assert.equal(engine.teardownsWhileClosed, 0);
  });

  test(`${PlayerClass.name} waits out the silence between songs before reporting the end`, async () => {
    const player = new PlayerClass(core(), 44100, 2048);
    endedEngine(player);
    let songEnds = 0;
    player.on('playerSongEnd', () => songEnds++);
    player.setSilenceDuration(1); // one second = 44100 samples = 22 buffers of 2048
    player.beginLoad();
    await player.loadData(new Uint8Array([1]), `local/a.${ext}`, {});
    await settle();

    player.processAudio(silentBuffers());
    assert.equal(songEnds, 0, 'the end is held back while the silence plays');
    assert.equal(player.stopped, false);
    for (let i = 0; i < 21; i++) player.processAudio(silentBuffers());
    assert.equal(songEnds, 0);
    player.processAudio(silentBuffers());
    assert.equal(songEnds, 1);
    assert.equal(player.stopped, true);
  });
}

test('MDXPlayer closes a song once, and never before it was opened', async () => {
  let closes = 0;
  const core = {
    FS: { mkdirTree() {}, mount() {}, filesystems: { IDBFS: {} }, analyzePath: () => ({ exists: false }),
      writeFile() {}, syncfs(_populate, cb) { cb(null); } },
    HEAPU8: new Uint8Array(512),
    _malloc: () => 0, _free() {}, _mdx_create_context: () => 1, _mdx_set_rate() {}, _mdx_set_dir() {},
    _mdx_get_title() {}, _mdx_close() { closes++; },
    ccall: name => (name === 'mdx_get_pdx_filename' ? '' : 0),
  };
  const player = new MDXPlayer(core, 44100);
  player.muteAudioDuringCall = async (_node, fn) => fn();
  player.resolveParamValues = () => {};
  player.setTempo = () => {};
  player.getBasePlayerState = () => ({});

  player.stop(); // e.g. the Sequencer stopping a player that never played
  assert.equal(closes, 0);

  player.beginLoad();
  await player.loadData(new Uint8Array([1]), 'a.mdx', {});
  assert.equal(player.stopped, false);
  player.stop(); // natural end
  player.stop(); // the Sequencer, before the next song
  assert.equal(closes, 1);

  // A load that was cancelled before mdx_open() leaves nothing to close.
  player.beginLoad();
  const loading = player.loadData(new Uint8Array([1]), 'b.mdx', {});
  player.stop();
  await loading;
  player.stop();
  assert.equal(closes, 1);
});

// Minimal <audio> element: records listeners so the test can fire media events.
class FakeAudio {
  constructor() { this.listeners = {}; this.currentTime = 0; this.duration = 10; this.readyState = 4; this.src = ''; }
  addEventListener(type, fn) { (this.listeners[type] ||= new Set()).add(fn); }
  removeEventListener(type, fn) { this.listeners[type]?.delete(fn); }
  fire(type) { for (const fn of [...(this.listeners[type] || [])]) fn(); }
  load() {}
  pause() {}
  play() { return Promise.resolve(); }
}

function makeStreamPlayer() {
  globalThis.Audio = FakeAudio;
  globalThis.fetch = async () => new Response(null, { status: 404 }); // no ID3 tags
  const player = new StreamPlayer(makeCore(), 44100, 2048);
  player.audioNode = { context: { state: 'running', destination: {}, createMediaElementSource: () => ({ connect() {} }) } };
  return player;
}

test('StreamPlayer is not ended by the silent ScriptProcessor output', async () => {
  const player = makeStreamPlayer();
  let songEnds = 0;
  player.on('playerSongEnd', () => songEnds++);
  player.beginLoad();
  await player.loadData('http://example/a.mp3', 'a.mp3');
  player.audioElement.fire('loadedmetadata');
  assert.equal(player.stopped, false);

  // Inside the last five seconds, where the base class looks for trailing
  // silence. The stream's audio never reaches these buffers.
  player.audioElement.currentTime = 8;
  for (let i = 0; i < 40; i++) player.processAudio(silentBuffers());
  assert.equal(songEnds, 0);
  assert.equal(player.stopped, false);
});

test('StreamPlayer reports the end of the stream, after the silence between songs', async () => {
  for (const silence of [-1, 1]) {
    const player = makeStreamPlayer();
    let songEnds = 0;
    player.on('playerSongEnd', () => songEnds++);
    player.setSilenceDuration(silence);
    player.beginLoad();
    await player.loadData('http://example/a.mp3', 'a.mp3');
    player.audioElement.fire('loadedmetadata');

    player.audioElement.fire('ended');
    if (silence > 0) {
      assert.equal(songEnds, 0, 'the end is held back while the silence plays');
      for (let i = 0; i < 22; i++) player.processAudio(silentBuffers());
    }
    assert.equal(songEnds, 1);
    assert.equal(player.stopped, true);
  }
});
