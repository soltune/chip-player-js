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


// hack to pass all those japaneese info texts safely to the JavaScript side:
static const std::string chars = 
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
std::string mdx_base64_encode(unsigned char* input, unsigned int len) {
  int i, j = 0;
  unsigned char arr3[3];
  unsigned char arr4[4];
  std::string ret;
  
  while (len--) {
    arr3[i++] = *(input++);
    if (i == 3) {
      arr4[0] = (arr3[0] & 0xfc) >> 2;
      arr4[1] = ((arr3[0] & 0x03) << 4) + ((arr3[1] & 0xf0) >> 4);
      arr4[2] = ((arr3[1] & 0x0f) << 2) + ((arr3[2] & 0xc0) >> 6);
      arr4[3] = arr3[2] & 0x3f;

      for(i = 0; (i <4) ; i++) {
        ret += chars[arr4[i]];
		}
      i = 0;
    }
  }
  if (i) {
    for(j = i; j < 3; j++) {
      arr3[j] = '\0';
	}
    arr4[0] = ( arr3[0] & 0xfc) >> 2;
    arr4[1] = ((arr3[0] & 0x03) << 4) + ((arr3[1] & 0xf0) >> 4);
    arr4[2] = ((arr3[1] & 0x0f) << 2) + ((arr3[2] & 0xc0) >> 6);

    for (j = 0; (j < i + 1); j++) {
      ret += chars[arr4[j]];
	}
    while((i++ < 3)) {
      ret += '=';
	}
  }
  return ret;
}

#define CHANNELS 2				
#define BYTES_PER_SAMPLE 2
#define SAMPLE_BUF_SIZE	1024
#define SAMPLE_FREQ	44100

int16_t mdx_sample_buffer[SAMPLE_BUF_SIZE * CHANNELS];
int mdx_samples_available= 0;

char* mdx_info_texts[2];

#define TEXT_MAX	1024
char mdx_title_str[TEXT_MAX];
char mdx_artist_str[TEXT_MAX];

#define RAW_INFO_MAX	1024
char mdx_raw_info_buffer[RAW_INFO_MAX];

struct StaticBlock {
    StaticBlock(){
		mdx_info_texts[0]= mdx_title_str;
		mdx_info_texts[1]= mdx_artist_str;
    }
};

static StaticBlock static_constructor;

int mdx_mode= 0;	// switch the two emulators..
t_mdxmini mdxmini;

int max_play_len= -1;
double play_len= 0;
int initialized= 0;
int mdx_loop_count = 2;

char* internalRhythmPath = "/rhythm";

static void do_init() {
	if (mdx_mode) {	
		memset(&mdxmini, 0, sizeof(t_mdxmini));
		mdx_set_rate(SAMPLE_FREQ);	
	} else {
		pmd_init();
		pmd_set_rhythm_path(internalRhythmPath);
		pmd_setrate( SAMPLE_FREQ );
	}
	initialized= 1;
}

static void do_song_init() {
	if (mdx_mode) {
		mdx_set_max_loop(&mdxmini, (mdx_loop_count - 1));
		mdx_get_title(&mdxmini, mdx_raw_info_buffer);

		max_play_len = mdx_get_length(&mdxmini) * 1000;

	} else {
		pmd_get_compo(mdx_raw_info_buffer);
		std::string encArtist= mdx_base64_encode((unsigned char*)mdx_raw_info_buffer, strlen(mdx_raw_info_buffer));
		snprintf(mdx_artist_str, TEXT_MAX, "%s", encArtist.c_str());

		pmd_get_title( mdx_raw_info_buffer );
		max_play_len = pmd_length_msec() + pmd_loop_msec() * (mdx_loop_count - 1);

	}
	std::string encTitle= mdx_base64_encode((unsigned char*)mdx_raw_info_buffer, strlen(mdx_raw_info_buffer));
	snprintf(mdx_title_str, TEXT_MAX, "%s", encTitle.c_str());

}

static int do_get_current_position() {
    if (mdx_mode) {
        return play_len;
    } else {
        return pmd_get_pos();
    }
}

static int do_get_max_position() {
    return max_play_len;
}

static int mdx_compute_samples() {
	if (do_get_current_position() >= do_get_max_position()) return 1;

	if (mdx_mode) {
		mdx_calc_sample(&mdxmini, mdx_sample_buffer, SAMPLE_BUF_SIZE);
	} else {
		pmd_renderer ( mdx_sample_buffer, SAMPLE_BUF_SIZE );
	}
	mdx_samples_available= SAMPLE_BUF_SIZE;
	play_len += ((double)mdx_samples_available)/SAMPLE_FREQ * 1000;
	return 0;
}

static void do_teardown() {
	if (initialized) {
		if (mdx_mode) {	
			mdx_close(&mdxmini);
		} else {
			pmd_stop();
		}
		initialized= 0;
	}
}

static int do_open(const char *filename) {
	if (mdx_mode) {
		return mdx_open(&mdxmini, (char*)filename, (char*) NULL);
	} else {
		return pmd_play (filename, (char*) NULL );
	}
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

extern "C" void mdx_teardown (void)  __attribute__((noinline));
extern "C" void EMSCRIPTEN_KEEPALIVE mdx_teardown (void) {
	mdx_title_str[0]= mdx_artist_str[0]= 0;
		
	do_teardown();
}

static int ends_with(std::string const & value, std::string const & ending) {
    if (ending.size() > value.size()) return 0;
    return std::equal(ending.rbegin(), ending.rend(), value.rbegin());
}

extern "C"  int mdx_load_file(char *filename, void * inBuffer, uint32_t inBufSize)  __attribute__((noinline));
extern "C"  int EMSCRIPTEN_KEEPALIVE mdx_load_file(char *filename, void * inBuffer, uint32_t inBufSize) {
	mdx_teardown();
	do_init();

	mdx_mode= ends_with(std::string(filename), std::string(".mdx"));
	
	if (!file_open(filename)) {
		// error
		return 1;
	} else {
		// success
		do_song_init();
		return 0;					
	}
}

extern "C" int mdx_get_sample_rate() __attribute__((noinline));
extern "C" EMSCRIPTEN_KEEPALIVE int mdx_get_sample_rate() {
	return SAMPLE_FREQ;
}

extern "C" int mdx_set_subsong(int subsong, unsigned char boost) __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE mdx_set_subsong(int track, unsigned char boost) {
	return 0;	// there are no subsongs...
}

extern "C" const char** mdx_get_track_info() __attribute__((noinline));
extern "C" const char** EMSCRIPTEN_KEEPALIVE mdx_get_track_info() {
	return (const char**)mdx_info_texts;
}

extern "C" char* EMSCRIPTEN_KEEPALIVE mdx_get_audio_buffer(void) __attribute__((noinline));
extern "C" char* EMSCRIPTEN_KEEPALIVE mdx_get_audio_buffer(void) {
	return (char*)mdx_sample_buffer;
}

extern "C" long EMSCRIPTEN_KEEPALIVE mdx_get_audio_buffer_length(void) __attribute__((noinline));
extern "C" long EMSCRIPTEN_KEEPALIVE mdx_get_audio_buffer_length(void) {
	return mdx_samples_available;
}

extern "C" int mdx_compute_audio_samples() __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE mdx_compute_audio_samples() {
	return mdx_compute_samples();
}

extern "C" int mdx_get_current_position() __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE mdx_get_current_position() {
    return do_get_current_position();
}

extern "C" void mdx_seek_position(int pos) __attribute__((noinline));
extern "C" void EMSCRIPTEN_KEEPALIVE mdx_seek_position(int pos) {
    if (mdx_mode) {
        while (do_get_current_position() < pos) {
            mdx_compute_samples();
        }
    } else {
        pmd_set_pos(pos);
    }
}

extern "C" int mdx_get_max_position() __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE mdx_get_max_position() {
    return do_get_max_position();
}

extern "C" int mdx_get_mdx_mode() __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE mdx_get_mdx_mode() {
    return mdx_mode;
}



