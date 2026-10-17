import React from 'react';
import { Image, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';

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

/** Top-left brand mark: the frosted-glass cart (assets/glass-logo.png, background cut out) in Presentation and Apple,
 *  a darker copy whose glass reflects the deep violet surroundings in Partiful (assets/glass-logo-partiful.png),
 *  and the flat cart everywhere else. */
export function BrandLogo({ size, color, glass, deep = false }: { size: number; color: string; glass: boolean; deep?: boolean }) {
  if (!glass) return <CartLogo size={size} color={color} />;
  // The glass art is cropped to its edges while the flat mark has padding inside its box, so draw it at 85% in the
  // same-size box: the brackets then line up with the green cart's.
  return <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <Image testID="glass-logo" accessible={false} source={deep ? require('../../assets/glass-logo-partiful.png') : require('../../assets/glass-logo.png')} style={{ width: Math.round(size * 0.85), height: Math.round(size * 0.85) }} resizeMode="contain" />
  </View>;
}

/** Partiful's sidebar selector: the two left corner brackets of the Partiful glass logo, periwinkle at the top fading to violet,
 *  with a thin highlight down the inside like the logo's glass. */
export function SelectorBracket({ height = 41 }: { height?: number }) {
  const id = `bracket-${React.useId().replace(/:/g, '')}`;
  const arm = Math.round(height * 0.3);
  const corner = (y: number, down: boolean) => down
    ? `M12 ${y + 2}H9a4 4 0 0 0-4 4V${y + arm}`
    : `M5 ${y - arm}V${y - 6}a4 4 0 0 0 4 4H12`;
  const d = `${corner(0, true)}${corner(height, false)}`;
  return <Svg accessible={false} width={14} height={height} viewBox={`0 0 14 ${height}`}>
    <Defs><LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <Stop offset="0" stopColor="#AAB4FB" /><Stop offset=".5" stopColor="#9C8EEA" /><Stop offset="1" stopColor="#A86BC4" />
    </LinearGradient></Defs>
    <Path d={d} fill="none" stroke={`url(#${id})`} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    <Path d={d} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" transform="translate(0.6 0)" />
  </Svg>;
}
