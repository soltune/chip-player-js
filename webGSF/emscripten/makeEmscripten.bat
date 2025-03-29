::  POOR MAN'S DOS PROMPT BUILD SCRIPT.. make sure to delete the respective built/*.bc files before building!
::  existing *.bc files will not be recompiled. 

:: EMSCRIPTEN does no allow use of the features that might elsewhere be activated using -DNEW_DYNAREC -DDYNAREC -DARCH_MIN_SSE2
:: the respective "dynarec" specific files have therefore completely been trown out of this project..
setlocal enabledelayedexpansion

SET ERRORLEVEL
VERIFY > NUL

:: **** use the "-s WASM" switch to compile WebAssembly output. warning: the SINGLE_FILE approach does NOT currently work in Chrome 63.. ****
set "OPT=  -s DEMANGLE_SUPPORT=0 -s WASM=0 -s ASSERTIONS=0 -s FORCE_FILESYSTEM=1 -Wcast-align -fno-strict-aliasing -s VERBOSE=0 -s SAFE_HEAP=0 -s DISABLE_EXCEPTION_CATCHING=0 -DHAVE_STDINT_H -DNO_DEBUG_LOGS -Wno-pointer-sign -I. -I.. -I../mgba/include  -I../mgba/src -I../psflib -I../zlib   -Os -O3 "
set "OPT2=  -DM_CORE_GB -DM_CORE_GBA -DHAVE_CRC32  -DMINIMAL_CORE=3 -DDISABLE_THREADING %OPT%"
if not exist "built/extra.bc" (
	call emcc.bat %OPT% ../mgba/src/third-party/blip_buf/blip_buf.c ../psflib/psflib.c ../psflib/psf2fs.c ../zlib/adler32.c ../zlib/compress.c ../zlib/crc32.c ../zlib/gzio.c ../zlib/uncompr.c ../zlib/deflate.c ../zlib/trees.c ../zlib/zutil.c ../zlib/inflate.c ../zlib/infback.c ../zlib/inftrees.c ../zlib/inffast.c -o built/extra.bc
	IF !ERRORLEVEL! NEQ 0 goto :END
)

if not exist "built/arm.bc" (
	call emcc.bat %OPT2%  ../mgba/src/arm/arm.c ../mgba/src/arm/decoder.c ../mgba/src/arm/decoder-arm.c ../mgba/src/arm/decoder-thumb.c ../mgba/src/arm/isa-arm.c ../mgba/src/arm/isa-thumb.c -o built/arm.bc
	IF !ERRORLEVEL! NEQ 0 goto :END
)

if not exist "built/LR35902.bc" (
	call emcc.bat %OPT2%  	../mgba/src/lr35902/decoder.c ../mgba/src/lr35902/isa-lr35902.c ../mgba/src/lr35902/lr35902.c -o built/LR35902.bc
	IF !ERRORLEVEL! NEQ 0 goto :END
)

if not exist "built/gb.bc" (
	call emcc.bat %OPT2%  ../mgba/src/gb/renderers/cache-set.c ../mgba/src/gb/renderers/software.c ../mgba/src/gb/audio.c ../mgba/src/gb/cheats.c ../mgba/src/gb/core.c ../mgba/src/gb/gb.c ../mgba/src/gb/io.c ../mgba/src/gb/mbc.c ../mgba/src/gb/memory.c ../mgba/src/gb/overrides.c ../mgba/src/gb/serialize.c ../mgba/src/gb/sio.c ../mgba/src/gb/timer.c ../mgba/src/gb/video.c -o built/gb.bc
	IF !ERRORLEVEL! NEQ 0 goto :END
)

if not exist "built/gba.bc" (
	call emcc.bat %OPT2%  ../mgba/src/gba/rr/vbm.c ../mgba/src/gba/rr/rr.c ../mgba/src/gba/rr/mgm.c ../mgba/src/gba/cheats/parv3.c ../mgba/src/gba/cheats/codebreaker.c ../mgba/src/gba/cheats/gameshark.c ../mgba/src/gba/audio.c ../mgba/src/gba/bios.c ../mgba/src/gba/cheats.c ../mgba/src/gba/core.c ../mgba/src/gba/dma.c ../mgba/src/gba/gba.c ../mgba/src/gba/hardware.c ../mgba/src/gba/hle-bios.c ../mgba/src/gba/input.c ../mgba/src/gba/io.c ../mgba/src/gba/memory.c ../mgba/src/gba/overrides.c ../mgba/src/gba/savedata.c ../mgba/src/gba/serialize.c ../mgba/src/gba/sharkport.c ../mgba/src/gba/sio.c ../mgba/src/gba/timer.c ../mgba/src/gba/vfame.c ../mgba/src/gba/video.c -o built/gba.bc
	IF !ERRORLEVEL! NEQ 0 goto :END
)

if not exist "built/gbsio.bc" (
	call emcc.bat %OPT2%  ../mgba/src/gb/sio/printer.c ../mgba/src/gb/sio/lockstep.c -o built/gbsio.bc
	IF !ERRORLEVEL! NEQ 0 goto :END
)

if not exist "built/gbasio.bc" (
	call emcc.bat %OPT2%  ../mgba/src/gba/sio/joybus.c ../mgba/src/gba/sio/lockstep.c -o built/gbasio.bc
	IF !ERRORLEVEL! NEQ 0 goto :END
)

if not exist "built/utils.bc" (
	call emcc.bat %OPT2%  ../mgba/src/util/vfs/vfs-mem.c ../mgba/src/util/crc32.c ../mgba/src/util/circle-buffer.c ../mgba/src/util/configuration.c ../mgba/src/util/elf-read.c ../mgba/src/util/export.c ../mgba/src/util/formatting.c ../mgba/src/util/gui.c ../mgba/src/util/hash.c ../mgba/src/util/patch.c ../mgba/src/util/patch-fast.c ../mgba/src/util/patch-ips.c ../mgba/src/util/patch-ups.c  ../mgba/src/util/ring-fifo.c ../mgba/src/util/string.c ../mgba/src/util/table.c ../mgba/src/util/text-codec.c ../mgba/src/util/vfs.c -o built/utils.bc
	IF !ERRORLEVEL! NEQ 0 goto :END
)

if not exist "built/gbarender.bc" (
	call emcc.bat %OPT2%  ../mgba/src/gba/renderers/cache-set.c ../mgba/src/gba/renderers/software-bg.c ../mgba/src/gba/renderers/software-mode0.c ../mgba/src/gba/renderers/software-obj.c ../mgba/src/gba/renderers/video-software.c -o built/gbarender.bc
	IF !ERRORLEVEL! NEQ 0 goto :END
)

if not exist "built/core.bc" (
	call emcc.bat %OPT2%  ../mgba/src/core/cache-set.c ../mgba/src/core/cheats.c ../mgba/src/core/config.c ../mgba/src/core/core.c ../mgba/src/core/directories.c ../mgba/src/core/input.c ../mgba/src/core/interface.c ../mgba/src/core/library.c ../mgba/src/core/lockstep.c ../mgba/src/core/log.c ../mgba/src/core/map-cache.c ../mgba/src/core/mem-search.c ../mgba/src/core/rewind.c ../mgba/src/core/scripting.c ../mgba/src/core/serialize.c ../mgba/src/core/sync.c ../mgba/src/core/tile-cache.c ../mgba/src/core/timing.c -o built/core.bc
	IF !ERRORLEVEL! NEQ 0 goto :END
)
call emcc.bat %OPT2% -s TOTAL_MEMORY=67108864 --closure 1 --llvm-lto 1 --memory-init-file 0  built/utils.bc built/extra.bc built/arm.bc built/LR35902.bc built/gb.bc built/gba.bc built/gbsio.bc built/gbasio.bc built/gbarender.bc built/core.bc  gsfplug.cpp  adapter.cpp --js-library callback.js  -s EXPORTED_FUNCTIONS="['_emu_setup', '_emu_init','_emu_teardown','_emu_get_current_position','_emu_seek_position','_emu_get_max_position','_emu_set_subsong','_emu_get_track_info','_emu_get_sample_rate','_emu_get_audio_buffer','_emu_get_audio_buffer_length','_emu_compute_audio_samples', '_malloc', '_free']"  -o htdocs/gsf.js  -s SINGLE_FILE=0 -s EXTRA_EXPORTED_RUNTIME_METHODS="['ccall', 'Pointer_stringify']"  -s BINARYEN_ASYNC_COMPILATION=1 -s BINARYEN_TRAP_MODE='clamp' && copy /b shell-pre.js + htdocs\gsf.js + shell-post.js htdocs\web_gsf3.js && del htdocs\gsf.js && copy /b htdocs\web_gsf3.js + gsf_adapter.js htdocs\backend_gsf.js && del htdocs\web_gsf3.js
:END