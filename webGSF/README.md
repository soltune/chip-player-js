# webGSF

Copyright (C) 2018 Juergen Wothke

This is a JavaScript/WebAudio plugin of kode54's "GSF Decoder" (based on mGBA). This 
plugin is designed to work with my generic WebAudio ScriptProcessor music player (see separate project). 

It allows to play "Gameboy Sound Format" music (.GSF/.MINIGSF2 files).

A live demo of this program can be found here: http://www.wothke.ch/webGSF/


## Credits
The real work is in the mGBA Game Boy Advance Emulator http://mgba.io/
and in whatever changes kode54 had to apply to use it as a music player 
http://www.foobar2000.org/components/view/foo_input_gsf. I just added a bit of glue 
so the code can now also be used on the Web.
The project is based on: 


## Project
It includes most of the original "USF Decoder" (see gsfplug.cpp) and "mGBA" (see mgba folder) 
code. Subfolders that are completely irrelevant here have been removed (but there are still 
heaps of unused files left).

All the "Web" specific additions (i.e. the whole point of this project) are contained in the 
"emscripten" subfolder. ) The main interface between the JavaScript/WebAudio world and the 
original C code is the adapter.c file. 

Some patches were necessary within the original codebase (these can be located by looking for EMSCRIPTEN if-defs):
The problem of that "portable" mGBA codebase is that it has non-portable
unaligned data access burried within its code (which I fixed as much as needed to 
make it run with EMSCRIPTEN..) For a project that states the goal of being "portable"
that is rather riddiculous..


## Howto build

You'll need Emscripten (http://kripken.github.io/emscripten-site/docs/getting_started/downloads.html). The make script 
is designed for use of emscripten version 1.37.29 (unless you want to create WebAssembly output, older versions might 
also still work).

The below instructions assume that the webGSF project folder has been moved into the main emscripten 
installation folder (maybe not necessary) and that a command prompt has been opened within the 
project's "emscripten" sub-folder, and that the Emscripten environment vars have been previously 
set (run emsdk_env.bat).

The Web version is then built using the makeEmscripten.bat that can be found in this folder. The 
script will compile directly into the "emscripten/htdocs" example web folder, were it will create 
the backend_gsf.js library. (To create a clean-build you have to delete any previously built libs in the 
'built' sub-folder!) The content of the "htdocs" can be tested by first copying it into some 
document folder of a web server. 


## Depencencies

The current version requires version 1.03 (older versions will not
support WebAssembly and the remote loading of music files) of my https://github.com/wothke/webaudio-player.

This project comes without any music files, so you'll also have to get your own and place them
in the htdocs/music folder (you can configure them in the 'songs' list in index.html).


## License

This project is distributed under the Mozilla Public License version 2.0 (like the underlyinf mGBA). A copy 
of the license is available in the distributed LICENSE file.
