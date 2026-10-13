import { NavLink } from 'react-router-dom'

// Meal Plan · Food Log · Shopping — the three nutrition tabs from the sheet.
export default function NutritionTabs() {
  const tabs = [['/app/nutrition/plan', 'Meal Plan'], ['/app/nutrition', 'Food Log'], ['/app/nutrition/shopping', 'Shopping']]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, background: 'var(--coal)', border: '1px solid var(--line)', borderRadius: 10, padding: 4 }}>
      {tabs.map(([to, label]) => (
        <NavLink key={to} to={to} end
          style={({ isActive }) => ({ textAlign: 'center', padding: '8px 4px', borderRadius: 7, fontSize: 12.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', textDecoration: 'none',
            background: isActive ? 'var(--orange)' : 'transparent', color: isActive ? '#000' : 'var(--muted)' })}>{label}</NavLink>
      ))}
    </div>
  )
}
