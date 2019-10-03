# webS98

Copyright (C) 2018 Juergen Wothke

This is a JavaScript/WebAudio plugin of a "m_s98.kpi v1.0r8 by Mamiya" used to emulate music from .s98, .vgm, 
.vgz, .cym, .mym & .x1f files. This plugin is designed to work with my generic WebAudio ScriptProcessor music 
player (see separate project). The older source code that is used here unfortunately does not handle V3 of the
S98 format yet. (I'd appreciate if somebody could provide me with a more recent version.)

A live demo of this program can be found here: http://www.wothke.ch/webS98/


## Credits
The project is based on: http://www.vesta.dti.ne.jp/~tsato/soft_s98v3.html (by Mamiya, et al.) including:
FM Sound Generator rel.008 (C) cisc 1998-2003. 
emu2413 by Mitsutaka Okazaki 2001-2004
zlib (C) 1995-2005 Jean-loup Gailly and Mark Adler

## Project

All the "Web" specific additions (i.e. the whole point of this project) are contained in the 
"emscripten" subfolder. 


## Howto build

You'll need Emscripten (http://kripken.github.io/emscripten-site/docs/getting_started/downloads.html). The make script 
is designed for use of emscripten version 1.37.29 (unless you want to create WebAssembly output, older versions might 
also still work).

The below instructions assume that the webS98 project folder has been moved into the main emscripten 
installation folder (maybe not necessary) and that a command prompt has been opened within the 
project's "emscripten" sub-folder, and that the Emscripten environment vars have been previously 
set (run emsdk_env.bat).

The Web version is then built using the makeEmscripten.bat that can be found in this folder. The 
script will compile directly into the "emscripten/htdocs" example web folder, were it will create 
the backend_s98.js library. (To create a clean-build you have to delete any previously built libs in the 
'built' sub-folder!) The content of the "htdocs" can be tested by first copying it into some 
document folder of a web server. 


## Depencencies

The current version requires version 1.03 (older versions will not
support WebAssembly or may have problems skipping playlist entries) 
of my https://github.com/wothke/webaudio-player.

This project comes without any music files, so you'll also have to get your own and place them
in the htdocs/music folder (you can configure them in the 'songs' list in index.html).


## License

NOT GPL: The code builds on FM Sound Generator with OPN/OPM interface Copyright (C) by cisc 1998, 2003.
As the author of FM Sound Generator states, this is free software but for any commercial application
the prior consent of the author is explicitly required. 

The same licence is here extended to any of the add-ons that are part of this project.

