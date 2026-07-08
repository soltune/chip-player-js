// Shared loader for the OPNA (YM2608) rhythm samples.
//
// The rhythm WAV files live in public/rhythm and are registered into the shared
// Emscripten FS (chipCore.FS). Every OPNA-based player (S98, PMD, ...) is
// constructed from the same chipCore instance, so these files only need to be
// fetched and registered once. A module-level promise guarantees a single fetch
// even when several players call this concurrently at startup, which previously
// caused the same files to be downloaded multiple times.

const rhythmPath = '/rhythm';
const rhythmFiles = [
  '2608_BD.WAV',
  '2608_HH.WAV',
  '2608_RIM.WAV',
  '2608_SD.WAV',
  '2608_TOM.WAV',
  '2608_TOP.WAV',
];

let loadPromise = null;

function existsFileData(fs, path, filename) {
  try {
    return fs.readdir(path).includes(filename);
  } catch (e) {
    return false; // given path does not exist
  }
}

function registerFileData(fs, path, filename, data) {
  try {
    let parent = '.';
    path.split('/').forEach((token) => { // create directories recursively
      if (token.length > 0 && fs.readdir(parent).indexOf(token) < 0) {
        fs.mkdir(parent + '/' + token);
      }
      parent += '/' + token;
    });
  } catch (ignore) {
  }
  try {
    fs.writeFile(path + '/' + filename, new Uint8Array(data));
  } catch (e) {
    return false; // file may already exist, e.g. registered by another player
  }
  return true;
}

function fetchAndRegister(fs, filename) {
  if (existsFileData(fs, rhythmPath, filename)) {
    return Promise.resolve();
  }
  return fetch(`${rhythmPath}/${filename}`, {method: 'GET'})
    .then(response => {
      if (!response.ok) {
        throw Error(response.statusText);
      }
      return response.arrayBuffer();
    })
    .then(buffer => {
      registerFileData(fs, rhythmPath, filename, buffer);
    })
    .catch(e => {
      // Ignore: rhythm samples simply stay silent if they cannot be fetched.
    });
}

/**
 * Fetch and register the OPNA rhythm samples into the shared FS exactly once.
 * Safe to call from multiple players; subsequent calls reuse the same promise.
 * @param {object} core - shared Emscripten module (chipCore)
 * @returns {Promise} resolves once all samples have been processed
 */
export default function ensureRhythmRom(core) {
  if (!loadPromise) {
    const fs = core.FS;
    loadPromise = Promise.all(rhythmFiles.map(filename => fetchAndRegister(fs, filename)));
  }
  return loadPromise;
}
