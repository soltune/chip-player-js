#!/bin/sh

OPT="-s WASM=0 -s ASSERTIONS=1 -s VERBOSE=0 -s FORCE_FILESYSTEM=1 -DEMSCRIPTEN -DNO_DEBUG_LOGS -DHAVE_LIMITS_H -DHAVE_STDINT_H -Wcast-align -fno-strict-aliasing -s SAFE_HEAP=1 -s DISABLE_EXCEPTION_CATCHING=0 -Wno-pointer-sign -Wno-narrowing -I. -I.. -I../zlib -I../mdxmini/src/ -I../pmdmini/src/pmdwin/ -I../pmdmini/src/fmgen/ -I../src/device -Os -O3 "

echo "building pmdmini..."
emcc ${OPT} ../pmdmini/src/fmgen/file.cpp ../pmdmini/src/fmgen/fmgen.cpp ../pmdmini/src/fmgen/fmtimer.cpp ../pmdmini/src/fmgen/opm.cpp ../pmdmini/src/fmgen/opna.cpp ../pmdmini/src/fmgen/psg.cpp ../pmdmini/src/pmdwin/opnaw.cpp ../pmdmini/src/pmdwin/p86drv.cpp ../pmdmini/src/pmdwin/pmdwin.cpp ../pmdmini/src/pmdwin/ppsdrv.cpp ../pmdmini/src/pmdwin/ppz8l.cpp ../pmdmini/src/pmdwin/table.cpp ../pmdmini/src/pmdwin/util.cpp ../pmdmini/src/pmdmini.c -o build/pmdmini.bc

echo "building mdxmini..."
emcc ${OPT} ../mdxmini/src/mdx2151.c ../mdxmini/src/mdxfile.c ../mdxmini/src/mdxmini.c ../mdxmini/src/mdxmml_ym2151.c ../mdxmini/src/pcm8.c ../mdxmini/src/pdxfile.c ../mdxmini/src/ym2151.c -o build/mdxmini.bc

echo "building webMDX..."
emcc ${OPT} -s TOTAL_MEMORY=67108864 --closure 1 --llvm-lto 1  --memory-init-file 0   build/pmdmini.bc build/mdxmini.bc  adapter.cpp   -s EXPORTED_FUNCTIONS="[ '_emu_load_file','_emu_teardown','_emu_get_current_position','_emu_seek_position','_emu_get_max_position','_emu_set_subsong','_emu_get_track_info','_emu_get_sample_rate','_emu_get_audio_buffer','_emu_get_audio_buffer_length','_emu_compute_audio_samples', '_malloc', '_free']"  -o build/mdx.bc  -s SINGLE_FILE=0 -s EXTRA_EXPORTED_RUNTIME_METHODS="['ccall', 'Pointer_stringify']"  -s BINARYEN_ASYNC_COMPILATION=1 -s BINARYEN_TRAP_MODE='clamp' 

echo "done."
