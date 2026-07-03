import React, { memo, useCallback, useContext } from 'react';
import PlayerParams from './PlayerParams';
import GlobalParams from './GlobalParams';
import { IMPULSE_MODELS } from '../effects/Reverb';
import { UserContext } from "./UserProvider";

const themes = [
  {
    value: 'msdos',
    label: 'MS-DOS',
  },
  {
    value: 'winamp',
    label: 'Winamp',
  }
];

function Settings(props) {
  const {
    ejected,
    tempo,
    voiceMask,
    voiceNames,
    voiceGroups,
    onVoiceMaskChange,
    onTempoChange,
    paramDefs,
    paramValues,
    onParamChange,
    onPinParam,
    persistedSettings,
    sequencer,
    // Fork: reverb / volume boost / list order controls
    boost,
    reverb,
    reverbGain,
    order,
    handleVolumeBoostChange,
    handleReverbClick,
    handleReverbGainChange,
    handleOrderClick,
  } = props;

  const { settings, updateSettings } = useContext(UserContext);
  const theme = settings?.theme;

  const handleThemeChange = useCallback((e) => {
    updateSettings({ theme: e.target.value });
  }, [updateSettings]);

  return (
    <div className='Settings'>
      <h3>{sequencer?.getPlayer()?.name || 'Player'} Settings</h3>
      {sequencer?.getPlayer() ?
        <PlayerParams
          ejected={ejected}
          tempo={tempo}
          voiceMask={voiceMask}
          voiceNames={voiceNames}
          voiceGroups={voiceGroups}
          onTempoChange={onTempoChange}
          onVoiceMaskChange={onVoiceMaskChange}
          paramDefs={paramDefs}
          paramValues={paramValues}
          onParamChange={onParamChange}
          onPinParam={onPinParam}
          persistedSettings={persistedSettings}
          playerKey={sequencer?.getPlayer()?.playerKey}
        />
        :
        <div>(No active player)</div>}
      <h3>Global Settings</h3>
      <span className='PlayerParams-param'>
        <label htmlFor='theme' className="PlayerParams-label">
          Theme:{' '}
        </label>
        <select
          id='theme'
          onChange={handleThemeChange}
          value={theme}>
          {themes.map(option =>
            <option key={option.value} value={option.value}>{option.label}</option>
          )}
        </select>
      </span>
      <GlobalParams
        boost={boost}
        order={order}
        reverb={reverb}
        reverbGain={reverbGain}
        reverbImpulseModels={IMPULSE_MODELS}
        handleVolumeBoostChange={handleVolumeBoostChange}
        handleReverbClick={handleReverbClick}
        handleReverbGainChange={handleReverbGainChange}
        handleOrderClick={handleOrderClick}
      />
    </div>
  );
}

export default memo(Settings);
