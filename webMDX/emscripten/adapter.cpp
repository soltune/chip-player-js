/*
* This file adapts "mdxmini/pmdmini" and exports the relevant API to JavaScript, e.g. for
* use in my generic JavaScript player.
*
* Copyright (C) 2018 Juergen Wothke
*
*
* Credits:
*   
*  milk.K, K.MAEKAWA, Missy.M - authors of the original X68000 MXDRV
*  Daisuke Nagano - author of the Unix mdxplay
*  KAJIHARA Mashahiro - original author of the PMD sound driver for PC-9801
*  AGAWA Koji - Maintainer of PMDXMMS, on which pmdmini was based
*  M88 / cisc - author of OPNA FM sound generator 
*  BouKiCHi - author of the mdxmini&pmdmini library
*  Misty De Meo - bugfixes and improvements to mdxmini&pmdmini
*  
*  The project is based on: https://github.com/mistydemeo/mdxmini & https://github.com/mistydemeo/pmdmini
*
*
* License:
*
*  The code builds on FM Sound Generator with OPN/OPM interface Copyright (C) by cisc.
*  As the author of FM Sound Generator states (see readme.txt in "fmgen" sub-folder), this is free software but 
*  for any commercial application the prior consent of the author is explicitly required. So it probably 
*  cannot be GPL.. and the GPL claims made in the pdmmini project are probably just invalid. 
*  
*  Be that as it may.. I'll extend whatever license is actually valid for the underlying code to the 
*  code that I added here to turn "mdxmini/pmdmini" into a JavaScript lib.
*/

#include <emscripten.h>
#include <stdio.h>
#include <stdlib.h>
#include <iconv.h>

#include <iostream>
#include <fstream>

//extern "C" {
#include "mdxmini.h"
#include "../pmdmini/src/pmdmini.h"
//}


#ifdef EMSCRIPTEN
#define EMSCRIPTEN_KEEPALIVE __attribute__((used))
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

#define CHANNELS 2				
#define BYTES_PER_SAMPLE 2
#define SAMPLE_BUF_SIZE	1024
#define PMD_SAMPLE_FREQ 55466   // 7987200Hz / 144 cycles
//#define MDX_SAMPLE_FREQ 62500   // 4000000Hz /  64 cycles

int16_t pmd_sample_buffer[SAMPLE_BUF_SIZE * CHANNELS];
int pmd_samples_available= 0;

char* pmd_info_texts[2];

#define TEXT_MAX	1024
char pmd_title_str[TEXT_MAX];
char pmd_artist_str[TEXT_MAX];

#define RAW_INFO_MAX	1024
char pmd_raw_info_buffer[RAW_INFO_MAX];

int max_play_len= -1;
double play_len= 0;
int initialized= 0;
int pmd_loop_count = 2;
int pmd_loop_length = 0;
char pmd_pcm_filename[256];

char* internalRhythmPath = "/rhythm";


static char* to_utf8(iconv_t ic, char* in_sjis, char* out_utf8) {
    size_t	in_size = strlen(in_sjis);
    size_t	out_size = (size_t)TEXT_MAX;

    iconv( ic, &in_sjis, &in_size, &out_utf8, &out_size );
    *out_utf8 = '\0';

    return out_utf8;
}

static void do_set_rhythm_with_ssg(int value) {
    pmd_set_rhythm_with_ssg(value);
}

static void do_init() {
    pmd_init();
    pmd_set_rhythm_path(internalRhythmPath);
    pmd_setrate( PMD_SAMPLE_FREQ );

	initialized= 1;
}

static void do_song_init() {
    iconv_t ic = iconv_open("UTF-8", "SJIS");  // sjis -> utf8

    pmd_get_compo(pmd_raw_info_buffer);
    to_utf8(ic, pmd_raw_info_buffer, pmd_artist_str);

    pmd_get_title( pmd_raw_info_buffer );
    to_utf8(ic, pmd_raw_info_buffer, pmd_title_str);

    do_set_rhythm_with_ssg(1);  // default : true

    pmd_loop_length = pmd_loop_msec();
    max_play_len = pmd_length_msec() + pmd_loop_length * (pmd_loop_count - 1);

    iconv_close( ic );

    pmd_info_texts[0] = pmd_title_str;
    pmd_info_texts[1] = pmd_artist_str;
}

static int do_get_current_position() {
    return pmd_get_pos();
}

static int do_get_max_position() {
    return max_play_len;
}

static int pmd_compute_samples() {

	pmd_samples_available= SAMPLE_BUF_SIZE;
    pmd_renderer ( pmd_sample_buffer, SAMPLE_BUF_SIZE );
    play_len += ((double)pmd_samples_available)/PMD_SAMPLE_FREQ * 1000;


	return (do_get_current_position() >= do_get_max_position())? 1 : 0;
}

static void do_teardown() {
	if (initialized) {
		pmd_stop();
		initialized= 0;
	}
}

static int do_open(const char *filename) {
	return pmd_play (filename, (char*) NULL );
}

static int file_open(const char *filename) {
	max_play_len= -1;
	play_len= 0;
	
	if (do_open(filename)) {
		printf("File open error: %s\n", filename);
		return 0;
	}
	return 1;
}

extern "C" void pmd_teardown (void)  __attribute__((noinline));
extern "C" void EMSCRIPTEN_KEEPALIVE pmd_teardown (void) {
	pmd_title_str[0]= pmd_artist_str[0]= 0;
		
	do_teardown();
}

static int ends_with(std::string const & value, std::string const & ending) {
    if (ending.size() > value.size()) return 0;
    return std::equal(ending.rbegin(), ending.rend(), value.rbegin());
}

extern "C"  int pmd_load_file(char *filename, void * inBuffer, uint32_t inBufSize)  __attribute__((noinline));
extern "C"  int EMSCRIPTEN_KEEPALIVE pmd_load_file(char *filename, void * inBuffer, uint32_t inBufSize) {
	pmd_teardown();

	do_init();

	if (!file_open(filename)) {
		// error
		return 1;
	} else {
		// success
        // stores PCM filenames because minipmd forget them if pcm loading fail
        unsigned char* copiedBuff = (unsigned char*) malloc(inBufSize);
        memcpy(copiedBuff, inBuffer, inBufSize);

        pmd_get_memo(pmd_pcm_filename, copiedBuff, inBufSize, 0); // p86 or ppc
        if (*pmd_pcm_filename == 0) {
            pmd_get_memo(pmd_pcm_filename, copiedBuff, inBufSize, -1); // pps
        }
        if (*pmd_pcm_filename == 0) {
            pmd_get_memo(pmd_pcm_filename, copiedBuff, inBufSize, -2); // ppz
        }

        free(copiedBuff);
		do_song_init();
		return 0;					
	}
}

extern "C" int pmd_get_sample_rate() __attribute__((noinline));
extern "C" EMSCRIPTEN_KEEPALIVE int pmd_get_sample_rate() {
    return PMD_SAMPLE_FREQ;
}

extern "C" int pmd_set_subsong(int subsong, unsigned char boost) __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE pmd_set_subsong(int track, unsigned char boost) {
	return 0;	// there are no subsongs...
}

extern "C" const char** pmd_get_track_info() __attribute__((noinline));
extern "C" const char** EMSCRIPTEN_KEEPALIVE pmd_get_track_info() {
	return (const char**)pmd_info_texts;
}

extern "C" char* EMSCRIPTEN_KEEPALIVE pmd_get_audio_buffer(void) __attribute__((noinline));
extern "C" char* EMSCRIPTEN_KEEPALIVE pmd_get_audio_buffer(void) {
	return (char*)pmd_sample_buffer;
}

extern "C" long EMSCRIPTEN_KEEPALIVE pmd_get_audio_buffer_length(void) __attribute__((noinline));
extern "C" long EMSCRIPTEN_KEEPALIVE pmd_get_audio_buffer_length(void) {
	return pmd_samples_available;
}

extern "C" int pmd_compute_audio_samples() __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE pmd_compute_audio_samples() {
	return pmd_compute_samples();
}

extern "C" int pmd_get_current_position() __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE pmd_get_current_position() {
    return do_get_current_position();
}

extern "C" void pmd_seek_position(int pos) __attribute__((noinline));
extern "C" void EMSCRIPTEN_KEEPALIVE pmd_seek_position(int pos) {
    pmd_set_pos(pos);
}

extern "C" int pmd_get_max_position() __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE pmd_get_max_position() {
    return do_get_max_position();
}

extern "C" int pmd_has_loop() __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE pmd_has_loop() {
    return pmd_loop_length > 0;
}

extern "C" void pmd_set_rws(int value) __attribute__((noinline));
extern "C" void EMSCRIPTEN_KEEPALIVE pmd_set_rws(int value) {
    do_set_rhythm_with_ssg(value);
}

extern "C" char* pmd_get_pcm_filename() __attribute__((noinline));
extern "C" char* EMSCRIPTEN_KEEPALIVE pmd_get_pcm_filename() {
    return (char*) pmd_pcm_filename;
}

extern "C" int pmd_reload_pcm(char* pcmFilename) __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE pmd_reload_pcm(char* pcmFilename) {
    return pmd_load_pcm_and_restart(pcmFilename);
}

extern "C" int pmd_get_voices() __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE pmd_get_voices() {
    return pmd_get_tracks();
}

extern "C" void pmd_set_voices(unsigned int voices) __attribute__((noinline));
extern "C" void EMSCRIPTEN_KEEPALIVE pmd_set_voices(unsigned int voices) {
    int voice_disabled = 1;

    for (int i = 0; i < 24; i++) {
        int maskon = (voices & (voice_disabled << i));
        pmd_set_mask(i, maskon);
    }
}