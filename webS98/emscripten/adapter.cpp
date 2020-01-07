/*
* This file adapts  "m_s98.kpi v1.0r8 by Mamiya"  to the interface expected by my generic JavaScript player.
*
* Copyright (C) 2018 Juergen Wothke
*
*
* Credits:   
* 
* The project is based on: http://www.vesta.dti.ne.jp/~tsato/soft_s98v3.html (by Mamiya, et al.)
* FM Sound Generator rel.008 (C) cisc 1998-2003. 
* emu2413 by Mitsutaka Okazaki 2001-2004
* zlib (C) 1995-2005 Jean-loup Gailly and Mark Adler
*
* Notes:
* 
* The sources currently available (above link or also the link here: http://www.purose.net/befis/download/lib/t98/ins98131s.zip
* all seem to point to outdated old versions and also the KBMediaPlayer plugin sources that I used here
* to NOT even match the plugin-binary that is provided on the same page: These sources doesn't compile before fixing a non existing
* enum reference. The sources date from 2006/10/19 whereas there has been some update of the winamp sources on 2011/05/31 -
* in case that update made any improvements on the emulator then these unfortunately will not be reflected here.
*
* License:
*
* NOT GPL: The code builds on FM Sound Generator with OPN/OPM interface Copyright (C) by cisc 1998, 2003.
* As the author of FM Sound Generator states, this is free software but for any commercial application
* the prior consent of the author is explicitly required. 
* The same licence is here extended to any of the add-ons that are part of this project.
*/

#include <emscripten.h>
#include <stdio.h>
#include <stdlib.h>
#include <iconv.h>

#include <iostream>
#include <fstream>

#include "s98types.h"
#include <m_s98.h>


#ifdef EMSCRIPTEN
#define EMSCRIPTEN_KEEPALIVE __attribute__((used))
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

const char *getEmscriptenRhythmPath() {
	return "/rhythm";
}

#define CHANNELS 2				
#define BYTES_PER_SAMPLE 2
#define SAMPLE_BUF_SIZE	1024
#define SAMPLE_FREQ	55466


Int16 sample_buffer[SAMPLE_BUF_SIZE * CHANNELS];
int s98_samples_available= 0;

char* s98_info_texts[9];


#define TEXT_MAX	255
char s98_title_str[TEXT_MAX];
char s98_artist_str[TEXT_MAX];
char s98_game_str[TEXT_MAX];
char s98_year_str[TEXT_MAX];
char s98_genre_str[TEXT_MAX];
char s98_comment_str[TEXT_MAX];
char s98_copyright_str[TEXT_MAX];
char s98_s98by_str[TEXT_MAX];
char s98_system_str[TEXT_MAX];

#define RAW_INFO_MAX	1024
char raw_info_buffer[RAW_INFO_MAX];

unsigned char* buffer_copy= NULL;
int isUnicodeTag;

static char* to_utf8(iconv_t ic, char* in_sjis, char* out_utf8) {
    if ( isUnicodeTag ) {
        strcpy( out_utf8, in_sjis );
        return out_utf8;
    }

    size_t  in_size = strlen(in_sjis);
    size_t  out_size = (size_t)TEXT_MAX;

    iconv( ic, &in_sjis, &in_size, &out_utf8, &out_size );
    *out_utf8 = '\0';

    return out_utf8;
}

void trash_buffer_copy() {
	if (buffer_copy) {
		free(buffer_copy);
		buffer_copy= NULL;		
	}
}

unsigned char * get_buffer_copy(const void * inBuffer, size_t inBufSize) {
	trash_buffer_copy();
	
	buffer_copy= (unsigned char*)malloc(inBufSize);
	memcpy ( buffer_copy, inBuffer, inBufSize );
	return buffer_copy;
}

// now to the S98 stuff:
SOUNDINFO g_soundinfo;
s98File *g_s98 = 0;
int g_loop_detected= 0;


extern "C" void s98_teardown (void)  __attribute__((noinline));
extern "C" void EMSCRIPTEN_KEEPALIVE s98_teardown (void) {
	trash_buffer_copy();
			
	memset(&g_soundinfo, 0, sizeof(SOUNDINFO));
	
	s98_title_str[0]= s98_artist_str[0]= s98_game_str[0]= s98_year_str[0]=
		s98_genre_str[0]= s98_comment_str[0]= s98_copyright_str[0]=
		s98_s98by_str[0]= s98_system_str[0] = 0;
	
	g_loop_detected= 0;
	
	if (g_s98) {
		delete g_s98;
		g_s98= 0;
	}
}

// C/C++ crap: when inlining this code directly within the below 'extern "C"' functions
// then the passed arguments will be total garbage... when they get to the invoked 
// C++ functions.. (e.g. the "void *inBuffer" for OpenFromBuffer)
int loadBuffer(void *inBuffer, uint32_t inBufSize ) {
	// Emscripten passes its original cached data -- so we better use a copy..
	inBuffer= get_buffer_copy(inBuffer, inBufSize);

	g_s98= new s98File();
	g_soundinfo.dwSamplesPerSec= SAMPLE_FREQ;

	return g_s98->OpenFromBuffer((unsigned char *)inBuffer, inBufSize, &g_soundinfo);
}

std::string stringToUpper(std::string strToConvert) {
    std::transform(strToConvert.begin(), strToConvert.end(), strToConvert.begin(), ::toupper);

    return strToConvert;
}

void extractFromInfoLine(std::string line) {
	std::string delimiter = "=";
    iconv_t ic = iconv_open("UTF-8", "SJIS");

	size_t pos = 0;
	if ((pos= line.find(delimiter)) != std::string::npos) {
		std::string key = stringToUpper(line.substr(0, pos));
		std::string value = line.substr(pos+1, line.length());
		
		// seems the "garbage" is actually unicode chars.. 
		// unless everthing is encoded there is no chance of
		// getting it uncorrupted to the rendering...
		char buf[TEXT_MAX];
		
		if (!key.compare("TITLE")) {
            strcpy(buf, value.c_str());
            to_utf8(ic, buf, s98_title_str);
		} else if (!key.compare("ARTIST")) {
            strcpy(buf, value.c_str());
            to_utf8(ic, buf, s98_artist_str);
		} else if (!key.compare("GAME")) {
            strcpy(buf, value.c_str());
            to_utf8(ic, buf, s98_game_str);
		} else if (!key.compare("YEAR")) {
            strcpy(buf, value.c_str());
            to_utf8(ic, buf, s98_year_str);
		} else if (!key.compare("GENRE")) {
            strcpy(buf, value.c_str());
            to_utf8(ic, buf, s98_genre_str);
		} else if (!key.compare("COMMENT")) {
            strcpy(buf, value.c_str());
            to_utf8(ic, buf, s98_comment_str);
		} else if (!key.compare("COPYRIGHT")) {
            strcpy(buf, value.c_str());
            to_utf8(ic, buf, s98_copyright_str);
		} else if (!key.compare("S98BY")) {
            strcpy(buf, value.c_str());
            to_utf8(ic, buf, s98_s98by_str);
		} else if (!key.compare("SYSTEM")) {
            strcpy(buf, value.c_str());
            to_utf8(ic, buf, s98_system_str);
		}  
	} else {
		fprintf(stderr, "garbage info: [%s]\n", line.c_str());
	}
    iconv_close( ic );
}

void extractStructFileInfo(char *filename) {
	g_s98->getRawFileInfo((unsigned char*)raw_info_buffer, TEXT_MAX, 0);	// !g_soundinfo.dwIsV3
	if (strlen(raw_info_buffer) == 0) {
		// fallback: just use the filename
		std::string title = filename;
		title.erase( title.find_last_of( '.' ) );	// remove ext
		snprintf(s98_title_str, TEXT_MAX, "%s", title.c_str());
	} else {
		/*
		note: V3 files contain tagged info, e.g.
		[S98]
		"title=Opening" 0x0a
		"artist=Yuzo Koshiro" 0x0a
		"game=Sorcerian" 0x0a
		"year=1987" 0x0a
		"genre=game" 0x0a
		"comment=This is sample data." 0x0a
		"copyright=Nihon Falcom" 0x0a
		"s98by=foo" 0x0a
		"system=PC-8801" 0x0a
		*/
		const char *pfx= "[S98]";
		unsigned char* tag = (unsigned char*) strstr( raw_info_buffer, pfx );
		int hasPrefix= tag != NULL;
		isUnicodeTag = 0;
		if ( tag ) {
		    tag += strlen( pfx );
		    if ( *tag == 0xEF && *(++tag) == 0xBB && *(++tag) == 0xBF ) { // BOM
		        isUnicodeTag = 1;
		    }
		}
		
		if (hasPrefix || g_soundinfo.dwIsV3) {
			std::string s= std::string(raw_info_buffer + (hasPrefix?strlen(pfx):0));

			std::string delimiter(1, (char)0xa);

			size_t pos = 0;
			std::string token;
			while ((pos = s.find(delimiter)) != std::string::npos) {
				token = s.substr(0, pos);
				extractFromInfoLine(token);
				s.erase(0, pos + delimiter.length());
			}
		} else {
			// some older format
			iconv_t ic = iconv_open("UTF-8", "SJIS");
			char buf[TEXT_MAX];

			std::string in = raw_info_buffer;
			size_t p= in.find("Copyright");	// some contain this.. 
			
			if (p == std::string::npos) {
				// give up
				strcpy(buf, in.c_str());
                to_utf8(ic, buf, s98_title_str);
			} else {
				// just split 2 sections
				const char *str= in.c_str();
				
				std::string title = in.substr (0, p);
				strcpy(buf, title.c_str());
                to_utf8(ic, buf, s98_title_str);

				std::string copyRight = std::string(str + p);
				strcpy(buf, copyRight.c_str());
                to_utf8(ic, buf, s98_copyright_str);
			}
			iconv_close( ic );
		}		
	}
    s98_info_texts[0]= s98_title_str;
    s98_info_texts[1]= s98_artist_str;
    s98_info_texts[2]= s98_game_str;
    s98_info_texts[3]= s98_year_str;
    s98_info_texts[4]= s98_genre_str;
    s98_info_texts[5]= s98_comment_str;
    s98_info_texts[6]= s98_copyright_str;
    s98_info_texts[7]= s98_s98by_str;
    s98_info_texts[8]= s98_system_str;
}

int computeSamples() {
//	if (g_loop_detected) return 1;  // the position goes over the end of tune
	
	s98_samples_available = g_s98->Write((Int16 *)sample_buffer, SAMPLE_BUF_SIZE / 4) ;
	return (!g_s98->HasLoop())? -1 :
	            ((g_loop_detected)? 1 : 0);
}

extern "C"  int s98_load_file(char *filename, void * inBuffer, uint32_t inBufSize)  __attribute__((noinline));
extern "C"  int EMSCRIPTEN_KEEPALIVE s98_load_file(char *filename, void * inBuffer, uint32_t inBufSize) {
	s98_teardown();

	if (!loadBuffer(inBuffer, inBufSize)) {
		// error
		return 1;
	} else {
		// success 
		extractStructFileInfo(filename);		
		return 0;					
	}
}

extern "C" int s98_get_sample_rate() __attribute__((noinline));
extern "C" EMSCRIPTEN_KEEPALIVE int s98_get_sample_rate()
{
	return g_soundinfo.dwSamplesPerSec;
}

extern "C" const char** s98_get_track_info() __attribute__((noinline));
extern "C" const char** EMSCRIPTEN_KEEPALIVE s98_get_track_info() {
	return (const char**)s98_info_texts;
}

extern "C" char* EMSCRIPTEN_KEEPALIVE s98_get_audio_buffer(void) __attribute__((noinline));
extern "C" char* EMSCRIPTEN_KEEPALIVE s98_get_audio_buffer(void) {
	return (char*)sample_buffer;
}

extern "C" long EMSCRIPTEN_KEEPALIVE s98_get_audio_buffer_length(void) __attribute__((noinline));
extern "C" long EMSCRIPTEN_KEEPALIVE s98_get_audio_buffer_length(void) {
	return s98_samples_available;
}


extern "C" int s98_compute_audio_samples() __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE s98_compute_audio_samples() {
	return computeSamples();
}

extern "C" int s98_get_current_position() __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE s98_get_current_position() {
	if (g_s98->GetPosition() > g_soundinfo.dwLength) {
		g_loop_detected = 1;
	}
//	return g_s98->GetPosition() % g_soundinfo.dwLength;
	return (g_s98)? g_s98->GetPosition() : 0;
}

extern "C" void s98_seek_position(int pos) __attribute__((noinline));
extern "C" void EMSCRIPTEN_KEEPALIVE s98_seek_position(int frames) {
	g_s98->SetPosition(frames);
}

extern "C" int s98_get_max_position() __attribute__((noinline));
extern "C" int EMSCRIPTEN_KEEPALIVE s98_get_max_position() {
	return g_soundinfo.dwSeekable ? g_soundinfo.dwLength : -1;
}

extern "C" void s98_close() __attribute__((noinline));
extern "C" void EMSCRIPTEN_KEEPALIVE s98_close() {
	g_s98->Close();
}

extern "C" const int s98_get_device_count() __attribute__((noinline));
extern "C" const int EMSCRIPTEN_KEEPALIVE s98_get_device_count() {
	return g_s98->GetDeviceCount();
}

extern "C" const char* s98_get_device_name(int deviceIndex) __attribute__((noinline));
extern "C" const char* EMSCRIPTEN_KEEPALIVE s98_get_device_name(int deviceIndex) {
	return g_s98->GetDeviceName(deviceIndex);
}

extern "C" const void s98_set_channel_mask(int deviceIndex, uint mask) __attribute__((noinline));
extern "C" const void EMSCRIPTEN_KEEPALIVE s98_set_channel_mask(int deviceIndex, uint mask) {
	g_s98->SetChannelMask(deviceIndex, mask);
}

extern "C" const void s98_set_volumes(int deviceIndex, int psgDb, int fmDb, int rhythmDb, int adpcmDb) __attribute__((noinline));
extern "C" const void EMSCRIPTEN_KEEPALIVE s98_set_volumes(int deviceIndex, int psgDb, int fmDb, int rhythmDb, int adpcmDb) {
	g_s98->SetVolumes(deviceIndex, psgDb, fmDb, rhythmDb, adpcmDb);
}