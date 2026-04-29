import { Ionicons } from '@expo/vector-icons'
import type { ComponentProps } from 'react'

// ─── Canonical set of icon names used in this app ───────────────────────────
export type AppIconName =
  // Navigation
  | 'arrow-back'
  | 'arrow-forward'
  | 'chevron-forward'
  // Connectivity
  | 'bluetooth'
  | 'bluetooth-outline'
  | 'wifi'
  | 'wifi-outline'
  // UI controls
  | 'settings-outline'
  | 'search'
  | 'time-outline'
  | 'flash'
  | 'radio'
  | 'radio-outline'
  | 'warning-outline'
  // GPS / map
  | 'navigate'
  | 'navigate-outline'
  | 'location'
  | 'location-outline'

// ─── Base Icon component ─────────────────────────────────────────────────────
interface IconProps {
  name: AppIconName
  size?: number
  color?: string
  style?: ComponentProps<typeof Ionicons>['style']
}

export function Icon({ name, size = 20, color, style }: IconProps) {
  return <Ionicons name={name} size={size} color={color} style={style} />
}

// ─── Semantic icon shortcuts ──────────────────────────────────────────────────
type SemanticProps = Omit<IconProps, 'name'>

export const BackIcon         = (p: SemanticProps) => <Icon name="arrow-back"        {...p} />
export const ForwardIcon      = (p: SemanticProps) => <Icon name="arrow-forward"     {...p} />
export const ChevronIcon      = (p: SemanticProps) => <Icon name="chevron-forward"   {...p} />
export const SettingsIcon     = (p: SemanticProps) => <Icon name="settings-outline"  {...p} />
export const HistoryIcon      = (p: SemanticProps) => <Icon name="time-outline"      {...p} />
export const SearchIcon       = (p: SemanticProps) => <Icon name="search"            {...p} />
export const BluetoothIcon    = (p: SemanticProps) => <Icon name="bluetooth"         {...p} />
export const BluetoothOffIcon = (p: SemanticProps) => <Icon name="bluetooth-outline" {...p} />
export const WifiIcon         = (p: SemanticProps) => <Icon name="wifi"              {...p} />
export const WifiOffIcon      = (p: SemanticProps) => <Icon name="wifi-outline"      {...p} />
export const FlashIcon        = (p: SemanticProps) => <Icon name="flash"             {...p} />
export const RadioIcon        = (p: SemanticProps) => <Icon name="radio"             {...p} />
export const RadioOffIcon     = (p: SemanticProps) => <Icon name="radio-outline"     {...p} />
export const WarningIcon      = (p: SemanticProps) => <Icon name="warning-outline"   {...p} />
export const NavigateIcon     = (p: SemanticProps) => <Icon name="navigate"          {...p} />
export const NavigateOffIcon  = (p: SemanticProps) => <Icon name="navigate-outline"  {...p} />
export const LocationIcon     = (p: SemanticProps) => <Icon name="location"          {...p} />
export const LocationOffIcon  = (p: SemanticProps) => <Icon name="location-outline"  {...p} />
