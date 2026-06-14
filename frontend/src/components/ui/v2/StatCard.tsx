'use client'

import { ReactNode } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { Card } from './Card'
import { IconTile, IconTileColor } from './IconTile'

export interface StatCardProps {
    label: string
    value: ReactNode
    /** Иконка. Лучше через <IconTile> color="..." — но можно и просто node. */
    icon?: ReactNode
    iconColor?: IconTileColor
    /** Дельта (например '+12%' или '-3%'). Цвет берётся из delta.direction. */
    delta?: { value: string; direction: 'up' | 'down' | 'flat' }
    /** Подпись под значением. */
    sub?: ReactNode
    /** Делает карточку кликабельной. */
    onClick?: () => void
    /** Дополнительный класс. */
    className?: string
}

/**
 * KPI-карточка для дашбордов: иконка + лейбл + значение + дельта/подпись.
 *
 * @example
 *   <StatCard label="Работ ждут проверки" value="12" icon={<ClipboardList size={16}/>}
 *             iconColor="warning" sub="3 в классе 10А" />
 */
export function StatCard({ label, value, icon, iconColor = 'brand', delta, sub, onClick, className }: StatCardProps) {
    return (
        <Card interactive={!!onClick} onClick={onClick} className={cn('flex flex-col gap-2', className)}>
            <div className="text-[13px] font-medium text-ink-500 flex items-center gap-2">
                {icon && <IconTile color={iconColor} size="sm">{icon}</IconTile>}
                {label}
            </div>
            <div className="font-display text-[28px] font-extrabold text-ink-900 leading-none tracking-tight tnum">
                {value}
            </div>
            {delta && (
                <div className={cn(
                    'text-xs font-semibold inline-flex items-center gap-1',
                    delta.direction === 'up'   && 'text-success-700',
                    delta.direction === 'down' && 'text-danger-700',
                    delta.direction === 'flat' && 'text-ink-500',
                )}>
                    {delta.direction === 'up'   && <TrendingUp className="w-3 h-3" />}
                    {delta.direction === 'down' && <TrendingDown className="w-3 h-3" />}
                    {delta.value}
                </div>
            )}
            {sub && <div className="text-xs text-ink-500">{sub}</div>}
        </Card>
    )
}
