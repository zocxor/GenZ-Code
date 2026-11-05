/**
 * Bottom navigation (v5): floating glass dock in the existing GenZ Code style.
 * Same four destinations and colours as before; the active tab uses the primary-button
 * gradient. Badges show real counts only (words due for review).
 */
import React from 'react';
import {View, Text, Pressable, StyleSheet} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {C, Icon, IconName} from './ui';

export type NavItem<T extends string> = {name: T; icon: IconName; activeIcon: IconName; badge?: number};

export default function NavBar<T extends string>({items, active, onSelect}: {items: NavItem<T>[]; active: T; onSelect: (t: T) => void}) {
  return <View style={s.wrap} accessibilityRole="tablist">
    {/* Solid backdrop + fade so scrolled content ends cleanly above the dock instead of being cut under it. */}
    <LinearGradient pointerEvents="none" colors={['rgba(229,245,242,0)', 'rgba(229,245,242,0.92)']} style={s.fade} />
    <View style={s.dock}>
      <View pointerEvents="none" style={s.shine} />
      {items.map(n => {
        const on = n.name === active;
        const label = `${n.name}${n.badge ? `, ${n.badge} ${n.badge === 1 ? 'item' : 'items'} waiting` : ''}`;
        return <Pressable key={n.name} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{selected: on}} onPress={() => onSelect(n.name)} style={({pressed}) => [s.tab, pressed && !on && {transform: [{scale: 0.96}]}]}>
          {on ? <LinearGradient colors={['#5289ff', '#245fe9', '#184bc9']} start={{x: 0, y: 0}} end={{x: 0, y: 1}} style={s.activePill}>
            <View pointerEvents="none" style={s.pillShine} />
            <View style={s.iconBox}><Icon name={n.activeIcon} color="#fff" size={23} />{!!n.badge && <Badge value={n.badge} on />}</View>
            <Text style={s.activeLabel} numberOfLines={1}>{n.name}</Text>
          </LinearGradient> : <View style={s.idle}>
            <View style={s.iconBox}><Icon name={n.icon} color={C.muted} size={23} />{!!n.badge && <Badge value={n.badge} />}</View>
            <Text style={s.label} numberOfLines={1}>{n.name}</Text>
          </View>}
        </Pressable>;
      })}
    </View>
  </View>;
}

/** Count badge pinned to the icon's top-right corner so it never covers the glyph. */
function Badge({value, on = false}: {value: number; on?: boolean}) {
  return <View pointerEvents="none" style={[s.badge, on && s.badgeOn]}><Text style={[s.badgeText, on && {color: C.blue}]}>{value > 99 ? '99+' : value}</Text></View>;
}

const s = StyleSheet.create({
  wrap: {paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10, backgroundColor: 'rgba(229,245,242,0.92)'},
  fade: {position: 'absolute', left: 0, right: 0, top: -22, height: 22},
  iconBox: {width: 30, height: 26, alignItems: 'center', justifyContent: 'center'},
  dock: {flexDirection: 'row', gap: 6, padding: 6, borderRadius: 28, backgroundColor: 'rgba(250,253,255,.92)', borderWidth: 1.5, borderColor: '#fff', shadowColor: '#3e6c9a', shadowOffset: {width: 0, height: 10}, shadowOpacity: 0.16, shadowRadius: 20, elevation: 10, overflow: 'visible'},
  shine: {position: 'absolute', top: 1, left: 24, right: 24, height: 1, backgroundColor: '#fff'},
  tab: {flex: 1, minHeight: 60, borderRadius: 22},
  idle: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 22},
  activePill: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 22, borderTopWidth: 1, borderTopColor: '#a4c6ff', borderBottomWidth: 2, borderBottomColor: '#1344b8', overflow: 'hidden', shadowColor: '#245ee6', shadowOffset: {width: 0, height: 6}, shadowOpacity: 0.3, shadowRadius: 10, elevation: 4},
  pillShine: {position: 'absolute', top: 0, left: 0, right: 0, height: '45%', backgroundColor: 'rgba(255,255,255,.12)'},
  label: {fontSize: 11, fontWeight: '700', color: C.muted},
  activeLabel: {fontSize: 11, fontWeight: '900', color: '#fff', letterSpacing: 0.2},
  badge: {position: 'absolute', top: -7, left: 21, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: '#e2552f', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff'},
  badgeOn: {backgroundColor: '#fff', borderColor: '#cfe0ff'},
  badgeText: {fontSize: 10, fontWeight: '900', color: '#fff'},
});
