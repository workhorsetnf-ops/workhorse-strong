// "Get set up" checklist: which first-week steps a client has done.
// Pure function so the client card and the coach view use the same rules.

export function platformOf(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  if (/iPhone|iPad|iPod/.test(ua) || (/Mac/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'other'
}

// f: { platform, installed, pushOn, stepsSynced, anySteps, workout, food, checkin }
export function setupItems(f) {
  const ios = f.platform === 'ios'
  const items = [
    { key: 'install', label: 'Add the app to your Home Screen', done: !!f.installed, to: '/guide/notifications', cta: 'Show me how' },
    { key: 'push', label: 'Turn on notifications', done: !!f.pushOn, to: '/app/reminders', cta: 'Turn on' },
    ios
      ? { key: 'steps', label: 'Sync your steps from your iPhone', done: !!f.stepsSynced, to: '/app/steps-sync', cta: 'Set up' }
      : { key: 'steps', label: 'Log your steps', done: !!f.anySteps, to: '/app/progress', cta: 'Log steps' },
    { key: 'workout', label: 'Log your first workout', done: !!f.workout, to: '/app/training', cta: 'Train' },
    { key: 'food', label: 'Log your first meal', done: !!f.food, to: '/app/nutrition', cta: 'Log food' },
    { key: 'checkin', label: 'Submit your first check-in', done: !!f.checkin, to: '/app/checkin', cta: 'Check in' },
  ]
  return { items, done: items.filter(i => i.done).length, total: items.length }
}

export const SHORT = { install: 'Home Screen', push: 'Notifications', steps: 'Steps', workout: 'Workout', food: 'Food', checkin: 'Check-in' }
