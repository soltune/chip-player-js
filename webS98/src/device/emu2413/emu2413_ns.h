/* chip-player-js fork: prefix webS98's emu2413 public symbols so they do not
 * collide with libvgm's bundled emu2413 (same upstream lineage, same names).
 * Force-included globally via -include in scripts/build-chip-core.js; only
 * TUs that reference OPLL_* (emu2413.c, s98opll.cpp) are affected. */
#ifndef S98_EMU2413_NS_H
#define S98_EMU2413_NS_H
#define OPLL_new            s98OPLL_new
#define OPLL_delete         s98OPLL_delete
#define OPLL_reset          s98OPLL_reset
#define OPLL_reset_patch    s98OPLL_reset_patch
#define OPLL_set_rate       s98OPLL_set_rate
#define OPLL_set_quality    s98OPLL_set_quality
#define OPLL_set_pan        s98OPLL_set_pan
#define OPLL_setMask        s98OPLL_setMask
#define OPLL_toggleMask     s98OPLL_toggleMask
#define OPLL_setPatch       s98OPLL_setPatch
#define OPLL_getDefaultPatch s98OPLL_getDefaultPatch
#define OPLL_copyPatch      s98OPLL_copyPatch
#define OPLL_forceRefresh   s98OPLL_forceRefresh
#define OPLL_dump2patch     s98OPLL_dump2patch
#define OPLL_patch2dump     s98OPLL_patch2dump
#define OPLL_writeIO        s98OPLL_writeIO
#define OPLL_writeReg       s98OPLL_writeReg
#define OPLL_calc           s98OPLL_calc
#define OPLL_calc_stereo    s98OPLL_calc_stereo
#endif
