export default function BotCTA({ text = 'Попробовать ИИ-бота' }: { text?: string }) {
  return (
    <div
      style={{
        margin: '32px 0',
        padding: '24px 28px',
        background: '#f0fdf4',
        border: '1.5px solid #bbf7d0',
        borderRadius: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      <div>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 17, color: '#14532d', lineHeight: 1.3 }}>
          ИИ-бот в Telegram
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: '#166534', lineHeight: 1.4 }}>
          Генерирует материалы прямо в мессенджере. Без регистрации.
        </p>
      </div>
      <a
        href="https://t.me/prepodavai_bot"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-block',
          padding: '10px 22px',
          background: '#22c55e',
          color: 'white',
          borderRadius: 10,
          textDecoration: 'none',
          fontWeight: 700,
          fontSize: 14,
          whiteSpace: 'nowrap',
        }}
      >
        {text} →
      </a>
    </div>
  )
}
