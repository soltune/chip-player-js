/*
* This file adapts "mGBA/GSF decoder" to the interface expected by my generic JavaScript player..
*
* Copyright (C) 2018 Juergen Wothke
*
* LICENSE
* 
* It is distributed under the Mozilla Public License version 2.0. A copy of the license is 
* available in the distributed LICENSE file.
*/

#include <emscripten.h>
#include <stdio.h>
#include <stdlib.h>     /* malloc, free, rand */

#include <exception>
#include <iostream>
#include <fstream>



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
#define SAMPLE_BUF_SIZE	1024

#define t_int16   signed short
t_int16 sample_buffer[SAMPLE_BUF_SIZE * CHANNELS];
int samples_available= 0;

const char* info_texts[7];

char title_str[TEXT_MAX];
char artist_str[TEXT_MAX];
char game_str[TEXT_MAX];
char year_str[TEXT_MAX];
char genre_str[TEXT_MAX];
char copyright_str[TEXT_MAX];
char psfby_str[TEXT_MAX];

int32_t gsf_sample_rate = 44100;

// interface to gsfplug.cpp
extern	void gsf_setup (int32_t sample_rate);
extern	void gsf_boost_volume(unsigned char b);
extern	int32_t gsf_end_song_position ();
extern	int32_t gsf_current_play_position ();
//extern	int32_t gsf_get_sample_rate ();
extern	int gsf_load_file(const char *uri);
extern	int gsf_read(int16_t *output_buffer, uint16_t outSize);
extern	int gsf_seek_position (int ms);
extern	void gsf_shutdown (void);
extern  void gsf_set_channel_mask (int mask);

void gsf_meta_set(const char * tag, const char * value) {
	// propagate selected meta info for use in GUI
	if (!strcasecmp(tag, "title")) {
		snprintf(title_str, TEXT_MAX, "%s", value);
		
	} else if (!strcasecmp(tag, "artist")) {
		snprintf(artist_str, TEXT_MAX, "%s", value);
		
	} else if (!strcasecmp(tag, "album")) {
		snprintf(game_str, TEXT_MAX, "%s", value);
		
	} else if (!strcasecmp(tag, "date")) {
		snprintf(year_str, TEXT_MAX, "%s", value);
		
	} else if (!strcasecmp(tag, "genre")) {
		snprintf(genre_str, TEXT_MAX, "%s", value);
		
	} else if (!strcasecmp(tag, "copyright")) {
		snprintf(copyright_str, TEXT_MAX, "%s", value);
		
	} else if (!strcasecmp(tag, "usfby")) {
		snprintf(psfby_str, TEXT_MAX, "%s", value);		
	} 
}

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
	
static void meta_clear() {
	snprintf(title_str, TEXT_MAX, "");
	snprintf(artist_str, TEXT_MAX, "");
	snprintf(game_str, TEXT_MAX, "");
	snprintf(year_str, TEXT_MAX, "");
	snprintf(genre_str, TEXT_MAX, "");
	snprintf(copyright_str, TEXT_MAX, "");
	snprintf(psfby_str, TEXT_MAX, "");
}


static StaticBlock g_emscripen_info;

extern "C" void gba_teardown (void)  __attribute__((noinline));
extern "C" void EMSCRIPTEN_KEEPALIVE gba_teardown (void) {
    gsf_shutdown();
    memset(sample_buffer, 0, sizeof(sample_buffer));
}

extern "C" int gba_setup(char *unused) __attribute__((noinline));
extern "C" EMSCRIPTEN_KEEPALIVE int gba_setup(char *unused)
{
	gsf_setup(gsf_sample_rate);	// basic init
	
	return 0;
}

extern "C" int gba_init(char *basedir, char *songmodule) __attribute__((noinline));
extern "C" EMSCRIPTEN_KEEPALIVE int gba_init(char *basedir, char *songmodule)
{
	gba_teardown();
	gsf_setup(gsf_sample_rate);	// basic init

	meta_clear();
	
	std::string file= std::string(basedir)+"/"+std::string(songmodule);
	
	
	if (gsf_load_file(file.c_str()) == 0) {
	} else {
		return -1;
	}
	gsf_seek_position(20); // workaround; skip noise in the beginning of music
	return 0;
}

extern "C" int gba_get_sample_rate() __attribute__((noinline));
extern "C" EMSCRIPTEN_KEEPALIVE int gba_get_sample_rate()
{
	return gsf_sample_rate;
}

extern "C" int gba_set_subsong(int subsong, unsigned char boost) __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE gba_set_subsong(int subsong, unsigned char boost) {
// TODO: are there any subsongs
	gsf_boost_volume(boost);
	return 0;
}

extern "C" const char** gba_get_track_info() __attribute__((noinline));
extern "C" const char** EMSCRIPTEN_KEEPALIVE gba_get_track_info() {
	return info_texts;
}

extern "C" char* EMSCRIPTEN_KEEPALIVE gba_get_audio_buffer(void) __attribute__((noinline));
extern "C" char* EMSCRIPTEN_KEEPALIVE gba_get_audio_buffer(void) {
	return (char*)sample_buffer;
}

extern "C" long EMSCRIPTEN_KEEPALIVE gba_get_audio_buffer_length(void) __attribute__((noinline));
extern "C" long EMSCRIPTEN_KEEPALIVE gba_get_audio_buffer_length(void) {
	return samples_available;
}

extern "C" int gba_compute_audio_samples() __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE gba_compute_audio_samples() {

	int ret=  gsf_read((short*)sample_buffer, SAMPLE_BUF_SIZE);

	if (ret < 0) {
		samples_available= 0;
		return 1;
	} else {
		samples_available= ret; // available time (measured in samples)
		if (ret) {
			return 0;
		} else {
			return 1;
		}		
	}
}

extern "C" int gba_get_current_position() __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE gba_get_current_position() {
	return gsf_current_play_position();
}

extern "C" void gba_seek_position(int pos) __attribute__((noinline));
extern "C" void EMSCRIPTEN_KEEPALIVE gba_seek_position(int ms) {
	gsf_seek_position(ms);
}

extern "C" int gba_get_max_position() __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE gba_get_max_position() {
	return gsf_end_song_position();
}

extern "C" void gba_set_mask(int mask) __attribute__((noinline));
extern "C" void EMSCRIPTEN_KEEPALIVE gba_set_mask(int mask) {
	gsf_set_channel_mask(mask);
}

