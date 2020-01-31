import {PureComponent} from 'react';
import React from 'react';

export default class GlobalParams extends PureComponent {
  render() {
    return (
      <div className='GlobalParams'>
        Volume Level Boost:{' '}
        <input
          type='range' value={this.props.boost}
          min='0.0' max='9.0' step='0.1'
          onInput={this.props.handleVolumeBoostChange}
          onChange={this.props.handleVolumeBoostChange} />{' '}
        {this.props.boost === 1.0 ? 'Off\u00A0' : 'x' + this.props.boost.toFixed(1)}<br/>
        NSF Duration:{' '}
        <input
          type='range' value={this.props.nsfDuration}
          min='60' max='600' step='10'
          onInput={this.props.handleNsfDurationChange}
          onChange={this.props.handleNsfDurationChange} />{' '}
        {this.props.nsfDuration} secs<br/>
        (Also applied to GBS/HES/KSS)
      </div>
    );
  }
}
