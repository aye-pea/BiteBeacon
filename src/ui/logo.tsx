import React from 'react';
import { Image } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';

/** BiteBeacon mark: a shopping cart inside barcode-scan brackets (assets/logo.svg). */
export function CartLogo({ size = 32, color }: { size?: number; color: string }) {
  return <Svg accessible={false} width={size} height={size} viewBox="0 0 1254 1254">
    <G fill="none" stroke={color} strokeWidth={54} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M123 394V239a95 95 0 0 1 95-95h199" />
      <Path d="M837 144h198a95 95 0 0 1 95 95v155" />
      <Path d="M123 838v170a95 95 0 0 0 95 95h199" />
      <Path d="M837 1103h198a95 95 0 0 0 95-95V838" />
      <Path d="M267 392h113l111 432h364l113-323H408" />
    </G>
    <G fill={color}><Circle cx={547} cy={940} r={67} /><Circle cx={755} cy={940} r={67} /></G>
  </Svg>;
}

/** Top-left brand mark: the frosted-glass cart (assets/glass-logo.png, background cut out) in the Presentation theme,
 *  the flat cart everywhere else. */
export function BrandLogo({ size, color, glass }: { size: number; color: string; glass: boolean }) {
  if (!glass) return <CartLogo size={size} color={color} />;
  // The glass art is pale and detailed, so it gets a little more room than the flat mark.
  size = Math.round(size * 1.3);
  return <Image testID="glass-logo" accessible={false} source={require('../../assets/glass-logo.png')} style={{ width: size, height: size }} resizeMode="contain" />;
}
