OPT="-s WASM=0 -s ASSERTIONS=1 -s VERBOSE=0 -s FORCE_FILESYSTEM=1 -DEMSCRIPTEN -DNO_DEBUG_LOGS -DHAVE_LIMITS_H -DHAVE_STDINT_H -Wcast-align -fno-strict-aliasing -s SAFE_HEAP=1 -s DISABLE_EXCEPTION_CATCHING=0 -Wno-pointer-sign -Wno-narrowing -I. -I.. -I../zlib -I../src -I../src/zlib -I../src/device -Os -O3"

echo "building zlib..."
emcc ${OPT} \
  ../src/zlib/adler32.c \
  ../src/zlib/compress.c \
  ../src/zlib/crc32.c \
  ../src/zlib/gzio.c \
  ../src/zlib/uncompr.c \
  ../src/zlib/deflate.c \
  ../src/zlib/trees.c \
  ../src/zlib/zutil.c \
  ../src/zlib/inflate.c \
  ../src/zlib/infback.c \
  ../src/zlib/inftrees.c \
  ../src/zlib/inffast.c  \
  -o build/zlib.bc

echo "building devices..."
emcc ${OPT} \
  ../src/device/emu2413/emu2413.c \
  ../src/device/fmgen/file.cpp \
  ../src/device/fmgen/fmgen.cpp \
  ../src/device/fmgen/fmtimer.cpp \
  ../src/device/fmgen/opm.cpp \
  ../src/device/fmgen/opna.cpp \
  ../src/device/fmgen/psg.cpp \
  ../src/device/mame/fmopl.c \
  ../src/device/mame/ymf262.c \
  -o build/device.bc

echo "building s98..."
emcc ${OPT} \
  ../src/device/s98mame.cpp \
  ../src/device/s98fmgen.cpp \
  ../src/device/s98opll.cpp\
  ../src/device/s98sng.cpp \
  ../src/device/s_logtbl.c \
  ../src/device/s_sng.c \
  -o build/s98.bc

FUNCTIONS="[ '_s98_load_file','_s98_teardown','_s98_get_current_position','_s98_seek_position','_s98_get_max_position',
'_s98_get_track_info','_s98_get_sample_rate','_s98_get_audio_buffer','_s98_get_audio_buffer_length',
'_s98_compute_audio_samples', '_s98_get_device_count', '_s98_get_device_name', '_s98_set_channel_mask', '_s98_set_volumes',
'_malloc', '_free']"
EXTRA_METHODS="['ccall', 'UTF8ToString']"

echo "building webS98..."
emcc ${OPT} \
  -s TOTAL_MEMORY=67108864 --llvm-lto 1  --memory-init-file 0 \
  -s "EXPORTED_FUNCTIONS=${FUNCTIONS}" \
  -s SINGLE_FILE=0 \
  -s "EXTRA_EXPORTED_RUNTIME_METHODS=${EXTRA_METHODS}" \
  -s "BINARYEN_ASYNC_COMPILATION=1" \
  -s "BINARYEN_TRAP_MODE='clamp'" \
  build/zlib.bc \
  build/s98.bc \
  build/device.bc \
  ../src/m_s98.cpp \
  adapter.cpp \
  -o build/m_s98.bc

echo "done."