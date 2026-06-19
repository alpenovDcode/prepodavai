export default function RegisterCTA({ text = 'Начать бесплатно' }: { text?: string }) {
  return (
    <div
      not-prose="true"
      style={{
        margin: '32px 0',
        padding: '28px 32px',
        background: 'linear-gradient(135deg, #1a120c 0%, #2c1a0e 100%)',
        borderRadius: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      <div>
        <p style={{ margin: 0, color: 'white', fontWeight: 700, fontSize: 18, lineHeight: 1.3 }}>
          ПреподавAI — бесплатно
        </p>
        <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.65)', fontSize: 14, lineHeight: 1.4 }}>
          11 инструментов для подготовки урока за минуты
        </p>
      </div>
      <a
        href="https://prepodavai.ru/?auth=register"
        style={{
          display: 'inline-block',
          padding: '12px 24px',
          background: '#f97316',
          color: 'white',
          borderRadius: 10,
          textDecoration: 'none',
          fontWeight: 700,
          fontSize: 15,
          whiteSpace: 'nowrap',
          boxShadow: '0 8px 22px rgba(249,115,22,0.36)',
        }}
      >
        {text} →
      </a>
    </div>
  )
}
