
ARCH := $(shell getconf LONG_BIT)

FLAGS_32 = -msse -mmmx -msse2
FLAGS_64 = -fPIC

CFLAGS = -c -g4 -Os -Wno-cast-align -fno-strict-aliasing -s VERBOSE=0 -s SAFE_HEAP=0 -s DISABLE_EXCEPTION_CATCHING=0 -DM_CORE_GBA -DHAVE_CRC32  -DMINIMAL_CORE=3 -DDISABLE_THREADING -DHAVE_STDINT_H -DNO_DEBUG_LOGS -Wno-pointer-sign -I. -I.. -I../mgba/include  -I../mgba/src -I../../psflib -DHAVE_ZLIB_H -s USE_ZLIB=1
OBJS = ../mgba/src/third-party/blip_buf/blip_buf.o ../mgba/src/arm/arm.o ../mgba/src/arm/decoder.o ../mgba/src/arm/decoder-arm.o ../mgba/src/arm/decoder-thumb.o ../mgba/src/arm/isa-arm.o ../mgba/src/arm/isa-thumb.o ../mgba/src/gb/audio.o ../mgba/src/gba/rr/vbm.o ../mgba/src/gba/rr/rr.o ../mgba/src/gba/rr/mgm.o ../mgba/src/gba/cheats/parv3.o ../mgba/src/gba/cheats/codebreaker.o ../mgba/src/gba/cheats/gameshark.o ../mgba/src/gba/audio.o ../mgba/src/gba/bios.o ../mgba/src/gba/cheats.o ../mgba/src/gba/core.o ../mgba/src/gba/dma.o ../mgba/src/gba/gba.o ../mgba/src/gba/hardware.o ../mgba/src/gba/hle-bios.o ../mgba/src/gba/input.o ../mgba/src/gba/io.o ../mgba/src/gba/memory.o ../mgba/src/gba/overrides.o ../mgba/src/gba/savedata.o ../mgba/src/gba/serialize.o ../mgba/src/gba/sharkport.o ../mgba/src/gba/sio.o ../mgba/src/gba/timer.o ../mgba/src/gba/vfame.o ../mgba/src/gba/video.o ../mgba/src/util/vfs/vfs-mem.o ../mgba/src/util/crc32.o ../mgba/src/util/circle-buffer.o ../mgba/src/util/configuration.o ../mgba/src/util/elf-read.o ../mgba/src/util/export.o ../mgba/src/util/formatting.o ../mgba/src/util/gui.o ../mgba/src/util/hash.o ../mgba/src/util/patch.o ../mgba/src/util/patch-fast.o ../mgba/src/util/patch-ips.o ../mgba/src/util/patch-ups.o ../mgba/src/util/ring-fifo.o ../mgba/src/util/string.o ../mgba/src/util/table.o ../mgba/src/util/text-codec.o ../mgba/src/util/vfs.o ../mgba/src/core/cache-set.o ../mgba/src/core/cheats.o ../mgba/src/core/config.o ../mgba/src/core/core.o ../mgba/src/core/directories.o ../mgba/src/core/input.o ../mgba/src/core/interface.o ../mgba/src/core/library.o ../mgba/src/core/lockstep.o ../mgba/src/core/log.o ../mgba/src/core/map-cache.o ../mgba/src/core/mem-search.o ../mgba/src/core/rewind.o ../mgba/src/core/scripting.o ../mgba/src/core/serialize.o ../mgba/src/core/sync.o ../mgba/src/core/tile-cache.o ../mgba/src/core/timing.o

all: libwebgsf.a

libwebgsf.a : $(OBJS)
	$(AR) rcs $@ $^

.c.o:
	$(CC) $(CFLAGS) $(OPTS) -o $@ $*.c

clean:
	rm -f $(OBJS) libwebgsf.a > /dev/null
