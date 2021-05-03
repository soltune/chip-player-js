
export class ImpulseResponseReverb {
    constructor (audioContext, sourceNode, destinationNode) {
        this.audioContext = audioContext;
        this.convolver = null;
        this.bridge = this.audioContext.createGain();
        this.gainNode = this.audioContext.createGain();
        this.gainNode.value = 1;
        this.sourceNode = sourceNode;
        this.destinationNode = destinationNode;

        this.sourceNode.connect(this.bridge);
        this.gainNode.connect(this.destinationNode);
    }

    loadModel(irUrl) {
        fetch(irUrl, {method: 'GET',})
            .then(response => {
                if (!response.ok) { // 404, 500.. missing pcm can be ignored for playing
                    throw Error(response.statusText);
                }
                return response.arrayBuffer();
            })
            .then(arrayBuffer => {
                this.audioContext.decodeAudioData(arrayBuffer, audioBuffer => {
                    this.dispose();

                    this.convolver = this.audioContext.createConvolver();
                    this.convolver.buffer = audioBuffer;

                    this.bridge.connect(this.convolver);
                    this.convolver.connect(this.gainNode);

                }, error => {
                    throw Error('decodeAudioData error');
                });
            })
            .catch(e => {});
    }

    dispose() {
        this.bridge.disconnect();
        if (this.convolver) {
            this.convolver.disconnect();
            this.convolver = null;
        }
    }

    set gain(value) {
        this.gainNode.value = value;
    }
}

export const IMPULSE_MODELS = [
    {label: 'Disabled', value: ''},
    {label: 'KinoullAisle', value: 'KinoullAisle.m4a'},
    {label: 'Maes-Howe', value: 'MaesHowe.m4a'},
    {label: 'Basement', value: 'Basement.m4a'},
    {label: 'StairwayUniversityOfYork.m4a', value: 'StairwayUniversityOfYork.m4a'}

];