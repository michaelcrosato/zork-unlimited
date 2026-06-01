/**
 * AdventureForge play view (spec §13 Stage 5).
 *
 * A thin React view: it renders the structured observation and turns clicks into
 * `GameSession.choose(id)` calls. The engine remains headless and authoritative —
 * the UI never decides what is legal or what an action does. Works for CYOA,
 * parser, and RPG packs with the same code, because the client normalizes every
 * mode into one View shape.
 */
import { useMemo, useState } from "react";
import { GameSession, type View } from "./engine.js";
import { PACKS } from "./packs.js";

export default function App(): JSX.Element {
  const [packPath, setPackPath] = useState(PACKS[0]?.path ?? "");
  const entry = useMemo(() => PACKS.find((p) => p.path === packPath) ?? PACKS[0], [packPath]);

  const [session, setSession] = useState<GameSession | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function startSelected(): void {
    if (!entry) return;
    try {
      const s = GameSession.start(entry.source, 1);
      setSession(s);
      setView(s.view());
      setLog([`— ${s.title} —`]);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setSession(null);
      setView(null);
    }
  }

  function choose(id: string, label: string): void {
    if (!session) return;
    const out = session.choose(id);
    setLog((prev) => [...prev, `> ${label}`, ...out.narration, ...(out.rejection ? [`(${out.rejection})`] : [])]);
    setView(session.view());
  }

  function restart(): void {
    if (!session) return;
    session.reset();
    setView(session.view());
    setLog([`— ${session.title} (restarted) —`]);
  }

  return (
    <main className="af">
      <header>
        <h1>AdventureForge</h1>
        <p className="sub">A web view over the headless, deterministic engine.</p>
        <div className="controls">
          <select value={packPath} onChange={(e) => setPackPath(e.target.value)}>
            {PACKS.map((p) => (
              <option key={p.path} value={p.path}>
                {p.name}
              </option>
            ))}
          </select>
          <button onClick={startSelected}>Start</button>
          {session && <button onClick={restart}>Restart</button>}
        </div>
        {error && <p className="error">Could not start: {error}</p>}
      </header>

      {view && (
        <section className="game">
          <div className="scene">
            <h2>{view.title}</h2>
            <p className="text">{view.text}</p>

            {view.ended ? (
              <p className="ending">★ {view.endingId} — The End</p>
            ) : (
              <ul className="choices">
                {view.choices.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => choose(c.id, c.label)}>{c.label}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <aside className="state">
            <h3>State</h3>
            {view.facts.length > 0 && (
              <ul className="facts">
                {view.facts.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            )}
            {view.inventory.length > 0 && (
              <p>
                <strong>Inventory:</strong> {view.inventory.join(", ")}
              </p>
            )}
            {view.journal.length > 0 && (
              <div className="journal">
                <strong>Journal</strong>
                <ul>
                  {view.journal.map((j, i) => (
                    <li key={i}>{j}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="hash">state: {view.stateHash.slice(0, 8)}</p>
          </aside>
        </section>
      )}

      {log.length > 0 && (
        <section className="log">
          <h3>Transcript</h3>
          <pre>{log.join("\n")}</pre>
        </section>
      )}
    </main>
  );
}
