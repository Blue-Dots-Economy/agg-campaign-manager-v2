---
paths:
  - "src/**/*.tsx"
  - "src/hooks/**"
---

# Rule: React Components

Applies to the dashboard UI. Read `tanstack-start.md` with this for routes and data loading.

## Components

- Small and single-purpose. A component that fetches, filters, sorts and renders is three components.
- Props get a typed interface. No inline `any`, no untyped spread.
- List items need a stable, unique `key` — a real id. An array index is only safe when the list never reorders, never has items inserted, and is never filtered.
- Build on the existing shadcn/ui primitives in `src/components/ui/` instead of new one-off widgets. Do not edit those primitives for a single page's needs.
- Program-specific labels, columns and KPIs come from the active program config, not from conditions on the program id inside a component.

## State and props

- Never mutate state or props. Build a new value.
- Use the functional setter when the next value depends on the previous one: `setCount((prev) => prev + 1)`.
- Derive during render instead of mirroring into state. A value computed from props is always correct; a copy in state goes stale.
- Lift state to the nearest common parent when siblings need it.
- Avoid deep prop drilling. Use an existing context (`src/auth/context.tsx`, `src/programs/context.tsx`).

```tsx
// ✅ derived
const visible = rows.filter((r) => r.status !== "done");

// ❌ duplicated in state, needs an effect to stay in sync
const [visible, setVisible] = useState(rows);
useEffect(() => setVisible(rows.filter((r) => r.status !== "done")), [rows]);
```

## Hooks and effects

- Rules of hooks: top level of a component or another hook only. Never in a condition, loop or callback.
- Keep effects minimal. Most things written as an effect are an event handler or a derived value. An effect is for synchronising with something outside React.
- Return a cleanup function from any effect that subscribes, polls, or sets a timer.
- Do not add `useMemo` or `useCallback` by default. Add one when a measurement shows a cost, or when the value must stay referentially stable for another hook.
- **Do not fetch data in `useEffect`.** Read through TanStack Query (`useQuery` with `useServerFn`) as the existing hooks in `src/programs/` and `src/hooks/` do, and write through `useMutation`, invalidating the affected queries.

## UI conventions

- Sentence case for all labels and headings.
- Drop-reason colours come from the shared `reasonColor` helper (see `AGENTS.md`).
- Every interactive element is reachable by keyboard and has an accessible name.
