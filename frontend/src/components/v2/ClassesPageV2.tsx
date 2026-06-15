'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import {
    Users, Plus, BookOpen, ChevronRight, GraduationCap,
    Layers, Pencil, Trash2, Check, X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils/cn'
import { apiClient } from '@/lib/api/client'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useMobileMenu } from '@/components/layout/v2/DashboardLayoutV2'
import { Card } from '@/components/ui/v2/Card'
import { Button } from '@/components/ui/v2/Button'
import { IconTile } from '@/components/ui/v2/IconTile'
import { Modal } from '@/components/ui/v2/Modal'

const fetcher = (url: string) => apiClient.get(url).then((r: any) => r.data)

interface ClassItem {
    id: string
    name: string
    description?: string | null
    createdAt: string
    _count: { students: number }
}

const SUB_NAV = [
    { label: 'Ученики',           href: '/dashboard/students',  key: 'students' },
    { label: 'Классы',            href: '/dashboard/classes',   key: 'classes' },
    { label: 'Домашние задания',  href: '/dashboard/assignments',   key: 'grading' },
    { label: 'Аналитика',         href: '/dashboard/analytics', key: 'analytics' },
] as const

export default function ClassesPageV2() {
    const router = useRouter()
    const menu = useMobileMenu()

    const { data, isLoading } = useSWR<ClassItem[]>('/classes', fetcher)
    const classes = Array.isArray(data) ? data : []

    const [showCreate, setShowCreate] = useState(false)
    const [className, setClassName] = useState('')
    const [classDesc, setClassDesc] = useState('')
    const [creating, setCreating] = useState(false)

    const totalStudents = classes.reduce((sum, c) => sum + c._count.students, 0)

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!className.trim()) return
        setCreating(true)
        try {
            await apiClient.post('/classes', { name: className.trim(), description: classDesc.trim() || undefined })
            mutate('/classes')
            setClassName('')
            setClassDesc('')
            setShowCreate(false)
            toast.success('Класс создан')
        } catch {
            toast.error('Не удалось создать класс')
        } finally {
            setCreating(false)
        }
    }

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Удалить класс «${name}»? Это действие нельзя отменить.`)) return
        try {
            await apiClient.delete(`/classes/${id}`)
            mutate('/classes')
            toast.success('Класс удалён')
        } catch {
            toast.error('Не удалось удалить класс')
        }
    }

    const [editClassId, setEditClassId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [editDesc, setEditDesc] = useState('')
    const [saving, setSaving] = useState(false)

    const handleStartEdit = (cls: ClassItem) => {
        setEditClassId(cls.id)
        setEditName(cls.name)
        setEditDesc(cls.description || '')
    }

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editClassId || !editName.trim()) return
        setSaving(true)
        try {
            await apiClient.put(`/classes/${editClassId}`, { name: editName.trim(), description: editDesc.trim() || undefined })
            mutate('/classes')
            setEditClassId(null)
            toast.success('Класс обновлён')
        } catch {
            toast.error('Не удалось сохранить')
        } finally {
            setSaving(false)
        }
    }

    return (
        <>
            <Topbar
                title="Классы"
                subtitle={
                    isLoading
                        ? undefined
                        : `${classes.length} ${pluralize(classes.length, 'класс', 'класса', 'классов')} · ${totalStudents} ${pluralize(totalStudents, 'ученик', 'ученика', 'учеников')}`
                }
                onMobileMenuToggle={menu.toggle}
                hideSearch
                actions={
                    <Button
                        variant="primary"
                        size="sm"
                        leftIcon={<Plus className="w-4 h-4" />}
                        onClick={() => setShowCreate(true)}
                    >
                        Создать класс
                    </Button>
                }
            />

            {/* Sub-navigation */}
            <div className="border-b border-ink-200 bg-surface px-8 max-md:px-4">
                <div className="flex gap-0 max-w-[1320px] mx-auto">
                    {SUB_NAV.map(({ label, href, key }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => router.push(href)}
                            className={cn(
                                'relative px-4 py-3 text-[14px] font-semibold transition-colors whitespace-nowrap',
                                key === 'classes' ? 'text-brand-700' : 'text-ink-500 hover:text-ink-900',
                            )}
                        >
                            {label}
                            {key === 'classes' && (
                                <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-t bg-brand-500" />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <div className="max-w-[1320px] w-full mx-auto p-8 max-md:p-4">
                {isLoading ? (
                    <div className="text-center py-24 text-ink-500">Загрузка…</div>
                ) : classes.length === 0 ? (
                    <Card padding="lg" className="text-center py-16">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-brand-50 flex items-center justify-center">
                            <Layers className="w-8 h-8 text-brand-500" />
                        </div>
                        <h3 className="font-display font-bold text-ink-900 text-lg mb-2">Классов пока нет</h3>
                        <p className="text-[14px] text-ink-500 mb-6 max-w-[320px] mx-auto">
                            Создайте первый класс, чтобы объединить учеников и назначать им задания.
                        </p>
                        <Button variant="primary" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
                            Создать класс
                        </Button>
                    </Card>
                ) : (
                    <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
                        {classes.map((cls) => (
                            <ClassCard
                                key={cls.id}
                                cls={cls}
                                onOpen={() => router.push(`/dashboard/classes/${cls.id}`)}
                                onDelete={() => handleDelete(cls.id, cls.name)}
                                onEdit={() => handleStartEdit(cls)}
                            />
                        ))}

                        {/* Add new card */}
                        <button
                            type="button"
                            onClick={() => setShowCreate(true)}
                            className="min-h-[160px] rounded-xl border-2 border-dashed border-ink-200 hover:border-brand-300 hover:bg-brand-50/30 transition-all flex flex-col items-center justify-center gap-2 text-ink-400 hover:text-brand-600 cursor-pointer"
                        >
                            <Plus className="w-7 h-7" />
                            <span className="text-[13px] font-semibold">Новый класс</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Модал создания класса */}
            <Modal
                open={showCreate}
                onClose={() => { setShowCreate(false); setClassName(''); setClassDesc('') }}
                title="Новый класс"
                description="Заполните название и при желании описание."
                size="sm"
            >
                <form onSubmit={handleCreate} className="p-5 flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[13px] font-semibold text-ink-700">Название класса*</label>
                        <input
                            autoFocus
                            value={className}
                            onChange={(e) => setClassName(e.target.value)}
                            placeholder="10А, Английский-Advanced…"
                            className="h-10 px-3.5 rounded-lg border border-ink-200 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-brand-400 focus:ring-[3px] focus:ring-brand-400/15 transition-all"
                            required
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[13px] font-semibold text-ink-700">Описание</label>
                        <textarea
                            value={classDesc}
                            onChange={(e) => setClassDesc(e.target.value)}
                            placeholder="Необязательно"
                            rows={3}
                            className="px-3.5 py-2.5 rounded-lg border border-ink-200 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-brand-400 focus:ring-[3px] focus:ring-brand-400/15 transition-all resize-none"
                        />
                    </div>
                    <div className="flex gap-2 pt-1">
                        <Button
                            type="button"
                            variant="secondary"
                            className="flex-1"
                            onClick={() => { setShowCreate(false); setClassName(''); setClassDesc('') }}
                        >
                            Отмена
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            className="flex-1"
                            disabled={!className.trim() || creating}
                        >
                            {creating ? 'Создаём…' : 'Создать'}
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Модал редактирования класса */}
            <Modal
                open={!!editClassId}
                onClose={() => setEditClassId(null)}
                title="Редактировать класс"
                size="sm"
            >
                <form onSubmit={handleSaveEdit} className="p-5 flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[13px] font-semibold text-ink-700">Название класса*</label>
                        <input
                            autoFocus
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="10А, Английский-Advanced…"
                            className="h-10 px-3.5 rounded-lg border border-ink-200 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-brand-400 focus:ring-[3px] focus:ring-brand-400/15 transition-all"
                            required
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[13px] font-semibold text-ink-700">Описание</label>
                        <textarea
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            placeholder="Необязательно"
                            rows={3}
                            className="px-3.5 py-2.5 rounded-lg border border-ink-200 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-brand-400 focus:ring-[3px] focus:ring-brand-400/15 transition-all resize-none"
                        />
                    </div>
                    <div className="flex gap-2 pt-1">
                        <Button type="button" variant="secondary" className="flex-1" onClick={() => setEditClassId(null)}>Отмена</Button>
                        <Button type="submit" variant="primary" className="flex-1" disabled={!editName.trim() || saving}>
                            {saving ? 'Сохраняем…' : 'Сохранить'}
                        </Button>
                    </div>
                </form>
            </Modal>
        </>
    )
}

function ClassCard({
    cls,
    onOpen,
    onDelete,
    onEdit,
}: {
    cls: ClassItem
    onOpen: () => void
    onDelete: () => void
    onEdit: () => void
}) {
    const createdDate = new Date(cls.createdAt).toLocaleDateString('ru-RU', {
        day: 'numeric', month: 'long', year: 'numeric',
    })

    return (
        <div
            className="bg-surface border border-ink-200 rounded-xl p-5 flex flex-col gap-4 hover:border-brand-300 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer group"
            onClick={onOpen}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <IconTile color="brand" size="md">
                        <GraduationCap className="w-5 h-5" />
                    </IconTile>
                    <div className="min-w-0">
                        <div className="font-bold text-ink-900 text-[15px] truncate group-hover:text-brand-700 transition-colors">
                            {cls.name}
                        </div>
                        <div className="text-xs text-ink-500 mt-0.5">создан {createdDate}</div>
                    </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                <button
                    type="button"
                    title="Редактировать класс"
                    onClick={(e) => { e.stopPropagation(); onEdit() }}
                    className="w-8 h-8 rounded-md flex items-center justify-center text-ink-400 hover:text-brand-600 hover:bg-brand-50 transition-all"
                >
                    <Pencil className="w-4 h-4" />
                </button>
                <button
                    type="button"
                    title="Удалить класс"
                    onClick={(e) => { e.stopPropagation(); onDelete() }}
                    className="w-8 h-8 rounded-md flex items-center justify-center text-ink-400 hover:text-danger-700 hover:bg-danger-50 transition-all"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
                </div>
            </div>

            {cls.description && (
                <p className="text-[13px] text-ink-600 leading-relaxed line-clamp-2 -mt-1">
                    {cls.description}
                </p>
            )}

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[13px] text-ink-600 font-medium">
                    <Users className="w-4 h-4 text-ink-400" />
                    {cls._count.students} {pluralize(cls._count.students, 'ученик', 'ученика', 'учеников')}
                </div>
                <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-600 group-hover:gap-2 transition-all">
                    Открыть <ChevronRight className="w-4 h-4" />
                </span>
            </div>
        </div>
    )
}

function pluralize(n: number, one: string, few: string, many: string) {
    const mod10 = n % 10
    const mod100 = n % 100
    if (mod10 === 1 && mod100 !== 11) return one
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
    return many
}
