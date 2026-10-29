// Tiny SVG kit for the setup-guide diagrams: a phone frame, text, rows,
// buttons, and an orange "tap here" ring. Everything is drawn in a 240 x 480
// box; the screen runs from (14,14) to (226,466).
import { useId } from 'react'

export const C = {
  orange: '#FF6A00', blue: '#0A84FF', green: '#34C759', red: '#FF3B30',
  iosBg: '#F2F2F7', card: '#FFFFFF', line: '#E5E5EA', ink: '#111111', sub: '#8E8E93',
  appBg: '#0B0B0B', appCard: '#1B1B1B', appLine: '#2E2E2E', white: '#F5F5F5', muted: '#9A9A9A',
  droidBg: '#FFFFFF', droidBar: '#F1F3F4',
}
export const X0 = 14, Y0 = 14, W = 212, H = 452, XR = X0 + W

export function Phone({ os = 'ios', bg = C.iosBg, dark = false, label, children }) {
  const cid = 'clip' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const ink = dark ? '#fff' : '#000'
  return (
    <svg viewBox="0 0 240 480" role="img" aria-label={label}
      style={{ width: '100%', maxWidth: 220, height: 'auto', display: 'block', margin: '0 auto' }}>
      <defs><clipPath id={cid}><rect x={X0} y={Y0} width={W} height={H} rx={26} /></clipPath></defs>
      <rect x={3} y={3} width={234} height={474} rx={37} fill="#1c1c1e" stroke="#48484a" strokeWidth={2} />
      <g clipPath={`url(#${cid})`}>
        <rect x={X0} y={Y0} width={W} height={H} fill={bg} />
        <T x={os === 'ios' ? 40 : 30} y={36} s={11} w={700} c={ink}>9:41</T>
        <rect x={190} y={28} width={18} height={9} rx={2.5} fill="none" stroke={ink} strokeWidth={1.2} />
        <rect x={192} y={30} width={11} height={5} rx={1} fill={ink} />
        {children}
      </g>
      {os === 'ios' ? <rect x={92} y={22} width={56} height={17} rx={8.5} fill="#000" /> : <circle cx={120} cy={29} r={5.5} fill="#000" />}
    </svg>
  )
}

export function T({ x, y, s = 10, w = 400, c = C.ink, a = 'start', children, mono }) {
  return <text x={x} y={y} fontSize={s} fontWeight={w} fill={c} textAnchor={a}
    fontFamily={mono ? 'ui-monospace, Menlo, monospace' : '-apple-system, system-ui, Roboto, sans-serif'}>{children}</text>
}

export function Box({ x, y, w, h, r = 10, fill = C.card, stroke, sw = 1 }) {
  return <rect x={x} y={y} width={w} height={h} rx={r} fill={fill} stroke={stroke} strokeWidth={stroke ? sw : 0} />
}

// Orange ring = "tap here". n draws a numbered badge beside it.
export function Tap({ x, y, r = 14, n }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r + 6} fill="none" stroke={C.orange} strokeWidth={2} opacity={0.35} />
      <circle cx={x} cy={y} r={r} fill="rgba(255,106,0,0.16)" stroke={C.orange} strokeWidth={3} />
      {n !== undefined && <g><circle cx={x + r + 4} cy={y - r - 2} r={8} fill={C.orange} /><T x={x + r + 4} y={y - r + 1.5} s={10} w={800} c="#000" a="middle">{n}</T></g>}
    </g>
  )
}

// Orange outline around an area (a row, a field, a button).
export function Hl({ x, y, w, h, r = 8, color = C.orange }) {
  return <rect x={x - 3} y={y - 3} width={w + 6} height={h + 6} rx={r + 2} fill={color === C.orange ? 'rgba(255,106,0,0.08)' : 'none'} stroke={color} strokeWidth={3} />
}

// iOS-style grouped list. rows: [{ t, right, rc (right colour), toggle, hl }]
export function List({ x = 24, y, w = 192, rowH = 28, rows, dark = false }) {
  const fill = dark ? C.appCard : C.card, line = dark ? C.appLine : C.line, ink = dark ? C.white : C.ink
  return (
    <g>
      <Box x={x} y={y} w={w} h={rows.length * rowH} r={10} fill={fill} />
      {rows.map((r, i) => {
        const ry = y + i * rowH
        return (
          <g key={i}>
            {i > 0 && <line x1={x + 10} x2={x + w} y1={ry} y2={ry} stroke={line} strokeWidth={1} />}
            <T x={x + 10} y={ry + rowH / 2 + 3.5} s={10} w={r.bold ? 700 : 400} c={r.c || ink}>{r.t}</T>
            {r.right && <T x={x + w - 10} y={ry + rowH / 2 + 3.5} s={10} c={r.rc || C.blue} a="end">{r.right}</T>}
            {r.toggle !== undefined && <Toggle x={x + w - 38} y={ry + rowH / 2 - 8} on={r.toggle} />}
            {r.hl && <Hl x={x + 2} y={ry + 2} w={w - 4} h={rowH - 4} r={6} />}
          </g>
        )
      })}
    </g>
  )
}

export function Toggle({ x, y, on }) {
  return (
    <g>
      <rect x={x} y={y} width={30} height={16} rx={8} fill={on ? C.green : '#D1D1D6'} />
      <circle cx={on ? x + 22 : x + 8} cy={y + 8} r={6.5} fill="#fff" />
    </g>
  )
}

export function Btn({ x, y, w, h = 26, t, fill = C.orange, c = '#000', s = 10, r = 8 }) {
  return <g><Box x={x} y={y} w={w} h={h} r={r} fill={fill} /><T x={x + w / 2} y={y + h / 2 + 3.5} s={s} w={800} c={c} a="middle">{t}</T></g>
}

// Rounded square app icon using the real logo.
export function AppIcon({ x, y, size = 40, label, dark = true }) {
  return (
    <g>
      <rect x={x} y={y} width={size} height={size} rx={size * 0.23} fill="#0A0A0A" />
      <image href="/icon-192.png" x={x + 2} y={y + 2} width={size - 4} height={size - 4} preserveAspectRatio="xMidYMid slice" />
      {label && <T x={x + size / 2} y={y + size + 11} s={7.5} c={dark ? '#fff' : '#000'} a="middle">{label}</T>}
    </g>
  )
}

export function Dim() { return <rect x={X0} y={Y0} width={W} height={H} fill="rgba(0,0,0,0.38)" /> }

// Wallpaper + a grid of placeholder icons, with ours somewhere in it.
export function HomeScreen({ ours = [3, 2], label = 'Workhorse Strong' }) {
  const cells = []
  for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) {
    const x = 30 + c * 48, y = 60 + r * 62
    if (r === ours[0] && c === ours[1]) cells.push(<AppIcon key={`${r}${c}`} x={x} y={y} size={38} label={label} />)
    else cells.push(<g key={`${r}${c}`}><rect x={x} y={y} width={38} height={38} rx={9} fill={`hsl(${(r * 4 + c) * 23 % 360} 45% 60% / .55)`} /><rect x={x + 6} y={y + 44} width={26} height={4} rx={2} fill="rgba(255,255,255,.4)" /></g>)
  }
  return <g>{cells}</g>
}

// Dark app header bar like Workhorse Strong.
export function AppTop({ title }) {
  return <g><T x={28} y={66} s={8} w={800} c={C.orange}>WORKHORSE STRONG</T><T x={28} y={86} s={17} w={800} c={C.white}>{title}</T></g>
}
