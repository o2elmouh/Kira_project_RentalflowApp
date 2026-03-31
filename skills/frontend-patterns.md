---
name: frontend-patterns
description: Frontend patterns for React 18, state management, performance optimization, and UI best practices.
origin: ECC
---

# Frontend Development Patterns

## When to Activate
- Building React components
- Managing state (useState, useReducer, Context)
- Optimizing performance (memoization, code splitting)
- Working with forms and validation
- Building accessible UI patterns

## Composition Over Inheritance
```tsx
export function Card({ children, variant = 'default' }) {
  return <div className={`card card-${variant}`}>{children}</div>
}
export function CardHeader({ children }) { return <div className="card-header">{children}</div> }
export function CardBody({ children }) { return <div className="card-body">{children}</div> }
```

## Context + Reducer Pattern
```tsx
type Action = { type: 'SET_DATA'; payload: Item[] } | { type: 'SET_LOADING'; payload: boolean }

function reducer(state, action) {
  switch (action.type) {
    case 'SET_DATA': return { ...state, data: action.payload }
    case 'SET_LOADING': return { ...state, loading: action.payload }
    default: return state
  }
}

export function DataProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, { data: [], loading: false })
  return <DataContext.Provider value={{ state, dispatch }}>{children}</DataContext.Provider>
}
```

## Custom Hooks
```tsx
// Debounce
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// Toggle
export function useToggle(init = false): [boolean, () => void] {
  const [val, setVal] = useState(init)
  return [val, useCallback(() => setVal(v => !v), [])]
}
```

## Performance
```tsx
// Memoization
const sorted = useMemo(() => items.sort((a, b) => b.value - a.value), [items])
const handler = useCallback((id: string) => deleteItem(id), [])
export const ItemCard = React.memo(({ item }) => <div>{item.name}</div>)

// Code splitting
const HeavyChart = lazy(() => import('./HeavyChart'))
<Suspense fallback={<Skeleton />}><HeavyChart /></Suspense>
```

## Form with Validation
```tsx
export function RentalForm() {
  const [data, setData] = useState({ clientName: '', startDate: '' })
  const [errors, setErrors] = useState({})

  const validate = () => {
    const errs = {}
    if (!data.clientName.trim()) errs.clientName = 'Requis'
    if (!data.startDate) errs.startDate = 'Requis'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!validate()) return
    // submit
  }

  return (
    <form onSubmit={handleSubmit}>
      <input value={data.clientName} onChange={e => setData(p => ({ ...p, clientName: e.target.value }))} />
      {errors.clientName && <span>{errors.clientName}</span>}
    </form>
  )
}
```

## Error Boundary
```tsx
export class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null }
  static getDerivedStateFromError(error) { return { hasError: true, error } }
  render() {
    if (this.state.hasError) return (
      <div className="alert alert-warn">
        <p>Une erreur s'est produite.</p>
        <button onClick={() => this.setState({ hasError: false })}>Réessayer</button>
      </div>
    )
    return this.props.children
  }
}
```
