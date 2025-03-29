#ifndef __M_S98___
#define __M_S98___

#include "device/s98types.h"
#include "device/s98device.h"

#include "tchar.h"

// EMSCRIPTEN: code moved here from .cpp of original "plugin" impl so that there is an API to use..
// if only all emus had such a clean API :-)


typedef struct {
	Uint8 dwIsV3;
	Uint16 dwSamplesPerSec;
	Uint16 dwChannels;
	Uint16 dwBitsPerSample;
	Uint16 dwSeekable;
	Uint32 dwUnitRender;
	Uint32 dwReserved1;
	Uint32 dwReserved2;
	DWORD dwLength; 	// song length in ms
} SOUNDINFO;

#define S98DEVICE_MAX 16
#define FADEOUT_TIME 0/*(10 * SYNC_RATE)*/

#define SAMPLE_RATE 44100
#define SYNC_RATE 60 /* (Hz) */
#define UNIT_RENDER (SAMPLE_RATE/SYNC_RATE)

class s98File {
public:
	bool OpenFromBuffer(const BYTE *Buffer, DWORD dwSize, SOUNDINFO *pInfo);
	/* bool Open(const char *cszFileName, SOUNDINFO *pInfo);*/
	void Close(void);
#ifdef EMSCRIPTEN
	DWORD GetPosition();
	void getRawFileInfo(unsigned char *titleOut, int max, int stripGarbage);
	int GetDeviceCount();
	const char* GetDeviceName(int deviceIndex);
	void SetChannelMask(int deviceIndex, uint mask);
	void SetVolumes(int deviceIndex, int psgDb, int fmDb, int rhythmDb, int adpcmDb);
	bool HasLoop();
#endif
	DWORD SetPosition(DWORD dwpos);
	DWORD Write(Int16 *Buffer, DWORD numSample);
	s98File();
	virtual ~s98File();
protected:
	int number_of_devices;
	S98DEVICEIF *devices[S98DEVICE_MAX];
	BYTE devicemap[0x40];

	BYTE *s98data;
	BYTE *s98head;
	BYTE *s98top;
	BYTE *s98loop;
	int length;
	DWORD playtime; /* syncs */
	DWORD looptime; /* syncs */

	BYTE *s98cur;
	DWORD curtime;

	int loopnum;
#if FADEOUT_TIME
	int loopcur;
	DWORD fader;
#endif

#define SPS_SHIFT 28
#define SPS_LIMIT (1 << SPS_SHIFT)
	enum { SAMPLE_PER_SYNC, SYNC_PER_SAMPLE } spsmode;
	DWORD sps;		/* sync/sample or sample/syjnc */
	DWORD timerinfo1;
	DWORD timerinfo2;

	double sync_per_sec;

	DWORD lefthi;
	DWORD leftlo;

	Sample bufdev[UNIT_RENDER * 2];

	void CalcTime(void);
	void Step(void);
	void Reset(void);

	void WriteSub(Int16 *Buffer, DWORD numSample);
	DWORD SyncToMsec(DWORD sync);
	DWORD MsecToSync(DWORD ms);
};




#endif