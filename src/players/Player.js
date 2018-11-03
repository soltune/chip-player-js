//
// Player can be viewed as a state machine with
// 3 states (playing, paused, stopped) and 5 transitions
// (open, pause, unpause, seek, close).
// If the player has reached end of the song,
// it is in the terminal "stopped" state and is
// no longer playable:
//                         ╭– (seek) –╮
//                         ^          v
//  ┌─ ─ ─ ─ ─┐         ┌─────────────────┐            ┌─────────┐
//  │ stopped │–(open)–>│     playing     │––(stop)–––>│ stopped │
//  └ ─ ─ ─ ─ ┘         └─────────────────┘            └─────────┘
//                        | ┌────────┐ ^
//                (pause) ╰>│ paused │–╯ (unpause)
//                          └────────┘
//
// In the "open" transition, the audioNode is connected.
// In the "stop" transition, it is disconnected.
// "stopped" is synonymous with closed/empty.
//
export default class Player {
  constructor(audioCtx, destNode, chipCore, onPlayerStateUpdate) {
    this._outerAudioProcess = this._outerAudioProcess.bind(this);

    this.paused = false;
    this.fileExtensions = [];
    this.metadata = {};
    this.audioCtx = audioCtx;
    this.destinationNode = destNode;
    this.onPlayerStateUpdate = onPlayerStateUpdate;
    this.bufferSize = 2048;
    this.audioProcess = null;
    this.audioNode = this.audioCtx.createScriptProcessor(this.bufferSize, 2, 2);
    this.audioNode.onaudioprocess = this._outerAudioProcess;
    this.debug = window.location.search.indexOf('debug=true') !== -1;
    this.timeCount = 0;
    this.renderTime = 0;
    this.perfLoggingInterval = 100;
  }

  togglePause() {
    this.paused = !this.paused;
    return this.paused;
  }

  isPaused() {
    return this.paused;
  }

  resume() {
    this.paused = false;
  }

  canPlay(fileExtension) {
    return this.fileExtensions.indexOf(fileExtension.toLowerCase()) !== -1;
  }

  loadData(data, filename) {
    throw Error('Player.loadData() must be implemented.');
  }

  stop() {
    throw Error('Player.stop() must be implemented.');
  }

  restart() {
    throw Error('Player.restart() must be implemented.');
  }

  isPlaying() {
    throw Error('Player.isPlaying() must be implemented.');
  }

  setTempo() {
    console.warn('Player.setTempo() not implemented for this player.');
  }

  setVoices() {
    console.warn('Player.setVoices() not implemented for this player.');
  }

  setFadeout(startMs) {
    console.warn('Player.setFadeout() not implemented for this player.');
  }

  getVoiceName(index) {
    console.warn('Player.getVoiceName() not implemented for this player.');
  }

  getNumVoices() {
    return 0;
  }

  getNumSubtunes() {
    return 1;
  }

  getSubtune() {
    return 0;
  }

  getMetadata() {
    return {
      title: null,
      author: null,
    }
  }

  getParameters() {
    return [];
  }

  connect() {
    if (!this.audioProcess) {
      throw Error('Player.audioProcess has not been set.');
    }
    this.audioNode.connect(this.destinationNode);
  }

  disconnect() {
    this.audioNode.disconnect();
  }

  setAudioProcess(fn) {
    if (typeof fn !== 'function') {
      throw Error('AudioProcess must be a function.');
    }
    this.audioProcess = fn;
  }

  _outerAudioProcess(event) {
    const start = performance.now();
    this.audioProcess(event);
    const end = performance.now();

    if (this.debug) {
      this.renderTime += end - start;
      this.timeCount++;
      if (this.timeCount >= this.perfLoggingInterval) {
        const cost = this.renderTime / this.timeCount;
        const budget = 1000 * this.bufferSize / this.audioCtx.sampleRate;
        console.log(
          '[%s] %s ms to render %d frames (%s ms) (%s% utilization)',
          this.constructor.name,
          cost.toFixed(2),
          this.bufferSize,
          budget.toFixed(1),
          (100 * cost / budget).toFixed(1),
        );
        this.renderTime = 0.0;
        this.timeCount = 0;
      }
    }
  }

  static muteAudioDuringCall(audioNode, fn) {
    if (audioNode) {
      const audioprocess = audioNode.onaudioprocess;
      // Workaround to eliminate stuttering:
      // Temporarily swap the audio process callback, and do the
      // expensive operation only after buffer is filled with silence
      audioNode.onaudioprocess = function(e) {
        for (let i = 0; i < e.outputBuffer.numberOfChannels; i++) {
          e.outputBuffer.getChannelData(i).fill(0);
        }
        fn();
        audioNode.onaudioprocess = audioprocess;
      };
    } else {
      fn();
    }
  }

  static metadataFromFilepath(filepath) {
    // Guess metadata from path/filename for MIDI files.
    // Assumes structure:  /Game MIDI/{game}/**/{title}
    //             ...or:  /MIDI/{artist}/**/{title}
    const parts = filepath.split('/');
    const metadata = {};
    metadata.title  = parts.pop();
    metadata.system = parts.shift();
    if(metadata.system === 'Game MIDI') {
      metadata.game = parts.shift();
    } else {
      metadata.artist = parts.shift();
    }
    return metadata;
  }
}