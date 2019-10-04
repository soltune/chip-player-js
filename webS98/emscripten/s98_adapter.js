/*
 s98_adapter.js: Adapts S98 backend to generic WebAudio/ScriptProcessor player.
 
 version 1.0
 
 	Copyright (C) 2018 Juergen Wothke

 LICENSE
 
 This library is free software; you can redistribute it and/or modify it
 under the terms of the GNU General Public License as published by
 the Free Software Foundation; either version 2.1 of the License, or (at
 your option) any later version. This library is distributed in the hope
 that it will be useful, but WITHOUT ANY WARRANTY; without even the implied
 warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 GNU General Public License for more details.
 
 You should have received a copy of the GNU General Public
 License along with this library; if not, write to the Free Software
 Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301 USA
*/
S98BackendAdapter = (function(){ var $this = function () {
		$this.base.call(this, backend_S98.Module, 2);
		this._manualSetupComplete= true;
		this._undefined;
		this._currentPath;
		this._currentFile;
		this._chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
	
		if (!backend_S98.Module.notReady) {
			// in sync scenario the "onRuntimeInitialized" has already fired before execution gets here,
			// i.e. it has to be called explicitly here (in async scenario "onRuntimeInitialized" will trigger
			// the call directly)
			this.doOnAdapterReady();
		}				
	}; 
	// sample buffer contains 2-byte integer sample data (i.e. 
	// must be rescaled) of 2 interleaved channels
	extend(EmsHEAP16BackendAdapter, $this, {
		doOnAdapterReady: function() {
			// called when runtime is ready (e.g. asynchronously when WASM is loaded)
			// if FS needed to be setup of would be done here..
		},
		getAudioBuffer: function() {
			var ptr=  this.Module.ccall('emu_get_audio_buffer', 'number');			
			// make it a this.Module.HEAP16 pointer
			return ptr >> 1;	// 2 x 16 bit samples			
		},
		getAudioBufferLength: function() {
			var len= this.Module.ccall('emu_get_audio_buffer_length', 'number');
			return len;
		},
		computeAudioSamples: function() {
			return this.Module.ccall('emu_compute_audio_samples', 'number');
		},
		getMaxPlaybackPosition: function() { 
			return this.Module.ccall('emu_get_max_position', 'number');
		},
		getPlaybackPosition: function() {
			return this.Module.ccall('emu_get_current_position', 'number');
		},
		seekPlaybackPosition: function(pos) {
			this.Module.ccall('emu_seek_position', 'number', ['number'], [pos]);
		},		
		getPathAndFilename: function(filename) {
			var sp = filename.split('/');
			var fn = sp[sp.length-1];					
			var path= filename.substring(0, filename.lastIndexOf("/"));	
			if (path.lenght) path= path+"/";
			
			return [path, fn];
		},
		mapBackendFilename: function (name) {
			// "name" comes from the C++ side 
			var input= this.Module.Pointer_stringify(name);
			return input;
		},
		registerFileData: function(pathFilenameArray, data) {
			return this.registerEmscriptenFileData(pathFilenameArray, data);
		},
		loadMusicData: function(sampleRate, path, filename, data, options) {
			var buf = this.Module._malloc(data.length);
			this.Module.HEAPU8.set(data, buf);
			var ret = this.Module.ccall('emu_load_file', 'number', ['string', 'number', 'number'], [filename, buf, data.length]);
			this.Module._free(buf);

			if (ret == 0) {
				this.playerSampleRate = this.Module.ccall('emu_get_sample_rate', 'number');
				this.resetSampleRate(sampleRate, this.playerSampleRate);
				this._currentPath= path;
				this._currentFile= filename;
			} else {
				this._currentPath= this._undefined;
				this._currentFile= this._undefined;
			}
			return ret;			
		},
		evalTrackOptions: function(options) {
			if (typeof options.timeout != 'undefined') {
				ScriptNodePlayer.getInstance().setPlaybackTimeout(options.timeout*1000);
			} else {
				ScriptNodePlayer.getInstance().setPlaybackTimeout(-1);	// reset last songs setting
			}
			var id= (options && options.track) ? options.track : -1;	// by default do not set track		
			var boostVolume= (options && options.boostVolume) ? options.boostVolume : 0;		
			return this.Module.ccall('emu_set_subsong', 'number', ['number', 'number'], [id, boostVolume]);	// not used for S98..
		},				
		teardown: function() {
			this.Module.ccall('emu_teardown', 'number');	// just in case
		},
		toUnicode: function(str) {
			return str.split('').map(function (value, index, array) {
				var temp = value.charCodeAt(0).toString(16).padStart(4, '0');
				//var temp = value.charCodeAt(0).toString(16).toUpperCase();
				if (temp.length > 2) {
					return '\\u' + temp;
				}
				return value;
			}).join('');
		},
		getExtAsciiString: function(heapPtr) {
			// Pointer_stringify cannot be used here since UTF-8 parsing 
			// messes up original extASCII content
			var len=0;
			for (var j= 0; j<100; j++) {
				var b= this.Module.HEAP8[heapPtr+j] & 0xff;
				if (b == 0) { len= j; break; }
			}
			var array = new Uint8Array(len);    
			array[10] = 256;
			for (var j= 0; j<len; j++) {
				array[j]= this.Module.HEAP8[heapPtr+j] & 0xff;
			}
			var s= this.toUnicode(new String(array, "UTF-16BE"));
			console.log("string: ["+s.valueOf+"]");
			return s;
			
		},
		// base64 decoding util
		findChar: function(str, c) {
			for (var i= 0; i<str.length; i++) {
				if (str.charAt(i) == c) {
					return i;
				}
			}
			return -1;
		},
		alphanumeric: function(inputtxt) {
			var letterNumber = /^[0-9a-zA-Z]+$/;
			return inputtxt.match(letterNumber);
		},
		is_base64: function(c) {
		  return (this.alphanumeric(""+c) || (c == '+') || (c == '/'));
		}, 
		base64Decode: function(encoded) {
			var in_len= encoded.length;
			var i= j= in_= 0;
			var arr4= new Array(4);
			var arr3= new Array(3);
			var ret= "";
			var carry=-1;

			while (in_len-- && ( encoded.charAt(in_) != '=') && this.is_base64(encoded.charAt(in_))) {
				arr4[i++]= encoded.charAt(in_); in_++;
				if (i ==4) {
					for (i = 0; i <4; i++) {
						arr4[i] = this.findChar(this._chars, arr4[i]);
					}
					arr3[0] = ( arr4[0] << 2       ) + ((arr4[1] & 0x30) >> 4);
					arr3[1] = ((arr4[1] & 0xf) << 4) + ((arr4[2] & 0x3c) >> 2);
					arr3[2] = ((arr4[2] & 0x3) << 6) +   arr4[3];

					for (i = 0; (i < 3); i++) {
						var val= arr3[i];
						
						if (carry > -1) {	// only allow 16bit max
							val= (carry << 8) + val;
							carry= -1;
							ret += String.fromCharCode(val)	// UNICODE
							
						} else if (val > 127) {	// treat as unicode
							carry= val;
						} else {
							ret += String.fromCharCode(val);	// ASCII
						}
					}
					i = 0;
				}
			}
			if (i) {
				for (j = 0; j < i; j++) {
					arr4[j] = this.findChar(this._chars, arr4[j]);
				}
				arr3[0] = (arr4[0] << 2) + ((arr4[1] & 0x30) >> 4);
				arr3[1] = ((arr4[1] & 0xf) << 4) + ((arr4[2] & 0x3c) >> 2);

				for (j = 0; (j < i - 1); j++) { 
					var val= arr3[j];
					
					if (carry > -1) {	// only allow 16bit max
						val= (carry << 8) + val;
						carry= -1;
						ret += String.fromCharCode(val)	// UNICODE
						
					} else if (val > 127) {	// treat as unicode
						carry= val;
					} else {
						ret += String.fromCharCode(val);	// ASCII
					}
				}
			}
			return ret;
		},		
		getSongInfoMeta: function() {
			return {title: String,		// the fields named in the V3 file spec
					artist: String, 
					game: String, 
					year: String, 
					genre: String, 
					comment: String, 
					copyright: String, 
					s98by: String, 
					system: String, 
					};
		},
		
		updateSongInfo: function(filename, result) {
			var numAttr= 9;
			var ret = this.Module.ccall('emu_get_track_info', 'number');

			// the automatic string creation fucks up the UNICODE chars beyond 
			// recognition.. base64	wrapping is used to handle the strings properly	
			var array = this.Module.HEAP32.subarray(ret>>2, (ret>>2)+numAttr);
			result.title= this.base64Decode(this.Module.Pointer_stringify(array[0]));
			result.artist= this.base64Decode(this.Module.Pointer_stringify(array[1]));
			result.game= this.base64Decode(this.Module.Pointer_stringify(array[2]));
			result.year= this.base64Decode(this.Module.Pointer_stringify(array[3]));
			result.genre= this.base64Decode(this.Module.Pointer_stringify(array[4]));
			result.comment= this.base64Decode(this.Module.Pointer_stringify(array[5]));
			result.copyright= this.base64Decode(this.Module.Pointer_stringify(array[6]));
			result.s98by= this.base64Decode(this.Module.Pointer_stringify(array[7]));
			result.system= this.base64Decode(this.Module.Pointer_stringify(array[8]));
		}
	});	return $this; })();