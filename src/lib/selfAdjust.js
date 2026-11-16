// Group self-adjust (Update 182): what the Eat tab card says for each answer
// from self_adjust_check(). The database decides; this only words it.

const fmtDay = iso => {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
const signed = n => (Number(n) > 0 ? '+' : '') + Number(n).toFixed(1)

// returns null (show nothing) or { tone, title, body, cta }
export function selfAdjustCopy(r, { tier } = {}) {
  if (!r || !r.kind || r.kind === 'none') return null
  const step = r.step || 30
  const trend = r.avg_base != null
    ? `Your weekly average went from ${Number(r.avg_base).toFixed(1)} to ${Number(r.avg_recent).toFixed(1)} lb (${signed(r.change_lb)} lb).`
    : ''
  switch (r.kind) {
    case 'wait':
      return { tone: 'muted', title: 'Next macro check: ' + fmtDay(r.next_check),
        body: r.changed_on
          ? 'Every change gets two full weeks before you judge it. Keep logging and weighing in.'
          : 'Your first check is three weeks after you join: one week to set your starting average, then two to compare. Keep logging and weighing in.' }
    case 'logging':
      return { tone: 'warn', title: 'Macro check: tighten up logging first',
        body: `You logged ${r.logged_recent} of 7 days last week and ${r.logged_prior} of 7 the week before. You need at least 6 of 7 both weeks before anything changes. You can't fix what you didn't track.` }
    case 'weighins':
      return { tone: 'warn', title: 'Macro check: more weigh-ins needed',
        body: `You weighed in ${r.weighins_recent} times in the last 7 days and ${r.weighins_base} times in the week you're being compared against. You need at least 4 in each. Weigh in every morning.` }
    case 'moving':
      return { tone: 'good', title: 'Macro check: you\'re on track',
        body: `${trend} That's the pace you want, so nothing changes. Keep going.` }
    case 'floor':
      return { tone: 'warn', title: 'Macro check: time to talk to Coach',
        body: `${trend} Your carbs are already close to the ${r.floor || 100} g floor, so the app won't take more off. Message Coach${tier === 'w90' ? ' or bring it to your monthly call' : ''} and he'll look at it with you.`,
        cta: 'message' }
    case 'down':
    case 'up': {
      const off = r.kind === 'down'
      return { tone: 'action', title: off ? 'Macro check: time to take carbs down' : 'Macro check: time to add carbs',
        body: `${trend} You logged ${r.logged_recent}/7 and ${r.logged_prior}/7 days, so the guide says ${off ? 'take' : 'add'} ${step} g of carbs ${off ? 'off' : 'on'}. Protein and fat stay the same.`,
        cta: 'apply' }
    }
    default:
      return null
  }
}

export const macroLine = m => m ? `${m.p} P · ${m.c} C · ${m.f} F · ${m.kcal} kcal` : ''
