import {useEffect, useRef, useState} from 'react'
import {DEFAULT_PLAYGROUND_CODE} from "../hooks/useWikiState.ts";

interface PlaygroundPanelProps {
    code: string
    savedLabel?: string
    onChange: (code: string) => void
}

interface ConsoleEntry {
    id: number
    type: 'log' | 'error'
    message: string
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
      (function () {
        function serialize(args) {
          return Array.prototype.map.call(args, function (value) {
            if (typeof value === 'string') return value;
            try { return JSON.stringify(value); } catch (e) { return String(value); }
          }).join(' ');
        }
        ['log', 'info', 'warn', 'error'].forEach(function (level) {
          var original = console[level];
          console[level] = function () {
            parent.postMessage({
              __pg: true,
              type: (level === 'error' || level === 'warn') ? 'error' : 'log',
              message: serialize(arguments),
            }, '*');
            if (original) original.apply(console, arguments);
          };
        });
      })();

      window.onerror = function(message, source, line, column, error) {
        const detail = error && error.stack
          ? error.stack
          : String(message) + ' (' + line + ':' + column + ')';
        document.getElementById('error').textContent = detail;
        parent.postMessage({ __pg: true, type: 'error', message: detail }, '*');
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
        const detail = error && error.stack ? error.stack : String(error);
        document.getElementById('error').textContent = detail;
        parent.postMessage({ __pg: true, type: 'error', message: detail }, '*');
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
    const [logs, setLogs] = useState<ConsoleEntry[]>([])
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const logIdRef = useRef(0)

    useEffect(() => {
        setPreview(buildPreviewDocument(code))
    }, [code])

    useEffect(() => {
        function handleMessage(event: MessageEvent) {
            const iframe = iframeRef.current
            if (!iframe || event.source !== iframe.contentWindow) {
                return
            }

            const data = event.data as
                | { __pg?: boolean; type?: string; message?: string }
                | undefined

            if (!data || !data.__pg) {
                return
            }

            logIdRef.current += 1
            setLogs((current) => [
                ...current,
                {
                    id: logIdRef.current,
                    type: data.type === 'error' ? 'error' : 'log',
                    message: data.message ?? '',
                },
            ])
            setConsoleVisible(true)
        }

        window.addEventListener('message', handleMessage)
        return () => window.removeEventListener('message', handleMessage)
    }, [])

    function runCode() {
        setLogs([])
        setPreview(buildPreviewDocument(code))
    }

    function resetCode() {
        if (window.confirm('Ripristinare il codice del playground?')) {
            onChange(DEFAULT_PLAYGROUND_CODE)
            setLogs([])
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
                        ref={iframeRef}
                        className="playground-preview"
                        title="Anteprima playground"
                        sandbox="allow-scripts"
                        srcDoc={preview}
                    />
                </div>
            </div>

            {consoleVisible && (
                <div className="playground-console">
                    {logs.length === 0 ? (
                        <div className="log-line log-empty">
                            Nessun output. Premi “Run” per eseguire il codice.
                        </div>
                    ) : (
                        logs.map((entry) => (
                            <div
                                key={entry.id}
                                className={`log-line ${entry.type === 'error' ? 'error' : ''}`}
                            >
                                {entry.type === 'error' ? '✖ ' : ''}
                                {entry.message}
                            </div>
                        ))
                    )}
                </div>
            )}
        </section>
    )
}