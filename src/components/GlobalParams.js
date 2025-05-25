import {PureComponent} from 'react';
import React from 'react';

export default class GlobalParams extends PureComponent {
  render() {
    return (
      <div className='GlobalParams'>
        <label title="boost whole volume, this is useful for the songs with low level" >
        Volume Boost:{' '}
        <input
          type='range' defaultValue={this.props.boost}
          min='1.0' max='9.0' step='0.5'
          onInput={this.props.handleVolumeBoostChange}
          onChange={this.props.handleVolumeBoostChange} />{' '}
        {this.props.boost === 1.0 ? 'Off\u00A0' : 'x' + this.props.boost.toFixed(1)}
        </label>
        <br />
        <label title="select impulse model for reverb" >
        Reverb:{' '}
            <select onChange={this.props.handleReverbClick} defaultValue={this.props.reverb}>
                {this.props.reverbImpulseModels.map(group => {
                    return (<optgroup key={group.label} label={group.label}>
                        {group.items.map(option => {
                            return (<option key={option.value} value={option.value} >{option.label}</option>);
                        })}
                    </optgroup>);
                })}
            </select>
        </label>
        <br />
        <label title="adjust reverb level" >
        Reverb Level:{' '}
          <input
            type="range" min="0.0" max="2.0" step="0.1"
            defaultValue={this.props.reverbGain}
            onChange={this.props.handleReverbGainChange}
              /> {this.props.reverbGain.toFixed(1)}
        </label>
        <br />
        <label title="enable stereo simulation (recommended for mono sources only)" >
        Stereo Simulation: {' '}
          <input
            type="checkbox"
            checked={this.props.stereoEnabled}
            onChange={this.props.handleStereoClick}
          />
        </label>
        <br />
        <label title="change file list order to 'Title', 'File size', and 'Modified date'" >
        List Order:{' '}
        <label className='inline'><input onClick={this.props.handleOrderClick}
                                         type='radio'
                                         value='orderByTitle'
                                         defaultChecked={this.props.order === 'orderByTitle'}
                                         name='order'/>Title</label>
        <label className='inline'><input onClick={this.props.handleOrderClick}
                                         type='radio'
                                         value='orderBySize'
                                         defaultChecked={this.props.order === 'orderBySize'}
                                         name='order'/>Size</label>
        <label className='inline'><input onClick={this.props.handleOrderClick}
                                         type='radio'
                                         value='orderByDate'
                                         defaultChecked={this.props.order === 'orderByDate'}
                                         name='order'/>Date</label>
        </label>
      </div>
    );
  }
}
