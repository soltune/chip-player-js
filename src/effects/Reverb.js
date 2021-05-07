
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
                if (!response.ok) {
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
    {
        label: '-',
        items: [ {label: 'Disabled', value: ''}, ],
    },
    {
        label: 'Small Reflection',
        items: [
            {label: 'Basement', value: 'Basement.m4a'},
            {label: 'Koli National Park - Summer', value: 'ColiNatinalParkSummer2.m4a'},
            {label: 'Maes Howe', value: 'MaesHowe.m4a'},
        ],
    },
    {
        label: 'Middle Reflection',
        items: [
            {label: 'St Lawrence Church Molenbeek', value: 'SaintLawrenceChurchMolenbeekWersbeekBelgium.m4a'},
            {label: 'Stairway, University of York', value: 'StairwayUniversityOfYork.m4a'},
            {label: 'The Dixon Studio Theatre, University of York', value: 'DixonStudioTheatre4.m4a'}
        ],
    },
    {
        label: 'Large Reflection',
        items: [
            {label: 'St Andrew’s Church', value: 'StAndrewsChurch.m4a'},
            {label: 'Lady Chapel, St Albans Cathedral', value: 'LadyChapelStAlbansCathedral.m4a'},
            {label: 'Tyndall Bruce Monument', value: 'TyndallBruceMonument.m4a'},

        ],
    },
];
