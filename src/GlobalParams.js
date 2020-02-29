import {PureComponent} from 'react';
import React from 'react';

export default class GlobalParams extends PureComponent {
  render() {
    return (
      <div className='GlobalParams'>
        Volume Level Boost:{' '}
        <input
          type='range' value={this.props.boost}
          min='0.0' max='9.0' step='0.2'
          onInput={this.props.handleVolumeBoostChange}
          onChange={this.props.handleVolumeBoostChange} />{' '}
        {this.props.boost === 1.0 ? 'Off\u00A0' : 'x' + this.props.boost.toFixed(1)}
      </div>
    );
  }
}
