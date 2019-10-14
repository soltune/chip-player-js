#!/bin/sh

OPT="-s WASM=0 -s ASSERTIONS=1 -s VERBOSE=0 -s FORCE_FILESYSTEM=1 -DEMSCRIPTEN -DNO_DEBUG_LOGS -DHAVE_LIMITS_H -DHAVE_STDINT_H -Wcast-align -fno-strict-aliasing -s SAFE_HEAP=1 -s DISABLE_EXCEPTION_CATCHING=0 -Wno-pointer-sign -Wno-narrowing -I. -I./fmplayer -Os -O3 "

echo "building fmplayer..."
emcc ${OPT} \
  ./fmplayer/fmdriver/fmdriver_fmp.c \
  ./fmplayer/fmdriver/fmdriver_common.c \
  ./fmplayer/fmdriver/ppz8.c \
  ./fmplayer/common/fmplayer_work_opna.c \
  ./fmplayer/common/fmplayer_file.c \
  ./fmplayer/libopna/opna.c \
  ./fmplayer/libopna/opnafm.c \
  ./fmplayer/libopna/opnaadpcm.c \
  ./fmplayer/libopna/opnatimer.c \
  ./fmplayer/libopna/opnadrum.c \
  ./fmplayer/libopna/opnassg.c \
  ./fmplayer/libopna/opnassg-sinc-c.c \
  ./fmplayer_wrapper.cpp \
  -s EXPORTED_FUNCTIONS="[ '_fmp_get_sample_rate', '_fmp_load_file', '_fmp_teardown', '_fmp_get_audio_buffer', '_fmp_get_audio_buffer_length', 'fmp_compute_audio_samples', '_fmp_get_current_position', '_fmp_get_max_position', '_fmp_has_loop' ]" \
  -s EXPORTED_RUNTIME_METHODS="[ 'ccall', 'UTF8ToString', 'getValue' ]" \
  -o build/fmplayer.bc
#
#echo "building webMDX..."
#emcc ${OPT} -s TOTAL_MEMORY=67108864 --closure 1 --llvm-lto 1  --memory-init-file 0   build/pmdmini.bc build/mdxmini.bc  adapter.cpp   -s EXPORTED_FUNCTIONS="[ '_fmp_load_file']"  -o build/mdx.bc  -s SINGLE_FILE=0 -s EXTRA_EXPORTED_RUNTIME_METHODS="['ccall', 'Pointer_stringify']"  -s BINARYEN_ASYNC_COMPILATION=1 -s BINARYEN_TRAP_MODE='clamp'

echo "done."

