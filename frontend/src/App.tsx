import { useRef, useState } from 'react';
import { ArrowLeft, BarChart3, Check, ChevronRight, Copy, Delete, Home, RotateCcw, ShieldCheck, Sigma, Star, Trophy, X } from 'lucide-react';
import { LARGE_LEVELS, OLDER_FACT_LEVELS, YOUNG_LEVELS, normalizeCode, totals, type Operation, type PracticeLevel } from './domain/model.ts';
import { games, makeQuestion } from './domain/math.ts';
import { useProgress } from './sync/useProgress.ts';
import { SyncStatus } from './components/SyncStatus.tsx';

type Screen = 'home' | 'levels' | 'practice' | 'celebrate' | 'grownups';
type AgeGroup = 'young' | 'older';
const AGE_KEY = 'factoodle-age-group';

function savedAgeGroup(): AgeGroup | null {
  try {
    const value = localStorage.getItem(AGE_KEY);
    return value === 'young' || value === 'older' ? value : null;
  } catch { return null; }
}

function levelText(operation: Operation, level: PracticeLevel) {
  if (typeof level === 'number') return `Answers 0–${level}`;
  const digits = level.slice(-1);
  const symbol = games.find(game => game.id === operation)?.symbol;
  return `3-digit ${symbol} ${digits}-digit`;
}

export default function App() {
  const sync = useProgress();
  const progress = totals(sync.document);
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(savedAgeGroup);
  const [screen, setScreen] = useState<Screen>('home');
  const [operation, setOperation] = useState<Operation>('addition');
  const [level, setLevel] = useState<PracticeLevel>(10);
  const [question, setQuestion] = useState(() => makeQuestion('addition', 10));
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [number, setNumber] = useState(1);
  const [roundCorrect, setRoundCorrect] = useState(0);
  const [streak, setStreak] = useState(0);
  const [busy, setBusy] = useState(false);
  const [resumeCode, setResumeCode] = useState('');
  const [notice, setNotice] = useState('');
  const [formError, setFormError] = useState('');
  const answerLock = useRef(false);
  const selected = games.find(game => game.id === operation)!;
  const older = ageGroup === 'older';
  const shellClass = `app-shell${older ? ' older-mode' : ''}`;

  function chooseAge(next: AgeGroup) {
    try { localStorage.setItem(AGE_KEY, next); } catch { /* The app still works for this visit. */ }
    setAgeGroup(next); setScreen('home');
  }
  function begin(nextLevel: PracticeLevel) {
    setLevel(nextLevel); setQuestion(makeQuestion(operation, nextLevel)); setNumber(1);
    setAnswer(''); setFeedback(null); setRoundCorrect(0); setStreak(0);
    setFormError(''); answerLock.current = false; setScreen('practice');
  }
  async function submit() {
    if (answerLock.current || feedback || !/^\d{1,6}$/.test(answer) || !sync.code) return;
    answerLock.current = true; setBusy(true); setFormError('');
    const correct = Number(answer) === question.answer;
    const nextStreak = correct ? streak + 1 : 0;
    try {
      await sync.engine.answer(operation, level, correct, nextStreak, number === 10);
      setStreak(nextStreak); setRoundCorrect(old => old + Number(correct));
      setFeedback(correct ? 'correct' : 'wrong');
    } catch { answerLock.current = false; setFormError('We could not save that answer on this device. Please ask a grown-up for help.'); }
    finally { setBusy(false); }
  }
  function next() {
    if (!feedback) return;
    if (number === 10) { setScreen('celebrate'); return; }
    setNumber(old => old + 1); setQuestion(makeQuestion(operation, level));
    setAnswer(''); setFeedback(null); answerLock.current = false;
  }
  async function restore() {
    setNotice(''); setFormError('');
    const code = normalizeCode(resumeCode);
    try {
      await sync.engine.restore(code); setResumeCode('');
      setNotice(`Progress restored. This device now uses ${code}.`);
    } catch (error) { setFormError(error instanceof Error ? error.message : 'Restore failed. Your current progress is unchanged.'); }
  }
  async function copyCode() {
    setNotice(''); setFormError('');
    try { await navigator.clipboard.writeText(sync.code); setNotice('Code copied. Keep it private.'); }
    catch { setFormError('Copy was blocked. Select the code above and copy it manually.'); }
  }
  const header = <header className="topbar">
    <button className="brand" onClick={() => setScreen('home')} aria-label="Go to Factoodle home"><span className="brand-mark"><Sigma /></span><span>Fact<span>oodle</span></span></button>
    <div className="header-actions"><SyncStatus state={sync.state} onClick={() => setScreen('grownups')} />
      <div className="star-count" aria-label={progress.stars + ' stars earned'}><Star size={20} fill="currentColor" />{progress.stars}</div>
      <button className="round-button" aria-label="Open grown-ups area" onClick={() => { setScreen('grownups'); setFormError(''); setNotice(''); }}><BarChart3 /></button></div>
  </header>;

  if (!ageGroup) return <main className="age-shell">
    <section className="age-picker" aria-labelledby="age-title"><span className="brand-mark age-logo"><Sigma /></span><p className="eyebrow">WELCOME TO FACTOODLE</p>
      <h1 id="age-title">Choose a practice path</h1><p>Pick the box that fits the learner. You can change this later.</p>
      <div className="age-options">
        <button className="age-option age-young" onClick={() => chooseAge('young')}><strong>Ages 0–8</strong><span>Big buttons, friendly number facts, and answer ranges through 50.</span><b>Choose this path <ChevronRight /></b></button>
        <button className="age-option age-older" onClick={() => chooseAge('older')}><strong>Ages 8+</strong><span>A focused workspace with facts through 144 and large-number practice.</span><b>Choose this path <ChevronRight /></b></button>
      </div><p className="safe-note"><ShieldCheck size={18} />No name, email, login, or ads.</p>
    </section>
  </main>;

  if (screen === 'home') return <main className={shellClass}>{header}
    <section className={`hero${older ? ' older-hero' : ''}`}><div className="number-doodle" aria-hidden="true"><span className="tile tile-one">7</span><span className="operator-tile">+</span><span className="tile tile-two">3</span><span className="equals-tile">=</span><span className="tile tile-answer">10</span></div>
      <p className="eyebrow">{older ? 'BUILD SPEED. GROW CONFIDENCE.' : 'LITTLE STEPS. BIG NUMBER SKILLS.'}</p><h1>{older ? <>Sharpen your<br />math skills.</> : <>Let's play<br />with numbers!</>}</h1><p className="hero-copy">Pick a math operation to begin.</p></section>
    <section className="operation-grid" aria-label="Choose a math operation">{games.map(game => <button key={game.id} className={'operation-card ' + game.color}
      onClick={() => { setOperation(game.id); setScreen('levels'); }}>
      <span className="operation-art">{game.example}</span><span className="operation-symbol">{game.symbol}</span><span className="operation-name">{game.name}</span><span className="operation-example">Tap to practice</span><span className="go-circle"><ChevronRight /></span>
    </button>)}</section><p className="safe-note"><ShieldCheck size={18} />No login. No ads. Just learning.</p>
    {sync.state === 'error' && <p className="home-warning">A grown-up needs to check online saving. <button onClick={() => setScreen('grownups')}>See details</button></p>}
  </main>;

  if (screen === 'levels') return <main className={shellClass}>{header}
    <button className="back-link" onClick={() => setScreen('home')}><ArrowLeft />Back</button>
    <section className="section-heading"><div className={'mini-operation ' + selected.color}>{selected.symbol}</div><div><p className="eyebrow">{selected.name} practice</p><h1>Pick your challenge</h1><p>{older ? 'Practice facts or move up to large-number work.' : 'Every answer is inside the range you choose.'}</p></div></section>
    {older && <h2 className="level-section-title">Math facts</h2>}
    <section className={`level-grid${older ? ' older-level-grid' : ''}`} aria-label="Choose an answer range">{(older ? OLDER_FACT_LEVELS : YOUNG_LEVELS).map(max => {
      const stats = progress.byLevel[operation + '-' + max];
      return <button key={max} className="level-card" onClick={() => begin(max)} disabled={!sync.code}>
        <span className="level-number">0–{max}</span><span className="level-label">Answer range</span><span className="level-pips"><i>0</i><b>{Math.floor(max / 2)}</b><i>{max}</i></span>
        <span className="level-score">{stats ? stats.correct + '/' + stats.answered + ' correct' : 'LET’S TRY!'}</span><span className="level-go"><ChevronRight /></span>
      </button>;
    })}</section>
    {older && <><h2 className="level-section-title large-title">Large-number practice</h2><p className="level-section-copy">The first number has 3 digits. Choose how many digits the second number has.</p>
      <section className="advanced-grid" aria-label="Choose a large-number challenge">{LARGE_LEVELS.map(item => {
        const stats = progress.byLevel[operation + '-' + item];
        return <button key={item} className="advanced-card" onClick={() => begin(item)} disabled={!sync.code}><span className="advanced-expression">{levelText(operation, item)}</span><span>{stats ? stats.correct + '/' + stats.answered + ' correct' : 'Start practice'}</span><ChevronRight /></button>;
      })}</section></>}
  </main>;

  if (screen === 'practice') return <main className={`practice-shell${older ? ' older-mode' : ''}`}>
    <header className="practice-topbar"><button className="round-button white" onClick={() => setScreen('levels')} aria-label="Leave practice" disabled={busy}><X /></button>
      <div className="progress-track" role="progressbar" aria-label="Round progress" aria-valuenow={number - (feedback ? 0 : 1)} aria-valuemin={0} aria-valuemax={10}><span style={{ width: (number - (feedback ? 0 : 1)) * 10 + '%' }} /></div><div className="streak-pill">🔥 {streak}</div></header>
    <section className={'quiz-card ' + (feedback ?? '')}><p className="quiz-label">WHAT IS THE ANSWER?</p>
      <form onSubmit={event => { event.preventDefault(); void submit(); }}>
        <div className="equation"><span>{question.left}</span><span className="math-symbol">{question.symbol}</span><span>{question.right}</span><span className="equals">=</span>
          <input className={'answer-box ' + (answer ? 'filled' : '')} aria-label="Your answer" inputMode="numeric" autoComplete="off" value={answer} placeholder="?" maxLength={6}
            onChange={event => { if (/^\d{0,6}$/.test(event.target.value)) setAnswer(event.target.value); }} disabled={busy || Boolean(feedback)} /></div>
        <div className={'feedback ' + (feedback ? 'show' : '')} aria-live="polite">{feedback === 'correct' ? <><Check />Great thinking!</> : feedback === 'wrong' ? <>You chose {answer}. The answer is <strong>{question.answer}</strong>.</> : null}</div>
        <div className="keypad" aria-label="Number keypad">{[1,2,3,4,5,6,7,8,9].map(value => <button type="button" key={value} disabled={busy || Boolean(feedback)} onClick={() => setAnswer(old => old.length < 6 ? (old === '0' ? String(value) : old + value) : old)}>{value}</button>)}
          <button type="button" className="delete-key" aria-label="Delete last number" disabled={busy || Boolean(feedback)} onClick={() => setAnswer(old => old.slice(0, -1))}><Delete /></button>
          <button type="button" disabled={busy || Boolean(feedback)} onClick={() => setAnswer(old => old.length < 6 ? (old === '0' ? '0' : old + '0') : old)}>0</button>
          <button className="check-key" type="submit" aria-label="Check answer" disabled={busy || Boolean(feedback) || !answer}><Check /></button></div>
      </form>
      {feedback && <button className="primary-button next-question" onClick={next}>{number === 10 ? 'See my stars' : 'Next question'}<ChevronRight /></button>}
      {formError && <p className="error-message" role="alert">{formError}</p>}
      <p className="question-count">Question {number} of 10 · {selected.name} · {levelText(operation, level)}</p>
      <SyncStatus state={sync.state} onClick={() => setScreen('grownups')} />
    </section></main>;

  if (screen === 'celebrate') return <main className={shellClass}>{header}<section className="celebrate-card">
    <div className="celebrate-icon"><Trophy /></div><p className="eyebrow">YOU FINISHED!</p><h1>You did the math!</h1><p>You answered <strong>{roundCorrect} out of 10</strong> correctly.</p>
    <div className="earned-stars"><Star fill="currentColor" />+{roundCorrect} stars</div><div className="celebrate-actions"><button className="primary-button" onClick={() => begin(level)}><RotateCcw />Play again</button><button className="secondary-button" onClick={() => setScreen('home')}><Home />Pick another game</button></div>
  </section></main>;

  const accuracy = progress.totalAnswered ? Math.round(progress.totalCorrect / progress.totalAnswered * 100) : 0;
  return <main className={shellClass}>{header}<button className="back-link" onClick={() => setScreen('home')}><ArrowLeft />Back to games</button>
    <section className="grownup-heading"><div><p className="eyebrow">GROWN-UPS AREA</p><h1>Small steps add up.</h1><p>Practice progress and your private recovery code.</p></div></section>
    <section className="stat-grid">{[[progress.stars, 'Stars earned'], [accuracy + '%', 'Accuracy'], [progress.bestStreak, 'Best streak'], [progress.sessions, 'Games finished']].map(([value, label]) => <article key={label}><strong>{value}</strong><span>{label}</span></article>)}</section>
    <section className={'save-panel ' + sync.state} aria-live="polite"><div><h2>{sync.state === 'saved' ? 'Saved online ✓' : sync.state === 'saving' ? 'Saving your progress…' : 'Progress is not confirmed online'}</h2>
      <p>{sync.message || (sync.state === 'saved' ? 'You can now restore this code on another device.' : 'Keep this page open. Your code will work on another browser after this says Saved online.')}</p></div>
      <button className="secondary-button" onClick={() => { void sync.engine.sync(); }} disabled={sync.state === 'saving' || !sync.code}>{sync.state === 'saving' ? 'Saving…' : 'Save now'}</button></section>
    <section className="code-panel"><div><p className="eyebrow">YOUR PROGRESS CODE</p><h2 className="recovery-code">{sync.code || 'Opening…'}</h2><p>This works like a private login code. Keep it private.</p></div><button className="copy-button" disabled={!sync.code} onClick={() => { void copyCode(); }}><Copy />Copy code</button></section>
    <section className="restore-panel"><div><h2>Have a progress code?</h2><p>Restoring switches this device to that code. Future practice here will update the same progress.</p></div>
      <form className="restore-form" onSubmit={event => { event.preventDefault(); void restore(); }}><input value={resumeCode} onChange={event => setResumeCode(event.target.value)} aria-label="Progress code" placeholder="FCT-ABCD-2345" autoComplete="off" maxLength={40} disabled={sync.restoring} /><button disabled={sync.restoring || !resumeCode.trim()}>{sync.restoring ? 'Restoring…' : 'Restore'}</button></form>
    </section>{notice && <p className="success-message" role="status">{notice}</p>}{formError && <p className="error-message" role="alert">{formError}</p>}
    <section className="path-panel"><div><h2>Practice path</h2><p>Current path: <strong>{older ? 'Ages 8+' : 'Ages 0–8'}</strong></p></div><button className="secondary-button" onClick={() => setAgeGroup(null)}>Change age group</button></section>
    <p className="privacy-note"><ShieldCheck />No child's name, email, or personal details needed.</p><p className="version-note">Factoodle 2 · local-first, confirmed online saves</p>
  </main>;
}
