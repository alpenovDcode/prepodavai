/**
 * Дизайн-система Redesign v2 — централизованный экспорт.
 *
 * Использование:
 *   import { Button, Card, Badge } from '@/components/ui/v2'
 *
 * Каждый компонент совместим с tnum / font-display utility-классами Tailwind config.
 * Цвета берутся из CSS-переменных (`globals.css`) через Tailwind алиасы (`bg-brand-500` и т.д.).
 */

export { Button }      from './Button'
export { Card }        from './Card'
export { Badge }       from './Badge'
export { Input }       from './Input'
export { Select }      from './Select'
export { Tabs }        from './Tabs'
export { Avatar }      from './Avatar'
export { Toggle }      from './Toggle'
export { Tooltip }     from './Tooltip'
export { Modal }       from './Modal'
export { IconTile }    from './IconTile'
export { SearchBar }   from './SearchBar'
export { StatCard }    from './StatCard'
export { TokenChip }   from './TokenChip'

// Types
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button'
export type { CardProps }                              from './Card'
export type { BadgeProps, BadgeVariant }               from './Badge'
export type { InputProps }                             from './Input'
export type { SelectProps, SelectOption }              from './Select'
export type { TabItem, TabsProps }                     from './Tabs'
export type { AvatarProps, AvatarSize }                from './Avatar'
export type { ToggleProps }                            from './Toggle'
export type { TooltipProps }                           from './Tooltip'
export type { ModalProps }                             from './Modal'
export type { IconTileProps, IconTileColor, IconTileSize } from './IconTile'
export type { SearchBarProps }                         from './SearchBar'
export type { StatCardProps }                          from './StatCard'
export type { TokenChipProps }                         from './TokenChip'
