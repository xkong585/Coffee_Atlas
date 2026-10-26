export default function Loading() {
  return (
    <div className="content-width status-page" role="status" aria-live="polite">
      <span className="loading-line" aria-hidden="true" />
      <p className="eyebrow">Just a moment</p>
      <h1>Opening your next stop.</h1>
      <p>The page is loading.</p>
    </div>
  );
}
