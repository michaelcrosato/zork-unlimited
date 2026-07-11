import type { FreshGameTutorial } from "../../src/world/fresh_game_tutorial.js";

type NewJourneyTutorialProps = {
  tutorial: FreshGameTutorial;
  onStart: () => void;
};

export function NewJourneyTutorial({
  tutorial,
  onStart,
}: NewJourneyTutorialProps): JSX.Element {
  return (
    <main className="tutorial-page">
      <section
        className="tutorial-card"
        aria-labelledby="tutorial-title"
        aria-describedby="tutorial-goal"
      >
        <header className="tutorial-heading">
          <p className="kicker">{tutorial.kicker}</p>
          <h1 id="tutorial-title">{tutorial.title}</h1>
          <p id="tutorial-goal">{tutorial.goal}</p>
        </header>

        <ol className="tutorial-steps">
          {tutorial.steps.map((step, index) => (
            <li key={step.id} className="tutorial-step">
              <span className="tutorial-number" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h2>{step.title}</h2>
                <p>{step.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <footer className="tutorial-footer">
          <p>Your browser saves this journey automatically.</p>
          <button type="button" onClick={onStart} autoFocus>
            {tutorial.start_label}
          </button>
        </footer>
      </section>
    </main>
  );
}
