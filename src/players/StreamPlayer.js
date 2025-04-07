import Player from "./Player.js";

const fileExtensions = ['mp3', 'ogg'];

export default class StreamPlayer extends Player {
  constructor(audioCtx, destNode, chipCore, bufferSize) {
    super(audioCtx, destNode, chipCore, bufferSize);
    this.initializeProperties();
    
    if (!audioCtx) {
      throw new Error('AudioContext is required');
    }

    this.mediaSource = new MediaSource();
    this.audioElement = new Audio();
    this.audioElement.crossOrigin = "anonymous";
    this.audioElement.src = URL.createObjectURL(this.mediaSource);
    
    try {
      this.sourceNode = this.audioCtx.createMediaElementSource(this.audioElement);
      if (destNode) {
        this.sourceNode.connect(destNode);
      } else {
        this.sourceNode.connect(this.audioCtx.destination);
      }
    } catch (error) {
      console.error('Failed to create MediaElementAudioSourceNode:', error);
      throw error;
    }

    this.setupBufferingListeners();
  }

  setupBufferingListeners() {
    this.audioElement.addEventListener('canplay', () => {
      this.emit('bufferingComplete');
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
    this.sampleRate = this.audioCtx.sampleRate;
    this.paused = true;
    this.fileExtensions = fileExtensions;
    this.tempo = 1.0;
    this.currentUrl = null;
    this.durationMs = 0;
    this.metadata = null;
    this.params = {};
  }

  loadData(data, filepath) {
    this.init();
    this.loadStream(data, filepath);
  }

  loadStream(url, filepath) {
    this.removeAllEventListeners();

    const cacheBuster = `?t=${Date.now()}`;
    const urlWithCacheBuster = url + cacheBuster;

    this.currentUrl = url;
    this.audioElement.src = urlWithCacheBuster;
    this.audioElement.load();

    const metadataHandler = () => {
      if (isNaN(this.audioElement.duration)) {
        console.error('[StreamPlayer] Invalid duration detected');
        this.emit('playerError', 'Invalid audio duration');
        return;
      }

      this.durationMs = this.audioElement.duration * 1000;
      this.metadata = { title: filepath.split('/').pop() };
      this.paused = false;

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
      this.isStopped = false;
    };

    const endedHandler = () => {
      this.isPaused = true;
      this.isStopped = true;

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
      this.emit('playerError', 'Failed to seek');
    }
  }

  getTempo() {
    return 1.0;
  }

  stop() {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
      this.paused = true;
    }
    
    this.emit('playerStateUpdate', {
      ...this.getBasePlayerState(),
      isStopped: true,
      metadata: this.metadata,
    });
  }

  resume() {
    if (this.audioElement) {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      this.audioElement.play();
      this.paused = false;
    }
  }

  suspend() {
    if (this.audioElement) {
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
