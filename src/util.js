import pathe from 'pathe';

import { API_BASE, CATALOG_PREFIX } from './config';
import axios from 'redaxios';

const MULTI_SLASH_REGEX = /\/{2,}/g;

export function updateQueryString(newParams) {
  const searchParams = new URLSearchParams(window.location.search);
  Object.entries(newParams).forEach(([key, value]) => {
    if (value === undefined) {
      searchParams.delete(key);
    } else {
      searchParams.set(key, value);
    }
  });
  const stateUrl = '?' + searchParams.toString().replace(/%20/g, '+');
  window.history.replaceState(null, '', stateUrl);
}

export function unlockAudioContext(context) {
  // https://hackernoon.com/unlocking-web-audio-the-smarter-way-8858218c0e09
  console.log('AudioContext initial state is %s.', context.state);

  // Track whether audio session may have been lost (zombie "running" state on iOS).
  // iOS Safari does not fire statechange when another app takes the audio session,
  // so context.state remains "running" even though the audio device is dead.
  // Recovery is only possible during a user gesture (touch/click).
  let needsRecovery = false;

  context.addEventListener('statechange', () => {
    if (context.state === 'interrupted') {
      needsRecovery = false; // Will be handled by resume on hidden
    }
  });

  const events = ['touchstart', 'touchend', 'mousedown', 'mouseup'];
  const unlock = (e) => {
    if (context.state === 'suspended') {
      // Need to resume when suspended due to bluetooth headphone connection/disconnection on iOS,
      // so removeEventListener() is disabled
      context.resume();
    }
    if (needsRecovery) {
      // iOS zombie state: context.state is "running" but audio device is dead.
      // Attempt recovery via suspend→resume within user gesture context.
      context.suspend().then(() => context.resume()).then(() => {
        needsRecovery = false;
      }).catch(() => {});
    }
  }
  events.forEach(event => document.body.addEventListener(event, unlock, false));

  // resume audio even if on background (iOS)
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      context.resume();
    } else {
      // Returning to foreground: mark as potentially needing recovery.
      // If another app took the audio session, context.state will be "running"
      // but the audio device will be dead. We can't fix it here (no user gesture),
      // so flag it for the next touch/click event.
      needsRecovery = true;
    }
  });
}

export function titlesFromMetadata(metadata) {
  if (metadata.formatted) {
    return metadata.formatted;
  }

  const title = allOrNone(metadata.artist, ' - ') + metadata.title;
  const subtitle = [metadata.game, metadata.system].filter(x => x).join(' - ') +
    allOrNone(' (', metadata.copyright, ')');
  return { title, subtitle };
}

export function allOrNone(...args) {
  let str = '';
  for (let i = 0; i < args.length; i++) {
    if (!args[i]) return '';
    str += args[i];
  }
  return str;
}

// Preserves leading and trailing slashes.
export function pathJoin(...parts) {
  const sep = '/';
  const last = parts.length - 1;
  return parts
    .map((part, i) => {
      if (i !== 0 && part.startsWith(sep)) part = part.slice(1);
      if (i !== last && part.endsWith(sep)) part = part.slice(0, -1);
      return part;
    })
    .join(sep);
}

export function getFilepathFromUrl(url) {
  if (!url) return null;
  return url.replace(CATALOG_PREFIX, '/').replace(MULTI_SLASH_REGEX, '/');
}

export function getUrlFromFilepath(filepath) {
  if (!filepath) return null;
  // in case it's already encoded
  try { filepath = decodeURIComponent(filepath); } catch {}
  return pathJoin(CATALOG_PREFIX, encodeURIComponent(filepath));
}

export function getMetadataUrlForFilepath(filepath) {
  // XXX: any time we convert from path to URL, we must encode
  filepath = filepath.replace('%25', '%').replace('%23', '#');
  return `${API_BASE}/metadata?path=${encodeURIComponent(filepath)}`;
}

export function getMetadataUrlForCatalogUrl(url) {
  const filepath = getFilepathFromUrl(url);
  return getMetadataUrlForFilepath(filepath);
}

export function ensureEmscFileWithUrl(emscRuntime, filename, url) {
  if (emscRuntime.FS.analyzePath(filename).exists) {
    console.debug(`${filename} exists in Emscripten file system.`);
    return Promise.resolve(filename);
  } else {
    console.log(`Downloading ${filename}...`);
    return fetch(url)
      .then(response => {
        // Because fetch doesn't reject on 404
        if (!response.ok) throw Error(`HTTP ${response.status} while fetching ${filename}`);
        return response;
      })
      .then(response => response.arrayBuffer())
      .then(buffer => {
        const arr = new Uint8Array(buffer);
        return ensureEmscFileWithData(emscRuntime, filename, arr, true);
      });
  }
}

export function ensureEmscFileWithData(emscRuntime, filename, uint8Array, forceWrite = false) {
  if (!forceWrite && emscRuntime.FS.analyzePath(filename).exists) {
    console.debug(`${filename} exists in Emscripten file system.`);
    return Promise.resolve(filename);
  } else {
    console.debug(`Writing ${filename} to Emscripten file system...`);
    const dir = pathe.dirname(filename);
    emscRuntime.FS.mkdirTree(dir);
    emscRuntime.FS.writeFile(filename, uint8Array);
    return new Promise((resolve, reject) => {
      emscRuntime.FS.syncfs(false, (err) => {
        if (err) {
          console.error('Error synchronizing to indexeddb.', err);
          reject(err);
        } else {
          console.debug(`Synchronized ${filename} to indexeddb.`);
          resolve(filename);
        }
      });
    });
  }
}

export function remap(number, fromLeft, fromRight, toLeft, toRight) {
  return toLeft + (number - fromLeft) / (fromRight - fromLeft) * (toRight - toLeft)
}

export function remap01(number, toLeft, toRight) {
  return remap(number, 0, 1, toLeft, toRight);
}

export const getWithAuth = async (user, path) => {
  if (!user) return;

  const token = await user.getIdToken();
  return axios.get(path, {
    headers: { 'Authorization': `Bearer ${token}`, },
  }).then(res => res.data);
}

export const postWithAuth = async (user, path, json) => {
  if (!user) return;

  const token = await user.getIdToken();
  return axios.post(path, json, {
    headers: { 'Authorization': `Bearer ${token}`, },
  }).then(res => res.data);
}

export const postWithOptionalAuth = async (user, path, json) => {
  const headers = {};
  if (user) {
    const token = await user.getIdToken();
    headers['Authorization'] = `Bearer ${token}`;
  }
  return axios.post(path, json, { headers }).then(res => res.data);
}

export const vectorToArray = (vec) => {
  return new Array(vec.size()).fill(0).map((_, id) => vec.get(id))
}
