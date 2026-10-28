'use client';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main" className="wrap" style={{ paddingTop: 48 }}>
      <div className="card stack">
        <h1>Something did not load</h1>
        <p className="muted">That is on our side, not yours. Please try again in a moment.</p>
        <div className="row">
          <button className="btn btn-primary" onClick={reset}>
            Try again
          </button>
          <a className="btn" href="/">
            Go to the start
          </a>
        </div>
      </div>
    </main>
  );
}
