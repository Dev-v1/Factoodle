import {
  ArrowLeft,
  BarChart3,
  Brain,
  Check,
  ChevronRight,
  Copy,
  Delete,
  Home,
  RotateCcw,
  ShieldCheck,
  Sigma,
  Sparkles,
  Star,
  Trophy,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type Operation = "addition" | "subtraction" | "multiplication" | "division";
type Screen = "home" | "levels" | "practice" | "celebrate" | "grownups";
type Question = { left: number; right: number; symbol: string; answer: number };
type Progress = {
  totalCorrect: number;
  totalAnswered: number;
  bestStreak: number;
  stars: number;
  sessions: number;
  byLevel: Record<string, { correct: number; answered: number }>;
};

const OPERATIONS: Array<{
  id: Operation;
  name: string;
  symbol: string;
  example: string;
  color: string;
}> = [
  { id: "addition", name: "Add", symbol: "+", example: "2 + 3 = 5", color: "coral" },
  { id: "subtraction", name: "Subtract", symbol: "−", example: "5 − 2 = 3", color: "blue" },
  { id: "multiplication", name: "Multiply", symbol: "×", example: "3 × 2 = 6", color: "purple" },
  { id: "division", name: "Divide", symbol: "÷", example: "6 ÷ 2 = 3", color: "green" },
];

const LEVELS = [10, 20, 30, 40, 50];
const EMPTY_PROGRESS: Progress = {
  totalCorrect: 0,
  totalAnswered: 0,
  bestStreak: 0,
  stars: 0,
  sessions: 0,
  byLevel: {},
};
const ENCOURAGEMENTS = ["You got it!", "Number power!", "Great thinking!", "Math star!", "Amazing job!"];

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function makeQuestion(operation: Operation, max: number): Question {
  if (operation === "addition") {
    const answer = randomInt(0, max);
    const left = randomInt(0, answer);
    return { left, right: answer - left, symbol: "+", answer };
  }

  if (operation === "subtraction") {
    const answer = randomInt(0, max);
    const right = randomInt(0, max - answer);
    return { left: answer + right, right, symbol: "−", answer };
  }

  if (operation === "multiplication") {
    const pairs: Array<[number, number]> = [];
    for (let left = 0; left <= 10; left += 1) {
      for (let right = 0; right <= 10; right += 1) {
        if (left * right <= max) pairs.push([left, right]);
      }
    }
    const [left, right] = pairs[randomInt(0, pairs.length - 1)];
    return { left, right, symbol: "×", answer: left * right };
  }

  const answer = randomInt(0, max);
  const right = randomInt(1, 10);
  return { left: answer * right, right, symbol: "÷", answer };
}

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const part = (start: number) =>
    Array.from(bytes.slice(start, start + 4), (byte) => alphabet[byte % alphabet.length]).join("");
  return `FCT-${part(0)}-${part(4)}`;
}

function apiUrl() {
  return (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "");
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [operation, setOperation] = useState<Operation>("addition");
  const [level, setLevel] = useState(10);
  const [question, setQuestion] = useState<Question>(() => makeQuestion("addition", 10));
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [questionNumber, setQuestionNumber] = useState(1);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [streak, setStreak] = useState(0);
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS);
  const [code, setCode] = useState("");
  const [resumeCode, setResumeCode] = useState("");
  const [notice, setNotice] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const nextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const existingCode = localStorage.getItem("factoodle-code") || makeCode();
    localStorage.setItem("factoodle-code", existingCode);
    setCode(existingCode);

    const saved = localStorage.getItem(`factoodle-progress:${existingCode}`);
    if (saved) {
      try {
        setProgress(JSON.parse(saved));
      } catch {
        localStorage.removeItem(`factoodle-progress:${existingCode}`);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !code) return;
    localStorage.setItem(`factoodle-progress:${code}`, JSON.stringify(progress));

    const baseUrl = apiUrl();
    if (!baseUrl) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`${baseUrl}/api/progress/${code}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(progress),
        signal: controller.signal,
      }).catch(() => undefined);
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [code, hydrated, progress]);

  useEffect(
    () => () => {
      if (nextTimer.current) clearTimeout(nextTimer.current);
    },
    [],
  );

  const selectedOperation = useMemo(
    () => OPERATIONS.find((item) => item.id === operation) ?? OPERATIONS[0],
    [operation],
  );

  function beginPractice(chosenLevel: number) {
    setLevel(chosenLevel);
    setQuestion(makeQuestion(operation, chosenLevel));
    setAnswer("");
    setFeedback(null);
    setQuestionNumber(1);
    setSessionCorrect(0);
    setStreak(0);
    setScreen("practice");
  }

  function submitAnswer() {
    if (!answer || feedback) return;
    const isCorrect = Number(answer) === question.answer;
    const nextStreak = isCorrect ? streak + 1 : 0;
    const key = `${operation}-${level}`;

    setFeedback(isCorrect ? "correct" : "wrong");
    setStreak(nextStreak);
    if (isCorrect) setSessionCorrect((value) => value + 1);
    setProgress((old) => ({
      ...old,
      totalCorrect: old.totalCorrect + (isCorrect ? 1 : 0),
      totalAnswered: old.totalAnswered + 1,
      bestStreak: Math.max(old.bestStreak, nextStreak),
      stars: old.stars + (isCorrect ? 1 : 0),
      byLevel: {
        ...old.byLevel,
        [key]: {
          correct: (old.byLevel[key]?.correct ?? 0) + (isCorrect ? 1 : 0),
          answered: (old.byLevel[key]?.answered ?? 0) + 1,
        },
      },
    }));

    nextTimer.current = setTimeout(() => {
      if (questionNumber >= 10) {
        setProgress((old) => ({ ...old, sessions: old.sessions + 1 }));
        setScreen("celebrate");
      } else {
        setQuestionNumber((value) => value + 1);
        setQuestion(makeQuestion(operation, level));
        setAnswer("");
        setFeedback(null);
      }
    }, isCorrect ? 950 : 1800);
  }

  function tapNumber(value: string) {
    if (!feedback && answer.length < 4) setAnswer((old) => (old === "0" ? value : old + value));
  }

  async function restoreProgress() {
    const normalized = resumeCode.trim().toUpperCase();
    if (!/^FCT-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(normalized)) {
      setNotice("Check the code and try again.");
      return;
    }

    let restored: Progress | null = null;
    const local = localStorage.getItem(`factoodle-progress:${normalized}`);
    if (local) {
      try {
        restored = JSON.parse(local);
      } catch {
        restored = null;
      }
    }

    const baseUrl = apiUrl();
    if (!restored && baseUrl) {
      try {
        const response = await fetch(`${baseUrl}/api/progress/${normalized}`);
        if (response.ok) restored = await response.json();
      } catch {
        // The local copy remains available when the network is offline.
      }
    }

    if (!restored) {
      setNotice("We couldn't find that code yet.");
      return;
    }

    localStorage.setItem("factoodle-code", normalized);
    setCode(normalized);
    setProgress(restored);
    setResumeCode("");
    setNotice("Progress restored!");
  }

  const header = (
    <header className="topbar">
      <button className="brand" onClick={() => setScreen("home")} aria-label="Go to Factoodle home">
        <span className="brand-mark" aria-hidden="true"><Sigma /></span>
        <span>Fact<span>oodle</span></span>
      </button>
      <div className="header-actions">
        <div className="star-count" aria-label={`${progress.stars} stars earned`}><Star size={22} fill="currentColor" /> {progress.stars}</div>
        <button className="round-button" onClick={() => setScreen("grownups")} aria-label="Open grown-ups area"><BarChart3 size={24} /></button>
      </div>
    </header>
  );

  if (screen === "home") {
    return (
      <main className="app-shell home-screen">
        {header}
        <section className="hero">
          <div className="number-doodle" aria-hidden="true">
            <span className="tile tile-one">7</span><span className="operator-tile">+</span>
            <span className="tile tile-two">3</span><span className="equals-tile">=</span>
            <span className="tile tile-answer">10</span><span className="doodle-loop" />
          </div>
          <p className="eyebrow">MATH FACTS MADE PLAYFUL</p>
          <h1>What do you want<br />to practice?</h1>
          <p className="hero-copy">Pick a math game to begin.</p>
        </section>
        <section className="operation-grid" aria-label="Choose a math operation">
          {OPERATIONS.map((item) => (
            <button key={item.id} className={`operation-card ${item.color}`} onClick={() => { setOperation(item.id); setScreen("levels"); }}>
              <span className="operation-art" aria-hidden="true">{item.example}</span>
              <span className="operation-symbol">{item.symbol}</span>
              <span className="operation-name">{item.name}</span>
              <span className="operation-example">Tap to practice</span>
              <span className="go-circle"><ChevronRight /></span>
            </button>
          ))}
        </section>
        <p className="safe-note"><ShieldCheck size={18} /> No login. No ads. Just happy learning.</p>
      </main>
    );
  }

  if (screen === "levels") {
    return (
      <main className="app-shell levels-screen">
        {header}
        <button className="back-link" onClick={() => setScreen("home")}><ArrowLeft /> Back</button>
        <section className="section-heading">
          <div className={`mini-operation ${selectedOperation.color}`}>{selectedOperation.symbol}</div>
          <div><p className="eyebrow">{selectedOperation.name.toUpperCase()} PRACTICE</p><h1>Pick your challenge</h1><p>Every correct answer stays inside the range you choose.</p></div>
        </section>
        <section className="level-grid" aria-label="Choose an answer range">
          {LEVELS.map((item) => {
            const stat = progress.byLevel[`${operation}-${item}`];
            return (
              <button key={item} className="level-card" onClick={() => beginPractice(item)}>
                <span className="level-number">0–{item}</span><span className="level-label">Answer range</span>
                <span className="level-pips" aria-hidden="true"><i>0</i><b>{item / 2}</b><i>{item}</i></span>
                {stat ? <span className="level-score"><Star size={16} fill="currentColor" /> {stat.correct}/{stat.answered}</span> : <span className="level-score new">NEW</span>}
                <span className="level-go"><ChevronRight /></span>
              </button>
            );
          })}
        </section>
      </main>
    );
  }

  if (screen === "practice") {
    return (
      <main className="practice-shell">
        <header className="practice-topbar">
          <button className="round-button white" onClick={() => setScreen("levels")} aria-label="Leave practice"><X /></button>
          <div className="progress-track" aria-label={`Question ${questionNumber} of 10`}><span style={{ width: `${questionNumber * 10}%` }} /></div>
          <div className="streak-pill">🔥 {streak}</div>
        </header>
        <section className={`quiz-card ${feedback ?? ""}`}>
          <p className="quiz-label">WHAT IS THE ANSWER?</p>
          <div className="equation" aria-label={`${question.left} ${question.symbol} ${question.right}`}>
            <span>{question.left}</span><span className="math-symbol">{question.symbol}</span><span>{question.right}</span><span className="equals">=</span><span className={`answer-box ${answer ? "filled" : ""}`}>{answer || "?"}</span>
          </div>
          <div className={`feedback ${feedback ? "show" : ""}`} aria-live="polite">
            {feedback === "correct" && <><Check /> {ENCOURAGEMENTS[(questionNumber - 1) % ENCOURAGEMENTS.length]}</>}
            {feedback === "wrong" && <><span>The answer is</span> <strong>{question.answer}</strong></>}
          </div>
          <div className="keypad" aria-label="Number keypad">
            {[1,2,3,4,5,6,7,8,9].map((number) => <button key={number} onClick={() => tapNumber(String(number))}>{number}</button>)}
            <button className="delete-key" onClick={() => setAnswer((old) => old.slice(0, -1))} aria-label="Delete last number"><Delete /></button>
            <button onClick={() => tapNumber("0")}>0</button>
            <button className="check-key" onClick={submitAnswer} disabled={!answer || Boolean(feedback)} aria-label="Check answer"><Check /></button>
          </div>
          <p className="question-count">Question {questionNumber} of 10</p>
        </section>
      </main>
    );
  }

  if (screen === "celebrate") {
    return (
      <main className="app-shell celebrate-screen">
        {header}
        <section className="celebrate-card">
          <div className="confetti" aria-hidden="true">+ &nbsp; × &nbsp; ÷</div>
          <div className="celebrate-icon" aria-hidden="true"><Trophy /></div>
          <p className="eyebrow">YOU FINISHED!</p><h1>That was powerful thinking!</h1>
          <p>You answered <strong>{sessionCorrect} out of 10</strong> correctly.</p>
          <div className="earned-stars"><Star fill="currentColor" /> +{sessionCorrect} stars</div>
          <div className="celebrate-actions">
            <button className="primary-button" onClick={() => beginPractice(level)}><RotateCcw /> Play again</button>
            <button className="secondary-button" onClick={() => setScreen("home")}><Home /> Pick another game</button>
          </div>
        </section>
      </main>
    );
  }

  const accuracy = progress.totalAnswered ? Math.round((progress.totalCorrect / progress.totalAnswered) * 100) : 0;
  return (
    <main className="app-shell grownups-screen">
      {header}
      <button className="back-link" onClick={() => setScreen("home")}><ArrowLeft /> Back to games</button>
      <section className="grownup-heading"><div className="grownup-icon"><Brain /></div><div><p className="eyebrow">GROWN-UPS AREA</p><h1>Learning progress</h1><p>A quick look at all the great practice on this device.</p></div></section>
      <section className="stat-grid">
        <article><span className="stat-icon yellow"><Star fill="currentColor" /></span><strong>{progress.stars}</strong><span>Stars earned</span></article>
        <article><span className="stat-icon green"><Check /></span><strong>{accuracy}%</strong><span>Accuracy</span></article>
        <article><span className="stat-icon coral">🔥</span><strong>{progress.bestStreak}</strong><span>Best streak</span></article>
        <article><span className="stat-icon blue"><Sparkles /></span><strong>{progress.sessions}</strong><span>Games finished</span></article>
      </section>
      <section className="code-panel">
        <div><p className="eyebrow">YOUR PROGRESS CODE</p><h2>{code}</h2><p>Keep this code somewhere safe. Use it on another device to bring back progress.</p></div>
        <button className="copy-button" onClick={() => { navigator.clipboard.writeText(code); setNotice("Code copied!"); }}><Copy /> Copy code</button>
      </section>
      <section className="restore-panel">
        <div><h2>Have a progress code?</h2><p>Enter it here to continue where you left off.</p></div>
        <div className="restore-form"><input value={resumeCode} onChange={(event) => setResumeCode(event.target.value)} placeholder="FCT-ABCD-2345" aria-label="Progress code" /><button onClick={restoreProgress}>Restore</button></div>
        {notice && <p className="notice" aria-live="polite">{notice}</p>}
      </section>
      <p className="privacy-note"><ShieldCheck /> Factoodle does not ask for a child&apos;s name, email, or personal information.</p>
    </main>
  );
}
