// Illustrated guide: build the "Sync Steps" iPhone Shortcut that sends Apple
// Health steps to Workhorse Strong every night. Public at /guide/steps.
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { GuidePage, Step, Tip, Help } from './GuideLayout'
import { Phone, T, Box, Tap, Hl, List, Btn, AppTop, C, X0, W } from './kit'

const LINK = 'workhorse-strong.vercel.app/api/st…'

// Shortcuts editor chrome: title at the top, action search + play at the bottom.
function Editor({ title = 'New Shortcut', children, tapSearch, tapPlay, search = 'Search Actions' }) {
  return (
    <g>
      <circle cx={34} cy={64} r={11} fill="#fff" /><T x={34} y={68} s={11} c={C.ink} a="middle">‹</T>
      <T x={120} y={68} s={10.5} w={700} a="middle">{title} ⌄</T>
      {children}
      <Box x={22} y={404} w={196} h={54} r={18} fill="rgba(255,255,255,0.96)" />
      <Box x={32} y={412} w={176} h={20} r={10} fill="#E9E9EE" />
      <T x={44} y={426} s={9} c={search === 'Search Actions' ? C.sub : C.ink}>🔍 {search}</T>
      <T x={196} y={450} s={11} c={C.ink} a="middle">▶</T>
      {tapSearch && <Hl x={32} y={412} w={176} h={20} r={10} />}
      {tapPlay && <Tap x={196} y={446} r={11} />}
    </g>
  )
}

function CopyLink() {
  return (
    <Phone bg={C.appBg} dark label="Sync steps page in Workhorse Strong with Copy link highlighted">
      <AppTop title="Sync steps" />
      <Box x={26} y={104} w={188} h={112} r={10} fill={C.appCard} />
      <T x={38} y={122} s={8} w={800} c={C.orange}>YOUR PRIVATE LINK</T>
      <Box x={38} y={130} w={164} h={30} r={6} fill="#2a2a2a" />
      <T x={44} y={143} s={7} c={C.white} mono>workhorse-strong.vercel.app</T>
      <T x={44} y={154} s={7} c={C.white} mono>/api/steps?t=01340cf0ecc8…</T>
      <Btn x={38} y={172} w={80} h={26} t="Copy link" />
      <Hl x={38} y={172} w={80} h={26} r={8} color="#FFFFFF" />
      <Box x={124} y={172} w={78} h={26} r={8} fill="#2a2a2a" />
      <T x={163} y={189} s={9} w={700} c={C.white} a="middle">New link</T>
      <T x={38} y={240} s={8.5} c={C.muted}>Log tab → “Sync steps from your</T>
      <T x={38} y={252} s={8.5} c={C.muted}>iPhone automatically →”</T>
    </Phone>
  )
}
function NewShortcut() {
  return (
    <Phone label="Shortcuts app with the plus button highlighted">
      <T x={30} y={92} s={17} w={800}>All Shortcuts</T>
      <T x={206} y={66} s={18} c={C.blue} a="middle">+</T>
      <Tap x={206} y={61} r={13} />
      {[0, 1, 2, 3, 4, 5].map(i => (
        <Box key={i} x={26 + (i % 2) * 96} y={108 + Math.floor(i / 2) * 64} w={90} h={56} r={12} fill={`hsl(${200 + i * 30} 70% 60%)`} />
      ))}
      <rect x={X0} y={420} width={W} height={46} fill="rgba(255,255,255,.95)" />
      {['Shortcuts', 'Automation', 'Gallery'].map((t, i) => <T key={t} x={50 + i * 70} y={448} s={8.5} w={700} c={i === 0 ? C.blue : C.sub} a="middle">{t}</T>)}
    </Phone>
  )
}
function AddFind() {
  return (
    <Phone label="New shortcut with Find Health Samples typed in the search">
      <Editor tapSearch search="Find Health Samples">
        <T x={120} y={190} s={9.5} c={C.sub} a="middle">Your shortcut is empty.</T>
        <Box x={22} y={300} w={196} h={90} r={14} />
        <T x={34} y={318} s={8} w={700} c={C.sub}>HEALTH</T>
        <T x={34} y={340} s={10} w={700}>❤️ Find Health Samples</T>
        <Hl x={28} y={327} w={184} h={20} r={6} />
        <T x={34} y={368} s={10}>❤️ Log Health Sample</T>
      </Editor>
    </Phone>
  )
}
function FindSetup() {
  return (
    <Phone label="Find Health Samples set to Steps, today, grouped by day">
      <Editor title="New Shortcut">
        <Box x={22} y={86} w={196} h={252} r={14} />
        <T x={32} y={106} s={10} w={700}>❤️ Find <tspan fill={C.blue}>Health Samples</tspan> where</T>
        <T x={32} y={120} s={10}><tspan fill={C.blue}>All</tspan> of the following are true</T>
        <line x1={22} x2={218} y1={130} y2={130} stroke={C.line} />
        <T x={32} y={148} s={10} w={700}>Type <tspan fill={C.blue} fontWeight={400}>is  Steps</tspan></T>
        <Hl x={28} y={134} w={184} h={20} r={6} />
        <T x={32} y={176} s={10} w={700}>Start Date <tspan fill={C.blue} fontWeight={400}>is today</tspan></T>
        <Hl x={28} y={162} w={184} h={20} r={6} />
        <T x={32} y={202} s={9.5} c={C.blue}>⊕ Add Filter</T>
        {[['Unit', 'count'], ['Group by', 'Day'], ['Fill Missing', ''], ['Sort by', 'None'], ['Limit', '']].map(([k, v], i) => (
          <g key={k}>
            <line x1={22} x2={218} y1={212 + i * 25} y2={212 + i * 25} stroke={C.line} />
            <T x={32} y={228 + i * 25} s={9.5}>{k}</T>
            {v && <T x={208} y={228 + i * 25} s={9.5} c={C.blue} a="end">{v}</T>}
          </g>
        ))}
        <rect x={178} y={267} width={30} height={16} rx={8} fill={C.green} /><circle cx={200} cy={275} r={6.5} fill="#fff" />
        <rect x={178} y={317} width={30} height={16} rx={8} fill="#D1D1D6" /><circle cx={186} cy={325} r={6.5} fill="#fff" />
        <Hl x={28} y={240} w={184} h={18} r={6} />
      </Editor>
    </Phone>
  )
}
function UrlAction() {
  return (
    <Phone label="Get Contents of URL with your link pasted in">
      <Editor search="Get Contents of URL">
        <Box x={22} y={86} w={196} h={46} r={14} />
        <T x={32} y={106} s={9.5} w={700}>❤️ Find Health Samples where…</T>
        <line x1={120} x2={120} y1={132} y2={144} stroke="#C7C7CC" strokeWidth={2} />
        <Box x={22} y={144} w={196} h={64} r={14} />
        <T x={32} y={164} s={10} w={700}>🌐 Get contents of</T>
        <Box x={32} y={172} w={176} h={26} r={6} fill="#EAF2FF" />
        <T x={38} y={189} s={7.5} c={C.blue} mono>{LINK}</T>
        <Hl x={32} y={172} w={176} h={26} r={6} />
        <T x={120} y={236} s={8.5} c={C.sub} a="middle">Tap the blue URL → Paste</T>
      </Editor>
    </Phone>
  )
}
function UrlBody() {
  return (
    <Phone label="Get Contents of URL set to POST, JSON, with a steps field">
      <Editor title="Get Contents of URL">
        <Box x={22} y={86} w={196} h={220} r={14} />
        <T x={32} y={106} s={10} w={700}>🌐 Get contents of <tspan fill={C.blue} fontWeight={400}>https://…</tspan></T>
        <T x={200} y={106} s={10} c={C.blue} a="middle">⌄</T>
        <Tap x={200} y={102} r={10} />
        <List x={22} y={120} w={196} rowH={30} rows={[
          { t: 'Method', right: 'POST', hl: true }, { t: 'Headers', right: '›', rc: C.sub }, { t: 'Request Body', right: 'JSON', hl: true },
        ]} />
        <line x1={22} x2={218} y1={210} y2={210} stroke={C.line} />
        <circle cx={38} cy={228} r={8} fill={C.red} /><rect x={33} y={227} width={10} height={2} fill="#fff" />
        <T x={54} y={232} s={10}>steps</T>
        <Box x={112} y={219} w={86} h={18} r={6} fill="#EAF2FF" />
        <T x={118} y={232} s={8.5} w={700} c={C.blue}>❤️ Health Samples</T>
        <Hl x={30} y={216} w={172} h={24} r={6} />
        <circle cx={38} cy={264} r={8} fill={C.green} /><T x={38} y={268} s={11} w={800} c="#fff" a="middle">+</T>
        <T x={54} y={268} s={10} c={C.sub}>Add new field</T>
      </Editor>
    </Phone>
  )
}
function SetNumber() {
  return (
    <Phone label="Health Samples variable settings with Number selected">
      <rect x={X0} y={44} width={W} height={422} fill={C.iosBg} />
      <T x={30} y={74} s={12} w={800}>❤️ Health Samples</T>
      <List y={90} rows={[{ t: 'Variable Name', right: 'Health Samples', rc: C.sub }]} />
      <List y={130} rowH={26} rows={[
        { t: 'Type', right: 'Number ⌄', rc: C.sub }, { t: 'Boolean', c: C.ink }, { t: 'Date', c: C.ink }, { t: 'Dictionary', c: C.ink },
        { t: 'Health sample', c: C.ink }, { t: 'Number', c: C.ink, bold: true, right: '✓', hl: true }, { t: 'Text', c: C.ink },
      ]} />
      <T x={120} y={340} s={8.5} c={C.sub} a="middle">Scroll down the list to find Number</T>
    </Phone>
  )
}
function RunIt() {
  return (
    <Phone label="Running the shortcut shows Saved steps">
      <Editor title="Sync Steps" tapPlay>
        <Box x={22} y={86} w={196} h={40} r={14} />
        <T x={32} y={110} s={9.5} w={700}>❤️ Find Health Samples where…</T>
        <Box x={22} y={136} w={196} h={40} r={14} />
        <T x={32} y={160} s={9.5} w={700}>🌐 Get contents of https://…</T>
        <Box x={22} y={190} w={196} h={86} r={14} fill="#fff" stroke={C.green} sw={2} />
        <T x={34} y={210} s={8.5} mono>{'{'}</T>
        <T x={42} y={226} s={8.5} mono>"ok" : true,</T>
        <T x={42} y={242} s={8.5} mono>"message" : "Saved</T>
        <T x={42} y={256} s={8.5} mono>6,412 steps for …"</T>
        <T x={34} y={270} s={8.5} mono>{'}'}</T>
      </Editor>
    </Phone>
  )
}
function Rename() {
  return (
    <Phone label="Shortcut name menu with Rename highlighted">
      <Editor title="New Shortcut">
        <Hl x={74} y={56} w={92} h={18} r={8} />
        <Box x={60} y={82} w={120} h={110} r={12} fill="rgba(250,250,250,.98)" />
        {['Rename', 'Choose Icon', 'Details', 'Duplicate'].map((t, i) => (
          <g key={t}>{i > 0 && <line x1={60} x2={180} y1={82 + i * 27} y2={82 + i * 27} stroke={C.line} />}<T x={72} y={100 + i * 27} s={9.5} w={i === 0 ? 700 : 400}>{t}</T></g>
        ))}
        <Hl x={63} y={85} w={114} h={21} r={6} />
        <T x={120} y={230} s={9} c={C.sub} a="middle">Name it: Sync Steps</T>
      </Editor>
    </Phone>
  )
}
function AutoTime() {
  return (
    <Phone label="Time of Day automation set to 11:30 PM daily, Run Immediately, with Done highlighted">
      <circle cx={34} cy={64} r={11} fill="#fff" /><T x={34} y={68} s={11} a="middle">‹</T>
      <T x={120} y={68} s={10.5} w={700} a="middle">Time of Day</T>
      <Btn x={176} y={54} w={40} h={22} t="Done" fill={C.blue} c="#fff" r={11} />
      <Hl x={176} y={54} w={40} h={22} r={11} />
      <List y={88} rowH={24} rows={[{ t: 'Sunrise', c: C.ink }, { t: 'Sunset', c: C.ink }, { t: 'Time of Day', c: C.ink, right: '✓' }]} />
      <Box x={24} y={164} w={192} h={40} r={10} />
      <Box x={32} y={174} w={176} h={20} r={8} fill="#EFEFF4" />
      <T x={120} y={188} s={12} w={700} a="middle">11 : 30  PM</T>
      <T x={30} y={222} s={8.5} c={C.sub}>REPEAT</T>
      <List y={228} rowH={24} rows={[{ t: 'Daily', c: C.ink, right: '✓', hl: true }, { t: 'Weekly', c: C.ink }, { t: 'Monthly', c: C.ink }]} />
      <List y={312} rowH={24} rows={[{ t: 'Run After Confirmation', c: C.ink }, { t: 'Run Immediately', c: C.ink, right: '✓', hl: true }, { t: 'Notify When Run', toggle: false }]} />
    </Phone>
  )
}
function AutoPick() {
  return (
    <Phone label="Choosing the Sync Steps shortcut for the automation">
      <circle cx={34} cy={64} r={11} fill="#fff" /><T x={34} y={68} s={11} a="middle">‹</T>
      <T x={120} y={68} s={10.5} w={700} a="middle">When 11:30 PM, daily</T>
      <T x={30} y={100} s={9} w={700} c={C.sub}>MY SHORTCUTS</T>
      <List y={108} rowH={28} rows={[{ t: '⚡ Sync Steps', c: C.ink, bold: true, hl: true }, { t: '⚡ Other shortcut', c: C.ink }]} />
      <T x={30} y={190} s={9} w={700} c={C.sub}>OR</T>
      <List y={198} rowH={28} rows={[{ t: '⊕ New Blank Automation', c: C.blue }]} />
      <T x={120} y={252} s={8.5} c={C.sub} a="middle">Then Add Action → Run Shortcut → Sync Steps</T>
    </Phone>
  )
}

export default function StepsGuide() {
  const { profile } = useAuth() || {}
  return (
    <GuidePage eyebrow="Setup guide · iPhone" title="Sync your steps automatically"
      intro="Your iPhone (and Apple Watch) already counts your steps in the Health app. This one-time setup sends them to Workhorse Strong every night, so you never type them in again. About 5 minutes.">
      <Tip>iPhone only. On Android, keep entering steps on the <b>Log</b> tab.</Tip>

      <Step n={1} title="Copy your private link" art={<CopyLink />}>
        In Workhorse Strong, tap the <b>Log</b> tab, then <b>Sync steps from your iPhone automatically</b>. Tap <b>Copy link</b>.
        <Tip warn>Don’t tap <b>New link</b> unless you mean to. It turns off the old one and you’d have to paste the new one in again.</Tip>
      </Step>
      <Step n={2} title="Make a new shortcut" art={<NewShortcut />}>
        Open the <b>Shortcuts</b> app (it comes with every iPhone). On the <b>Shortcuts</b> tab, tap <b>+</b> in the top right.
      </Step>
      <Step n={3} title="Add “Find Health Samples”" art={<AddFind />}>
        Tap <b>Search Actions</b> at the bottom, type <b>Find Health Samples</b>, and tap it.
      </Step>
      <Step n={4} title="Set it to today’s steps" art={<FindSetup />}>
        Tap <b>Add Filter</b>, then set it to <b>Type is Steps</b>. Tap <b>Add Filter</b> again and set it to <b>Start Date is today</b>. Then set <b>Group by</b> to <b>Day</b>.
        <Tip><b>Group by: Day</b> matters. It adds up all of today’s steps into one number.</Tip>
      </Step>
      <Step n={5} title="Add “Get Contents of URL” and paste your link" art={<UrlAction />}>
        Search <b>Get Contents of URL</b> and tap it. It goes <b>under</b> Find Health Samples. Tap the blue <b>URL</b>, delete it, and <b>Paste</b> your link from step 1.
      </Step>
      <Step n={6} title="Set POST, JSON and the steps field" art={<UrlBody />}>
        Tap the small <b>⌄</b> arrow on that action to open it. Then:
        <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
          <li><b>Method</b> → <b>POST</b></li>
          <li><b>Request Body</b> → <b>JSON</b></li>
          <li>Tap <b>Add new field</b> → <b>Number</b>. Type <b>steps</b> in the left box (all lowercase).</li>
          <li>Tap the right box. In the bar above the keyboard, tap <b>Health Samples</b>.</li>
        </ul>
        <Tip>Don’t see Health Samples above the keyboard? Swipe that bar sideways. Or press and hold the right box → <b>Select Variable</b> → tap the <b>Find Health Samples</b> action.</Tip>
      </Step>
      <Step n={7} title="Make it a Number" art={<SetNumber />}>
        Tap the blue <b>Health Samples</b> bubble you just added. Under <b>Type</b>, scroll down and pick <b>Number</b>. Swipe the panel down to close it.
      </Step>
      <Step n={8} title="Name it “Sync Steps”" art={<Rename />}>
        Tap the name at the very top (“New Shortcut”) → <b>Rename</b> → type <b>Sync Steps</b>.
      </Step>
      <Step n={9} title="Run it once" art={<RunIt />}>
        Tap <b>▶</b> at the bottom right. The first time, tap <b>Allow</b> when it asks for Health access. You should see <b>“Saved … steps”</b>.
        <Tip>Saw something else? Check the <b>Not working?</b> list at the bottom of this page.</Tip>
      </Step>
      <Step n={10} title="Make it run every night" art={<AutoTime />}>
        Go back and open the <b>Automation</b> tab → <b>+</b> → <b>Time of Day</b>. Set <b>11:30 PM</b>, <b>Daily</b>, and <b>Run Immediately</b>. Then tap <b>Done</b> (or the arrow) in the top right.
      </Step>
      <Step n={11} title="Pick Sync Steps" art={<AutoPick />}>
        Tap <b>Sync Steps</b> in the list. If there’s no list, tap <b>New Blank Automation</b> → <b>Add Action</b> → search <b>Run Shortcut</b> → tap the blue word <b>Shortcut</b> → pick <b>Sync Steps</b>. Tap <b>Done</b>.
        <Tip>That’s it. Every night at 11:30 your steps land in the app. You’ll see <b>✓ Steps synced from Apple Health</b> on the Log tab.</Tip>
      </Step>

      <Help title="Not working?" items={[
        ['“This link is not active” or “no longer active”', 'Your link was replaced, or was copied from a different account. Open Sync steps in the app while logged in as yourself, tap Copy link, and paste it into the URL again (step 5).'],
        ['“No step count found”', 'The steps field is empty or not linked. Redo steps 6 and 7: the right box must show the blue Health Samples bubble set to Number, and the left box must say steps.'],
        ['It saved 0 steps', 'Check step 4: Type is Steps, Start Date is today, and Group by is Day. Also open the Health app and check that it has steps for today.'],
        ['It asks me to confirm every night', 'Open the automation in the Automation tab and choose Run Immediately (not Run After Confirmation).'],
        ['I typed steps in the app myself', 'That’s fine. The next sync for that day replaces your typed number with the Health app’s count.'],
      ]} />
      {profile?.role === 'client' && <Link to="/app/steps-sync" className="btn" style={{ textAlign: 'center', textDecoration: 'none' }}>Get my link →</Link>}
    </GuidePage>
  )
}
