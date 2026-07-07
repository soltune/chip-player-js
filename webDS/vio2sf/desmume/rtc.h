/*  DS Real-Time Clock emulation (ported from DeSmuME rtc.cpp)
    Copyright (C) 2006 yopyop
    Copyright (C) 2008 CrazyMax
    Copyright (C) 2008-2010 DeSmuME team
    GPLv2 or later; see DeSmuME for details. */

#ifndef VIO2SF_RTC_H
#define VIO2SF_RTC_H

#include "types.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct
{
	/* RTC registers */
	u8 regStatus1;
	u8 regStatus2;
	u8 regAdjustment;
	u8 regFree;

	/* bus */
	u8 _prevSCK;
	u8 _prevCS;
	u8 _prevSIO;
	u8 _SCK;
	u8 _CS;
	u8 _SIO;
	u8 _DD;
	u16 _REG;

	/* command & data */
	u8 cmd;
	u8 cmdStat;
	u8 bitsCount;
	u8 data[8];

	u8 cmdBitsSize[8];
} RTC_t;

void rtcInit(RTC_t *rtc);
u16 rtcRead(RTC_t *rtc);
void rtcWrite(RTC_t *rtc, u16 val);

#ifdef __cplusplus
}
#endif

#endif
