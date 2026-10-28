import Link from 'next/link';

export default function NotFound() {
  return (
    <main id="main" className="wrap" style={{ paddingTop: 48 }}>
      <div className="card stack">
        <h1>We could not find that page</h1>
        <Link className="btn btn-primary" href="/">
          Back to Leanplate
        </Link>
      </div>
    </main>
  );
}
