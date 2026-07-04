import Player from "./Player.js";
import { parseID3 } from "./id3Parser.js";

const fileExtensions = ['mp3', 'ogg'];

export default class StreamPlayer extends Player {
  constructor(...args) {
    super(...args);
    this.initializeProperties();

    this.playerKey = 'stream';
    this.name = 'Stream Player';

    this.audioElement = new Audio();
    this.audioElement.crossOrigin = "anonymous";
    this.audioElement.src = '';

    // Created lazily in _ensureSourceNode(): the AudioContext is only reachable
    // after App assigns this.audioNode (players no longer receive audioCtx).
    this.sourceNode = null;

    this.setupBufferingListeners();
  }

  // The shared AudioContext, reachable once App assigns this.audioNode.
  get audioCtx() {
    return this.audioNode ? this.audioNode.context : null;
  }

  _ensureSourceNode() {
    if (this.sourceNode) return;
    if (!this.audioNode) {
      throw new Error('StreamPlayer requires audioNode to be assigned before loading');
    }
    this.sourceNode = this.audioCtx.createMediaElementSource(this.audioElement);
    // destinationNode (assigned by App) keeps streams subject to master volume/effects.
    this.sourceNode.connect(this.destinationNode || this.audioCtx.destination);
    // vizNode (assigned by App) feeds the Visualizer's analyser, which otherwise
    // only sees the ScriptProcessorNode that stream audio bypasses.
    if (this.vizNode) {
      this.sourceNode.connect(this.vizNode);
    }
  }

  processAudioInner(channels) {
    // Intentionally empty: stream audio flows through the MediaElementSource,
    // not the shared ScriptProcessorNode.
  }

  setupBufferingListeners() {
    this.audioElement.addEventListener('canplay', () => {
      this.emit('bufferingComplete');
      // Guard against stale canplay events that arrive after suspend() was
      // called. this.paused alone cannot be used here because stalled also
      // sets it to true (for UI), yet we must resume after buffering.
      // this._intentionalPause is only set by suspend() and cleared by
      // resume() or when loadedmetadata fires for a new song, so it
      // reliably reflects user/system intent rather than buffering state.
      if (this._intentionalPause) return;
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      this.audioElement.play().then(() => {
        this.paused = false;
      }).catch(error => {
        console.error('Failed to start playback:', error);
        this.emit('playerError', 'Failed to start playback');
      });
    });

    this.audioElement.addEventListener('playing', () => {
      this.paused = false;
    });

    this.audioElement.addEventListener('stalled', () => {
      this.paused = true;
      this.audioElement.pause();
      this.emit('bufferingStart');
    });

    this.audioElement.addEventListener('suspend', () => {
      // this.paused = true;
      // this.audioElement.pause();
    });
  }

  initializeProperties() {
    this.paused = true;
    this._intentionalPause = false;
    this.fileExtensions = fileExtensions;
    this.tempo = 1.0;
    this.currentUrl = null;
    this.durationMs = 0;
    this.metadata = null;
    this.params = {};
  }

  loadData(data, filepath, persistedSettings = {}) {
    this._ensureSourceNode();
    this.init();
    this.loadStream(data, filepath);
  }

  loadStream(url, filepath) {
    this.removeAllEventListeners();

    this.currentUrl = url;
    // Loading counts as "not stopped": anything emitted before loadedmetadata
    // (e.g. the parallel ID3 fetch) must not carry isStopped=true, or the
    // Sequencer treats the song as ended and advances through the whole context.
    this.stopped = false;
    // Set filename-based metadata immediately as a fallback.
    // _fetchID3Metadata will overwrite this with tag data when the fetch completes.
    this.metadata = { title: filepath.split('/').pop() };

    this.audioElement.src = url;
    this.audioElement.load();

    // Kick off ID3 tag fetch in parallel with audio loading
    this._fetchID3Metadata(url);

    const metadataHandler = () => {
      if (isNaN(this.audioElement.duration)) {
        console.error('[StreamPlayer] Invalid duration detected');
        this.emit('playerError', 'Invalid audio duration');
        return;
      }

      // The user stopped playback while this song was still loading;
      // don't resurrect it when the (now stale) metadata arrives.
      if (this._intentionalPause && this.stopped) return;

      this.durationMs = this.audioElement.duration * 1000;
      // this.metadata is already initialized above; don't overwrite it here
      // so that ID3 tags fetched in parallel are not lost.
      this.paused = false;
      this.stopped = false;
      this._intentionalPause = false; // new song is ready; allow canplay to play

      if (this.audioElement.readyState >= 2) { // HAVE_CURRENT_DATA
        this.audioElement.play().catch(error => {
          console.error('[StreamPlayer] Failed to start playback:', error);
          this.emit('playerError', 'Failed to start playback');
        });
      }

      this.emit('playerStateUpdate', {
        ...this.getBasePlayerState(),
        isStopped: false,
        metadata: this.metadata,
      });
    };

    const playHandler = () => {
      this.stopped = false;
    };

    const endedHandler = () => {
      this.paused = true;
      this.stopped = true;

      this.audioElement.pause();
      this.audioElement.currentTime = 0;
      this.audioElement.src = '';
      this.audioElement.load();

      this.emit('playerStateUpdate', {
        ...this.getBasePlayerState(),
        isStopped: true,
        metadata: this.metadata,
      });
    };

    this.audioElement.addEventListener('loadedmetadata', metadataHandler);
    this.audioElement.addEventListener('play', playHandler);
    this.audioElement.addEventListener('ended', endedHandler);

    this.currentEventListeners = {
      loadedmetadata: metadataHandler,
      play: playHandler,
      ended: endedHandler
    };
  }

  async _fetchID3Metadata(url) {
    try {
      const res = await fetch(url, { headers: { Range: 'bytes=0-65535' } });
      // Accept both 200 (server ignores Range) and 206 (Partial Content)
      if (!res.ok) return;
      const buffer = await res.arrayBuffer();
      const tags = parseID3(buffer);
      if (!tags) return;

      // Guard against stale responses arriving after the user has moved to a different song
      if (this.currentUrl !== url) return;

      this.metadata = {
        ...this.metadata,
        title:  tags.title  || this.metadata?.title,
        artist: tags.artist || undefined,
        album:  tags.album  || undefined,
        track:  tags.track  || undefined,
      };

      // Metadata-only update: never emit while stopped. getBasePlayerState()
      // reports isStopped from this.stopped, and this fetch usually finishes
      // before loadedmetadata — emitting isStopped=true here makes the
      // Sequencer skip to the next song (and chain through entire directories
      // of streamed files). The merged tags are still delivered by the
      // loadedmetadata emit or the next state update.
      if (this.stopped) return;

      this.emit('playerStateUpdate', {
        ...this.getBasePlayerState(),
        metadata: this.metadata,
      });
    } catch (e) {
      // Network error or parse failure — silently fall back to filename-based metadata
    }
  }

  removeAllEventListeners() {
    if (this.currentEventListeners) {
      Object.entries(this.currentEventListeners).forEach(([event, handler]) => {
        this.audioElement.removeEventListener(event, handler);
      });
      this.currentEventListeners = null;
    }
  }

  init() {
    this.durationMs = 0;
    this.currentUrl = null;
    this.metadata = null;
    this.removeAllEventListeners();
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
      this.audioElement.src = '';
    }
  }

  getPositionMs() {
    if (!this.audioElement) return 0;
    return Math.floor(this.audioElement.currentTime * 1000);
  }

  getDurationMs() {
    if (!this.audioElement || isNaN(this.audioElement.duration)) return 0;
    return Math.floor(this.audioElement.duration * 1000);
  }

  getMetadata() {
    return this.metadata;
  }

  getParameter(id) {
    return this.params[id];
  }

  getParamDefs() {
    return [];
  }

  setParameter(id, value) {
    this.params[id] = value;
  }

  isPaused() {
    return this.paused;
  }

  isPlaying() {
    return !this.paused && this.getPositionMs() < this.getDurationMs();
  }

  setTempo(val) {}

  setFadeout(startMs) {}

  getVoiceName(index) {
    return "";
  }

  getNumVoices() {
    return 0;
  }

  setVoiceMask(voices) {}

  getVoiceMask() {
    return [];
  }

  seekMs(positionMs) {
    if (!this.audioElement) return;

    try {
      const seekTime = positionMs / 1000;
      const clampedTime = Math.max(0, Math.min(seekTime, this.audioElement.duration));
      this.audioElement.currentTime = clampedTime;
      
      this.emit('playerStateUpdate', {
        ...this.getBasePlayerState(),
        positionMs: positionMs,
        metadata: this.metadata,
      });
    } catch (error) {
      console.error('Failed to seek:', error);
      //this.emit('playerError', 'Failed to seek');
    }
  }

  getTempo() {
    return 1.0;
  }

  stop() {
    if (this.audioElement) {
      this._intentionalPause = true; // block stale canplay/loadedmetadata from restarting audio
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
      this.paused = true;
      this.stopped = true;
    }
    
    this.emit('playerStateUpdate', {
      ...this.getBasePlayerState(),
      isStopped: true,
      metadata: this.metadata,
    });
  }

  resume() {
    if (this.audioElement) {
      this._intentionalPause = false;
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      this.audioElement.play();
      this.paused = false;
    }
  }

  suspend() {
    if (this.audioElement) {
      this._intentionalPause = true;
      this.audioElement.pause();
      this.paused = true;
    }
  }

  togglePause() {
    if (this.audioElement) {
      if (this.paused) {
        this.resume();
      } else {
        this.suspend();
      }
    }
    return this.paused;
  }

  isStreaming() {
    return true;
  }
}
