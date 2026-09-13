import React from 'react';
import { Composition } from 'remotion';
import { Aetheris, AETHERIS_DURATION } from './Aetheris';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Aetheris"
    component={Aetheris}
    durationInFrames={AETHERIS_DURATION}
    fps={30}
    width={1920}
    height={1080}
  />
);
