import { useEffect, useState } from 'react'
import {DEFAULT_PLAYGROUND_CODE} from "../hooks/useWikiState.ts";

interface PlaygroundPanelProps {
    code: string
    savedLabel?: string
    onChange: (code: string) => void
}

function RunIcon() {
    return (
        <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
    )
}

function ResetIcon() {
    return (
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
    )
}

function ConsoleIcon() {
    return (
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
    )
}


function buildPreviewDocument(code: string): string {
    return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com; style-src 'unsafe-inline';"
    />
    <style>
      body {
        margin: 0;
        padding: 16px;
        color: #e6edf3;
        background: #0d1117;
        font-family: sans-serif;
      }
      #error {
        color: #ff7b72;
        white-space: pre-wrap;
      }
    </style>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <pre id="error"></pre>

    <script>
      window.onerror = function(message, source, line, column, error) {
        const element = document.getElementById('error');
        element.textContent =
          error && error.stack
            ? error.stack
            : String(message) + ' (' + line + ':' + column + ')';
      };
    </script>

    <script>
      try {
        const compiled = Babel.transform(
          ${JSON.stringify(code)},
          { presets: ['react'] }
        ).code;

        new Function(compiled)();
      } catch (error) {
        document.getElementById('error').textContent =
          error && error.stack ? error.stack : String(error);
      }
    </script>
  </body>
</html>`
}

export function PlaygroundPanel({
                                    code,
                                    savedLabel,
                                    onChange,
                                }: PlaygroundPanelProps) {
    const [preview, setPreview] = useState('')
    const [consoleVisible, setConsoleVisible] = useState(false)

    useEffect(() => {
        setPreview(buildPreviewDocument(code))
    }, [code])

    function runCode() {
        setPreview(buildPreviewDocument(code))
    }

    function resetCode() {
        if (window.confirm('Ripristinare il codice del playground?')) {
            onChange(DEFAULT_PLAYGROUND_CODE)
            setPreview(buildPreviewDocument(DEFAULT_PLAYGROUND_CODE))
        }
    }

    return (
        <section className="playground-panel">
            <header className="playground-toolbar">
                <button className="pg-btn accent" type="button" onClick={runCode}>
                    <RunIcon />
                    Run
                </button>

                <button className="pg-btn" type="button" onClick={resetCode}>
                    <ResetIcon />
                    Reset
                </button>

                <button
                    className="pg-btn"
                    type="button"
                    onClick={() => setConsoleVisible((value) => !value)}
                >
                    <ConsoleIcon />
                    Console
                </button>

                <div className="playground-spacer" />

                <span className="pg-autosave">{savedLabel ?? '—'}</span>
            </header>

            <div className="playground-split">
                <div className="playground-editor-wrap">
                    <span className="panel-label">EDITOR</span>
                    <textarea
                        className="playground-editor"
                        value={code}
                        spellCheck={false}
                        onChange={(event) => onChange(event.target.value)}
                    />
                </div>

                <div className="playground-preview-wrap">
                    <span className="panel-label">PREVIEW</span>
                    <iframe
                        className="playground-preview"
                        title="Anteprima playground"
                        sandbox="allow-scripts"
                        srcDoc={preview}
                    />
                </div>
            </div>

            {consoleVisible && (
                <div className="playground-console">
                    La console del playground viene visualizzata nell'anteprima.
                </div>
            )}
        </section>
    )
}