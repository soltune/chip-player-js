#include <emscripten.h>
#include <stdio.h>
#include <stdlib.h>
#include <iconv.h>

#include <iostream>
#include <fstream>
#include <string.h>

#define FMP_VOLUME_BOOST

#include "fmplayer/fmdriver/fmdriver_fmp.h"
#include "fmplayer/fmdriver/ppz8.h"
#include "fmplayer/libopna/opnatimer.h"
#include "fmplayer/libopna/opnaadpcm.h"
#include "fmplayer/libopna/opnadrum.h"
#include "fmplayer/libopna/opna.h"

#include "fmplayer/common/fmplayer_common.h"

#ifdef EMSCRIPTEN
#define EMSCRIPTEN_KEEPALIVE __attribute__((used))
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

#define CHANNELS 2
#define BYTES_PER_SAMPLE 2
#define SAMPLE_BUF_SIZE	1024
#define SAMPLE_FREQ	55467
#define FMP_MAX_LOOP 2

int16_t fmp_sample_buffer[SAMPLE_BUF_SIZE * CHANNELS];
int fmp_samples_available = 0;

#define TEXT_MAX	1024
#define FMP_COMMENT_COUNT   3
char* fmp_info_texts[FMP_COMMENT_COUNT];

int fmp_max_play_len= -1;
double fmp_play_len= 0;
char* fmp_pcm_filenames[2];
bool fmp_loop_detected = false;

char* fmp_internalRhythmPath = (char*)"/rhythm/ym2608_adpcm_rom.bin";

struct driver_fmp fmp;    // fmdriver_fmp.h
struct opna_timer opna_timer;   //opnatimer.h
struct fmdriver_work fmp_work;  //fmdriver.h
struct ppz8 ppz8;
uint8_t adpcmram[OPNA_ADPCM_RAM_SIZE];
struct opna opna;
uint8_t drum_rom[OPNA_ROM_SIZE];


static void *fileread(const char *path, size_t maxsize, size_t *filesize) {
  FILE *f = 0;
  void *buf = 0;
  size_t fsize;

  f = fopen(path, "rb");
  if (!f) {
    goto err;
  }
  if (fseek(f, 0, SEEK_END)) {
    goto err;
  }
  {
    long ssize = ftell(f);
    if (ssize < 0) {
      goto err;
    }
    if (maxsize && ((size_t)ssize > maxsize)) {
      goto err;
    }
    fsize = ssize;
  }
  if (fseek(f, 0, SEEK_SET)) {
    goto err;
  }
  buf = malloc(fsize);
  if (!buf) {
    goto err;
  }
  if (fread(buf, 1, fsize, f) != fsize) {
    goto err;
  }
  fclose(f);
  *filesize = fsize;
  return buf;
err:
  free(buf);
  if (f) fclose(f);
  return 0;
}

static int loadfile(void) {
  long size = 0;
  FILE *rhythm = fopen(fmp_internalRhythmPath, "r");
  if (!rhythm) goto loadfile_err;
  if (fseek(rhythm, 0, SEEK_END) != 0) goto err_file;
  size = ftell(rhythm) ;
  if (size != OPNA_ROM_SIZE) goto err_file;
  if (fseek(rhythm, 0, SEEK_SET) != 0) goto err_file;
  if (fread(drum_rom, 1, OPNA_ROM_SIZE, rhythm) != OPNA_ROM_SIZE) goto err_file;
  fclose(rhythm);
  return 0;

err_file:
  fclose(rhythm);

loadfile_err:
  return 1;
}

bool fmplayer_drum_rom_load(struct opna_drum *drum) {
  if (loadfile() == 1) {
    return false;
  }
  opna_drum_set_rom(drum, drum_rom);
  return true;
}

static struct driver_fmp *fmp_dup(const struct driver_fmp *fmp) {
  struct driver_fmp *fmpdup = (struct driver_fmp *) malloc(sizeof(struct driver_fmp));
  if (!fmpdup) return 0;
  memcpy(fmpdup, fmp, sizeof(*fmp));
  fmpdup->data = (const uint8_t *) malloc(fmp->datalen);
  if (!fmpdup->data) {
    free(fmpdup);
    return 0;
  }
  memcpy((void*)fmpdup->data, fmp->data, fmp->datalen);
  return fmpdup;
}

static int get_fmp_duration(struct fmdriver_work *work, struct driver_fmp *fmp, int loopcnt) {
    struct driver_fmp *fmpdup = fmp_dup(fmp);
    if (!fmpdup) {
        return 0;
    }
    struct opna dopna = {0};
    struct fmdriver_work dwork = {0};
    struct opna_timer dtimer = {0};

    fmplayer_init_work_opna(&dwork, &ppz8, &dopna, &dtimer, adpcmram);
    fmp_init(&dwork, fmpdup);

    unsigned int total_frames = 0;
    while (dwork.loop_cnt >= 0 && dwork.loop_cnt <= loopcnt && total_frames < SAMPLE_FREQ * 600) {
        unsigned generate_samples = 1024;
        if (dtimer.timerb_enable && dtimer.timerb_load) {
            unsigned timerb_samples = (1<<12) - dtimer.timerb_cnt;
            if (timerb_samples < generate_samples) {
                generate_samples = timerb_samples;
            }
        }
        if (dtimer.timera_enable && dtimer.timera_load) {
            unsigned timera_samples = (1<<10) - dtimer.timera;
            if (timera_samples < generate_samples) {
                generate_samples = timera_samples;
            }
        }
//        opna_mix_oscillo(timer->opna, buf, generate_samples, oscillo);
//        if (timer->mix_cb) {
//          timer->mix_cb(timer->mix_userptr, buf, generate_samples);
//        }
//        buf += generate_samples*2;
//        samples -= generate_samples;
        total_frames += generate_samples;
        if (dtimer.timera_load) {
            dtimer.timera = (dtimer.timera + generate_samples) & ((1<<10)-1);
            if (!dtimer.timera && dtimer.timera_enable) {
                if (!(dtimer.status & (1<<0))) {
                    dtimer.status |= (1<<0);
                    dtimer.interrupt_cb(dtimer.interrupt_userptr);  // fmp_opna_interrupt()
                }
            }
            dtimer.timera &= (1<<10)-1;
        }
        if (dtimer.timerb_load) {
            dtimer.timerb_cnt = (dtimer.timerb_cnt + generate_samples) & ((1<<12)-1);
            if (!dtimer.timerb_cnt && dtimer.timerb_enable) {
                if (!(dtimer.status & (1<<1))) {
                    dtimer.status |= (1<<1);
                    dtimer.interrupt_cb(dtimer.interrupt_userptr);
                }
            }
        }
    }
    free((void*)fmpdup->data);
    free((void*)fmpdup);

    fmp_loop_detected = dwork.loop_cnt != 255;

    return total_frames / (SAMPLE_FREQ / 1000);   // in msec
}

static char* to_utf8(iconv_t ic, char* in_sjis, char* out_utf8) {
    size_t	in_size = strlen(in_sjis);
    size_t	out_size = (size_t)TEXT_MAX;

    iconv( ic, &in_sjis, &in_size, &out_utf8, &out_size );
    *out_utf8 = '\0';

    return out_utf8;
}

static void do_song_init() {
    iconv_t ic = iconv_open("UTF-8", "SJIS");
    for (int i = 0; i < FMP_COMMENT_COUNT; i++) {
        fmp_info_texts[i] = (char*) malloc(TEXT_MAX);
        if (strlen((const char *)fmp.comment[i]) > 0) {
            to_utf8(ic, (char*)fmp.comment[i], fmp_info_texts[i]);
        } else {
            *fmp_info_texts[i] = '\0';
        }
    }
    iconv_close( ic );
}

static int fmp_compute_samples() {
    memset(fmp_sample_buffer, 0, sizeof(fmp_sample_buffer));
    opna_timer_mix(&opna_timer, fmp_sample_buffer, SAMPLE_BUF_SIZE );

#ifdef FMP_VOLUME_BOOST
    for (int i = 0; i < SAMPLE_BUF_SIZE * CHANNELS; i++) {
        int32_t o = fmp_sample_buffer[i] * 1.5;
        fmp_sample_buffer[i] = (o > INT16_MAX)? INT16_MAX : (o < INT16_MIN ? INT16_MIN : o);
    }
#endif

	fmp_samples_available = SAMPLE_BUF_SIZE;
	fmp_play_len += ((double)fmp_samples_available)/SAMPLE_FREQ * 1000;
	return 0;
}

extern "C" void fmp_teardown (void)  __attribute__((noinline));
extern "C" void EMSCRIPTEN_KEEPALIVE fmp_teardown (void) {
    free((void*) fmp.data);
    memset(fmp_sample_buffer, 0, sizeof(fmp_sample_buffer));
	for (int i = 0; i < FMP_COMMENT_COUNT; i++) {
	    free(&fmp_info_texts[i]);
	}
	fmp_play_len = 0;

    fmp_work = {0};
    fmplayer_init_work_opna(&fmp_work, &ppz8, &opna, &opna_timer, adpcmram);

    opna_ssg_set_mix(&opna.ssg, 0x10000);
    opna_ssg_set_ymf288(&opna.ssg, &opna.resampler, true);
    ppz8_set_interpolation(&ppz8, PPZ8_INTERP_SINC);
    opna_fm_set_hires_sin(&opna.fm, true);
    opna_fm_set_hires_env(&opna.fm, true);

    fmp = {0};
}

extern "C"  int fmp_load_file(char *filename, void * inBuffer, uint32_t inBufSize)  __attribute__((noinline));
extern "C"  int EMSCRIPTEN_KEEPALIVE fmp_load_file(char *filename, void * inBuffer, uint32_t inBufSize) {
	fmp_teardown();

	uint8_t *fmp_data = (uint8_t*) malloc(inBufSize * sizeof(uint8_t));
	if (fmp_data == NULL) {
	    return 1;
	}
    memcpy(fmp_data, inBuffer, inBufSize);
	if (!fmp_load(&fmp, fmp_data, (uint16_t) inBufSize)) {
        return 1;
    }

    fmp_max_play_len = get_fmp_duration(&fmp_work, &fmp, FMP_MAX_LOOP - 1);
    fmp_init(&fmp_work, &fmp);

    fmp_pcm_filenames[0] = fmp.pvi_name;
    fmp_pcm_filenames[1] = fmp.ppz_name;

    do_song_init();
    return 0;
}

extern "C" int fmp_get_sample_rate() __attribute__((noinline));
extern "C" EMSCRIPTEN_KEEPALIVE int fmp_get_sample_rate() {
	return SAMPLE_FREQ;
}

extern "C" const char** fmp_get_track_info() __attribute__((noinline));
extern "C" const char** EMSCRIPTEN_KEEPALIVE fmp_get_track_info() {
	return (const char**)fmp_info_texts;
}

extern "C" char* EMSCRIPTEN_KEEPALIVE fmp_get_audio_buffer(void) __attribute__((noinline));
extern "C" char* EMSCRIPTEN_KEEPALIVE fmp_get_audio_buffer(void) {
	return (char*)fmp_sample_buffer;
}

extern "C" long EMSCRIPTEN_KEEPALIVE fmp_get_audio_buffer_length(void) __attribute__((noinline));
extern "C" long EMSCRIPTEN_KEEPALIVE fmp_get_audio_buffer_length(void) {
	return fmp_samples_available;
}

extern "C" int fmp_compute_audio_samples() __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE fmp_compute_audio_samples() {
	return fmp_compute_samples();
}

extern "C" int fmp_get_current_position() __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE fmp_get_current_position() {
    return fmp_play_len;
}

extern "C" void fmp_seek_position(int pos) __attribute__((noinline));
extern "C" void EMSCRIPTEN_KEEPALIVE fmp_seek_position(int pos) {
    while (fmp_play_len < pos) {
        opna_timer_mix(&opna_timer, 0, SAMPLE_BUF_SIZE );
	    fmp_play_len += ((double)SAMPLE_BUF_SIZE)/SAMPLE_FREQ * 1000;
    }
}

extern "C" int fmp_get_max_position() __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE fmp_get_max_position() {
    return fmp_max_play_len;
}

extern "C" int fmp_has_loop() __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE fmp_has_loop() {
    return fmp_loop_detected;
}

extern "C" const char** fmp_get_pcm_filenames() __attribute__((noinline));
extern "C" const char** EMSCRIPTEN_KEEPALIVE fmp_get_pcm_filenames() {
	return (const char**)fmp_pcm_filenames;
}

extern "C" int fmp_load_pvi(const char* pvi_absolute_path) __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE fmp_load_pvi(const char* pvi_absolute_path) {
    size_t filesize;
    void *buf = fileread(pvi_absolute_path, 0, &filesize);
    if (!fmp_adpcm_load(&fmp_work, (uint8_t *) buf, filesize)) {
        free(buf);
        return 1;
    }
    free(buf);
    return 0;
}

extern "C" int fmp_load_ppz(const char* ppz_absolute_path) __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE fmp_load_ppz(const char* ppz_absolute_path) {
// fmplayer_file:: loadppzpvi
    size_t filesize;
    void *pvibuf = 0, *ppzbuf = 0;

    pvibuf = fileread(ppz_absolute_path, 0, &filesize);
    if (!pvibuf) goto err;
    ppzbuf = calloc(ppz8_pvi_decodebuf_samples(filesize), 2);
    if (!ppzbuf) goto err;
    if (!ppz8_pvi_load(fmp_work.ppz8, 0, (const uint8_t *)pvibuf, filesize, (int16_t *)ppzbuf)) goto err;
    free(pvibuf);
    return true;

err:
    free(ppzbuf);
    free(pvibuf);
    return false;
}

extern "C" void fmp_set_mask(uint32_t mask) __attribute__((noinline));
extern "C" void EMSCRIPTEN_KEEPALIVE fmp_set_mask(uint32_t mask) {
    opna_set_mask(&opna, mask & 0xffff);
    ppz8_set_mask(&ppz8, mask >> 16);
}
