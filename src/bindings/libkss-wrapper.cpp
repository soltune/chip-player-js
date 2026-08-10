// Bridges libkss (KSSPLAY) to src/players/KSSPlayer.js.
// libkss lives in a side-by-side clone (../libkss); see scripts/build-libs.sh.
// Currently used for .mgs only (.kss stays on game-music-emu for now).

#include <emscripten.h>
#include <stdint.h>

extern "C" {
#include "kssplay.h"
}

namespace {

struct LkssContext {
  KSS *kss = nullptr;
  KSSPLAY *play = nullptr;
  uint32_t sampleRate = 44100;
  uint32_t song = 0;
  uint64_t renderedFrames = 0;
  // Channel masks are applied to the emulated devices directly, which
  // KSSPLAY_reset re-creates; keep a copy so seeks can re-apply them.
  uint32_t channelMask[KSS_DEVICE_MAX] = {0, 0, 0, 0};
  char mgsText[1024] = {0};
};

void applyChannelMasks(LkssContext *ctx) {
  for (int d = 0; d < KSS_DEVICE_MAX; d++) {
    KSSPLAY_set_channel_mask(ctx->play, (KSS_DEVICE)d, ctx->channelMask[d]);
  }
}

void unloadSong(LkssContext *ctx) {
  if (ctx->play) {
    KSSPLAY_delete(ctx->play);
    ctx->play = nullptr;
  }
  if (ctx->kss) {
    KSS_delete(ctx->kss);
    ctx->kss = nullptr;
  }
  ctx->renderedFrames = 0;
  ctx->mgsText[0] = '\0';
}

} // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE
LkssContext *lkss_init(uint32_t sampleRate) {
  LkssContext *ctx = new LkssContext();
  ctx->sampleRate = sampleRate;
  return ctx;
}

// Accepts any format KSS_bin2kss understands (KSS/MGS/BGM/OPX/MPK/MBM);
// the driver binaries (MGSDRV etc.) are compiled into libkss.
// Returns 0 on success.
EMSCRIPTEN_KEEPALIVE
int lkss_load_data(LkssContext *ctx, uint8_t *data, uint32_t size, const char *filename) {
  unloadSong(ctx);

  ctx->kss = KSS_bin2kss(data, size, filename);
  if (ctx->kss == nullptr) return 1;

  ctx->play = KSSPLAY_new(ctx->sampleRate, 2, 16);
  if (ctx->play == nullptr) {
    unloadSong(ctx);
    return 2;
  }
  KSSPLAY_set_master_volume(ctx->play, 48);
  KSSPLAY_set_data(ctx->play, ctx->kss);
  KSSPLAY_get_MGStext(ctx->play, ctx->mgsText, sizeof(ctx->mgsText));

  ctx->song = 0;
  KSSPLAY_reset(ctx->play, ctx->song, 0);
  applyChannelMasks(ctx);
  return 0;
}

EMSCRIPTEN_KEEPALIVE
void lkss_stop(LkssContext *ctx) {
  unloadSong(ctx);
}

// Renders `frames` stereo frames of interleaved int16 into buf.
EMSCRIPTEN_KEEPALIVE
int lkss_render(LkssContext *ctx, int16_t *buf, uint32_t frames) {
  if (ctx->play == nullptr) return 0;
  KSSPLAY_calc(ctx->play, buf, frames);
  ctx->renderedFrames += frames;
  return frames;
}

EMSCRIPTEN_KEEPALIVE
double lkss_get_position_ms(LkssContext *ctx) {
  return ctx->renderedFrames * 1000.0 / ctx->sampleRate;
}

EMSCRIPTEN_KEEPALIVE
void lkss_seek_ms(LkssContext *ctx, uint32_t ms) {
  if (ctx->play == nullptr) return;
  uint64_t targetFrames = (uint64_t)ms * ctx->sampleRate / 1000;
  if (targetFrames < ctx->renderedFrames) {
    KSSPLAY_reset(ctx->play, ctx->song, 0);
    ctx->renderedFrames = 0;
    applyChannelMasks(ctx);
  }
  while (ctx->renderedFrames < targetFrames) {
    uint32_t chunk = (uint32_t)(targetFrames - ctx->renderedFrames);
    if (chunk > 4096) chunk = 4096;
    KSSPLAY_calc_silent(ctx->play, chunk);
    ctx->renderedFrames += chunk;
  }
}

// 1 once the driver signals end of music (MGS without loop), else 0.
EMSCRIPTEN_KEEPALIVE
int lkss_get_stop_flag(LkssContext *ctx) {
  return ctx->play ? KSSPLAY_get_stop_flag(ctx->play) : 0;
}

EMSCRIPTEN_KEEPALIVE
int lkss_get_loop_count(LkssContext *ctx) {
  return ctx->play ? KSSPLAY_get_loop_count(ctx->play) : 0;
}

// Shift-JIS bytes; decode with TextDecoder('shift-jis') on the JS side.
EMSCRIPTEN_KEEPALIVE
const char *lkss_get_title(LkssContext *ctx) {
  return ctx->kss ? KSS_get_title(ctx->kss) : "";
}

// Full MGS text block (Shift-JIS), empty for non-MGS data.
EMSCRIPTEN_KEEPALIVE
const char *lkss_get_mgs_text(LkssContext *ctx) {
  return ctx->mgsText;
}

// Device usage flags from the KSS header, for building the voice-group UI.
EMSCRIPTEN_KEEPALIVE
int lkss_get_fmpac(LkssContext *ctx)     { return ctx->kss ? ctx->kss->fmpac : 0; }
EMSCRIPTEN_KEEPALIVE
int lkss_get_msx_audio(LkssContext *ctx) { return ctx->kss ? ctx->kss->msx_audio : 0; }
EMSCRIPTEN_KEEPALIVE
int lkss_get_sn76489(LkssContext *ctx)   { return ctx->kss ? ctx->kss->sn76489 : 0; }

// mask bit n = 1 mutes channel n of the given device
// (KSS_DEVICE_PSG=0, SCC=1, OPLL=2, OPL=3).
EMSCRIPTEN_KEEPALIVE
void lkss_set_channel_mask(LkssContext *ctx, uint32_t device, uint32_t mask) {
  if (device >= KSS_DEVICE_MAX) return;
  ctx->channelMask[device] = mask;
  if (ctx->play) KSSPLAY_set_channel_mask(ctx->play, (KSS_DEVICE)device, mask);
}

EMSCRIPTEN_KEEPALIVE
uint32_t lkss_get_channel_mask(LkssContext *ctx, uint32_t device) {
  return device < KSS_DEVICE_MAX ? ctx->channelMask[device] : 0;
}

} // extern "C"
