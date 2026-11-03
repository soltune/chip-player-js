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
    player.loadData(new Uint8Array([1]), 'game/a.x', {});
    player.loadData(new Uint8Array([1]), 'game/b.x', {});
    await mutes.releaseAll();
    assert.deepEqual(loads, ['b.x']);
    assert.equal(player.stopped, false);
  });

  test(`${PlayerClass.name} does not start after a switch to another player during the mute`, async () => {
    const player = new PlayerClass(makeCore(), 44100);
    const loads = stubLib(player);
    const mutes = holdMutes(player);
    player.lib.registerFileData('game/', 'game.lib');
    player.loadData(new Uint8Array([1]), 'game/a.x', {});
    player.suspend(); // the Sequencer suspends the old player before switching
    await mutes.releaseAll();
    assert.deepEqual(loads, []);
    assert.equal(player.stopped, true);
  });

  test(`${PlayerClass.name} does not start in the background when a lib arrives after a switch`, async () => {
    const player = new PlayerClass(makeCore(), 44100);
    const loads = stubLib(player);
    const mutes = holdMutes(player);
    const fetches = holdFetches();
    player.loadData(new Uint8Array([1]), 'game/a.x', {});
    await mutes.releaseAll();
    assert.deepEqual(loads, ['a.x']); // waiting for game.lib
    player.suspend(); // switched to another player's song
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
    player.loadData(new Uint8Array([1]), 'game/a.x', {});
    await mutes.releaseAll();
    player.suspend(); // the Sequencer suspends before the next song on the same player
    player.loadData(new Uint8Array([1]), 'game/b.x', {});
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
  player.loadData(new Uint8Array([1]), 'a.opi', {});
  player.loadData(new Uint8Array([1]), 'b.opi', {});
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
