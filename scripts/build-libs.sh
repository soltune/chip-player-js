#!/usr/bin/env bash
# Build every static library needed by scripts/build-chip-core.js (this fork).
#
# Layout: side-by-side clones live next to this repository:
#   ../libxmp           https://github.com/libxmp/libxmp.git
#   ../game-music-emu   https://github.com/soltune/game-music-emu.git (chip-player)
#   ../FluidLite        https://github.com/divideconcept/FluidLite.git
#   ../libvgm           https://github.com/soltune/libvgm.git (chip-player)
#   ../libsidplayfp     https://github.com/mmontag/libsidplayfp.git (montag-dev-2.14)
# In-repo builds: fluidlite is NOT used (stale subtree); psflib, lazyusf2 and
# webGSF build from the in-repo sources.
#
# Flags policy: no -flto (miscompiles legacy engine code under Emscripten 5),
# -fwrapv for the old C/C++ codebases that assume wrapping signed overflow.
#
# Prerequisites: emsdk (Emscripten 5.x) at ~/src/emsdk, cmake, autotools
# (brew install automake libtool), xa (brew install xa, for libsidplayfp).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SIB="$(dirname "$ROOT")"
J="${J:-8}"
source ~/src/emsdk/emsdk_env.sh

clone_if_missing() { # url dir [branch]
  local url=$1 dir=$2 branch=${3:-}
  if [ ! -d "$dir" ]; then
    git clone ${branch:+-b "$branch"} "$url" "$dir"
  fi
}

echo '=== side-by-side clones'
clone_if_missing https://github.com/libxmp/libxmp.git          "$SIB/libxmp"
clone_if_missing https://github.com/soltune/game-music-emu.git "$SIB/game-music-emu" chip-player
clone_if_missing https://github.com/divideconcept/FluidLite.git "$SIB/FluidLite"
clone_if_missing https://github.com/soltune/libvgm.git         "$SIB/libvgm" chip-player
clone_if_missing https://github.com/mmontag/libsidplayfp.git   "$SIB/libsidplayfp" montag-dev-2.14

echo '=== libxmp-lite (side-by-side)'
( cd "$SIB/libxmp" && mkdir -p build && cd build
  emcmake cmake -DBUILD_LITE=ON -DBUILD_STATIC=ON -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_C_FLAGS="-Oz -fwrapv" -DCMAKE_POLICY_VERSION_MINIMUM=3.5 ..
  emmake make -j"$J" )

echo '=== game-music-emu (side-by-side; VGM/GYM off, they belong to libvgm)'
( cd "$SIB/game-music-emu" && mkdir -p build && cd build
  emcmake cmake -DCMAKE_BUILD_TYPE=Release -DUSE_GME_VGM=OFF -DUSE_GME_GYM=OFF \
    -DGME_ZLIB=OFF -DGME_BUILD_STATIC=ON \
    -DCMAKE_CXX_FLAGS="-Oz -fwrapv" -DCMAKE_C_FLAGS="-Oz -fwrapv" \
    -DCMAKE_POLICY_VERSION_MINIMUM=3.5 ..
  emmake make -j"$J" )

echo '=== FluidLite (side-by-side; add -DENABLE_SF3=YES -DSTB_VORBIS=YES for sf3)'
( cd "$SIB/FluidLite" && mkdir -p build && cd build
  emcmake cmake .. -DCMAKE_BUILD_TYPE=Release -DCMAKE_C_FLAGS="-Oz -fwrapv" \
    -DCMAKE_POLICY_VERSION_MINIMUM=3.5
  emmake make -j"$J" fluidlite-static )

echo '=== libvgm (side-by-side)'
( cd "$SIB/libvgm" && mkdir -p build && cd build
  emcmake cmake .. -DCMAKE_BUILD_TYPE=Release -DCMAKE_POLICY_VERSION_MINIMUM=3.5
  emmake make -j"$J" )

echo '=== libsidplayfp (side-by-side; see scripts/patches/libsidplayfp-NOTES.txt)'
( cd "$SIB/libsidplayfp"
  git submodule update --init --recursive || true
  # The pinned resid commit is unpublished; fall back to resid master.
  ( cd src/builders/resid-builder/resid && git fetch --quiet origin && \
    git checkout --quiet origin/HEAD ) || true
  git apply --check "$ROOT/scripts/patches/libsidplayfp-resid-emu.patch" 2>/dev/null && \
    git apply "$ROOT/scripts/patches/libsidplayfp-resid-emu.patch" || true
  # Regenerate the 6502 driver blobs with BSD-compatible od (no -w8).
  for a65 in src/psiddrv.a65 src/sidtune/sidplayer1.a65 src/sidtune/sidplayer2.a65; do
    bin="${a65%.a65}.bin"; o65="${a65%.a65}.o65"
    if [ ! -s "$bin" ]; then
      xa -R -G "$a65" -o "$o65"
      od -v -An -tx1 "$o65" | sed -E 's/[[:alnum:]]+/0x&,/g' > "$bin"
      rm -f "$o65"
    fi
  done
  [ -x configure ] || autoreconf -vfi
  [ -f Makefile ] || emconfigure ./configure --host=wasm32-unknown-emscripten \
    --disable-shared --enable-static --disable-debug --without-exsid --without-gcrypt \
    --with-simd=sse4 XA="$(command -v xa)" OD="$(command -v od)" \
    CXXFLAGS="-Oz -msimd128" LDFLAGS="-Oz -msimd128"
  emmake make -j"$J" )

echo '=== psflib (in-repo)'
( cd "$ROOT/psflib" && emmake make -f Emscripten.Makefile libpsflib.a )

echo '=== lazyusf2 (in-repo)'
( cd "$ROOT/lazyusf2" && mkdir -p build && cd build
  emcmake cmake .. -DCMAKE_BUILD_TYPE=Release -DCMAKE_POLICY_VERSION_MINIMUM=3.5
  emmake make -j"$J" )

echo '=== webGSF / libwebgsf.a (in-repo)'
( cd "$ROOT/webGSF/emscripten" && emmake make -f Emscripten.Makefile -j"$J" )

echo 'All libraries built. Now run: npm run build-chip-core'
