/*
	GSF Decoder: for playing "Game Boy Sound Format" (.GSF/.MINIGSF) files
	
	Based on kode54's: http://www.foobar2000.org/components/view/foo_input_gsf

	As compared to kode54's original psf.cpp, the code has been patched to NOT
	rely on any fubar2000 base impls.  (The migration must have messed up
	the original "silence suppression" impl - which seems to be rather crappy
	anyway and not worth the trouble - and it has just been disabled here.)
	
	The structure/impl of this file is very similar (aka copy/paste) to other
	psflib based players of kode54 (see gsf, PSX, etc) but unfortunately there 
	doesn't seem to be a consolidated base lib version that could be shared for 
	all these projects - which is rather unfortunate, but I dont't feel like 
	wasting more time just to clean this up.
	
	
	Copyright
	
	mGBA is Copyright © 2013 – 2018 Jeffrey Pfau. It is distributed under the Mozilla Public License version 2.0. A copy of the license is available in the distributed LICENSE file.

	mGBA contains the following third-party libraries:
	inih, which is copyright © 2009 Ben Hoyt and used under a BSD 3-clause license.
	blip-buf, which is copyright © 2003 – 2009 Shay Green and used under a Lesser GNU Public License.
	LZMA SDK, which is public domain.
	MurmurHash3 implementation by Austin Appleby, which is public domain.
	getopt for MSVC, which is public domain.
	foo_input_gsf Copyright Christopher Snowhill
	web port Copyright © 2018 Juergen Wothke. It is distributed under the same Mozilla Public License version 2.0 as the used mGBA base.
*/

#include <stdio.h>
#include <stdlib.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <unistd.h>

#include <stdexcept>
#include <set>

#include <codecvt>
#include <locale>
#include <string>

#include <string.h>


#include <mgba/core/core.h>
#include <mgba/core/blip_buf.h>
#include <mgba-util/vfs.h>
#include <mgba/core/log.h>

#include <psflib.h>


static unsigned int g_cat_arm = 0;

extern "C" void GSFLogger(struct mLogger* logger, int category, enum mLogLevel level, const char* format, va_list args)
{
	if ((level & mLOG_ERROR) || (level & mLOG_FATAL)) {
		fprintf(stderr, format, args);
		fprintf(stderr, "\n");
	}
/*	else {
		fprintf(stderr, "info: ");
		fprintf(stderr, format, args);
		fprintf(stderr, "\n");		
	}*/
	
/*
	// this kind of logic could be used in case specific messages are needed 
	for (unsigned i = 1; i < 64; ++i) {
		const char * catname = mLogCategoryName(i);
		if (catname && strcmp(catname, "ARM CPU") == 0) {
		}
	}
*/
}

static struct mLogger gsf_logger = {
	GSFLogger
};

static struct gsf_set_logger
{
	gsf_set_logger()
	{
		mLogSetDefaultLogger(&gsf_logger);
	}
} g_gsf_set_logger;



#include "circular_buffer.h"


#define t_int16   signed short
#define stricmp strcasecmp


#include <mgba-util/memory.h>

extern "C" void* anonymousMemoryMap(size_t size) {
	return malloc(size);
}

extern "C" void mappedMemoryFree(void* memory, size_t size) {
	UNUSED(size);
	free (memory);
}

// implemented on JavaScript side (also see callback.js) for "on-demand" file load:
extern "C" int gsf_request_file(const char *filename);

// just some fillers to change kode54's below code as little as possible
class exception_io_data: public std::runtime_error {
public:
	exception_io_data(const char *what= "exception_io_data") : std::runtime_error(what) {}
};
int stricmp_utf8(std::string const& s1, const char* s2) {	
    return strcasecmp(s1.c_str(), s2);
}
int stricmp_utf8(const char* s1, const char* s2) {	
    return strcasecmp(s1, s2);
}
int stricmp_utf8_partial(std::string const& s1,  const char* s2) {
	std::string s1pref= s1.substr(0, strlen(s2));	
    return strcasecmp(s1pref.c_str(), s2);
}

# define strdup_(s)							      \
  (__extension__							      \
    ({									      \
      const char *__old = (s);						      \
      size_t __len = strlen (__old) + 1;				      \
      char *__new = (char *) malloc (__len);			      \
      (char *) memcpy (__new, __old, __len);				      \
    }))


#define trace(...) { fprintf(stderr, __VA_ARGS__); }
//#define trace(fmt,...)

// callback defined elsewhere 
extern void gsf_meta_set(const char * name, const char * value);


#define DB_FILE FILE
	
struct FileAccess_t {	
	void* (*fopen)( const char * uri );
	size_t (*fread)( void * buffer, size_t size, size_t count, void * handle );
	int (*fseek)( void * handle, int64_t offset, int whence );

	long int (*ftell)( void * handle );
	int (*fclose)( void * handle  );

	size_t (*fgetlength)( FILE * f);
};
static struct FileAccess_t *g_file= 0;

static void * psf_file_fopen( const char * uri ) {
    void *file= g_file->fopen( uri );
	return file;
}
static size_t psf_file_fread( void * buffer, size_t size, size_t count, void * handle ) {
    size_t ret= g_file->fread( buffer, size, count, handle );
	return ret;
}
static int psf_file_fseek( void * handle, int64_t offset, int whence ) {
    int ret= g_file->fseek( handle, offset, whence );	
	return ret;
}
static int psf_file_fclose( void * handle ) {
    g_file->fclose( handle );
    return 0;	
}
static long psf_file_ftell( void * handle ) {
    long ret= g_file->ftell( handle );	
	return ret;
}
const psf_file_callbacks psf_file_system = {
    "\\/|:",
    psf_file_fopen,
    psf_file_fread,
    psf_file_fseek,
    psf_file_fclose,
    psf_file_ftell
};


//#define DBG(a) OutputDebugString(a)
#define DBG(a)

static unsigned int cfg_infinite= 0;
static unsigned int cfg_deflength= 170000;
static unsigned int cfg_deffade= 10000;

// that "silence suppression" impl sucks.. and it isn't worth the time needed to fix it..
static unsigned int cfg_suppressopeningsilence = 0;
static unsigned int cfg_suppressendsilence = 0;
static unsigned int cfg_endsilenceseconds= 5;

static const char field_length[]="gsf_length";
static const char field_fade[]="gsf_fade";

#define BORK_TIME 0xC0CAC01A

static unsigned long parse_time_crap(const char *input)
{
    if (!input) return BORK_TIME;
    int len = strlen(input);
    if (!len) return BORK_TIME;
    int value = 0;
    {
        int i;
        for (i = len - 1; i >= 0; i--)
        {
            if ((input[i] < '0' || input[i] > '9') && input[i] != ':' && input[i] != ',' && input[i] != '.')
            {
                return BORK_TIME;
            }
        }
    }

    char * foo = strdup_( input );

    if ( !foo )
        return BORK_TIME;

    char * bar = foo;
    char * strs = bar + strlen( foo ) - 1;
    char * end;
    while (strs > bar && (*strs >= '0' && *strs <= '9'))
    {
        strs--;
    }
    if (*strs == '.' || *strs == ',')
    {
        // fraction of a second
        strs++;
        if (strlen(strs) > 3) strs[3] = 0;
        value = strtoul(strs, &end, 10);
        switch (strlen(strs))
        {
        case 1:
            value *= 100;
            break;
        case 2:
            value *= 10;
            break;
        }
        strs--;
        *strs = 0;
        strs--;
    }
    while (strs > bar && (*strs >= '0' && *strs <= '9'))
    {
        strs--;
    }
    // seconds
    if (*strs < '0' || *strs > '9') strs++;
    value += strtoul(strs, &end, 10) * 1000;
    if (strs > bar)
    {
        strs--;
        *strs = 0;
        strs--;
        while (strs > bar && (*strs >= '0' && *strs <= '9'))
        {
            strs--;
        }
        if (*strs < '0' || *strs > '9') strs++;
        value += strtoul(strs, &end, 10) * 60000;
        if (strs > bar)
        {
            strs--;
            *strs = 0;
            strs--;
            while (strs > bar && (*strs >= '0' && *strs <= '9'))
            {
                strs--;
            }
            value += strtoul(strs, &end, 10) * 3600000;
        }
    }
    free( foo );
    return value;
}

// hack: dummy impl to replace foobar2000 stuff
const int MAX_INFO_LEN= 10;

class file_info {
	double len;
	
	// no other keys implemented
	const char* sampleRate;
	const char* channels;
	
	std::vector<std::string> requiredLibs;
	
public:
	file_info() {
		sampleRate = (const char*)malloc(MAX_INFO_LEN);
		channels = (const char*)malloc(MAX_INFO_LEN);
	}
	~file_info() {
		free((void*)channels);
		free((void*)sampleRate);
	}
	void reset() {
		requiredLibs.resize(0);
	}
	std::vector<std::string> get_required_libs() {
		return requiredLibs;
	}
	void info_set_int(const char *tag, int value) {
		if (!stricmp_utf8(tag, "samplerate")) {
			snprintf((char*)sampleRate, MAX_INFO_LEN, "%d", value);
		} else if (!stricmp_utf8(tag, "channels")) {
			snprintf((char*)channels, MAX_INFO_LEN, "%d", value);
		}
		// who cares.. just ignore
	}
	const char *info_get(std::string &t) {
		const char *tag= t.c_str();
		
		if (!stricmp_utf8(tag, "samplerate")) {
			return sampleRate;
		} else if (!stricmp_utf8(tag, "channels")) {
			return channels;
		}
		return "unavailable";
	}

	void set_length(double l) {
		len= l;
	}
	
	void info_set_lib(std::string& tag, const char * value) {
		// EMSCRIPTEN depends on all libs being loaded before the song can be played!
		requiredLibs.push_back(std::string(value));	
	}

	// 
	unsigned int meta_get_count() { return 0;}
	unsigned int meta_enum_value_count(unsigned int i) { return 0; }
	const char* meta_enum_value(unsigned int i, unsigned int k) { return "dummy";}
	void meta_modify_value(unsigned int i, unsigned int k, const char *value) {}
	unsigned int info_get_count() {return 0;}
	const char* info_enum_name(unsigned int i) { return "dummy";}

	void info_set(const char * name, const char * value) {}
	void info_set(std::string& name, const char * value) {}
	const char* info_enum_value(unsigned int i) {return "dummy";}
	void info_set_replaygain(const char *tag, const char *value) {}
	void info_set_replaygain(std::string &tag, const char *value) {}
	void meta_add(const char *tag, const char *value) {}
	void meta_add(std::string &tag, const char *value) {}
};


static void info_meta_ansi( file_info & info )
{
/* FIXME eventually migrate original impl
 
	for ( unsigned i = 0, j = info.meta_get_count(); i < j; i++ )
	{
		for ( unsigned k = 0, l = info.meta_enum_value_count( i ); k < l; k++ )
		{
			const char * value = info.meta_enum_value( i, k );
			info.meta_modify_value( i, k, pfc::stringcvt::string_utf8_from_ansi( value ) );
		}
	}
	for ( unsigned i = 0, j = info.info_get_count(); i < j; i++ )
	{
		const char * name = info.info_enum_name( i );
		
		if ( name[ 0 ] == '_' )
			info.info_set( std::string( name ), pfc::stringcvt::string_utf8_from_ansi( info.info_enum_value( i ) ) );
	}
*/
}

struct psf_info_meta_state
{
	file_info * info;

	std::string name;

	bool utf8;

	int tag_song_ms;
	int tag_fade_ms;

	psf_info_meta_state()
		: info( 0 ), utf8( false ), tag_song_ms( 0 ), tag_fade_ms( 0 ) {}
};

static int psf_info_meta(void * context, const char * name, const char * value) {
	// typical tags: _lib, _enablecompare(on), _enableFIFOfull(on), fade, volume
	// game, genre, year, copyright, track, title, length(x:x.xxx), artist
	
	// FIXME: various "_"-settings are currently not used to configure the emulator
	
	psf_info_meta_state * state = ( psf_info_meta_state * ) context;

	std::string & tag = state->name;

	tag.assign(name);

	if (!stricmp_utf8(tag, "game"))
	{
		DBG("reading game as album");
		tag.assign("album");
	}
	else if (!stricmp_utf8(tag, "year"))
	{
		DBG("reading year as date");
		tag.assign("date");
	}

	if (!stricmp_utf8_partial(tag, "replaygain_"))
	{
		DBG("reading RG info");
		state->info->info_set_replaygain(tag, value);
	}
	else if (!stricmp_utf8(tag, "length"))
	{
		DBG("reading length");
		int temp = parse_time_crap(value);
		if (temp != BORK_TIME)
		{
			state->tag_song_ms = temp;
			state->info->info_set_int(field_length, state->tag_song_ms);
		}
	}
	else if (!stricmp_utf8(tag, "fade"))
	{
		DBG("reading fade");
		int temp = parse_time_crap(value);
		if (temp != BORK_TIME)
		{
			state->tag_fade_ms = temp;
			state->info->info_set_int(field_fade, state->tag_fade_ms);
		}
	}
	else if (!stricmp_utf8(tag, "utf8"))
	{
		state->utf8 = true;
	}
	else if (!stricmp_utf8_partial(tag, "_lib"))
	{
		DBG("found _lib");
		state->info->info_set_lib(tag, value);
	}
	else if (tag[0] == '_')
	{
		DBG("found unknown required tag, failing");
		return -1;
	}
	else
	{
		state->info->meta_add( tag, value );
	}

	// handle description stuff elsewhere
	gsf_meta_set(tag.c_str(), value);
	
	return 0;
}

struct gsf_loader_state
{
    int entry_set;
    uint32_t entry;
    uint8_t * data;
    size_t data_size;
	gsf_loader_state() : entry_set( 0 ), data( 0 ), data_size( 0 ) { }
	~gsf_loader_state() { if ( data ) free( data ); }
};

inline unsigned get_le32( void const* p )
{
    return  (unsigned) ((unsigned char const*) p) [3] << 24 |
            (unsigned) ((unsigned char const*) p) [2] << 16 |
            (unsigned) ((unsigned char const*) p) [1] <<  8 |
            (unsigned) ((unsigned char const*) p) [0];
}

int gsf_loader(void * context, const uint8_t * exe, size_t exe_size,
                                  const uint8_t * reserved, size_t reserved_size)
{
    if ( exe_size < 12 ) return -1;

    struct gsf_loader_state * state = ( struct gsf_loader_state * ) context;

    unsigned char *iptr;
    unsigned isize;
    unsigned char *xptr;
    unsigned xentry = get_le32(exe + 0);
    unsigned xsize = get_le32(exe + 8);
    unsigned xofs = get_le32(exe + 4) & 0x1ffffff;
    if ( xsize < exe_size - 12 ) return -1;
    if (!state->entry_set)
    {
        state->entry = xentry;
        state->entry_set = 1;
    }
    {
        iptr = state->data;
        isize = state->data_size;
        state->data = 0;
        state->data_size = 0;
    }
    if (!iptr)
    {
        unsigned rsize = xofs + xsize;
        {
            rsize -= 1;
            rsize |= rsize >> 1;
            rsize |= rsize >> 2;
            rsize |= rsize >> 4;
            rsize |= rsize >> 8;
            rsize |= rsize >> 16;
            rsize += 1;
        }
        iptr = (unsigned char *) malloc(rsize + 10);
        if (!iptr)
            return -1;
        memset(iptr, 0, rsize + 10);
        isize = rsize;
    }
    else if (isize < xofs + xsize)
    {
        unsigned rsize = xofs + xsize;
        {
            rsize -= 1;
            rsize |= rsize >> 1;
            rsize |= rsize >> 2;
            rsize |= rsize >> 4;
            rsize |= rsize >> 8;
            rsize |= rsize >> 16;
            rsize += 1;
        }
        xptr = (unsigned char *) realloc(iptr, xofs + rsize + 10);
        if (!xptr)
        {
            free(iptr);
            return -1;
        }
        iptr = xptr;
        isize = rsize;
    }
    memcpy(iptr + xofs, exe + 12, xsize);
    {
        state->data = iptr;
        state->data_size = isize;
    }
    return 0;
}

struct gsf_running_state
{
	struct mAVStream stream;
	int16_t samples[2048 * 2];
	int buffered;
};

static void _gsf_postAudioBuffer(struct mAVStream * stream, blip_t * left, blip_t * right)
{
	// note: the amount of samples delivered per channel actually ranges from 2048 to 2050!
//fprintf(stderr, "a: %d %d \n", blip_samples_avail(left), blip_samples_avail(right));	
		
	struct gsf_running_state * state = (struct gsf_running_state *) stream;
	int countLeft= blip_read_samples(left, state->samples, 1024, true);
	int countRight= blip_read_samples(right, state->samples + 1, 1024, true);
	state->buffered = 1024;
	
}


/*
	removed: inheritance, remove_tags(), retag(), etc
*/
class input_gsf
{
	gsf_loader_state *m_state;
	struct gsf_running_state m_output;
	struct mCore * m_core;
	std::string m_path;
	file_info m_info;
		
	bool no_loop, eof;

	circular_buffer<t_int16> silence_test_buffer;
	t_int16 sample_buffer[2048*2];

	int err;
	int data_written,remainder,pos_delta,startsilence,silence;

	double gsfemu_pos;

	int song_len,fade_len;
	int tag_song_ms,tag_fade_ms;

	bool do_filter, do_suppressendsilence;

public:
	input_gsf() : silence_test_buffer( 0 ), m_core( 0 ), m_state(0) {
		memset(&m_output, 0, sizeof(m_output));		
	}

	~input_gsf() {
		shutdown();
	}

	int32_t getCurrentPlayPosition() { return data_written*1000/getSamplesRate() + pos_delta; }
	int32_t getEndPlayPosition() { return tag_song_ms; }
	int32_t getSamplesRate() { return 44100; }	// todo: replace those hardcoded usages
	
	std::vector<std::string> splitpath(const std::string& str, 
								const std::set<char> &delimiters) {

		std::vector<std::string> result;

		char const* pch = str.c_str();
		char const* start = pch;
		for(; *pch; ++pch) {
			if (delimiters.find(*pch) != delimiters.end()) {
				if (start != pch) {
					std::string str(start, pch);
					result.push_back(str);
				} else {
					result.push_back("");
				}
				start = pch + 1;
			}
		}
		result.push_back(start);

		return result;
	}
	
	
	void shutdown()
	{
		if ( m_core )
		{
			m_core->deinit(m_core);
			m_core = NULL;
		}
	}

	int open(const char * p_path ) {
		m_info.reset();
		m_path = p_path;

		psf_info_meta_state info_state;
		info_state.info = &m_info;
		
		// INFO: info_state is what is later passed as "context" in the callbacks
		//       psf_info_meta then is the "target"
		
		if ( psf_load( p_path, &psf_file_system, 0x22, 0, 0, psf_info_meta, &info_state, 0 ) <= 0 )
			throw exception_io_data( "Not a GSF file" );

		if ( !info_state.utf8 )
			info_meta_ansi( m_info );

		tag_song_ms = info_state.tag_song_ms;
		tag_fade_ms = info_state.tag_fade_ms;

		if (!tag_song_ms)
		{
			tag_song_ms = cfg_deflength;
			tag_fade_ms = cfg_deffade;
		}

		m_info.set_length( (double)( tag_song_ms + tag_fade_ms ) * .001 );
		m_info.info_set_int( "samplerate", 44100 );
		m_info.info_set_int( "channels", 2 );

		// song may depend on some lib-file(s) that first must be loaded! 
		// (enter "retry-mode" if something is missing)
		std::set<char> delims; delims.insert('\\'); delims.insert('/');
		
		std::vector<std::string> p = splitpath(m_path, delims);		
		std::string path= m_path.substr(0, m_path.length()-p.back().length());
		
		
		// make sure the file will be available in the FS when the song asks for it later..		
		std::vector<std::string>libs= m_info.get_required_libs();
		for (std::vector<std::string>::const_iterator iter = libs.begin(); iter != libs.end(); ++iter) {
			const std::string& libName= *iter;
			const std::string libFile= path + libName;

			int r= gsf_request_file(libFile.c_str());	// trigger load & check if ready
			if (r <0) {
				return -1; // file not ready
			}
		}
		return 0;
	}

	void decode_initialize() {

		shutdown();

		if (m_state) {
			delete m_state;
		}
		m_state= new gsf_loader_state();

		if ( psf_load( m_path.c_str(), &psf_file_system, 0x22, gsf_loader, m_state, 0, 0, 0 ) < 0 )
			throw exception_io_data( "Invalid GSF" );
		if (m_state->data_size > UINT_MAX)
			throw exception_io_data("Invalid GSF");
			
		struct VFile * rom = VFileFromConstMemory(m_state->data, m_state->data_size);
		if (!rom)
			throw std::bad_alloc();

		struct mCore * core = mCoreFindVF(rom);
		if (!core)
		{
			rom->close(rom);
			throw exception_io_data("Invalid GSF");
		}

		memset(&m_output, 0, sizeof(m_output));
		m_output.stream.postAudioBuffer = _gsf_postAudioBuffer;

		core->init(core);
		core->setAVStream(core, &m_output.stream);
		mCoreInitConfig(core, NULL);

		core->setAudioBufferSize(core, 2048);

		blip_set_rates(core->getAudioChannel(core, 0), core->frequency(core), 44100);
		blip_set_rates(core->getAudioChannel(core, 1), core->frequency(core), 44100);

		struct mCoreOptions opts = {};
		opts.useBios = false;
		opts.skipBios = true;
		opts.volume = 0x100;
		opts.sampleRate = 44100;

		mCoreConfigLoadDefaults(&core->config, &opts);
		core->loadROM(core, rom);		
		core->reset(core);
		m_core = core;

		gsfemu_pos = 0.;

		startsilence = silence = 0;

		eof = 0;
		err = 0;
		data_written = 0;
		remainder = 0;
		pos_delta = 0;
		no_loop = 1;

		calcfade();

		do_suppressendsilence = !! cfg_suppressendsilence;

		unsigned skip_max = cfg_endsilenceseconds * 44100;

		if ( cfg_suppressopeningsilence ) // ohcrap
		{
			for (;;)
			{
				unsigned skip_howmany = skip_max - silence;
				unsigned unskippable = 0;

				m_output.buffered = 0;
				while (!m_output.buffered)
					m_core->runFrame(m_core);
				if ( skip_howmany > m_output.buffered )
					skip_howmany = m_output.buffered;
				else
					unskippable = m_output.buffered - skip_howmany;
				short * foo = m_output.samples;
				unsigned i;
				for ( i = 0; i < skip_howmany; ++i )
				{
					if ( foo[ 0 ] || foo[ 1 ] ) break;
					foo += 2;
				}
				silence += i;
				if ( i < skip_howmany )
				{
					remainder = skip_howmany - i + unskippable;
					memmove( m_output.samples, foo, remainder * sizeof( short ) * 2 );
					break;
				}
				if ( silence >= skip_max )
				{
					eof = true;
					break;
				}
			}

			startsilence += silence;
			silence = 0;
		}
		if ( do_suppressendsilence ) silence_test_buffer.resize( skip_max * 2 );

	}
	
	int decode_run( int16_t** output_buffer, uint16_t *output_samples) {

		if ( ( eof || err < 0 ) && !silence_test_buffer.data_available() ) return false;

		if ( no_loop && tag_song_ms && ( pos_delta + MulDiv( data_written, 1000, 44100 ) ) >= tag_song_ms + tag_fade_ms )
			return false;

		unsigned int written = 0;

		int samples;

		if ( no_loop )
		{
			samples = ( song_len + fade_len ) - data_written;
			if ( samples > 2048 ) samples = 2048;
		}
		else
		{
			samples = 2048;
		}

		short * ptr;

		if ( do_suppressendsilence )
		{
			if ( !eof )
			{
				unsigned free_space = silence_test_buffer.free_space() / 2;
				while ( free_space )
				{

					unsigned samples_to_render;
					if ( remainder )
					{
						samples_to_render = remainder;
						remainder = 0;
					}
					else
					{
						samples_to_render = free_space;
						m_output.buffered = 0;
						while (!m_output.buffered)
							m_core->runFrame(m_core);
						samples_to_render = m_output.buffered;
						if ( samples_to_render > free_space )
						{
							remainder = samples_to_render - free_space;
							samples_to_render = free_space;
						}
					}
					silence_test_buffer.write( m_output.samples, samples_to_render * 2 );
					free_space -= samples_to_render;
					if ( remainder )
					{
						memmove( m_output.samples, m_output.samples + samples_to_render * 2, remainder * 4 );
					}
				}
			}

			if ( silence_test_buffer.test_silence() )
			{
				eof = true;
				return false;
			}

			written = silence_test_buffer.data_available() / 2;
		//	if ( written > 2048 ) written = 2048;
		//	sample_buffer.grow_size( written * 2 );
			silence_test_buffer.read( sample_buffer, written * 2 );
			ptr = sample_buffer;
		}
		else
		{
			if ( remainder )
			{
				written = remainder;
				remainder = 0;
			}
			else
			{
				m_output.buffered = 0;
				while (!m_output.buffered)
					m_core->runFrame(m_core);
				written = m_output.buffered;
			}

			ptr = m_output.samples;
		}

		gsfemu_pos += double( written ) / 44100.;

		int d_start, d_end;
		d_start = data_written;
		data_written += written;
		d_end = data_written;

		if ( tag_song_ms && d_end > song_len && no_loop )
		{
			short * foo = ptr;
			int n;
			for( n = d_start; n < d_end; ++n )
			{
				if ( n > song_len )
				{
					if ( n > song_len + fade_len )
					{
						foo[ 0 ] = 0;
						foo[ 1 ] = 0;
					}
					else
					{
						int bleh = song_len + fade_len - n;
						foo[ 0 ] = MulDiv( foo[ 0 ], bleh, fade_len );
						foo[ 1 ] = MulDiv( foo[ 1 ], bleh, fade_len );
					}
				}
				foo += 2;
			}
		}
		
		*output_buffer = ptr;
		*output_samples= written;

		return true;
	}

	void decode_seek( double p_seconds ) {
		eof = false;

		double buffered_time = (double)(silence_test_buffer.data_available() / 2) / 44100.0;

		gsfemu_pos += buffered_time;

		silence_test_buffer.reset();

		if ( p_seconds < gsfemu_pos )
		{
			decode_initialize( );
		}
		unsigned int howmany = ( int )( ( p_seconds - gsfemu_pos )*44100 );

		// more abortable, and emu doesn't like doing huge numbers of samples per call anyway
		while ( howmany )
		{

			m_output.buffered = 0;
			while (!m_output.buffered)
				m_core->runFrame(m_core);
			unsigned samples = m_output.buffered;
			if ( samples > howmany )
			{
				memmove( m_output.samples, m_output.samples + howmany * 2, ( samples - howmany ) * 4 );
//				remainder = samples - howmany;
				remainder = 0;	// creates nothing but noise anyway..
				samples = howmany;
			}
			howmany -= samples;
		}

		data_written = 0;
		pos_delta = ( int )( p_seconds * 1000. );
		gsfemu_pos = p_seconds;

		calcfade();

	}
private:
	double MulDiv(int ms, int sampleRate, int d) {
		return ((double)ms)*sampleRate/d;
	}

	void calcfade() {
		song_len=MulDiv(tag_song_ms-pos_delta,44100,1000);
		fade_len=MulDiv(tag_fade_ms,44100,1000);
	}
};
static input_gsf g_input_usf;

// ------------------------------------------------------------------------------------------------------- 


void gsf_boost_volume(unsigned char b) { /*noop*/}

int32_t gsf_get_sample_rate() {
	return g_input_usf.getSamplesRate();
}

int32_t gsf_end_song_position() {
	// base for seeking
	return g_input_usf.getEndPlayPosition();	// in ms
}

int32_t gsf_current_play_position() {
	return g_input_usf.getCurrentPlayPosition();
}

int gsf_load_file(const char *uri) {
	try {
		int retVal= g_input_usf.open(uri);
		if (retVal < 0) return retVal;	// trigger retry later
		
		g_input_usf.decode_initialize();

		return 0;
	} catch(...) {
		return -1;
	}
}


int16_t *availableBuffer= 0;
uint16_t availableBufferSize= 0;

int gsf_read(int16_t *output_buffer, uint16_t outSize) {
	uint16_t requestedSize= outSize;
	
	while (outSize) {
		if (availableBufferSize) {
			if (availableBufferSize >= outSize) {
				memcpy(output_buffer, availableBuffer, outSize<<2);
				availableBuffer+= outSize<<2;
				availableBufferSize-= outSize;
				return requestedSize;
			} else {
				memcpy(output_buffer, availableBuffer, availableBufferSize<<2);
				availableBuffer= 0;
				output_buffer+= availableBufferSize<<2;
				outSize-= availableBufferSize;
			}
		} else {
			if(!g_input_usf.decode_run( &availableBuffer, &availableBufferSize)) {
				return 0; 	// end song
			}
		}
	}
	return requestedSize;
}

int gsf_seek_position (int ms) {
	g_input_usf.decode_seek( ((double)ms)/1000);
    return 0;
}

// use "regular" file ops - which are provided by Emscripten (just make sure all files are previously loaded)

void* em_fopen( const char * uri ) { 
	return (void*)fopen(uri, "r");
}
size_t em_fread( void * buffer, size_t size, size_t count, void * handle ) {
	return fread(buffer, size, count, (FILE*)handle );
}
int em_fseek( void * handle, int64_t offset, int whence ) {
	return fseek( (FILE*) handle, offset, whence );
}
long int em_ftell( void * handle ) {
	return  ftell( (FILE*) handle );
}
int em_fclose( void * handle  ) {
	return fclose( (FILE *) handle  );
}

size_t em_fgetlength( FILE * f) {
	int fd= fileno(f);
	struct stat buf;
	fstat(fd, &buf);
	return buf.st_size;	
}	

void gsf_setup (void) {
	if (!g_file) {
		g_file = (struct FileAccess_t*) malloc(sizeof( struct FileAccess_t ));
		
		g_file->fopen= em_fopen;
		g_file->fread= em_fread;
		g_file->fseek= em_fseek;
		g_file->ftell= em_ftell;
		g_file->fclose= em_fclose;		
		g_file->fgetlength= em_fgetlength;
	}
}


