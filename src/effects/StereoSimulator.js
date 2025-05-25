export class StereoSimulator {
    constructor (audioContext, sourceNode, destinationNode) {
        // Since sourceNode is also used outside this class, 
        // we access it through this.in to ensure we can only disconnect() elements within this class
        this.in = audioContext.createGain();
        sourceNode.connect(this.in);
        this.out = audioContext.createGain();
        this.out.connect(destinationNode);
        
        const pannerL = audioContext.createStereoPanner();
        const pannerR = audioContext.createStereoPanner();
        pannerL.pan.value = -0.12;
        pannerR.pan.value =  0.12;

        const merger = audioContext.createChannelMerger(2);
        merger.connect(this.out);

        this.lowEQ = audioContext.createBiquadFilter();
        this.lowEQ.type = 'lowshelf';
        this.lowEQ.frequency.value = 300;
        this.lowEQ.gain.value = 1.5;

        this.midEQ = audioContext.createBiquadFilter();
        this.midEQ.type = 'peaking';
        this.midEQ.frequency.value = 2000;
        this.midEQ.Q.value = 1.5;
        this.midEQ.gain.value = 3;

        this.highEQ = audioContext.createBiquadFilter();
        this.highEQ.type = 'highshelf';
        this.highEQ.frequency.value = 4000;
        this.highEQ.gain.value = 4;

        const delayL = audioContext.createDelay();
        const delayR = audioContext.createDelay();
        delayL.delayTime.value = 0.006;
        delayR.delayTime.value = 0.020;

        const midCrossfeedL = audioContext.createGain();
        const midCrossfeedR = audioContext.createGain();
        midCrossfeedL.gain.value = 0.22;
        midCrossfeedR.gain.value = 0.28;

        const highCrossfeedL = audioContext.createGain();
        const highCrossfeedR = audioContext.createGain();
        highCrossfeedL.gain.value = 0.12;
        highCrossfeedR.gain.value = 0.08;

        // While lowEQ can be connected through panners, stereoizing low frequencies tends to create an unpleasant feeling
        // this.lowEQ.connect(pannerL);
        // this.lowEQ.connect(pannerR);
        this.lowEQ.connect(merger, 0, 0);
        this.lowEQ.connect(merger, 0, 1);
        this.midEQ.connect(delayL);
        this.highEQ.connect(delayL);
        this.midEQ.connect(delayR);
        this.highEQ.connect(delayR);

        delayL.connect(pannerL);
        delayR.connect(pannerR);

        delayL.connect(midCrossfeedR);
        delayR.connect(midCrossfeedL);
        midCrossfeedR.connect(pannerR);
        midCrossfeedL.connect(pannerL);

        delayL.connect(highCrossfeedR);
        delayR.connect(highCrossfeedL);
        highCrossfeedR.connect(pannerR);
        highCrossfeedL.connect(pannerL);

        pannerL.connect(merger, 0, 0);
        pannerR.connect(merger, 0, 1);

        const lfo = audioContext.createOscillator();
        lfo.frequency.value = 0.17;
        const lfoGainR = audioContext.createGain();
        const lfoGainL = audioContext.createGain();

        lfoGainR.gain.value = 0.003;
        lfoGainL.gain.value = 0.002;
        lfo.connect(lfoGainR).connect(delayR.delayTime);
        lfo.connect(lfoGainL).connect(delayL.delayTime);
        lfo.start();

        this.disable();
    }

    enable () {
        this.in.disconnect();

        this.in.gain.value = 0.45;
        this.in.connect(this.lowEQ);
        this.in.connect(this.midEQ);
        this.in.connect(this.highEQ);
    }

    disable () {
        this.in.disconnect();
        this.in.connect(this.out);
        this.in.gain.value = 1.0;
    }

    get outputNode() {
        return this.out;
    }
}