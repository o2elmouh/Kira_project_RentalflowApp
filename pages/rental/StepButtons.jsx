export default function StepButtons({ leftBtns, rightBtns }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      marginTop: 28,
      paddingTop: 20,
      borderTop: '1px solid rgba(0,0,0,0.07)',
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
