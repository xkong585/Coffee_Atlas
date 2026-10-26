import styles from "./notices.module.css";

/**
 * Shown whenever a page renders the labeled development preview catalog
 * instead of the shared catalog service. It must stay visible: preview data
 * is not project content.
 */
export function PreviewNotice() {
  return (
    <aside className={styles.preview} aria-label="Development preview data">
      <span className={`preview-label ${styles.previewLabel}`}>
        <span aria-hidden="true" />
        Development preview
      </span>
      <p>
        Development preview data — shown only in local development with <code>ENABLE_DEV_FIXTURES=true</code>. Not the
        project catalog.
      </p>
    </aside>
  );
}
