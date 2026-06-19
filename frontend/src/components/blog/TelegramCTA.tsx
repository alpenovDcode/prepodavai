export default function TelegramCTA({ text = 'Подписаться на канал' }: { text?: string }) {
  return (
    <div
      style={{
        margin: '32px 0',
        padding: '24px 28px',
        background: '#f0f9ff',
        border: '1.5px solid #bae6fd',
        borderRadius: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      <div>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 17, color: '#0c4a6e', lineHeight: 1.3 }}>
          Telegram-канал Преподавай
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: '#075985', lineHeight: 1.4 }}>
          Методика, инструменты и истории из практики — раз в неделю
        </p>
      </div>
      <a
        href="https://t.me/prepodavai_news"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-block',
          padding: '10px 22px',
          background: '#0088cc',
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
