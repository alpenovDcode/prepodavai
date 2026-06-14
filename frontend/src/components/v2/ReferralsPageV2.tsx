'use client'

import { useState } from 'react'
import { Copy, Check, Gift, Users, Sparkles, Share2, Trophy } from 'lucide-react'
import toast from 'react-hot-toast'
import { useReferralCode, useReferralStats, useReferralsList, useCreateReferralCode } from '@/lib/hooks/useReferrals'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useMobileMenu } from '@/components/layout/v2/DashboardLayoutV2'
import { Card } from '@/components/ui/v2/Card'
import { Button } from '@/components/ui/v2/Button'
import { Badge } from '@/components/ui/v2/Badge'
import { IconTile } from '@/components/ui/v2/IconTile'
import { Input } from '@/components/ui/v2/Input'
import { Avatar } from '@/components/ui/v2/Avatar'

export default function ReferralsPageV2() {
    const menu = useMobileMenu()
    const { data: codeData } = useReferralCode()
    const { data: statsData } = useReferralStats()
    const { data: listData } = useReferralsList()
    const createCode = useCreateReferralCode()

    const [customCode, setCustomCode] = useState('')
    const [copied, setCopied] = useState<'code' | 'link' | null>(null)

    const code = codeData
    const stats = statsData
    const referrals = listData ?? []

    const copyTo = async (text: string, kind: 'code' | 'link') => {
        try {
            await navigator.clipboard.writeText(text)
            setCopied(kind)
            toast.success('Скопировано')
            setTimeout(() => setCopied(null), 1500)
        } catch {
            toast.error('Не удалось')
        }
    }

    return (
        <>
            <Topbar
                title="Пригласите друзей"
                subtitle="Расскажите коллегам и ученикам о Преподавай"
                onMobileMenuToggle={menu.toggle}
                hideSearch
            />

            <div className="max-w-[1240px] w-full mx-auto p-8 max-md:p-4">
                {/* KPI strip */}
                <div className="grid grid-cols-4 gap-4 mb-6 max-md:grid-cols-2">
                    <KpiTile icon={<Users className="w-4 h-4" />}    color="info"    label="Всего приглашений" value={stats?.totalReferrals ?? 0} />
                    <KpiTile icon={<Sparkles className="w-4 h-4" />} color="warning" label="Активированы"      value={stats?.activated ?? 0} />
                    <KpiTile icon={<Trophy className="w-4 h-4" />}   color="success" label="Конверсии"          value={stats?.converted ?? 0} />
                    <KpiTile icon={<Gift className="w-4 h-4" />}     color="brand"   label="Друзей привели"     value={stats?.totalReferrals ?? 0} />
                </div>

                <div className="grid grid-cols-12 gap-4 max-lg:grid-cols-1">
                    {/* Code + link */}
                    <Card padding="lg" className="col-span-7 max-lg:col-span-1">
                        <h2 className="font-display font-bold text-[18px] text-ink-900 mb-1">Ваш реферальный код</h2>
                        <p className="text-[13px] text-ink-500 mb-5">
                            Поделитесь ссылкой с коллегами — пусть тоже попробуют Преподавай.
                        </p>

                        {code ? (
                            <>
                                <div className="flex items-center gap-3 mb-3 max-md:flex-col max-md:items-stretch">
                                    <div className="flex-1 flex items-center gap-2 p-3 rounded-md bg-brand-50 border border-brand-200">
                                        <span className="font-mono font-bold text-[18px] text-brand-700 flex-1">{code.code}</span>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => copyTo(code.code, 'code')}
                                            leftIcon={copied === 'code' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                        >
                                            {copied === 'code' ? 'Скопировано' : 'Скопировать код'}
                                        </Button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 p-3 rounded-md bg-ink-100 border border-ink-200">
                                    <span className="text-[13px] text-ink-700 truncate flex-1">{code.link}</span>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => copyTo(code.link, 'link')}
                                        leftIcon={copied === 'link' ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                                    >
                                        {copied === 'link' ? 'Скопировано' : 'Скопировать ссылку'}
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <div className="flex items-end gap-2 max-md:flex-col max-md:items-stretch">
                                <Input
                                    label="Желаемый код (необязательно)"
                                    value={customCode}
                                    onChange={e => setCustomCode(e.target.value.toUpperCase())}
                                    placeholder="MYCODE2026"
                                    className="flex-1"
                                />
                                <Button
                                    variant="primary"
                                    onClick={() => createCode.mutate(customCode || undefined as any)}
                                    loading={createCode.isPending}
                                >
                                    Создать код
                                </Button>
                            </div>
                        )}

                        <div className="mt-6 pt-5 border-t border-ink-100 grid grid-cols-3 gap-3 text-center max-md:grid-cols-1">
                            <Step n={1} title="Поделитесь" desc="Отправьте код или ссылку коллегам" />
                            <Step n={2} title="Они регистрируются" desc="По вашему коду активируют аккаунт" />
                            <Step n={3} title="Они начинают пользоваться" desc="Вы помогаете расти сообществу учителей" />
                        </div>
                    </Card>

                    {/* Recent referrals */}
                    <Card padding="lg" className="col-span-5 max-lg:col-span-1">
                        <h2 className="font-display font-bold text-[16px] text-ink-900 mb-4">Последние приглашения</h2>
                        {referrals.length === 0 ? (
                            <div className="text-center py-10 text-ink-500 text-[13px]">
                                Пока никто не зарегистрировался по вашему коду.
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {referrals.slice(0, 8).map((r: any) => (
                                    <div key={r.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-ink-50 transition-colors">
                                        <Avatar name={r.referredName} size="sm" />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[13px] font-semibold text-ink-900 truncate">{r.referredName}</div>
                                            <div className="text-[11px] text-ink-500">
                                                {new Date(r.createdAt).toLocaleDateString('ru-RU')}
                                            </div>
                                        </div>
                                        <StatusBadge status={r.status} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>
            </div>
        </>
    )
}

function KpiTile({ icon, color, label, value }: { icon: React.ReactNode; color: any; label: string; value: number }) {
    return (
        <Card padding="md">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-bold text-ink-500 mb-2">
                <IconTile size="sm" color={color}>{icon}</IconTile>
                <span className="truncate">{label}</span>
            </div>
            <div className="font-display font-extrabold text-[24px] text-ink-900 tnum leading-none">{value}</div>
        </Card>
    )
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
    return (
        <div>
            <div className="w-8 h-8 mx-auto rounded-full bg-brand-100 text-brand-700 font-bold text-sm flex items-center justify-center mb-2">{n}</div>
            <div className="font-semibold text-[13px] text-ink-900">{title}</div>
            <div className="text-[12px] text-ink-500 mt-1">{desc}</div>
        </div>
    )
}

function StatusBadge({ status }: { status: string }) {
    if (status === 'converted') return <Badge variant="success">конверсия</Badge>
    if (status === 'activated') return <Badge variant="brand">активирован</Badge>
    return <Badge variant="neutral">регистрация</Badge>
}
