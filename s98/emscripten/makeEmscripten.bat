::  POOR MAN'S DOS PROMPT BUILD SCRIPT.. make sure to delete the respective built/*.bc files before building!
::  existing *.bc files will not be recompiled. 

setlocal enabledelayedexpansion

SET ERRORLEVEL
VERIFY > NUL


:: **** use the "-s WASM" switch to compile WebAssembly output. warning: the SINGLE_FILE approach does NOT currently work in Chrome 63.. ****
set "OPT= -s WASM=0 -s ASSERTIONS=1 -s VERBOSE=0 -s FORCE_FILESYSTEM=1 -DEMSCRIPTEN -DNO_DEBUG_LOGS -DHAVE_LIMITS_H -DHAVE_STDINT_H -Wcast-align -fno-strict-aliasing -s SAFE_HEAP=1 -s DISABLE_EXCEPTION_CATCHING=0 -Wno-pointer-sign -I. -I.. -I../zlib -I../src -I../src/zlib -I../src/device -Os -O3 "
if not exist "built/zlib.bc" (
	call emcc.bat %OPT% ../src/zlib/adler32.c ../src/zlib/compress.c ../src/zlib/crc32.c ../src/zlib/gzio.c ../src/zlib/uncompr.c ../src/zlib/deflate.c ../src/zlib/trees.c ../src/zlib/zutil.c ../src/zlib/inflate.c ../src/zlib/infback.c ../src/zlib/inftrees.c ../src/zlib/inffast.c  -o built/zlib.bc
	IF !ERRORLEVEL! NEQ 0 goto :END
)
if not exist "built/device.bc" (
	call emcc.bat  %OPT% ../src/device/emu2413/emu2413.c ../src/device/fmgen/file.cpp ../src/device/fmgen/fmgen.cpp ../src/device/fmgen/fmtimer.cpp ../src/device/fmgen/opm.cpp ../src/device/fmgen/opna.cpp ../src/device/fmgen/psg.cpp ../src/device/mame/fmopl.c ../src/device/mame/ymf262.c -o built/device.bc
	IF !ERRORLEVEL! NEQ 0 goto :END
)
if not exist "built/s98.bc" (
	call emcc.bat  %OPT% ../src/device/s98mame.cpp ../src/device/s98fmgen.cpp ../src/device/s98opll.cpp ../src/device/s98sng.cpp ../src/device/s_logtbl.c ../src/device/s_sng.c -o built/s98.bc
	IF !ERRORLEVEL! NEQ 0 goto :END
)
call emcc.bat %OPT% -s TOTAL_MEMORY=67108864 --closure 1 --llvm-lto 1  --memory-init-file 0   built/zlib.bc built/s98.bc built/device.bc ../src/m_s98.cpp adapter.cpp   -s EXPORTED_FUNCTIONS="[ '_emu_load_file','_emu_teardown','_emu_get_current_position','_emu_seek_position','_emu_get_max_position','_emu_set_subsong','_emu_get_track_info','_emu_get_sample_rate','_emu_get_audio_buffer','_emu_get_audio_buffer_length','_emu_compute_audio_samples', '_malloc', '_free']"  -o htdocs/s98.js  -s SINGLE_FILE=0 -s EXTRA_EXPORTED_RUNTIME_METHODS="['ccall', 'Pointer_stringify']"  -s BINARYEN_ASYNC_COMPILATION=1 -s BINARYEN_TRAP_MODE='clamp' && copy /b shell-pre.js + htdocs\s98.js + shell-post.js htdocs\web_s983.js && del htdocs\s98.js && copy /b htdocs\web_s983.js + s98_adapter.js htdocs\backend_s98.js && del htdocs\web_s983.js
:END

