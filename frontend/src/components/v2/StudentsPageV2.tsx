'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Users, Copy, Check, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { apiClient } from '@/lib/api/client'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useMobileMenu } from '@/components/layout/v2/DashboardLayoutV2'
import { Card } from '@/components/ui/v2/Card'
import { Button } from '@/components/ui/v2/Button'
import { Badge } from '@/components/ui/v2/Badge'
import { SearchBar } from '@/components/ui/v2/SearchBar'
import { Avatar } from '@/components/ui/v2/Avatar'

interface Klass {
    id: string
    name: string
    description?: string
    _count?: { students: number }
}

interface Student {
    id: string
    name: string
    email?: string
    avatar?: string
    accessCode?: string
    status?: 'active' | 'pending'
    class: { id?: string; name: string }
    createdAt: string
}

export default function StudentsPageV2() {
    const router = useRouter()
    const menu = useMobileMenu()

    const [classes, setClasses] = useState<Klass[]>([])
    const [students, setStudents] = useState<Student[]>([])
    const [loading, setLoading] = useState(true)
    const [query, setQuery] = useState('')
    const [activeClass, setActiveClass] = useState<string | 'all'>('all')
    const [copiedCode, setCopiedCode] = useState<string | null>(null)

    useEffect(() => {
        Promise.all([
            apiClient.get('/classes').catch(() => ({ data: [] })),
            apiClient.get('/students').catch(() => ({ data: [] })),
        ]).then(([cr, sr]: any) => {
            setClasses(cr.data || [])
            setStudents(sr.data || [])
        }).finally(() => setLoading(false))
    }, [])

    const filtered = useMemo(() => {
        const q = query.toLowerCase().trim()
        return students.filter(s => {
            if (activeClass !== 'all' && s.class?.name !== classes.find(c => c.id === activeClass)?.name) return false
            if (!q) return true
            return s.name.toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q)
        })
    }, [students, query, activeClass, classes])

    const pendingCount = students.filter(s => s.status === 'pending').length

    const copyCode = async (code: string) => {
        try {
            await navigator.clipboard.writeText(code)
            setCopiedCode(code)
            toast.success('Код скопирован')
            setTimeout(() => setCopiedCode(null), 1500)
        } catch {
            toast.error('Не удалось скопировать')
        }
    }

    return (
        <>
            <Topbar
                title="Ученики"
                subtitle={`${students.length} ${pluralizeRu(students.length, 'ученик', 'ученика', 'учеников')} в ${classes.length} ${pluralizeRu(classes.length, 'классе', 'классах', 'классах')}`}
                onMobileMenuToggle={menu.toggle}
                hideSearch
                actions={
                    <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />}>Добавить</Button>
                }
                notificationsCount={pendingCount}
            />

            <div className="max-w-[1240px] w-full mx-auto p-8 max-md:p-4">
                <div className="grid grid-cols-12 gap-4 max-lg:grid-cols-1">
                    {/* Classes sidebar */}
                    <Card padding="md" className="col-span-3 max-lg:col-span-1 h-fit sticky top-20">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-500 px-2 mb-2">Классы</div>
                        <button
                            type="button"
                            onClick={() => setActiveClass('all')}
                            className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium ${activeClass === 'all' ? 'bg-brand-50 text-brand-700' : 'text-ink-700 hover:bg-ink-100'}`}
                        >
                            Все ученики <span className="float-right tnum text-ink-500">{students.length}</span>
                        </button>
                        {classes.map(c => (
                            <button
                                key={c.id}
                                type="button"
                                onClick={() => setActiveClass(c.id)}
                                className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium ${activeClass === c.id ? 'bg-brand-50 text-brand-700' : 'text-ink-700 hover:bg-ink-100'}`}
                            >
                                {c.name} <span className="float-right tnum text-ink-500">{c._count?.students ?? 0}</span>
                            </button>
                        ))}
                        <button
                            type="button"
                            className="w-full mt-2 text-left px-3 py-2 rounded-md text-sm font-semibold text-brand-600 hover:bg-brand-50 inline-flex items-center gap-1.5"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Новый класс
                        </button>
                    </Card>

                    {/* Students list */}
                    <div className="col-span-9 max-lg:col-span-1 flex flex-col gap-4">
                        <SearchBar
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Найти ученика по имени или email…"
                            className="w-full"
                        />

                        {loading ? (
                            <div className="text-center py-16 text-ink-500">Загрузка…</div>
                        ) : filtered.length === 0 ? (
                            <Card padding="lg" className="text-center">
                                <Users className="w-10 h-10 mx-auto text-ink-300 mb-3" />
                                <h3 className="font-display font-bold text-ink-900 mb-1">Учеников пока нет</h3>
                                <p className="text-[13px] text-ink-500 mb-4">Добавьте первого ученика, чтобы начать.</p>
                                <Button variant="primary" leftIcon={<Plus className="w-4 h-4" />}>Добавить</Button>
                            </Card>
                        ) : (
                            <Card padding="none">
                                <div className="divide-y divide-ink-100">
                                    {filtered.map(s => (
                                        <div
                                            key={s.id}
                                            className="px-5 py-3.5 flex items-center gap-3 cursor-pointer hover:bg-ink-50 transition-colors"
                                            onClick={() => router.push(`/dashboard/students/${s.id}`)}
                                        >
                                            <Avatar name={s.name} size="md" src={s.avatar} />
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-[14px] text-ink-900 truncate">{s.name}</div>
                                                <div className="text-[11px] text-ink-500 truncate">
                                                    {s.class?.name}{s.email ? ` · ${s.email}` : ''}
                                                </div>
                                            </div>
                                            {s.status === 'pending' && s.accessCode && (
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={(e) => { e.stopPropagation(); copyCode(s.accessCode!) }}
                                                    leftIcon={copiedCode === s.accessCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                                >
                                                    {s.accessCode}
                                                </Button>
                                            )}
                                            {s.status === 'pending' && (
                                                <Badge variant="warning" icon={<AlertTriangle className="w-3 h-3" />}>не активирован</Badge>
                                            )}
                                            {s.status === 'active' && (
                                                <Badge variant="success">активен</Badge>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        )}
                    </div>
                </div>
            </div>
        </>
    )
}

function pluralizeRu(n: number, one: string, few: string, many: string) {
    const mod10 = n % 10, mod100 = n % 100
    if (mod10 === 1 && mod100 !== 11) return one
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
    return many
}
