/*
* This file adapts "2SF decoder" to the interface expected by my generic JavaScript player..
*
* (copy/paste reuse of respective GSF impl)
*
* Copyright (C) 2019 Juergen Wothke
*
* LICENSE: GPL
*/

#include <emscripten.h>
#include <stdio.h>
#include <stdlib.h>     /* malloc, free, rand */

#include <exception>
#include <iostream>
#include <fstream>

#define BUF_SIZE	1024
#define TEXT_MAX	255
#define NUM_MAX	15

// see Sound::Sample::CHANNELS
#define CHANNELS 2				
#define BYTES_PER_SAMPLE 2
#define SAMPLE_BUF_SIZE	1024

static signed short sample_buffer[SAMPLE_BUF_SIZE * CHANNELS];
static int samples_available= 0;

static const char* info_texts[7];

static char title_str[TEXT_MAX];
static char artist_str[TEXT_MAX];
static char game_str[TEXT_MAX];
static char year_str[TEXT_MAX];
static char genre_str[TEXT_MAX];
static char copyright_str[TEXT_MAX];
static char psfby_str[TEXT_MAX];


// interface to twosfplug.cpp
extern	void ds_setup (void);
extern	void ds_boost_volume(unsigned char b);
extern	int32_t ds_end_song_position ();
extern	int32_t ds_current_play_position ();
extern	int32_t ds_get_sample_rate ();
extern	int ds_load_file(const char *uri);
extern	int ds_read(int16_t *output_buffer, uint16_t outSize);
extern	int ds_seek_position (int ms);
extern  void ds_destory(void);
extern  void ds_set_channel_mute(uint32_t mask);

void ds_meta_set(const char * tag, const char * value) {
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

static void clean_output_buffer() {
	for (int i= 0; i<(SAMPLE_BUF_SIZE * CHANNELS); i++) {
		sample_buffer[i]= 0;
	}	
}

extern "C" void nds_teardown (void)  __attribute__((noinline));
extern "C" void EMSCRIPTEN_KEEPALIVE nds_teardown (void) {
    ds_destory();

	clean_output_buffer();
}

extern "C" int nds_setup(char *unused) __attribute__((noinline));
extern "C" EMSCRIPTEN_KEEPALIVE int nds_setup(char *unused)
{
	ds_setup();	// basic init
	
	return 0;
}

extern "C" int nds_init(char *basedir, char *songmodule) __attribute__((noinline));
extern "C" EMSCRIPTEN_KEEPALIVE int nds_init(char *basedir, char *songmodule)
{
	nds_teardown();

	ds_setup();	// basic init

	meta_clear();

	std::string file= std::string(basedir)+"/"+std::string(songmodule);
	

	if (ds_load_file(file.c_str()) == 0) {
	} else {
		return -1;
	}
	return 0;
}

extern "C" int nds_get_sample_rate() __attribute__((noinline));
extern "C" EMSCRIPTEN_KEEPALIVE int nds_get_sample_rate()
{
	return ds_get_sample_rate();
}

//extern "C" int nds_set_subsong(int subsong, unsigned char boost) __attribute__((noinline));
//extern "C" int EMSCRIPTEN_KEEPALIVE nds_set_subsong(int subsong, unsigned char boost) {
//// TODO: are there any subsongs
//	ds_boost_volume(boost);
//	return 0;
//}

extern "C" const char** nds_get_track_info() __attribute__((noinline));
extern "C" const char** EMSCRIPTEN_KEEPALIVE nds_get_track_info() {
	return info_texts;
}

extern "C" char* EMSCRIPTEN_KEEPALIVE nds_get_audio_buffer(void) __attribute__((noinline));
extern "C" char* EMSCRIPTEN_KEEPALIVE nds_get_audio_buffer(void) {
	return (char*)sample_buffer;
}

extern "C" long EMSCRIPTEN_KEEPALIVE nds_get_audio_buffer_length(void) __attribute__((noinline));
extern "C" long EMSCRIPTEN_KEEPALIVE nds_get_audio_buffer_length(void) {
	return samples_available;
}

extern "C" int nds_compute_audio_samples() __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE nds_compute_audio_samples() {
	int ret=  ds_read((short*)sample_buffer, SAMPLE_BUF_SIZE);

	samples_available= ret; // available time (measured in samples)
	if (ret) {
		return 0;
	} else {
		return 1;	// report "song ended"
	}		
}

extern "C" int nds_get_current_position() __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE nds_get_current_position() {
	return ds_current_play_position();
}

extern "C" void nds_seek_position(int pos) __attribute__((noinline));
extern "C" void EMSCRIPTEN_KEEPALIVE nds_seek_position(int ms) {
	ds_seek_position(ms);
}

extern "C" int nds_get_max_position() __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE nds_get_max_position() {
	return ds_end_song_position();
}

extern "C" void nds_set_mask(int32_t mask) __attribute__((noinline));
extern "C" void EMSCRIPTEN_KEEPALIVE nds_set_mask(int32_t mask) {
	ds_set_channel_mute(mask);
}
