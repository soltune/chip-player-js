export const API_BASE = "http://"+window.location.hostname+":8080/";
export const CATALOG_PREFIX = "http://"+window.location.hostname+":5000/static/catalog/";
export const SOUNDFONT_URL_PATH = process.env.REACT_APP_SOUNDFONT_URL_PATH;

export const MAX_VOICES = 64;
export const REPLACE_STATE_ON_SEEK = false;
export const FORMATS =  [
  'ay',
  'gbs',
  'it',
  'm',
  'm2',
  'mz',
  'mid',
  'mod',
  'nsf',
  'nsfe',
  'sgc',
  'spc',
  'kss',
  's3m',
  's98',
  'vgm',
  'vgz',
  'xm',
];
