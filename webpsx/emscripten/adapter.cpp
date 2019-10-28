/*
* This file adapts "HighlyExperimental" to the interface expected by my generic JavaScript player..
*
* Copyright (C) 2015 Juergen Wothke
*
* LICENSE
* 
* This library is free software; you can redistribute it and/or modify it
* under the terms of the GNU General Public License as published by
* the Free Software Foundation; either version 2.1 of the License, or (at
* your option) any later version. This library is distributed in the hope
* that it will be useful, but WITHOUT ANY WARRANTY; without even the implied
* warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
* GNU General Public License for more details.
* 
* You should have received a copy of the GNU General Public
* License along with this library; if not, write to the Free Software
* Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301 USA
*/

#include <emscripten.h>
#include <stdio.h>
#include <stdlib.h>     /* malloc, free, rand */

#include "psx.h"



#ifdef EMSCRIPTEN
#define EMSCRIPTEN_KEEPALIVE __attribute__((used))
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

#define BUF_SIZE	1024
#define TEXT_MAX	255
#define NUM_MAX	15

// see Sound::Sample::CHANNELS
#define CHANNELS 2				
#define BYTES_PER_SAMPLE 2
#define SAMPLE_BUF_SIZE	8192
static sint16 sample_buffer[SAMPLE_BUF_SIZE * CHANNELS];
static int samples_available= 0;

static const char* info_texts[7];

static char title_str[TEXT_MAX];
static char artist_str[TEXT_MAX];
static char game_str[TEXT_MAX];
static char year_str[TEXT_MAX];
static char genre_str[TEXT_MAX];
static char copyright_str[TEXT_MAX];
static char psfby_str[TEXT_MAX];


// use heplug.c impl
//extern "C" {  // commented out for building em++

	void setVolumeBoost(unsigned char b);

	struct DB_fileinfo_t;
	int he_init (struct DB_fileinfo_t *_info, const char * uri);
	struct DB_fileinfo_t *he_open (uint32_t hints); 
	int he_read (struct DB_fileinfo_t *_info, char *bytes, int size);
	int he_install_bios(const char *he_bios_path);
	
	int he_get_samples_to_play (DB_fileinfo_t *_info);
 	int he_get_samples_played (DB_fileinfo_t *_info);
	int he_seek_sample (DB_fileinfo_t *_info, int sample);
	int he_get_sample_rate (DB_fileinfo_t *_info);
	
	int psf_info_meta2(void * context, const char * name, const char * value) {
		if ( !strcasecmp( name, "title" ) ) {
			snprintf(title_str, TEXT_MAX, "%s", value);
		} else if ( !strcasecmp( name, "artist" ) ) {
			snprintf(artist_str, TEXT_MAX, "%s", value);
		} else if ( !strcasecmp( name, "game" ) ) {
			snprintf(game_str, TEXT_MAX, "%s", value);
		} else if ( !strcasecmp( name, "year" ) ) {
			snprintf(year_str, TEXT_MAX, "%s", value);
		} else if ( !strcasecmp( name, "genre" ) ) {
			snprintf(genre_str, TEXT_MAX, "%s", value);
		} else if ( !strcasecmp( name, "copyright" ) ) {
			snprintf(copyright_str, TEXT_MAX, "%s", value);
		} else if ( !strcasecmp( name, "psfby" ) ) {
			snprintf(psfby_str, TEXT_MAX, "%s", value);
		} 
		return 0;
	}

	int he_get_psf_version (DB_fileinfo_t *_info);
	void he_set_channel_mask (DB_fileinfo_t *_info, uint64 mask);
	void he_set_reverb(DB_fileinfo_t *_info, uint8 enable);
//}

struct StaticBlock {
    StaticBlock(){
		info_texts[0]= title_str;
		info_texts[1]= artist_str;
		info_texts[2]= game_str;
		info_texts[3]= year_str;
		info_texts[4]= genre_str;
		info_texts[5]= copyright_str;
		info_texts[6]= psfby_str;
    }
};

DB_fileinfo_t* song_info= 0;

void clearInfoTexts() {
		snprintf(title_str, TEXT_MAX, "");
		snprintf(artist_str, TEXT_MAX, "");
		snprintf(game_str, TEXT_MAX, "");
		snprintf(year_str, TEXT_MAX, "");
		snprintf(genre_str, TEXT_MAX, "");
		snprintf(copyright_str, TEXT_MAX, "");
		snprintf(psfby_str, TEXT_MAX, "");
}


static StaticBlock g_emscripen_info;

void *psx_state= 0;
char * song_buffer= 0;
uint8 * bios_buffer= 0;

extern "C" void psf_teardown (void)  __attribute__((noinline));
extern "C" void EMSCRIPTEN_KEEPALIVE psf_teardown (void) {
}

extern "C" int psf_setup(char *bios_path) __attribute__((noinline));
extern "C" EMSCRIPTEN_KEEPALIVE int psf_setup(char *bios_path)
{
	return he_install_bios(bios_path);	// the first installed BIOS stays; if "built-in hebios" is activated  bios_path is ignored
}

extern "C" int psf_init(char *basedir, char *songmodule) __attribute__((noinline));
extern "C" EMSCRIPTEN_KEEPALIVE int psf_init(char *basedir, char *songmodule)
{
	psf_teardown();

	clearInfoTexts();
	
	if (!song_info) song_info= he_open(0);
	
	return he_init(song_info, songmodule);
}

extern "C" int psf_get_sample_rate() __attribute__((noinline));
extern "C" EMSCRIPTEN_KEEPALIVE int psf_get_sample_rate()
{
	return he_get_sample_rate(song_info);
}

//extern "C" int psf_set_subsong(int subsong, unsigned char boost) __attribute__((noinline));
//extern "C" int EMSCRIPTEN_KEEPALIVE psf_set_subsong(int subsong, unsigned char boost) {
//
//// TODO: are there any subsongs
//
//	setVolumeBoost(boost);
//	return 0;
//}

extern "C" const char** psf_get_track_info() __attribute__((noinline));
extern "C" const char** EMSCRIPTEN_KEEPALIVE psf_get_track_info() {
	return info_texts;
}

extern "C" char* EMSCRIPTEN_KEEPALIVE psf_get_audio_buffer(void) __attribute__((noinline));
extern "C" char* EMSCRIPTEN_KEEPALIVE psf_get_audio_buffer(void) {
	return (char*)sample_buffer;
}

extern "C" long EMSCRIPTEN_KEEPALIVE psf_get_audio_buffer_length(void) __attribute__((noinline));
extern "C" long EMSCRIPTEN_KEEPALIVE psf_get_audio_buffer_length(void) {
	return samples_available;
}

extern "C" int psf_compute_audio_samples() __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE psf_compute_audio_samples() {
	uint32 size = SAMPLE_BUF_SIZE;

	int ret=  he_read (song_info, (char*)sample_buffer, size);	// returns number of bytes

	if (ret < 0) {
		samples_available= 0;
		return 1;		// end song
	} else {
		samples_available= ret >>2; // 2*2bytes sample
		if (size) {
			return 0;
		} else {
			return 1;	// end song
		}		
	}
}

extern "C" int psf_get_current_position() __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE psf_get_current_position() {
	return he_get_samples_played(song_info);
}

extern "C" void psf_seek_position(int pos) __attribute__((noinline));
extern "C" void EMSCRIPTEN_KEEPALIVE psf_seek_position(int pos) {
	he_seek_sample(song_info, pos);
}

extern "C" int psf_get_max_position() __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE psf_get_max_position() {
	return he_get_samples_to_play(song_info);
}

extern "C" int psf_get_psf_version() __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE psf_get_psf_version() {
	return he_get_psf_version(song_info);
}

extern "C" void psf_set_mask(uint64 mask) __attribute__((noinline));
extern "C" void EMSCRIPTEN_KEEPALIVE psf_set_mask(uint64 mask) {
	he_set_channel_mask(song_info, mask);
}

extern "C" void psf_set_reverb(uint8 enable) __attribute__((noinline));
extern "C" void EMSCRIPTEN_KEEPALIVE psf_set_reverb(uint8 enable) {
	he_set_reverb(song_info, enable);
}