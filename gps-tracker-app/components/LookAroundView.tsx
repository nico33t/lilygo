import React from 'react';
import { requireNativeComponent, ViewProps, Platform } from 'react-native';

interface LookAroundViewProps extends ViewProps {
  coordinate: {
    latitude: number;
    longitude: number;
  };
}

/**
 * Apple Look Around View (iOS 16+)
 * On Android or older iOS versions, this will render nothing.
 */
const NativeLookAroundView = Platform.OS === 'ios' 
  ? requireNativeComponent<LookAroundViewProps>('LookAroundView')
  : null;

export const LookAroundView: React.FC<LookAroundViewProps> = (props) => {
  if (Platform.OS !== 'ios' || !NativeLookAroundView) {
    return null;
  }
  return <NativeLookAroundView {...props} />;
};

export default LookAroundView;
