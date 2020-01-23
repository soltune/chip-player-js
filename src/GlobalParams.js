import {PureComponent} from 'react';
import React from 'react';

export default class GlobalParams extends PureComponent {
  constructor(props) {
    super(props);
  }

  render() {
    return (
      <div className='GlobalParams'>
        Volume Boost:{' '}
        <input
          type='range' value={this.props.boost}
          min='1.0' max='3.0' step='0.2'
          onInput={this.props.handleVolumeBoostChange}
          onChange={this.props.handleVolumeBoostChange} />{' '}
        {this.props.boost <= 1.0 ? 'Disabled' : 'x' + this.props.boost.toFixed(1)}<br/>

      </div>
    );
  }
}
