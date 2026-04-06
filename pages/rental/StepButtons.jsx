export default function StepButtons({ leftBtns, rightBtns }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      marginTop: 24,
      paddingTop: 16,
      borderTop: '1px solid var(--border)'
    }}>
      <div style={{ display: 'flex', gap: 10 }}>
        {leftBtns}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        {rightBtns}
      </div>
    </div>
  )
}
