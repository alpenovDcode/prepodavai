'use client'

import { useState } from 'react'
import {
  Users, Library, Video, Link2, UserPlus, Gift, Award,
  Copy, Share2, Send, MessageCircle, Phone, Mail,
  CheckCircle2, Lock, Sparkles, Clock, Compass, Download,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useReferralStats, useReferralsList, useCreateReferralCode, type ReferralTier, type ReferralListItem } from '@/lib/hooks/useReferrals'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useMobileMenu } from '@/components/layout/v2/DashboardLayoutV2'
import { useTour } from '@/lib/tour/useTour'
import { Button } from '@/components/ui/v2/Button'
import { Badge } from '@/components/ui/v2/Badge'
import { Avatar } from '@/components/ui/v2/Avatar'
import { Input } from '@/components/ui/v2/Input'

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatNextWebinar(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const day = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  return `${day} в ${time}`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

// ─── main component ──────────────────────────────────────────────────────────

export default function ReferralsPageV2() {
  const menu = useMobileMenu()
  const tour = useTour()
  const { data: stats, isLoading: statsLoading } = useReferralStats()
  const { data: listData } = useReferralsList()
  const createCode = useCreateReferralCode()
  const [customCode, setCustomCode] = useState('')

  const code = stats?.code ?? null
  const shareUrl = stats?.shareUrl ?? ''

  // Копирование ссылки
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      toast.success('Скопировано')
    } catch {
      toast.error('Не удалось скопировать')
    }
  }

  // Шеринг через Web Share API с fallback на clipboard
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Преподавай',
          text: 'Присоединяйтесь к платформе для учителей',
          url: shareUrl,
        })
      } catch { /* отменено */ }
    } else {
      await copyLink()
    }
  }

  const openShare = (url: string) => window.open(url, '_blank', 'noopener')

  const shareText = encodeURIComponent('Присоединяйтесь к Преподаваю — платформе для учителей: ')
  const encodedUrl = encodeURIComponent(shareUrl)

  return (
    <>
      <Topbar
        title="Пригласить коллег"
        subtitle="Делитесь платформой и открывайте новые возможности для своих уроков"
        onMobileMenuToggle={menu.toggle}
        hideSearch
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" leftIcon={<Compass className="w-3.5 h-3.5" />}
              onClick={tour.start}>
              Тур
            </Button>
            <Button variant="secondary" size="sm" leftIcon={<Download className="w-3.5 h-3.5" />}
              onClick={() => toast('Скоро', { icon: '📦' })}>
              Промо-материалы
            </Button>
          </div>
        }
      />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'clamp(20px,3vw,28px) clamp(16px,3vw,32px) 48px', width: '100%' }}>

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <div data-tour="hero" style={{
          background: 'radial-gradient(at 100% 0%, rgba(255,126,88,0.18), transparent 50%), radial-gradient(at 0% 100%, rgba(255,168,138,0.14), transparent 50%), linear-gradient(135deg, var(--brand-50), #FFFFFF 70%)',
          border: '1px solid var(--brand-200)',
          borderRadius: 'var(--r-xl)',
          padding: 'clamp(20px,4vw,36px)',
          marginBottom: 24,
        }}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(24px,4vw,34px)',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            lineHeight: 1.15,
            marginBottom: 12,
            maxWidth: 640,
            color: 'var(--ink-900)',
          }}>
            Помогите коллегам,{' '}
            <span style={{ color: 'var(--brand-600)' }}>а мы поможем вам стать лучшим учителем</span>
          </h1>

          <p style={{
            color: 'var(--ink-600)',
            fontSize: 'clamp(14px,2vw,16px)',
            maxWidth: 600,
            lineHeight: 1.6,
            marginBottom: 24,
          }}>
            Поделитесь Преподаваем с другими учителями. За приглашённых вы получаете доступ
            к эксклюзивным материалам, вебинарам с топ-методистами и статус наставника в нашем
            сообществе. Это про развитие, а не про деньги.
          </p>

          {/* Ссылка или форма создания */}
          {!statsLoading && code === null ? (
            <CreateCodeForm
              customCode={customCode}
              onChangeCode={setCustomCode}
              onSubmit={() => createCode.mutate(customCode || undefined)}
              loading={createCode.isPending}
            />
          ) : (
            <>
              {/* ref-link */}
              <div data-tour="ref-link" style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'white',
                border: '1px solid var(--ink-200)',
                borderRadius: 'var(--r-md)',
                padding: '8px 8px 8px 16px',
                maxWidth: 560,
                flexWrap: 'wrap',
              }}>
                <span style={{
                  flex: '1 1 200px', minWidth: 0,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 14,
                  color: 'var(--ink-700)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  prepodavai.ru/?ref=<span style={{ color: 'var(--brand-600)', fontWeight: 700 }}>{code ?? '…'}</span>
                </span>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <Button variant="secondary" size="sm" leftIcon={<Copy className="w-3.5 h-3.5" />} onClick={copyLink}>
                    Скопировать
                  </Button>
                  <Button variant="primary" size="sm" leftIcon={<Share2 className="w-3.5 h-3.5" />} onClick={handleShare}>
                    Поделиться
                  </Button>
                </div>
              </div>

              {/* share-row */}
              <div data-tour="share-buttons" style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                <ShareBtn
                  color="#0088CC"
                  icon={<Send className="w-[13px] h-[13px]" />}
                  label="Telegram"
                  onClick={() => openShare(`https://t.me/share/url?url=${encodedUrl}&text=${shareText}`)}
                />
                <ShareBtn
                  color="linear-gradient(135deg,#5B47FB,#9747FB)"
                  icon={<MessageCircle className="w-[13px] h-[13px]" />}
                  label="MAX"
                  onClick={copyLink}
                />
                <ShareBtn
                  color="#25D366"
                  icon={<Phone className="w-[13px] h-[13px]" />}
                  label="WhatsApp"
                  onClick={() => openShare(`https://wa.me/?text=${shareText}${encodedUrl}`)}
                />
                <ShareBtn
                  color="var(--ink-700)"
                  icon={<Mail className="w-[13px] h-[13px]" />}
                  label="Email"
                  onClick={() => openShare(`mailto:?subject=${encodeURIComponent('Преподавай')}&body=${shareText}${encodedUrl}`)}
                />
              </div>
            </>
          )}
        </div>

        {/* ── KPI ──────────────────────────────────────────────────────────── */}
        <div data-tour="kpi" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))',
          gap: 14,
          marginBottom: 28,
        }}>
          {/* Пригласили коллег */}
          <KpiCard
            iconEl={<Users className="w-[14px] h-[14px]" />}
            label="Пригласили коллег"
            value={String(stats?.totalInvited ?? 0)}
            sub={stats?.monthlyDelta ? `+${stats.monthlyDelta} за этот месяц` : 'Начните приглашать коллег'}
          />
          {/* Эксклюзивных материалов — highlight */}
          <KpiCard
            iconEl={<Library className="w-[14px] h-[14px]" />}
            label="Эксклюзивных материалов"
            value={`${stats?.exclusiveMaterials ?? 0}`}
            unit="шт."
            sub="Готовые шаблоны от методистов · в Материалах"
            highlight
          />
          {/* Доступно вебинаров */}
          <KpiCard
            iconEl={<Video className="w-[14px] h-[14px]" />}
            label="Доступно вебинаров"
            value={String(stats?.webinarsAvailable ?? 0)}
            sub={stats?.nextWebinarAt
              ? `Ближайший — ${formatNextWebinar(stats.nextWebinarAt)}`
              : 'Откройте уровень 2 для доступа'}
            iconStyle={{ background: 'var(--success-50)', color: 'var(--success-700)' }}
          />
        </div>

        {/* ── Как это работает ─────────────────────────────────────────────── */}
        <SectionHead title="Как это работает" subtitle="Три простых шага" />
        <div data-tour="how-it-works" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))',
          gap: 14,
          marginBottom: 28,
        }}>
          <HowStep n="01" icon={<Link2 className="w-[22px] h-[22px]" />}
            title="Поделитесь ссылкой"
            desc="В мессенджере, email или просто скопируйте и отправьте лично коллеге-учителю." />
          <HowStep n="02" icon={<UserPlus className="w-[22px] h-[22px]" />}
            title="Коллега начинает работать"
            desc="Регистрируется, осваивает Генератор, создаёт первый рабочий лист или тест." />
          <HowStep n="03" icon={<Gift className="w-[22px] h-[22px]" />}
            title="Вам открываются возможности"
            desc="Эксклюзивные материалы, вебинары экспертов, статус наставника — выбор за вами." />
        </div>

        {/* ── Что вы получаете ─────────────────────────────────────────────── */}
        <SectionHead title="Что вы получаете" subtitle="Три уровня — каждый открывает новые возможности для роста" />
        <div data-tour="rewards" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))',
          gap: 16,
          marginBottom: 28,
        }}>
          {stats?.tiers ? (
            <>
              <RewardCard
                tier={stats.tiers[0]}
                icon={<Library className="w-[28px] h-[28px]" />}
                conditionIcon={<UserPlus className="w-[12px] h-[12px]" />}
                conditionText="Уже 1 коллега"
                title="Эксклюзивные материалы от методистов"
                desc="Сборники готовых рабочих листов, тестов и презентаций от ведущих методистов. Это не сгенерированные ИИ — это проверенные материалы, которые недоступны в обычном Генераторе."
                statusContent={<>
                  <CheckCircle2 className="w-[16px] h-[16px] flex-shrink-0" />
                  <span>Открыто · {stats.exclusiveMaterials} материалов в библиотеке</span>
                </>}
                tierIndex={0}
              />
              <RewardCard
                tier={stats.tiers[1]}
                icon={<Video className="w-[28px] h-[28px]" />}
                conditionIcon={<UserPlus className="w-[12px] h-[12px]" />}
                conditionText="3 активных коллеги"
                title="Закрытые вебинары и мастер-классы"
                desc="Доступ в методический клуб: ежемесячные онлайн-встречи с топ-учителями страны, разборы сложных тем, обмен опытом, возможность задать вопрос эксперту."
                statusContent={<TierProgress tier={stats.tiers[1]} />}
                tierIndex={1}
              />
              <RewardCard
                tier={stats.tiers[2]}
                icon={<Award className="w-[28px] h-[28px]" />}
                conditionIcon={<Lock className="w-[11px] h-[11px]" />}
                conditionText="8 активных коллег"
                title="Статус «Наставник» + методический набор"
                desc="Именной сертификат «Наставник Преподавай» для портфолио, физический набор учителя в подарок (планер, ручки, наклейки для класса), отдельный значок в сообществе."
                statusContent={<TierProgress tier={stats.tiers[2]} labelBefore="До цели" />}
                tierIndex={2}
              />
            </>
          ) : (
            // skeleton
            [0, 1, 2].map(i => (
              <div key={i} style={{
                background: 'var(--ink-50)',
                border: '1px solid var(--ink-100)',
                borderRadius: 'var(--r-lg)',
                height: 260,
                animation: 'pulse 1.5s ease-in-out infinite',
              }} />
            ))
          )}
        </div>

        {/* ── Кого вы пригласили ────────────────────────────────────────────── */}
        <div data-tour="invitees" style={{
          background: 'var(--surface)',
          border: '1px solid var(--ink-200)',
          borderRadius: 'var(--r-lg)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)',
        }}>
          {/* head */}
          <div style={{
            padding: '18px 22px',
            borderBottom: '1px solid var(--ink-100)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
          }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-900)', margin: 0 }}>
                Кого вы пригласили
              </h2>
              <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>
                Видите статус каждого и какие награды открыли
              </div>
            </div>
            {(listData?.total ?? 0) > 0 && (
              <Button variant="secondary" size="sm">
                Все {listData?.total}
              </Button>
            )}
          </div>

          {/* header row */}
          {(listData?.items?.length ?? 0) > 0 && (
            <InviteeHeaderRow />
          )}

          {/* items */}
          {listData?.items?.length === 0 || listData === undefined ? (
            <div style={{ padding: '32px 22px', textAlign: 'center', color: 'var(--ink-500)', fontSize: 13 }}>
              Пока никого не пригласили. Поделитесь ссылкой выше.
            </div>
          ) : (
            listData.items.map(item => (
              <InviteeRow key={item.id} item={item} />
            ))
          )}
        </div>

      </div>
    </>
  )
}

// ─── sub-components ───────────────────────────────────────────────────────────

function CreateCodeForm({
  customCode,
  onChangeCode,
  onSubmit,
  loading,
}: {
  customCode: string
  onChangeCode: (v: string) => void
  onSubmit: () => void
  loading: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap', maxWidth: 500 }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <Input
          label="Желаемый код (необязательно)"
          value={customCode}
          onChange={e => onChangeCode(e.target.value.toUpperCase())}
          placeholder="MYCODE2026"
        />
      </div>
      <Button variant="primary" onClick={onSubmit} loading={loading} style={{ marginBottom: 1 }}>
        Создать код
      </Button>
    </div>
  )
}

function ShareBtn({
  color,
  icon,
  label,
  onClick,
}: {
  color: string
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 42,
        padding: '0 16px',
        borderRadius: 'var(--r-md)',
        border: '1px solid var(--ink-200)',
        background: 'white',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        color: 'var(--ink-700)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--ink-300)'
        ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--ink-50)'
        ;(e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--ink-200)'
        ;(e.currentTarget as HTMLButtonElement).style.background = 'white'
        ;(e.currentTarget as HTMLButtonElement).style.transform = 'none'
      }}
    >
      <span style={{
        width: 22, height: 22,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        flexShrink: 0,
        background: color,
      }}>
        {icon}
      </span>
      {label}
    </button>
  )
}

function KpiCard({
  iconEl,
  label,
  value,
  unit,
  sub,
  highlight,
  iconStyle,
}: {
  iconEl: React.ReactNode
  label: string
  value: string
  unit?: string
  sub: string
  highlight?: boolean
  iconStyle?: React.CSSProperties
}) {
  return (
    <div style={{
      background: highlight
        ? 'linear-gradient(135deg, var(--brand-50), #FFFFFF 60%)'
        : 'var(--surface)',
      border: `1px solid ${highlight ? 'var(--brand-200)' : 'var(--ink-200)'}`,
      borderRadius: 'var(--r-lg)',
      padding: '20px 22px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--ink-500)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{
          width: 28, height: 28,
          borderRadius: 'var(--r-sm)',
          background: highlight ? 'white' : 'var(--brand-50)',
          color: highlight ? 'var(--brand-600)' : 'var(--brand-700)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          ...iconStyle,
        }}>
          {iconEl}
        </span>
        {label}
      </div>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: 30,
        fontWeight: 800,
        color: highlight ? 'var(--brand-700)' : 'var(--ink-900)',
        letterSpacing: '-0.02em',
        lineHeight: 1.1,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
        {unit && <span style={{ fontSize: 17, color: 'var(--ink-500)', fontWeight: 600, marginLeft: 4 }}>{unit}</span>}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-500)', lineHeight: 1.4 }}>{sub}</div>
    </div>
  )
}

function SectionHead({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink-900)', margin: 0 }}>{title}</h2>
      <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 3 }}>{subtitle}</div>
    </div>
  )
}

function HowStep({ n, icon, title, desc }: { n: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--ink-200)',
      borderRadius: 'var(--r-lg)',
      padding: '22px 22px 20px',
      position: 'relative',
    }}>
      <span style={{
        position: 'absolute', top: 18, right: 22,
        fontFamily: 'var(--font-display)',
        fontSize: 14,
        fontWeight: 800,
        color: 'var(--ink-200)',
        letterSpacing: '-0.02em',
      }}>{n}</span>
      <div style={{
        width: 44, height: 44,
        borderRadius: 'var(--r-md)',
        background: 'var(--brand-50)',
        color: 'var(--brand-700)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
      }}>{icon}</div>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)', marginBottom: 6, marginTop: 0 }}>{title}</h3>
      <p style={{ fontSize: 13, color: 'var(--ink-600)', lineHeight: 1.55, margin: 0 }}>{desc}</p>
    </div>
  )
}

function rewardCardClass(tier: ReferralTier, index: number): 'is-unlocked' | 'is-progress' | 'is-locked' {
  if (tier.status === 'unlocked') return 'is-unlocked'
  if (index === 2) return 'is-locked'
  return tier.status === 'progress' ? 'is-progress' : 'is-locked'
}

function RewardCard({
  tier, icon, conditionIcon, conditionText, title, desc, statusContent, tierIndex,
}: {
  tier: ReferralTier
  icon: React.ReactNode
  conditionIcon: React.ReactNode
  conditionText: string
  title: string
  desc: string
  statusContent: React.ReactNode
  tierIndex: number
}) {
  const cls = rewardCardClass(tier, tierIndex)

  const cardBg = cls === 'is-unlocked'
    ? 'linear-gradient(135deg, #ECFDF5 0%, #FFFFFF 60%)'
    : 'var(--surface)'
  const cardBorder = cls === 'is-unlocked' ? '#A7F3D0' : 'var(--ink-200)'

  const iconBg = cls === 'is-unlocked' ? 'var(--success-50)' : cls === 'is-progress' ? 'var(--brand-50)' : 'var(--ink-100)'
  const iconColor = cls === 'is-unlocked' ? 'var(--success-700)' : cls === 'is-progress' ? 'var(--brand-600)' : 'var(--ink-500)'

  const condBg = cls === 'is-unlocked' ? 'var(--success-50)' : cls === 'is-progress' ? 'var(--brand-50)' : 'var(--ink-100)'
  const condColor = cls === 'is-unlocked' ? 'var(--success-700)' : cls === 'is-progress' ? 'var(--brand-700)' : 'var(--ink-700)'

  const statusBg = cls === 'is-unlocked' ? 'white' : 'var(--surface-soft, var(--ink-50))'
  const statusColor = cls === 'is-unlocked' ? 'var(--success-700)' : 'var(--ink-600)'

  return (
    <div style={{
      background: cardBg,
      border: `1px solid ${cardBorder}`,
      borderRadius: 'var(--r-lg)',
      padding: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      opacity: cls === 'is-locked' ? 0.85 : 1,
      transition: 'all 0.2s ease',
    }}>
      <div style={{
        width: 56, height: 56,
        borderRadius: 'var(--r-lg)',
        background: iconBg,
        color: iconColor,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>{icon}</div>

      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'flex-start',
        padding: '4px 10px',
        background: condBg,
        color: condColor,
        borderRadius: 'var(--r-full)',
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {conditionIcon} {conditionText}
      </span>

      <h3 style={{
        fontFamily: 'var(--font-display)',
        fontSize: 18,
        fontWeight: 800,
        color: cls === 'is-locked' ? 'var(--ink-700)' : 'var(--ink-900)',
        letterSpacing: '-0.01em',
        lineHeight: 1.3,
        margin: 0,
      }}>{title}</h3>

      <p style={{
        fontSize: 13.5,
        color: cls === 'is-locked' ? 'var(--ink-500)' : 'var(--ink-600)',
        lineHeight: 1.6,
        margin: 0,
        flex: 1,
      }}>{desc}</p>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 12px',
        background: statusBg,
        borderRadius: 'var(--r-md)',
        fontSize: 12.5,
        color: statusColor,
        fontWeight: cls === 'is-unlocked' ? 600 : 400,
        marginTop: 'auto',
      }}>
        {statusContent}
      </div>
    </div>
  )
}

function TierProgress({ tier, labelBefore = 'Прогресс' }: { tier: ReferralTier; labelBefore?: string }) {
  const pct = Math.min(100, Math.round((tier.current / tier.required) * 100))
  const done = tier.status === 'unlocked'
  return (
    <>
      <span style={{ whiteSpace: 'nowrap' }}>{labelBefore}</span>
      <div style={{
        flex: 1,
        height: 6,
        background: 'var(--ink-100)',
        borderRadius: 'var(--r-full)',
        overflow: 'hidden',
      }}>
        <i style={{
          display: 'block',
          height: '100%',
          width: `${pct}%`,
          background: 'linear-gradient(90deg, var(--brand-400), var(--brand-600))',
          borderRadius: 'var(--r-full)',
        }} />
      </div>
      <span style={{
        whiteSpace: 'nowrap',
        fontWeight: 600,
        color: done ? 'var(--success-700)' : 'inherit',
      }}>
        {Math.min(tier.current, tier.required)} / {tier.required}{done ? ' ✓' : ''}
      </span>
    </>
  )
}

function InviteeHeaderRow() {
  const cellStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '0.05em' }
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(180px,2fr) minmax(180px,1.2fr) minmax(160px,1fr)',
      gap: 16,
      padding: '10px 22px',
      background: 'var(--ink-50, #F9F9F9)',
      borderBottom: '1px solid var(--ink-100)',
    }} className="max-sm:hidden">
      <div style={cellStyle}>Учитель</div>
      <div style={cellStyle}>Что делает на платформе</div>
      <div style={{ ...cellStyle, textAlign: 'right' }}>Вклад в ваши награды</div>
    </div>
  )
}

function InviteeRow({ item }: { item: ReferralListItem }) {
  const statusConfig = {
    master:  { variant: 'brand'    as const, icon: <Award className="w-[12px] h-[12px]" />,    text: 'Опытный пользователь' },
    active:  { variant: 'success'  as const, icon: <Sparkles className="w-[12px] h-[12px]" />, text: 'Активно работает' },
    pending: { variant: 'warning'  as const, icon: <Clock className="w-[12px] h-[12px]" />,    text: 'Ещё не создавал(а) материалы' },
  }
  const cfg = statusConfig[item.status]

  const rewardText = item.status === 'master'
    ? 'Открыл все уровни'
    : item.status === 'active'
    ? `+${item.materialsCreated} материалов`
    : ''

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-4 px-[22px] border-b border-ink-100 items-center sm:gap-4 max-sm:gap-2 max-sm:py-3.5 max-sm:px-4">
      {/* Учитель */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <Avatar name={item.name} size="sm" />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: 'var(--ink-900)', fontSize: 14, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.name}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 2 }}>
            {formatDate(item.registeredAt)} · {item.materialsCreated} материалов
          </div>
        </div>
      </div>

      {/* Статус */}
      <div>
        <Badge variant={cfg.variant} icon={cfg.icon}>{cfg.text}</Badge>
      </div>

      {/* Вклад */}
      <div style={{ fontSize: 13, color: 'var(--ink-700)', textAlign: 'right', fontWeight: 600 }}
           className="max-sm:text-left">
        {rewardText
          ? rewardText
          : <span style={{ color: 'var(--ink-400)', fontWeight: 500 }}>пока ничего</span>
        }
      </div>
    </div>
  )
}
