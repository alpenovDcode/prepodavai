'use client'

/**
 * Превью дизайн-системы Redesign v2.
 *
 * Эта страница НЕ для пользователей — это стайлгайд для разработчиков.
 * Доступна по адресу /v2-preview (только в dev/staging).
 *
 * После завершения миграции — удалить или перенести в Storybook.
 */

import { useState } from 'react'
import {
    Sparkles, FileText, HelpCircle, Presentation,
    Check, Bell, Settings,
    Clock, TrendingUp, ClipboardList, AlertTriangle,
} from 'lucide-react'

import {
    Button, Card, Badge, Input, Select, Tabs, Avatar, Toggle, Tooltip, Modal,
    IconTile, SearchBar, StatCard, TokenChip,
} from '@/components/ui/v2'

export default function V2PreviewPage() {
    const [tab, setTab] = useState('all')
    const [pillTab, setPillTab] = useState('all')
    const [toggleA, setToggleA] = useState(true)
    const [toggleB, setToggleB] = useState(false)
    const [modalOpen, setModalOpen] = useState(false)

    return (
        <div className="v2 min-h-screen bg-ink-50 font-sans">
            <div className="max-w-6xl mx-auto px-8 py-12">

                {/* Hero */}
                <div className="mb-12">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand-50 text-brand-700 rounded-full text-xs font-bold uppercase tracking-wide mb-4">
                        <Sparkles className="w-3 h-3" /> Redesign v2 · Foundation
                    </div>
                    <h1 className="font-display text-4xl font-extrabold text-ink-900 tracking-tight mb-3">
                        Дизайн-система <span className="text-brand-600">Преподавай</span>
                    </h1>
                    <p className="text-ink-600 text-base max-w-2xl leading-relaxed">
                        Базовые компоненты для всех новых экранов. После миграции — переедут в Storybook.
                        Стиль: clean modern SaaS (Notion + Linear + Khan Academy).
                    </p>
                </div>

                {/* ─── Buttons ─── */}
                <Section title="Кнопки" subtitle="4 варианта × 3 размера + состояние loading">
                    <div className="space-y-4">
                        <div className="flex flex-wrap gap-3 items-center">
                            <Button variant="primary" leftIcon={<Sparkles className="w-4 h-4" />}>Сгенерировать</Button>
                            <Button variant="secondary">Сохранить</Button>
                            <Button variant="ghost">Отмена</Button>
                            <Button variant="danger">Удалить</Button>
                        </div>
                        <div className="flex flex-wrap gap-3 items-center">
                            <Button size="sm">Small</Button>
                            <Button size="md">Default</Button>
                            <Button size="lg">Large</Button>
                            <Button loading>Загрузка...</Button>
                            <Button disabled>Disabled</Button>
                        </div>
                    </div>
                </Section>

                {/* ─── Badges ─── */}
                <Section title="Бейджи" subtitle="Для статусов и меток">
                    <div className="flex flex-wrap gap-2">
                        <Badge variant="brand">бренд</Badge>
                        <Badge variant="success" icon={<Check className="w-3 h-3" />}>готово</Badge>
                        <Badge variant="warning">в работе</Badge>
                        <Badge variant="danger" icon={<AlertTriangle className="w-3 h-3" />}>риск</Badge>
                        <Badge variant="info">новое</Badge>
                        <Badge variant="neutral">архив</Badge>
                    </div>
                </Section>

                {/* ─── Inputs ─── */}
                <Section title="Поля ввода" subtitle="Input, Select, SearchBar">
                    <div className="grid grid-cols-2 gap-6 max-w-3xl">
                        <Input
                            label="Тема урока"
                            placeholder="Введите тему…"
                            defaultValue="Тригонометрия"
                            hint="Чем точнее — тем точнее задания"
                        />
                        <Input
                            label="Email"
                            type="email"
                            placeholder="your@email.ru"
                            error="Введите корректный email"
                        />
                        <Select
                            label="Класс"
                            options={[
                                { value: '10А', label: '10А' },
                                { value: '9А',  label: '9А' },
                                { value: '11Б', label: '11Б' },
                            ]}
                        />
                        <div>
                            <label className="block text-[13px] font-semibold text-ink-800 mb-1.5">Поиск (Cmd + K)</label>
                            <SearchBar placeholder="Найти ученика, материал…" kbdHint="⌘K" />
                        </div>
                    </div>
                </Section>

                {/* ─── Tabs ─── */}
                <Section title="Табы" subtitle="Два варианта: underline и pill">
                    <div className="space-y-6">
                        <Tabs
                            items={[
                                { id: 'all',    label: 'Все',         count: 7 },
                                { id: 'todo',   label: 'К выполнению', count: 5 },
                                { id: 'review', label: 'На проверке', count: 1 },
                                { id: 'done',   label: 'Завершено',   count: 1 },
                            ]}
                            active={tab}
                            onChange={setTab}
                        />
                        <Tabs
                            variant="pill"
                            items={[
                                { id: 'all',     label: 'Все',         count: 47 },
                                { id: 'starred', label: 'Избранное',   count: 6, icon: <FileText className="w-3.5 h-3.5" /> },
                                { id: 'week',    label: 'На этой неделе', count: 8, icon: <Clock className="w-3.5 h-3.5" /> },
                            ]}
                            active={pillTab}
                            onChange={setPillTab}
                        />
                    </div>
                </Section>

                {/* ─── StatCards ─── */}
                <Section title="KPI карточки" subtitle="Для дашбордов">
                    <div className="grid grid-cols-4 gap-4">
                        <StatCard
                            label="Работ ждут проверки"
                            value="12"
                            icon={<ClipboardList className="w-4 h-4" />}
                            iconColor="warning"
                            sub="3 в классе 10А, 9 в 8Б"
                        />
                        <StatCard
                            label="Средний балл"
                            value="4,3"
                            icon={<TrendingUp className="w-4 h-4" />}
                            iconColor="success"
                            delta={{ value: '+0,2 за месяц', direction: 'up' }}
                        />
                        <StatCard
                            label="Под наблюдением"
                            value="3"
                            icon={<AlertTriangle className="w-4 h-4" />}
                            iconColor="danger"
                            sub="из 47, разные классы"
                        />
                        <StatCard
                            label="Баланс токенов"
                            value="9 375"
                            icon={<Sparkles className="w-4 h-4" />}
                            iconColor="brand"
                            sub="из 1 500/мес на «Бизнесе»"
                            onClick={() => alert('Открыть тарифы')}
                        />
                    </div>
                </Section>

                {/* ─── Cards & Icon tiles ─── */}
                <Section title="Карточки и иконки" subtitle="Контейнеры и цветные плитки">
                    <div className="grid grid-cols-3 gap-4">
                        <Card>
                            <div className="flex items-center gap-3 mb-3">
                                <IconTile color="brand" size="md"><FileText className="w-4 h-4" /></IconTile>
                                <div>
                                    <div className="font-semibold text-ink-900">Рабочий лист</div>
                                    <div className="text-xs text-ink-500">3 токена · ~30 сек</div>
                                </div>
                            </div>
                            <p className="text-sm text-ink-600">Готовый PDF с заданиями под класс и уровень.</p>
                        </Card>

                        <Card interactive>
                            <div className="flex items-center gap-3 mb-3">
                                <IconTile color="info" size="md"><HelpCircle className="w-4 h-4" /></IconTile>
                                <div>
                                    <div className="font-semibold text-ink-900">Тест</div>
                                    <div className="text-xs text-ink-500">3 токена · ~30 сек</div>
                                </div>
                            </div>
                            <p className="text-sm text-ink-600">5-25 вопросов с автоматическим ключом ответов.</p>
                        </Card>

                        <Card elevated>
                            <div className="flex items-center gap-3 mb-3">
                                <IconTile color="warning" size="md"><Presentation className="w-4 h-4" /></IconTile>
                                <div>
                                    <div className="font-semibold text-ink-900">Презентация</div>
                                    <div className="text-xs text-ink-500">50 токенов · ~2 мин</div>
                                </div>
                            </div>
                            <p className="text-sm text-ink-600">PPTX с дизайном, картинками, формулами.</p>
                        </Card>
                    </div>
                </Section>

                {/* ─── Avatars ─── */}
                <Section title="Аватары" subtitle="Инициалы или картинка, разные размеры и цвета">
                    <div className="flex items-center gap-4 flex-wrap">
                        <Avatar name="Евгения Александрова" size="xs" />
                        <Avatar name="Мария Куликова" size="sm" />
                        <Avatar name="Дмитрий Волков" size="md" />
                        <Avatar name="Анна Соколова" size="lg" color="danger" />
                        <Avatar name="Ирина Смирнова" size="xl" color="success" />
                        <div className="inline-flex">
                            <Avatar name="К П" size="sm" color="danger" className="border-2 border-white -ml-2 first:ml-0" />
                            <Avatar name="А С" size="sm" color="warning" className="border-2 border-white -ml-2 first:ml-0" />
                            <Avatar name="М К" size="sm" color="info" className="border-2 border-white -ml-2 first:ml-0" />
                        </div>
                    </div>
                </Section>

                {/* ─── Toggle + tooltip ─── */}
                <Section title="Переключатели и тултипы">
                    <Card className="max-w-xl space-y-4">
                        <Toggle
                            checked={toggleA}
                            onChange={setToggleA}
                            label="Ученик сдал работу"
                            description="Push в Telegram + Email — как только появится новая работа"
                        />
                        <hr className="border-ink-100" />
                        <Toggle
                            checked={toggleB}
                            onChange={setToggleB}
                            label="Новые возможности продукта"
                            description="Раз в 2 недели — что нового, что улучшили"
                        />
                        <hr className="border-ink-100" />
                        <div className="flex items-center gap-3">
                            <Tooltip content="Скопировано в буфер обмена">
                                <Button variant="secondary" size="sm">Hover для подсказки</Button>
                            </Tooltip>
                            <Tooltip content="Tooltip справа" side="right">
                                <Button variant="ghost" size="sm">Right tooltip</Button>
                            </Tooltip>
                        </div>
                    </Card>
                </Section>

                {/* ─── Topbar widgets ─── */}
                <Section title="Виджеты topbar" subtitle="Чип баланса, аватар, уведомления">
                    <Card className="flex items-center gap-3">
                        <SearchBar placeholder="Найти материалы, учеников, классов…" kbdHint="⌘K" className="max-w-sm" />
                        <div className="flex-1"></div>
                        <TokenChip balance={9375} onClick={() => alert('Pricing')} />
                        <Button variant="ghost" size="sm" className="w-9 h-9 !p-0 relative" aria-label="Уведомления">
                            <Bell className="w-4 h-4" />
                            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-brand-500 rounded-full border-2 border-white" />
                        </Button>
                        <Avatar name="Евгения А." size="sm" />
                    </Card>
                </Section>

                {/* ─── Modal ─── */}
                <Section title="Модал">
                    <Button variant="primary" onClick={() => setModalOpen(true)} leftIcon={<Settings className="w-4 h-4" />}>
                        Открыть модал
                    </Button>

                    <Modal
                        open={modalOpen}
                        onClose={() => setModalOpen(false)}
                        title="Подтверждение действия"
                        description="Удалить материал? Это действие нельзя отменить."
                    >
                        <div className="p-5">
                            <p className="text-sm text-ink-600 mb-5">
                                Если у материала есть назначенные задания, они тоже будут удалены.
                                Ученики потеряют доступ к выполнению.
                            </p>
                            <div className="flex justify-end gap-2">
                                <Button variant="ghost" onClick={() => setModalOpen(false)}>Отмена</Button>
                                <Button variant="danger" onClick={() => setModalOpen(false)}>Да, удалить</Button>
                            </div>
                        </div>
                    </Modal>
                </Section>

                {/* ─── Footer ─── */}
                <div className="mt-16 pt-6 border-t border-ink-200 text-xs text-ink-500">
                    <strong className="text-ink-900">Foundation v0.1</strong> — Фаза 0 плана миграции выполнена.
                    Следующая фаза: новый Sidebar + Topbar + DashboardLayout.
                </div>

            </div>
        </div>
    )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
    return (
        <section className="mb-12">
            <div className="mb-4">
                <h2 className="font-display text-xl font-bold text-ink-900 tracking-tight">{title}</h2>
                {subtitle && <p className="text-sm text-ink-500 mt-1">{subtitle}</p>}
            </div>
            {children}
        </section>
    )
}
