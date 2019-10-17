#include <emscripten.h>
#include <stdio.h>
#include <stdlib.h>
#include <iconv.h>

#include <iostream>
#include <fstream>

extern "C" {
#include "fmplayer/fmdriver/fmdriver_fmp.h"
#include "fmplayer/libopna/opnatimer.h"
#include "fmplayer/libopna/opnaadpcm.h"
#include "fmplayer/libopna/opnadrum.h"
#include "fmplayer/libopna/opna.h"
#include "fmplayer/common/fmplayer_common.h"
}


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
int fmp_samples_available= 0;

char* fmp_info_texts[2];

#define TEXT_MAX	1024
char fmp_title_str[TEXT_MAX];
char fmp_artist_str[TEXT_MAX];

#define RAW_INFO_MAX	1024
char fmp_raw_info_buffer[RAW_INFO_MAX];

int fmp_max_play_len= -1;
double fmp_play_len= 0;
char fmp_pcm_filename[256];
bool fmp_loop_detected = false;

char* fmp_internalRhythmPath = (char*)"/rhythm/ym2608_adpcm_rom.bin";

struct driver_fmp fmp;    // fmdriver_fmp.h 演奏中のFMP各種情報
struct opna_timer opna_timer;   //opnatimer.h
struct fmdriver_work fmp_work;  //fmdriver.h
struct ppz8 ppz8;
uint8_t adpcmram[OPNA_ADPCM_RAM_SIZE];
struct opna opna;
uint8_t drum_rom[OPNA_ROM_SIZE];

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

extern "C" bool fmplayer_drum_rom_load(struct opna_drum *drum) {
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


static void do_init() {
    // ナンか初期化するものがあれば初期化
    // メモリの解放などは、それ以前のteardown()でやってる
//	if (mdx_mode) {
//		memset(&mdxmini, 0, sizeof(t_mdxmini));
//		mdx_set_rate(SAMPLE_FREQ);
//	} else {
//		pmd_init();
//		pmd_set_rhythm_path(internalRhythmPath);
//		pmd_setrate( SAMPLE_FREQ );
//	}
//	initialized= 1;
}

static void do_song_init() {
    // TODO: 初期化、タグ読み込みなど

//    mdx_info_texts[0] = mdx_title_str;
//    mdx_info_texts[1] = mdx_artist_str;
}

static int fmp_compute_samples() {
    memset(fmp_sample_buffer, 0, sizeof(fmp_sample_buffer));
    opna_timer_mix(&opna_timer, fmp_sample_buffer, SAMPLE_BUF_SIZE );

	fmp_samples_available = SAMPLE_BUF_SIZE;
	fmp_play_len += ((double)fmp_samples_available)/SAMPLE_FREQ * 1000;
	return 0;
}

extern "C" void fmp_teardown (void)  __attribute__((noinline));
extern "C" void EMSCRIPTEN_KEEPALIVE fmp_teardown (void) {
    free((void*) fmp.data);

	fmp_title_str[0]= fmp_artist_str[0]= 0;
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
	do_init();

	uint8_t *fmp_data = (uint8_t*) malloc(inBufSize * sizeof(uint8_t));
	if (fmp_data == NULL) {
	    return 1;
	}
    memcpy(fmp_data, inBuffer, inBufSize);
	if (!fmp_load(&fmp, fmp_data, (uint16_t) inBufSize)) {
        return 1;
    }

    fmp_max_play_len = get_fmp_duration(&fmp_work, &fmp, FMP_MAX_LOOP);
    fmp_init(&fmp_work, &fmp);  //  fmp_init(work, &fmfile->driver.fmp);

    // ここまでおわったら(fmp_init()のあと)、一旦js側に制御を戻して以下メソッドを呼ばせる
    //     loadpvi(work, fmfile);   // loadpvi()の実装は、fmplayer_file.cをさんこうに
    //       loadfmpppz(work, fmfile);

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

}

extern "C" int fmp_get_max_position() __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE fmp_get_max_position() {
    return fmp_max_play_len;
}

extern "C" int fmp_has_loop() __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE fmp_has_loop() {
    return fmp_loop_detected;
}
