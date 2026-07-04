# Getting Started — Complete Setup Guide

This guide walks you through setting up Chip Player JS (this fork) from a fresh
clone to a fully working player, step by step. It assumes basic familiarity
with the command line but no prior knowledge of this project.

The short build notes in [README.md](README.md) are a quick reference for
people who have done this before. If this is your first time, follow this
document instead.

## What you are building

Chip Player JS consists of four parts:

| Part | What it is | Built by |
|------|-----------|----------|
| `chip-core.wasm` | All music engines (MDX, VGM, SID, SPC, MIDI...) compiled to WebAssembly | Emscripten (`scripts/build-chip-core.js`) |
| React frontend | The web UI | `scripts/build.js` (ejected Create React App) |
| API server | Node/Express server that serves the UI, the music catalog, and the JSON API | `server/index.js` |
| Catalog databases | JSON + SQLite indexes of your music collection | `scripts/build-catalog.js`, `scripts/build-music.js` |

In production, **the Node server serves everything** (UI, music files, API) on
a single port. There is no separate static file hosting: the HTML is rendered
by the server at request time (for OpenGraph previews), so you cannot serve
the `build/` directory with nginx alone.

## Prerequisites

- **Git**
- **Node.js 20 or newer** (this fork is tested with Node 24) and npm
- **Emscripten SDK (emsdk) 5.x** — installed in step 2 below
- **CMake**, **automake**, **libtool**, **pkg-config**
- **xa** (6502 cross-assembler, needed by libsidplayfp)
- **zlib development headers** (Linux only)

macOS:

```bash
brew install cmake automake libtool pkg-config xa
```

Debian/Ubuntu/Raspberry Pi OS:

```bash
sudo apt-get install -y git cmake automake libtool pkg-config xa65 zlib1g-dev build-essential
```

> **Raspberry Pi note:** a Pi 5 (8 GB) builds everything in well under an
> hour. arm64 builds of emsdk are available, so the steps below are identical.

## Step 1 — Clone the repository

The build scripts expect several **sibling repositories cloned next to this
one** (they are cloned automatically in step 3), so put this repo in a
directory of its own:

```bash
mkdir -p ~/src && cd ~/src
git clone https://github.com/soltune/chip-player-js.git
cd chip-player-js
```

After step 3 your directory will look like:

```
~/src/
  chip-player-js/     <- this repo
  libxmp/             <- cloned automatically by scripts/build-libs.sh
  game-music-emu/
  FluidLite/
  libvgm/
  libsidplayfp/
```

## Step 2 — Install the Emscripten SDK

The build scripts look for emsdk at `~/src/emsdk` (hard-coded in
`package.json` and `scripts/build-libs.sh`). If you keep it elsewhere, create
a symlink.

```bash
cd ~/src
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install 5.0.7
./emsdk activate 5.0.7
```

Verify:

```bash
source ~/src/emsdk/emsdk_env.sh
emcc --version   # should print 5.0.7
```

> **If your emsdk clone is old** (1.x era) it will not recognize `5.0.7`.
> Delete it and clone fresh — that is faster than repairing it.

## Step 3 — Build the native libraries

This clones the sibling repos (if missing) and compiles every static library
that chip-core needs:

```bash
cd ~/src/chip-player-js
scripts/build-libs.sh          # takes several minutes
```

You should see `All libraries built.` at the end.

> **Troubleshooting: `Could NOT find ZLIB` (libvgm)**
> The Emscripten toolchain does not search your host `/usr/include`, so
> installing zlib system-wide does not help. Install the Emscripten zlib port
> into the sysroot instead, then re-run:
>
> ```bash
> source ~/src/emsdk/emsdk_env.sh
> embuilder build zlib
> rm -rf ../libvgm/build
> scripts/build-libs.sh
> ```

> **Do not "optimize" the build flags.** The flags policy (no `-flto`,
> `-fwrapv`, 5 MB stack) exists because several legacy engines miscompile
> under LTO with Emscripten 5 and crash at load time with
> `memory access out of bounds`. See the comments in `scripts/build-libs.sh`
> and `scripts/build-chip-core.js`.

## Step 4 — Build chip-core (the WebAssembly music engines)

```bash
npm run build-chip-core
```

This produces `src/chip-core.js` and `src/chip-core.wasm` (both gitignored).
You only need to repeat steps 3–4 when the C/C++ engine code changes.

## Step 5 — Install JavaScript dependencies

Two separate installs — the server has its own `package.json`:

```bash
npm install
(cd server && npm install)
```

## Step 6 — Create the files that are not in git

**`src/config/firebaseConfig.js`** (required — the build fails without it).
Firebase is used for login (favorites and settings sync). Copy the example
and, if you want working logins, replace the values with your own Firebase
project's web config:

```bash
cp src/config/firebaseConfig.example.js src/config/firebaseConfig.js
```

Optional runtime assets (gitignored, the player works without them but the
corresponding features degrade):

- `public/instruments/` — sample data used by some players
- `public/rhythm/ym2608_adpcm_rom.bin` — PC-98 (PMD) rhythm samples
- `public/soundfonts/` — extra soundfonts for local dev

## Step 7 — Set up your music catalog

The catalog is just a directory tree of music files. Create a symlink named
`catalog` in the repo root pointing at it:

```bash
ln -s /path/to/your/music ~/src/chip-player-js/catalog
```

Then build the catalog indexes (run from the repo root):

```bash
node scripts/build-catalog.js     # -> server/catalog.json, server/directories.json
node scripts/build-music.js       # -> server/catalog.db (SQLite, with full-text search)
```

`build-music.js` reads every file once (metadata + hash). The first run over a
large collection takes a while; later runs skip unmodified files.

## Step 8 — Initialize the remaining database tables

`server/index.js` prepares SQL statements for a few tables that
`build-music.js` does **not** create (user accounts, favorites, and two
metadata caches). Without them the server exits immediately with
`SQLITE_ERROR`. Create them once with the script in Appendix A:

```bash
node scripts/init-db.js   # if present in your checkout
# ...or save Appendix A as init-db.js anywhere and run it from the repo root
```

## Step 9 — Configure the server

```bash
cp server/.env server/.env.local
```

Edit `server/.env.local`:

```ini
BROWSE_LOCAL_FILESYSTEM=false                       # false = use catalog.db
LOCAL_CATALOG_ROOT='/path/to/your/music'            # same target as the symlink
LOCAL_SOUNDFONT_ROOT='/path/to/your/soundfonts'
LOCAL_CLIENT_BUILD_ROOT='/home/you/src/chip-player-js/build'
PORT=8080
```

> **Firebase note:** upstream's `server/middleware/auth.js` loads a Firebase
> *service account* JSON from `server/untracked/`. If you do not have one,
> either place your own project's service account key there, or initialize
> firebase-admin with only your project ID — token verification works without
> credentials. (The production branch of this fork carries that patch.)

## Step 10 — Run it (development)

```bash
npm run dev
```

This starts the webpack dev server (http://localhost:3000) and the API server
(http://localhost:8080) together. Open **http://localhost:3000**.

## Step 11 — Run it (production)

Build the frontend. Set the public URL paths first if the site is served from
a single origin (recommended):

```bash
cat > .env.production.local <<'EOF'
REACT_APP_API_BASE=/api
REACT_APP_CATALOG_PREFIX=/catalog
REACT_APP_SOUNDFONT_URL_PATH=/soundfonts
EOF
node scripts/build.js             # -> build/
```

Run the server under pm2:

```bash
npm install -g pm2
cp server/ecosystem.config.example.js server/ecosystem.config.js  # edit paths
cd server && pm2 start ecosystem.config.js && pm2 save
```

The whole site is now on port 8080. If you put nginx or a tunnel in front,
proxy everything to it:

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| Server exits with `SQLITE_ERROR` at startup | Missing tables — run the init script (step 8) |
| Server exits with `Cannot find module '../untracked/...json'` | Missing Firebase service account — see step 9 note |
| `Could NOT find ZLIB` during `build-libs.sh` | `embuilder build zlib`, then rebuild (step 3 note) |
| `memory access out of bounds` when a song loads | A flags-policy violation (usually `-flto` sneaking back in) — rebuild libs and chip-core with the stock flags |
| Frontend calls `https://chiptune.app/api` | `.env.production.local` missing at build time — recreate it and rebuild |
| Search returns nothing | `catalog.db` missing or stale — re-run `build-music.js` |

## Appendix A — init-db.js

```js
#!/usr/bin/env node
// Creates the tables server/index.js needs that build-music.js does not create.
// Safe to run repeatedly (IF NOT EXISTS). Run from the repository root.
const path = require('path');
const Database = require('better-sqlite3');
const serverDir = path.resolve(__dirname, 'server'); // adjust if not in repo root

const catalogDb = new Database(path.join(serverDir, 'catalog.db'));
catalogDb.exec(`
  CREATE TABLE IF NOT EXISTS hvsc_files (
    id INTEGER PRIMARY KEY, fullname TEXT UNIQUE, hash TEXT,
    title TEXT, author TEXT, released TEXT, stil TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_hvsc_files_hash ON hvsc_files(hash);
`);
catalogDb.close();

const usersDb = new Database(path.join(serverDir, 'users.db'));
usersDb.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT, display_name TEXT, photo_url TEXT,
    created_at INTEGER, last_login INTEGER, settings TEXT DEFAULT '{}'
  );
  CREATE TABLE IF NOT EXISTS playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, title TEXT,
    created_at INTEGER, modified_at INTEGER, type TEXT, items TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_playlists_user_favorites
    ON playlists(user_id) WHERE type = 'favorites';
  CREATE TABLE IF NOT EXISTS playbacks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, ip_address TEXT,
    song_id TEXT, played_at INTEGER, duration_ms INTEGER
  );
`);
usersDb.close();

const csdbDb = new Database(path.join(serverDir, 'csdb.db'));
csdbDb.exec(`
  CREATE TABLE IF NOT EXISTS sids (
    csdbid INTEGER PRIMARY KEY, xml TEXT, fetched_at INTEGER
  );
`);
csdbDb.close();
console.log('All databases initialized.');
```
