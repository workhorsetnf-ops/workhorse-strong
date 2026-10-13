import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { sumMacros, targetsFrom } from '../../lib/mealplan'
import { PlanTargets, PlanCards, DailyTotalBar } from '../coach/MealPlanView'
import NutritionTabs from './NutritionTabs'

export default function ClientMealPlan() {
  const { profile } = useAuth()
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!profile) return
    Promise.all([
      supabase.from('profiles').select('protein_g, carbs_g, fat_g, calories, phase').eq('id', profile.id).single(),
      supabase.from('meal_plans').select('*').eq('client_id', profile.id).maybeSingle(),
      supabase.from('meal_plan_meals').select('*').eq('client_id', profile.id).order('position').order('created_at'),
      supabase.from('meal_plan_items').select('*').eq('client_id', profile.id).order('position').order('created_at'),
    ]).then(([{ data: me }, { data: plan }, { data: meals }, { data: items }]) => setData({ me: me || profile, plan, meals: meals || [], items: items || [] }))
  }, [profile])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <NutritionTabs />
      <header>
        <div className="eyebrow">Your plan</div>
        <h1 style={{ fontSize: 24, marginTop: 4 }}>Meal Plan</h1>
      </header>
      {!data && <p className="muted">Loading…</p>}
      {data && data.meals.length === 0 && <div className="card muted" style={{ fontSize: 14 }}>Your coach hasn't built your meal plan yet. Your daily targets are below.</div>}
      {data && <>
        <PlanTargets compact targets={targetsFrom(data.me, data.plan)} totals={sumMacros(data.items)} />
        {data.meals.length > 0 && <>
          <PlanCards meals={data.meals} items={data.items} />
          <DailyTotalBar totals={sumMacros(data.items)} />
          <p className="muted" style={{ fontSize: 11.5 }}>Weigh foods as listed (meats and rice are cooked weights). Swap lines are close macro matches if you need a change.</p>
        </>}
      </>}
    </div>
  )
}
