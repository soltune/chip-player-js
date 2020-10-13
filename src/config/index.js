const API_BASE = process.env.REACT_APP_API_BASE;
const CATALOG_PREFIX = process.env.REACT_APP_CATALOG_PREFIX;
const SOUNDFONT_URL_PATH = process.env.REACT_APP_SOUNDFONT_URL_PATH;

const MAX_VOICES = 64;
const REPLACE_STATE_ON_SEEK = false;
const FORMATS =  [
  '2sf',
  'ay',
  'gbs',
  'hes',
  'it',
  'm',
  'm2',
  'mz',
  'mdx',
  'mid',
  'mini2sf',
  'minipsf',
  'minipsf2',
  'miniusf',
  'mod',
  'mp3',
  'nsf',
  'nsfe',
  'opi',
  'ovi',
  'ozi',
  'sgc',
  'spc',
  'kss',
  'psf',
  'psf2',
  's3m',
  's98',
  'v2m',
  'vgm',
  'vgz',
  'xm',
];

// needs to be a CommonJS module - used in node.js server
module.exports = {
  API_BASE,
  CATALOG_PREFIX,
  SOUNDFONT_URL_PATH,
  MAX_VOICES,
  REPLACE_STATE_ON_SEEK,
  FORMATS,
};
