/*  DS Real-Time Clock emulation (ported from DeSmuME rtc.cpp)
    Copyright (C) 2006 yopyop
    Copyright (C) 2008 CrazyMax
    Copyright (C) 2008-2010 DeSmuME team
    GPLv2 or later; see DeSmuME for details. */

#include <stdio.h>
#include <string.h>
#include <time.h>

#include "rtc.h"

static const u8 kDefaultCmdBitsSize[8] = {8, 8, 56, 24, 0, 24, 8, 8};

static u8 toBCD(u8 x)
{
	return (u8)(((x / 10) << 4) | (x % 10));
}

static void rtcRecv(RTC_t *rtc)
{
	time_t now = time(NULL);
	struct tm tmv;
#ifdef _WIN32
	tmv = *localtime(&now);
#else
	localtime_r(&now, &tmv);
#endif

	memset(&rtc->data[0], 0, sizeof(rtc->data));
	switch (rtc->cmd >> 1)
	{
	case 0: /* status register 1 */
		rtc->regStatus1 &= 0x0F;
		rtc->data[0] = rtc->regStatus1;
		break;
	case 1: /* status register 2 */
		rtc->data[0] = rtc->regStatus2;
		break;
	case 2: /* date & time */
	{
		int hour = tmv.tm_hour;
		rtc->data[0] = toBCD((u8)(tmv.tm_year % 100));
		rtc->data[1] = toBCD((u8)(tmv.tm_mon + 1));
		rtc->data[2] = toBCD((u8)tmv.tm_mday);
		rtc->data[3] = (u8)tmv.tm_wday;
		if (!(rtc->regStatus1 & 0x02)) hour %= 12;
		rtc->data[4] = (u8)(((tmv.tm_hour < 12) ? 0x00 : 0x40) | toBCD((u8)hour));
		rtc->data[5] = toBCD((u8)tmv.tm_min);
		rtc->data[6] = toBCD((u8)tmv.tm_sec);
		break;
	}
	case 3: /* time */
	{
		int hour = tmv.tm_hour;
		if (!(rtc->regStatus1 & 0x02)) hour %= 12;
		rtc->data[0] = (u8)(((tmv.tm_hour < 12) ? 0x00 : 0x40) | toBCD((u8)hour));
		rtc->data[1] = toBCD((u8)tmv.tm_min);
		rtc->data[2] = toBCD((u8)tmv.tm_sec);
		break;
	}
	case 4: /* freq/alarm 1 */
		break;
	case 5: /* alarm 2 */
		break;
	case 6: /* clock adjust */
		rtc->data[0] = rtc->regAdjustment;
		break;
	case 7: /* free register */
		rtc->data[0] = rtc->regFree;
		break;
	}
}

static void rtcSend(RTC_t *rtc)
{
	switch (rtc->cmd >> 1)
	{
	case 0:
		rtc->regStatus1 = rtc->data[0];
		break;
	case 1:
		rtc->regStatus2 = rtc->data[0];
		break;
	case 6:
		rtc->regAdjustment = rtc->data[0];
		break;
	case 7:
		rtc->regFree = rtc->data[0];
		break;
	default:
		break;
	}
}

void rtcInit(RTC_t *rtc)
{
	memset(rtc, 0, sizeof(*rtc));
	memcpy(&rtc->cmdBitsSize[0], kDefaultCmdBitsSize, 8);
	rtc->regStatus1 |= 0x02; /* 24h mode */
}

u16 rtcRead(RTC_t *rtc)
{
#ifdef DEBUG_IPC_TRACE
	fprintf(stderr, "[rtc] read -> %04x\n", rtc->_REG);
#endif
	return rtc->_REG;
}

void rtcWrite(RTC_t *rtc, u16 val)
{
#ifdef DEBUG_IPC_TRACE
	fprintf(stderr, "[rtc] write %04x\n", val);
#endif
	rtc->_DD  = (u8)((val & 0x10) >> 4);
	rtc->_SIO = rtc->_DD ? (u8)(val & 0x01) : rtc->_prevSIO;
	rtc->_SCK = (val & 0x20) ? (u8)((val & 0x02) >> 1) : rtc->_prevSCK;
	rtc->_CS  = (val & 0x40) ? (u8)((val & 0x04) >> 2) : rtc->_prevCS;

	switch (rtc->cmdStat)
	{
	case 0:
		if ((!rtc->_prevCS) && (rtc->_prevSCK) && (rtc->_CS) && (rtc->_SCK))
		{
			rtc->cmdStat = 1;
			rtc->bitsCount = 0;
			rtc->cmd = 0;
		}
		break;

	case 1:
		if (!rtc->_CS)
		{
			rtc->cmdStat = 0;
			break;
		}
		if (rtc->_SCK && rtc->_DD) break;
		if (!rtc->_SCK && !rtc->_DD) break;

		rtc->cmd |= (u8)(rtc->_SIO << rtc->bitsCount);
		rtc->bitsCount++;
		if (rtc->bitsCount == 8)
		{
			/* little-endian command */
			if ((rtc->cmd & 0x0F) == 0x06)
			{
				u8 tmp = rtc->cmd;
				rtc->cmd = (u8)(((tmp & 0x80) >> 7) | ((tmp & 0x40) >> 5) |
				                ((tmp & 0x20) >> 3) | ((tmp & 0x10) >> 1));
			}
			else
			{
				rtc->cmd &= 0x0F;
			}

			if ((rtc->_prevSCK) && (!rtc->_SCK))
			{
				rtc->bitsCount = 0;
				if ((rtc->cmd >> 1) == 0x04)
				{
					if ((rtc->regStatus2 & 0x0F) == 0x04)
						rtc->cmdBitsSize[rtc->cmd >> 1] = 24;
					else
						rtc->cmdBitsSize[rtc->cmd >> 1] = 8;
				}
				if (rtc->cmd & 0x01)
				{
					rtc->cmdStat = 4;
					rtcRecv(rtc);
				}
				else
				{
					rtc->cmdStat = 3;
				}
			}
		}
		break;

	case 3: /* write */
		if ((rtc->_prevSCK) && (!rtc->_SCK))
		{
			if (rtc->_SIO)
				rtc->data[rtc->bitsCount >> 3] |= (u8)(1 << (rtc->bitsCount & 0x07));
			rtc->bitsCount++;
			if (rtc->bitsCount == rtc->cmdBitsSize[rtc->cmd >> 1])
			{
				rtcSend(rtc);
				rtc->cmdStat = 0;
			}
		}
		break;

	case 4: /* read */
		if ((rtc->_prevSCK) && (!rtc->_SCK))
		{
			rtc->_REG = val;
			if ((rtc->data[(rtc->bitsCount >> 3)] >> (rtc->bitsCount & 0x07)) & 0x01)
				rtc->_REG |= 0x01;
			else
				rtc->_REG &= (u16)~0x01;

			rtc->bitsCount++;
			if (rtc->bitsCount == rtc->cmdBitsSize[rtc->cmd >> 1] || (!(val & 0x04)))
				rtc->cmdStat = 0;
		}
		break;
	}

	rtc->_prevSIO = rtc->_SIO;
	rtc->_prevSCK = rtc->_SCK;
	rtc->_prevCS  = rtc->_CS;
}
