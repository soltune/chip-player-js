# Chip Player JS


## About this fork
Chip Player JS is web-based chip tune player written by Matt Montag.

This fork can play Sega Daytona USA correctly.
![Screen Shot](https://user-images.githubusercontent.com/38772866/99869968-9d002d00-2c12-11eb-9cb6-c5a4d247c239.png)
  
This fork is to share my fixes like;  
- Small bugfixes and improvements
    - [GME] fixed incorrect text encoding handling in the tags
    - [GME/nsf] supported `FDS write protect` for some tunes which use multi extend chips
    - [Font] added additional font to improve rendering Japanese text
        - the font is created by [MM of 自家製フォント工房](http://jikasei.me/font/kh-dotfont/) licensed by SIL Open Font License (with some modifications made by me)
- additional file formats support
    - **gbs, hes**
    - **vgm, vgz** ([webVGM](https://github.com/wothke/vgmplay-0.40.9), based on [VGMPlay](https://github.com/vgmrips/vgmplay))
        - Replaced GME to improve .vgm/vgz support
        - `yrw801.rom` must be located at `chip-player-js/public/instruments` to play OPL4(YMF278)
    - **s98** ([webS98](https://github.com/wothke/webS98/), based on [m_s98.kpi S98V3](http://www.vesta.dti.ne.jp/~tsato/soft_s98v3.html))
        - supports rhythm samples for OPNA
        - corrects volume balance for PC-9801
            - the player reduces the volume of PSG ch if there's `9801` in 'system' tag.
        - the following sound samples must be located at `chip-player-js/public/rhythm` before building (each filenames are case sensitive)
            - 2608_BD.WAV
            - 2608_HH.WAV 
            - 2608_RIM.WAV 
            - 2608_SD.WAV
            - 2608_TOM.WAV
            - 2608_TOP.WAV
    - **pmd** ([webMDX](https://github.com/wothke/webMDX), based on [pmdmini](https://github.com/mistydemeo/pmdmini))
        - supports rhythm samples for OPNA
        - supports ADPCM/PCM (.pps, .ppc, .p86, .pzi)
        - the following sound samples must be located at `chip-player-js/public/rhythm` before building (each filenames are case sensitive)
            - 2608_BD.WAV
            - 2608_HH.WAV 
            - 2608_RIM.WAV 
            - 2608_SD.WAV
            - 2608_TOM.WAV
            - 2608_TOP.WAV
    - **mdx** ([webMDX](https://github.com/wothke/webMDX), based on [mdxmini](https://github.com/mistydemeo/mdxmini))
        - supports ADPCM/PCM (.pdx)
    - **fmp** ([fmplayer](https://github.com/takamichih/fmplayer/))
        - supports rhythm rom for OPNA
        - supports ADPCM/PCM (.pvi, .pzi(for PPZ8))
        - `ym2608_adpcm_rom.bin` must be located at `chip-player-js/public/rhythm` before building (the filename is case sensitive)
    - **psf, minipsf** ([webPSX](https://github.com/wothke/webpsx))
    - **2sf, mini2sf** ([webDS](https://github.com/wothke/webDS))
    - **gsf** ([webGSF](https://github.com/wothke/webGSF))
- additional soundfonts
    - added two high quality piano soundfonts. if you'd like to listen piano solo this is good choice :)
        - place the following .sf2 at public/sondfonts folder to enable them
        - [Equinox Grand Pianos](http://www.mediafire.com/?12enyjv0ewj)
        - [Warren S. Trachtman - Steinway Model-C Soundfont](https://archive.org/details/WST25FStein_00Sep22.sf2)

**This player assumes each pcm files(.pzi, .pvi, .pdx ...) are in the same directory where the music files are.**

## Building Notes
Some static libraries must be built before launching `yarn run build-chip-core`.

```sh
$ source ~/src/emsdk/emsdk_env.sh

$ cd ./psflib
$ emmake make -f Emscripten.Makefile    # building libpsflib.a

$ cd ../lazyusf2
$ emmake make -f Emscripten.Makefile    # building liblazyusf.a

$ cd ../webGSF/emscripten
$ emmake make -f Emscripten.Makefile    # building libwebgsf.a

$ cd ../../
$ yarn run build-chip-core              # and finally build chip-core (chip-core.wasm)

```

---

![Screen Shot 2019-11-19 at 1 21 04 PM](https://user-images.githubusercontent.com/946117/69187458-80955600-0acf-11ea-9a1f-e090032dcb00.png)

Play online: [Chip Player JS](https://mmontag.github.io/chip-player-js). Feature requests? [Create an issue](https://github.com/mmontag/chip-player-js/issues/new).

### Features

- Support popular game console formats and tracker formats (not exhaustive)
- Advanced sound control (channel volume, panning, etc.) like [NotSoFatso](https://disch.zophar.net/notsofatso.php)'s stereo and bandlimiting controls
- Built-in online music library like [Chipmachine](http://sasq64.github.io/chipmachine/)
- Simple music management (at least the ability to save favorites) like Winamp/Spotify
- High-quality MIDI playback with JS wavetable synthesis
    * Bonus: user-selectable soundbanks
- Track sequencer with player controls and shuffle mode
- Media key support in Chrome
- High performance
   - Time-to-audio under 500 ms (i.e. https://mmontag.github.io/chip-player-js/?play=ModArchives/aryx.s3m)
   - Instant search results
   - CPU usage under 25% in most circumstances

## Development Notes

### Architecture

This project was bootstrapped with [Create React App](https://github.com/facebookincubator/create-react-app).

The player engines come from C/C++ libraries such as [game-music-emu](https://bitbucket.org/mpyne/game-music-emu/wiki/Home) and [libxmp](https://github.com/cmatsuoka/libxmp), compiled to JS with [Emscripten](https://kripken.github.io/emscripten-site). Where possible, these projects are incorporated using `git subtree`.

The C/C++ code is compiled by [scripts/build-chip-core.js](scripts/build-chip-core.js). This file also defines the list of exports that will be available to the JavaScript program. Components that go into this build are as follows:

* Manually selected cpp sources from game-music-emu.
* For libraries with their own build system like LibXMP and Fluidlite (detailed [below](#Building)):
    * Build a static library with Emscripten (i.e. using emconfigure, emmake)
    * Link the static library in build-chip-core.js
* **tinyplayer.c**: a super light MIDI file reader/player
* **showcqtbar.c**: a modified [FFMPEG plugin](https://github.com/mfcc64/html5-showcqtbar) providing lovely [constant Q](https://en.wikipedia.org/wiki/Constant-Q_transform#Comparison_with_the_Fourier_transform) spectrum analysis for the visualizer.

The music catalog is created by [scripts/build-catalog.js](scripts/build-catalog.js). **This script looks for a ./catalog folder to build a music index.** This location is untracked, so put a symlink here that points to your local music archive. TODO: Document the corresponding public location (`CATALOG_PREFIX`).

### Local Development Setup

Prerequisites: yarn, cmake, emsdk.

* Clone the repository. 
* Run `yarn install`.

In building the subprojects, we ultimately invoke `emmake make` instead of `make` to yield an object file that Emscripten can link to in the final build.

* Install the [Emscripten SDK (emsdk)](https://github.com/emscripten-core/emsdk).
* The build script in [package.json](package.json) looks for the emsdk in `~/src/emsdk`. Modify this line to match your emsdk install location if necessary:

  ```"build-chip-core": "source ~/src/emsdk/emsdk_env.sh; node scripts/build-chip-core.js",```


#### Creating Config File

Chip Player JS needs .env file on project root directly to get some settings.  
Create your file from sample.env:

```sh
cd chip-player-js/              # navigate to chip-player-js root
cp sample.env .env              # create .env file from sample
```

#### User Accounts and Saved Favorites Functionality

User account management is provided through Firebase Cloud Firestore. You must obtain your own [Google Firebase](https://console.firebase.google.com/) credentials and update [src/config/firebaseConfig.js](src/config/firebaseConfig.js) with these credentials. This file is not tracked. Without these credentials, Login/Favorites functionality won't work.

#### Subproject: libxmp-lite

Our goal is to produce **libxmp/libxmp-lite-stagedir/lib/libxmp-lite.a**.
Build libxmp (uses GNU make):

```sh
cd chip-player-js/libxmp/        # navigate to libxmp root
source ~/src/emsdk/emsdk_env.sh  # load the emscripten environment variables
autoconf
emconfigure ./configure
emmake make
```

Proceed to build libxmp-lite:

```sh
emmake make -f Makefile.lite     # this will have some errors, but they can be ignored
cd libxmp-lite-stagedir/
autoconf
emconfigure ./configure --enable-static --disable-shared
emmake make
```

#### Subproject: fluidlite

Our goal is to produce **fluidlite/build/libfluidlite.a**.
Build fluidlite (uses Cmake):

```sh
cd chip-player-js/fluidlite/     # navigate to fluidlite root
source ~/src/emsdk/emsdk_env.sh  # load the emscripten environment variables
mkdir build                      # create a build folder for Cmake output
cd build                         
emcmake cmake -DDISABLE_SF3=1 .. # Cmake will generate a Makefile by default
                                 # Problems here? Try deleting CMake cache files
emmake make fluidlite-static
```

Once these are in place we can build the parent project.
Our goal is to produce **public/chip-core.wasm**.

```sh
cd chip-player-js/
yarn run build-chip-core
```

This will use object files created in the previous steps and link them into chip-core.wasm.
If you change some C/C++ component of the subprojects, you'll need to redo this process.
Once we have chip-core.wasm, we can proceed to develop JavaScript interactively on localhost:

```sh
yarn start
```

Build the entire project:

```sh
yarn build
```

Or deploy to Github Pages:

```sh
yarn deploy
```

Deploy to Github Pages without rebuilding chip-core.wasm: 

```sh
yarn deploy-lite
```

### Related Projects and Resources

##### Chipmachine (Native)
http://sasq64.github.io/chipmachine/

Chipmachine is a multiplatform player supporting an enormous number of formats. Downloads music from an impressive variety of [external sources](https://github.com/sasq64/chipmachine/blob/master/lua/db.lua).
Most of these come from HTTP sources without CORS headers, not feasible for direct playback. 

##### Muki (JS)
http://muki.io

Muki, by [Tomás Pollak](https://github.com/tomas), is a polished JS player pulling together [Timidity (MIDI)](http://timidity.sourceforge.net/), [Munt (MT-32)](https://github.com/munt/munt), [libopenmpt](https://lib.openmpt.org/libopenmpt/) (instead of libxmp), game-music-emu, Wildmidi, Adplug, [Adlmidi (OPL3)](https://bisqwit.iki.fi/source/adlmidi.html), mdxmini, and [sc68](http://sc68.atari.org/apidoc/index.html). The music is a collection of PC game music.

##### Chiptune Blaster (JS)
https://github.com/wothke?tab=repositories

Jeurgen Wothke's collection of chipmusic projects ported to the web with Emscripten. He's beaten me to it, but with a rudimentary player and no built-in music collection. http://www.wothke.ch/blaster

##### SaltyGME (JS)
http://gamemusic.multimedia.cx/about

SaltyGME is a GME-based web player targeting Google Chrome NaCl. (Deprecated)

##### Cirrus Retro (JS)
https://github.com/multimediamike/cirrusretro-players

Cirrusretro is an updated version of SaltyGME compiled with Emscripten. Self-hosted file archive.

##### Audio Overload (Native)
https://www.bannister.org/software/ao.htm

Audio Overload is a multiplatform player supporting 33 formats.

##### JSGME (JS)
http://onakasuita.org/jsgme/

One of the first examples of GME compiled with Emscripten. Music collection is a self-hosted mirror of Famicompo entries.

##### MoseAmp (Native + JS)
https://github.com/osmose/moseamp

MoseAmp is a multiplatform player built with Electron. Some nice game console icons: https://www.deviantart.com/jaffacakelover/art/Pixel-Gaming-Machine-Icons-413704203

#### MIDI Stuff

The best modern option for playing MIDI is probably using a well-designed GM SoundFont bank with a good SoundFont 2.01 implementation like FluidSynth.

- SF2 Overview: https://schristiancollins.wordpress.com/2016/03/02/using-soundfonts-in-2016/
- Timidity compiled by Emscripten: https://bitmidi.com/
    * https://github.com/feross/timidity/commit/d1790eef24ff3b4067c536e45aa88c0863ad9676
    * Uses the 32 MB ["Old FreePats sound set"](http://freepats.zenvoid.org/SoundSets/general-midi.html)
- SoundFonts at MuseScore: https://musescore.org/en/handbook/soundfonts-and-sfz-files#list
- SoundFonts at Woolyss: https://woolyss.com/chipmusic-soundfonts.php
- MIDI file library: https://github.com/craigsapp/midifile
- FluidSynth Lite, supports SF3: https://github.com/divideconcept/FluidLite
- Compress SF2 to SF3: https://github.com/cognitone/sf2convert

##### SoundFont credits

Diverse and usable GM SoundFonts.

- GeneralUser SF2 sound bank: http://schristiancollins.com/generaluser.php
- The Ultimate Megadrive SoundFont: https://musical-artifacts.com/artifacts/24
- NTONYX SoundFont: http://ntonyx.com/sf_f.htm

##### Music archives

- The best pop music MIDI archive comes from [Colin Raffel's thesis work](https://colinraffel.com/projects/lmd/) on MIDI alignment. About 20,000 cleaned MIDI files
    * Colin Raffel. "Learning-Based Methods for Comparing Sequences, with Applications to Audio-to-MIDI Alignment and Matching". PhD Thesis, 2016.
- VGM Rips: https://vgmrips.net
- VGMusic.com: https://archive.org/details/vgmusic
- Sound Canvas MIDI Collection: https://archive.org/details/sound_canvas_midi_collection
- The Mod Archive: https://modarchive.org/
- Zophar's Domain: https://www.zophar.net/music
- OPL Archive: http://opl.wafflenet.com/
- Piano E-Competition MIDI: http://www.piano-e-competition.com/midiinstructions.asp
- Modland: https://modland.com/pub/modules/

#### Miscellaneous

[ISO 226 Equal loudness curves](https://github.com/IoSR-Surrey/MatlabToolbox/blob/master/%2Biosr/%2Bauditory/iso226.m)

## License

A word about licensing: chip-player-js represents the hard work of many individuals because it is built upon several open-source projects. Each of these projects carries their own license restrictions, and chip-player-js as a whole must adhere to the most restrictive licenses among these. Therefore, chip-player-js is *generally* licensed under [GPLv3](LICENSE). 

However, each subdirectory in this project *may* contain additional, more specific license info that pertains to files contained therein. For example, the code under [src/](src) is written by me and is more permissively [MIT licensed](src/LICENSE).
