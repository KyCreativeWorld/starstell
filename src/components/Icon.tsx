import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName = 'dashboard' | 'report' | 'solutions' | 'settings' | 'search' | 'user' | 'close' | 'palette' | 'bottleneck' | 'chevron' | 'audit' | 'folder' | 'people' | 'timeline';

/** Simple line icons (24×24 grid, 1.8px stroke). */
export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color: string }) {
  const stroke = { stroke: color, strokeWidth: 1.8, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      {name === 'dashboard' ? (
        <>
          <Rect x={3.5} y={3.5} width={7} height={7} rx={1.5} {...stroke} />
          <Rect x={13.5} y={3.5} width={7} height={4.5} rx={1.5} {...stroke} />
          <Rect x={13.5} y={11} width={7} height={9.5} rx={1.5} {...stroke} />
          <Rect x={3.5} y={13.5} width={7} height={7} rx={1.5} {...stroke} />
        </>
      ) : name === 'report' ? (
        <>
          <Path d="M7 3.5h7l4.5 4.5v12.5H7a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 7 3.5z" {...stroke} />
          <Path d="M14 3.5V8h4.5" {...stroke} />
          <Path d="M9 16v-3M12 16v-5M15 16v-2" {...stroke} />
        </>
      ) : name === 'solutions' ? (
        <>
          <Path d="M9 18h6M10 21h4" {...stroke} />
          <Path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z" {...stroke} />
        </>
      ) : name === 'settings' ? (
        <>
          <Circle cx={12} cy={12} r={3} {...stroke} />
          <Path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
            {...stroke}
          />
        </>
      ) : name === 'search' ? (
        <>
          <Circle cx={11} cy={11} r={6.5} {...stroke} />
          <Path d="M20 20l-4.2-4.2" {...stroke} />
        </>
      ) : name === 'user' ? (
        <>
          <Circle cx={12} cy={8.5} r={3.8} {...stroke} />
          <Path d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" {...stroke} />
        </>
      ) : name === 'bottleneck' ? (
        // A funnel: lots of work in, a trickle out.
        <Path d="M4 4.5h16l-6 7.5v6.5l-4 2v-8.5z" {...stroke} />
      ) : name === 'audit' ? (
        // A clipboard with a check mark.
        <>
          <Path d="M9 4.5H7A1.5 1.5 0 0 0 5.5 6v13A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V6A1.5 1.5 0 0 0 17 4.5h-2" {...stroke} />
          <Rect x={9} y={3} width={6} height={3} rx={1} {...stroke} />
          <Path d="M9 13l2 2 4-4.5" {...stroke} />
        </>
      ) : name === 'people' ? (
        // Two people, one slightly behind the other.
        <>
          <Circle cx={9} cy={8.5} r={3.3} {...stroke} />
          <Path d="M3 19.5c.9-3.2 3.2-5 6-5s5.1 1.8 6 5" {...stroke} />
          <Path d="M15.2 5.4a3.3 3.3 0 0 1 0 6.2M17.2 14.8c1.9.6 3.2 2.2 3.8 4.7" {...stroke} />
        </>
      ) : name === 'timeline' ? (
        // Three staggered bars on a time track, like a schedule.
        <>
          <Path d="M3.5 5.5h17" {...stroke} />
          <Rect x={4} y={8.5} width={7} height={3} rx={1.5} {...stroke} />
          <Rect x={9.5} y={13} width={8} height={3} rx={1.5} {...stroke} />
          <Rect x={6} y={17.5} width={6} height={3} rx={1.5} {...stroke} />
        </>
      ) : name === 'folder' ? (
        <Path d="M3.5 7A1.5 1.5 0 0 1 5 5.5h4.2l2 2.2H19A1.5 1.5 0 0 1 20.5 9.2V17A1.5 1.5 0 0 1 19 18.5H5A1.5 1.5 0 0 1 3.5 17z" {...stroke} />
      ) : name === 'chevron' ? (
        <Path d="M9.5 6l6 6-6 6" {...stroke} />
      ) : name === 'close' ? (
        <Path d="M6 6l12 12M18 6L6 18" {...stroke} />
      ) : (
        <>
          <Path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7h2a4.1 4.1 0 0 0 4.1-4.1C20.5 6.8 16.7 3.5 12 3.5z" {...stroke} />
          <Circle cx={7.5} cy={11} r={1} fill={color} />
          <Circle cx={10.5} cy={7.5} r={1} fill={color} />
          <Circle cx={15} cy={7.5} r={1} fill={color} />
        </>
      )}
    </Svg>
  );
}
