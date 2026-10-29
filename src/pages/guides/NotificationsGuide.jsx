// Illustrated guide: turning on push notifications, iPhone and Android.
// Public at /guide/notifications so the coach can text the link to anyone.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { GuidePage, Step, Tip, Help, isAndroid } from './GuideLayout'
import { Phone, T, Box, Tap, Hl, List, Btn, AppIcon, Dim, HomeScreen, AppTop, C, X0, Y0, W, H, XR } from './kit'

const SITE = 'workhorse-strong.vercel.app'

// ---------- shared app screens ----------
function SiteBody() {
  return (
    <g>
      <rect x={X0} y={50} width={W} height={330} fill={C.appBg} />
      <T x={120} y={150} s={15} w={800} c={C.white} a="middle">WORKHORSE</T>
      <T x={120} y={168} s={15} w={800} c={C.orange} a="middle">STRONG</T>
      <Box x={40} y={200} w={160} h={22} r={6} fill={C.appCard} />
      <Box x={40} y={228} w={160} h={22} r={6} fill={C.appCard} />
      <Btn x={40} y={258} w={160} h={24} t="LOG IN" />
    </g>
  )
}

function AppHome({ os }) {
  const tiles = ['Calendar', 'Progress', 'Resources', 'Hub', 'Supplements', 'Reminders', 'Habits', 'Cardio', 'FAQ']
  return (
    <Phone os={os} bg={C.appBg} dark label="Workhorse Strong Home screen with the Reminders tile highlighted">
      <AppTop title="Home" />
      <Box x={26} y={98} w={188} h={40} r={10} fill={C.appCard} />
      <T x={36} y={115} s={9} w={700} c={C.white}>Today: Upper A</T>
      <T x={36} y={129} s={8} c={C.muted}>4 exercises · tap to start</T>
      {tiles.map((t, i) => {
        const x = 26 + (i % 3) * 64, y = 150 + Math.floor(i / 3) * 56
        return (
          <g key={t}>
            <Box x={x} y={y} w={58} h={48} r={9} fill={C.appCard} />
            <circle cx={x + 29} cy={y + 18} r={7} fill="none" stroke={C.orange} strokeWidth={2} />
            <T x={x + 29} y={y + 39} s={7.5} w={700} c={C.white} a="middle">{t}</T>
            {t === 'Reminders' && <Hl x={x} y={y} w={58} h={48} r={9} />}
          </g>
        )
      })}
      <rect x={X0} y={430} width={W} height={36} fill="#111" />
      {['Home', 'Train', 'Eat', 'Log', 'Coach'].map((t, i) => <T key={t} x={36 + i * 42} y={452} s={7.5} w={700} c={i === 0 ? C.orange : C.muted} a="middle">{t}</T>)}
    </Phone>
  )
}

function Reminders({ os, on }) {
  return (
    <Phone os={os} bg={C.appBg} dark label={on ? 'Reminders page with Send me a test and a notification arriving' : 'Reminders page with the Turn on notifications button highlighted'}>
      <AppTop title="Reminders" />
      <Box x={26} y={104} w={188} h={94} r={10} fill={C.appCard} />
      <circle cx={42} cy={124} r={7} fill="none" stroke={on ? C.orange : C.muted} strokeWidth={2} />
      <T x={56} y={127} s={10} w={800} c={C.white}>{on ? 'ON FOR THIS DEVICE' : 'OFF ON THIS DEVICE'}</T>
      <T x={56} y={140} s={7.5} c={C.muted}>Turn it on for each phone you use.</T>
      <Btn x={38} y={156} w={on ? 100 : 150} h={28} t={on ? 'Send me a test' : 'Turn on notifications'} />
      <Hl x={38} y={156} w={on ? 100 : 150} h={28} r={8} color="#FFFFFF" />
      <Box x={26} y={210} w={188} h={150} r={10} fill={C.appCard} />
      <T x={38} y={228} s={8} w={800} c={C.orange}>WHAT TO SEND ME</T>
      {['Training days', 'Food log', 'Habits', 'Check-in', 'Messages from your coach'].map((t, i) => (
        <g key={t}>
          <rect x={38} y={240 + i * 23} width={11} height={11} rx={2} fill={C.orange} />
          <T x={56} y={249 + i * 23} s={9} w={700} c={C.white}>{t}</T>
        </g>
      ))}
      {on && (
        <g>
          <Box x={22} y={44} w={196} h={46} r={14} fill="rgba(245,245,245,0.97)" />
          <AppIcon x={30} y={52} size={28} />
          <T x={66} y={63} s={9} w={800}>Notifications are on 🔔</T>
          <T x={66} y={77} s={8} c="#555">This is what your reminders look like.</T>
        </g>
      )}
    </Phone>
  )
}

// ---------- iPhone ----------
function SafariBar({ tapAddr, tapMore }) {
  return (
    <g>
      <rect x={X0} y={380} width={W} height={86} fill="#F7F7F8" />
      <T x={30} y={421} s={18} c={C.blue}>‹</T>
      <Box x={48} y={404} w={136} h={26} r={13} fill="#E6E6EA" />
      <T x={116} y={421} s={8.5} c={C.ink} a="middle">{SITE}</T>
      <T x={204} y={421} s={14} w={800} c={C.blue} a="middle">···</T>
      {tapAddr && <Hl x={48} y={404} w={136} h={26} r={13} />}
      {tapMore && <Tap x={204} y={417} r={13} />}
    </g>
  )
}

function IosSafari() {
  return <Phone label="Safari open on the Workhorse Strong site"><SiteBody /><SafariBar tapAddr /></Phone>
}
function IosMore() {
  return (
    <Phone label="Safari menu opened from the three-dot button, with Share highlighted">
      <SiteBody /><Dim /><SafariBar tapMore />
      <Box x={92} y={256} w={126} h={142} r={14} fill="rgba(250,250,250,0.98)" />
      {['Share', 'Add to Bookmarks', 'Add to Favorites', 'Find on Page', 'Move Tab'].map((t, i) => (
        <g key={t}>
          {i > 0 && <line x1={102} x2={218} y1={256 + i * 28} y2={256 + i * 28} stroke={C.line} />}
          <T x={104} y={274 + i * 28} s={9.5} w={i === 0 ? 700 : 400}>{t}</T>
        </g>
      ))}
      <Hl x={95} y={259} w={120} h={22} r={8} />
    </Phone>
  )
}
function IosShareSheet() {
  return (
    <Phone label="Share sheet with Add to Home Screen highlighted">
      <SiteBody /><Dim />
      <Box x={X0} y={150} w={W} h={330} r={22} fill={C.iosBg} />
      <rect x={104} y={158} width={32} height={4} rx={2} fill="#C7C7CC" />
      <AppIcon x={28} y={172} size={28} dark={false} />
      <T x={64} y={184} s={9.5} w={700}>Workhorse Strong</T>
      <T x={64} y={196} s={8} c={C.sub}>{SITE}</T>
      <List y={216} rowH={27} rows={[
        { t: 'Copy', c: C.ink }, { t: 'Add to Reading List', c: C.ink }, { t: 'Add Bookmark', c: C.ink },
        { t: 'Add to Favorites', c: C.ink }, { t: 'Find on Page', c: C.ink }, { t: 'Add to Home Screen', c: C.ink, hl: true, bold: true },
      ]} />
      <T x={120} y={396} s={8} c={C.sub} a="middle">Scroll down if you don’t see it</T>
    </Phone>
  )
}
function IosAdd() {
  return (
    <Phone label="Add to Home Screen screen with the Add button highlighted">
      <T x={26} y={68} s={10} c={C.blue}>Cancel</T>
      <T x={120} y={68} s={10} w={700} a="middle">Add to Home Screen</T>
      <T x={212} y={68} s={10} w={800} c={C.blue} a="end">Add</T>
      <Hl x={190} y={56} w={26} h={16} r={6} />
      <Box x={24} y={88} w={192} h={70} r={10} />
      <AppIcon x={34} y={98} size={46} dark={false} />
      <T x={92} y={118} s={10} w={700}>Workhorse Strong</T>
      <line x1={92} x2={206} y1={126} y2={126} stroke={C.line} />
      <T x={92} y={142} s={8} c={C.sub}>{SITE}</T>
      <List y={172} rows={[{ t: 'Open as Web App', toggle: true }]} />
      <T x={30} y={218} s={8} c={C.sub}>Leave this ON.</T>
    </Phone>
  )
}
function IosHome() {
  return <Phone bg="#2b3a55" dark label="iPhone Home Screen with the Workhorse Strong icon highlighted"><HomeScreen /><Tap x={145} y={265} r={24} /></Phone>
}
function IosAllow() {
  return (
    <Phone bg={C.appBg} dark label="iPhone permission pop-up with Allow highlighted">
      <AppTop title="Reminders" /><Dim />
      <Box x={40} y={180} w={160} h={112} r={14} fill="rgba(242,242,247,0.98)" />
      <T x={120} y={204} s={9.5} w={800} a="middle">“Workhorse Strong” Would</T>
      <T x={120} y={217} s={9.5} w={800} a="middle">Like to Send You</T>
      <T x={120} y={230} s={9.5} w={800} a="middle">Notifications</T>
      <T x={120} y={246} s={7.5} c="#555" a="middle">Alerts, sounds and badges.</T>
      <line x1={40} x2={200} y1={258} y2={258} stroke="#C6C6C8" />
      <line x1={120} x2={120} y1={258} y2={292} stroke="#C6C6C8" />
      <T x={80} y={279} s={10} c={C.blue} a="middle">Don’t Allow</T>
      <T x={160} y={279} s={10} w={800} c={C.blue} a="middle">Allow</T>
      <Hl x={123} y={261} w={74} h={28} r={6} />
    </Phone>
  )
}

// ---------- Android ----------
function ChromeTop({ tapMenu }) {
  return (
    <g>
      <rect x={X0} y={44} width={W} height={36} fill={C.droidBg} />
      <Box x={24} y={50} w={168} h={24} r={12} fill={C.droidBar} />
      <T x={36} y={66} s={8.5} c="#333">{SITE}</T>
      <circle cx={208} cy={56} r={1.8} fill="#333" /><circle cx={208} cy={62} r={1.8} fill="#333" /><circle cx={208} cy={68} r={1.8} fill="#333" />
      {tapMenu && <Tap x={208} y={62} r={12} />}
    </g>
  )
}
function DroidBody() {
  return (
    <g>
      <rect x={X0} y={80} width={W} height={386} fill={C.appBg} />
      <T x={120} y={190} s={15} w={800} c={C.white} a="middle">WORKHORSE</T>
      <T x={120} y={208} s={15} w={800} c={C.orange} a="middle">STRONG</T>
      <Box x={40} y={240} w={160} h={22} r={6} fill={C.appCard} />
      <Box x={40} y={268} w={160} h={22} r={6} fill={C.appCard} />
      <Btn x={40} y={298} w={160} h={24} t="LOG IN" />
    </g>
  )
}
function DroidChrome() {
  return <Phone os="android" bg={C.droidBg} label="Chrome on Android with the three-dot menu highlighted"><DroidBody /><ChromeTop tapMenu /></Phone>
}
function DroidMenu() {
  const rows = ['New tab', 'History', 'Downloads', 'Bookmarks', 'Share…', 'Add to Home screen', 'Desktop site']
  return (
    <Phone os="android" bg={C.droidBg} label="Chrome menu with Add to Home screen highlighted">
      <DroidBody /><ChromeTop />
      <Box x={88} y={52} w={132} h={rows.length * 30 + 10} r={8} fill="#FFFFFF" stroke="#DADCE0" />
      {rows.map((t, i) => <T key={t} x={102} y={76 + i * 30} s={9.5} w={t.startsWith('Add') ? 700 : 400} c="#202124">{t}</T>)}
      <Hl x={92} y={57 + 5 * 30} w={124} h={26} r={6} />
      <T x={154} y={286} s={7.5} c={C.white} a="middle">May say “Install app”</T>
    </Phone>
  )
}
function DroidInstall() {
  return (
    <Phone os="android" bg={C.droidBg} label="Install app dialog with Install highlighted">
      <DroidBody /><ChromeTop /><Dim />
      <Box x={32} y={170} w={176} h={124} r={18} fill="#FFFFFF" />
      <T x={46} y={194} s={11} w={700} c="#202124">Install app</T>
      <AppIcon x={46} y={208} size={34} dark={false} />
      <T x={90} y={222} s={9.5} w={700} c="#202124">Workhorse Strong</T>
      <T x={90} y={235} s={8} c="#5F6368">{SITE}</T>
      <T x={128} y={276} s={10} w={700} c="#1A73E8" a="middle">Cancel</T>
      <T x={180} y={276} s={10} w={800} c="#1A73E8" a="middle">Install</T>
      <Hl x={160} y={263} w={40} h={20} r={8} />
    </Phone>
  )
}
function DroidHome() {
  return <Phone os="android" bg="#3a2b4f" dark label="Android home screen with the Workhorse Strong icon highlighted"><HomeScreen ours={[3, 1]} /><Tap x={97} y={265} r={24} /></Phone>
}
function DroidAllow() {
  return (
    <Phone os="android" bg={C.appBg} dark label="Android permission pop-up with Allow highlighted">
      <AppTop title="Reminders" /><Dim />
      <Box x={30} y={170} w={180} h={150} r={22} fill="#F3EDF7" />
      <circle cx={120} cy={194} r={9} fill="none" stroke="#1D1B20" strokeWidth={2} />
      <T x={120} y={222} s={10} w={500} c="#1D1B20" a="middle">Allow Workhorse Strong to</T>
      <T x={120} y={236} s={10} w={500} c="#1D1B20" a="middle">send you notifications?</T>
      <Box x={44} y={250} w={152} h={26} r={13} fill="#6750A4" />
      <T x={120} y={267} s={10} w={700} c="#fff" a="middle">Allow</T>
      <T x={120} y={302} s={10} w={500} c="#6750A4" a="middle">Don’t allow</T>
      <Hl x={44} y={250} w={152} h={26} r={13} />
    </Phone>
  )
}

export default function NotificationsGuide() {
  const { profile } = useAuth() || {}
  const coach = profile?.role === 'coach'
  const [tab, setTab] = useState(isAndroid() ? 'android' : 'iphone')
  const where = coach
    ? <>Tap <b>Notifications</b> in the menu (at the bottom of the left side, or swipe the top bar on a phone).</>
    : <>On the <b>Home</b> tab, scroll down to the tiles and tap <b>Reminders</b>.</>
  const settingsLink = coach ? '/coach/notifications' : '/app/reminders'

  return (
    <GuidePage eyebrow="Setup guide" title="Turn on notifications"
      intro="Get a ping on your phone for messages, check-ins, training days and calls. Takes about 2 minutes, once per phone."
      tabs={[['iphone', 'iPhone'], ['android', 'Android']]} tab={tab} setTab={setTab}>

      {tab === 'iphone' ? (
        <>
          <Tip>Needs iOS 16.4 or newer. On iPhone, notifications <b>only</b> work after the app is added to your Home Screen. That’s steps 1–5.</Tip>
          <Step n={1} title="Open the app in Safari" art={<IosSafari />}>
            Open <b>Safari</b> (not Chrome or Instagram) and go to <b>{SITE}</b>. Log in.
          </Step>
          <Step n={2} title="Tap ··· then Share" art={<IosMore />}>
            Tap the <b>···</b> button at the bottom right, then <b>Share</b>.
            <Tip>Older iPhones show a <b>Share</b> button (a square with an arrow ↑) in the bottom bar instead. Tap that.</Tip>
          </Step>
          <Step n={3} title="Tap Add to Home Screen" art={<IosShareSheet />}>
            Scroll down the list that pops up and tap <b>Add to Home Screen</b>.
            <Tip>Not there? Scroll to the very bottom, tap <b>Edit Actions</b>, and add it.</Tip>
          </Step>
          <Step n={4} title="Tap Add" art={<IosAdd />}>
            Leave <b>Open as Web App</b> switched on, then tap <b>Add</b> in the top right corner.
          </Step>
          <Step n={5} title="Open it from your Home Screen" art={<IosHome />}>
            Close Safari. Find the new <b>Workhorse Strong</b> icon on your Home Screen and open it. Log in if it asks.
            <Tip>From now on, always open the app from this icon. Notifications don’t work from Safari.</Tip>
          </Step>
          <Step n={6} title={coach ? 'Go to Notifications' : 'Tap Reminders'} art={!coach && <AppHome os="ios" />}>{where}</Step>
          <Step n={7} title="Tap Turn on notifications" art={<Reminders os="ios" />}>Tap the orange <b>Turn on notifications</b> button.</Step>
          <Step n={8} title="Tap Allow" art={<IosAllow />}>Your iPhone asks for permission. Tap <b>Allow</b>.</Step>
          <Step n={9} title="Send yourself a test" art={<Reminders os="ios" on />}>
            Tap <b>Send me a test</b>. A notification should pop up within a few seconds. Then tick what you want reminders for. You’re done.
          </Step>
          <Help title="Not working?" items={[
            ['I don’t see “Turn on notifications”, it says to add the app to my Home Screen', 'You’re still in Safari. Do steps 2–5, then open the app from the Home Screen icon.'],
            ['I tapped Don’t Allow by mistake', <>Open <b>Settings</b> → <b>Notifications</b> → <b>Workhorse Strong</b> → switch on <b>Allow Notifications</b>. Then open the app and tap <b>Send me a test</b>.</>],
            ['The test says sent, but nothing shows up', <>Check that <b>Focus</b> / Do Not Disturb is off (swipe down from the top right). Also check <b>Settings → Notifications → Workhorse Strong</b>: Lock Screen, Notification Center and Banners should all be ticked.</>],
            ['I got a new phone or reinstalled the app', 'Notifications are set per phone. Do this guide again on the new phone.'],
            ['There are two Workhorse Strong icons', 'Delete the extra one (press and hold → Remove App → Delete), then turn notifications on again from the one you kept.'],
          ]} />
        </>
      ) : (
        <>
          <Tip>Use <b>Chrome</b>. Samsung Internet works too, but the menu wording is a little different.</Tip>
          <Step n={1} title="Open the app in Chrome" art={<DroidChrome />}>
            Open <b>Chrome</b> and go to <b>{SITE}</b>. Log in. Then tap the <b>⋮</b> menu in the top right corner.
          </Step>
          <Step n={2} title="Tap Add to Home screen" art={<DroidMenu />}>
            In the menu, tap <b>Add to Home screen</b>. On some phones it says <b>Install app</b>.
          </Step>
          <Step n={3} title="Tap Install" art={<DroidInstall />}>
            Tap <b>Install</b> (or <b>Add</b>). If it asks where, choose <b>Add to Home screen</b> / <b>Add automatically</b>.
          </Step>
          <Step n={4} title="Open it from your home screen" art={<DroidHome />}>
            Find the new <b>Workhorse Strong</b> icon on your home screen (or in your app drawer) and open it. Log in if it asks.
          </Step>
          <Step n={5} title={coach ? 'Go to Notifications' : 'Tap Reminders'} art={!coach && <AppHome os="android" />}>{where}</Step>
          <Step n={6} title="Tap Turn on notifications" art={<Reminders os="android" />}>Tap the orange <b>Turn on notifications</b> button.</Step>
          <Step n={7} title="Tap Allow" art={<DroidAllow />}>Your phone asks for permission. Tap <b>Allow</b>.</Step>
          <Step n={8} title="Send yourself a test" art={<Reminders os="android" on />}>
            Tap <b>Send me a test</b>. A notification should pop up within a few seconds. Then tick what you want reminders for. You’re done.
          </Step>
          <Help title="Not working?" items={[
            ['I tapped Don’t allow by mistake', <>Open <b>Settings</b> → <b>Apps</b> → <b>Workhorse Strong</b> (or <b>Chrome</b>) → <b>Notifications</b> → switch them on. Then open the app and tap <b>Send me a test</b>.</>],
            ['It says notifications are blocked', <>In the app, tap the <b>lock</b> or <b>settings</b> icon next to the web address → <b>Permissions</b> → <b>Notifications</b> → <b>Allow</b>.</>],
            ['Notifications arrive late or not at all', <><b>Settings</b> → <b>Apps</b> → <b>Chrome</b> → <b>Battery</b> → choose <b>Unrestricted</b>. Some phones (Samsung, Xiaomi) put Chrome to sleep and hold notifications back.</>],
            ['Do Not Disturb', 'Swipe down from the top and make sure Do Not Disturb is off.'],
            ['I got a new phone', 'Notifications are set per phone. Do this guide again on the new phone.'],
          ]} />
        </>
      )}
      {profile && <Link to={settingsLink} className="btn" style={{ textAlign: 'center', textDecoration: 'none' }}>Go to {coach ? 'Notifications' : 'Reminders'} →</Link>}
    </GuidePage>
  )
}
