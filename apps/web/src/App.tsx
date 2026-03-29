import type { ReactElement } from "react";

/**
 * Main application shell.
 *
 * @returns Root UI for the web app.
 */
export function App(): ReactElement {
  return (
    <main style={{ fontFamily: "sans-serif", margin: "2rem" }}>
      <h1>Patchloom</h1>
      <p>AI Engineering Workflow Assistant</p>
    </main>
  );
}
