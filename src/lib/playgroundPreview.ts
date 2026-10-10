// Costruisce il documento caricato nell'iframe del Playground,
// ripreso dalla versione legacy.

const REACT_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js'
const REACT_DOM_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js'
const BABEL_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js'

/** Messaggio inviato dall'iframe al parent via postMessage. */
export interface PlaygroundMessage {
    __pg: true
    type: 'log' | 'error'
    message: string
    line?: number | null
    col?: number | null
}

export function isPlaygroundMessage(data: unknown): data is PlaygroundMessage {
    return typeof data === 'object' && data !== null && (data as { __pg?: unknown }).__pg === true
}

/** Serializza il codice come stringa JS sicura dentro un <script> (niente `</script>`). */
function toScriptString(code: string): string {
    return JSON.stringify(code)
        .replace(/</g, '\\u003c')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029')
}

/** File aggiuntivo (modulo secondario) da eseguire prima del codice principale. */
export interface ExtraFile {
    name: string
    code: string
}

export function buildPreviewDocument(userCode: string, extraFiles: ExtraFile[] = []): string {
    // Concatena i moduli extra prima del main: le loro funzioni sono disponibili globalmente.
    const fullCode = extraFiles.length > 0
        ? extraFiles.map(f => `// === ${f.name} ===\n${f.code}`).join('\n\n') + '\n\n// === App.tsx ===\n' + userCode
        : userCode

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com; style-src 'unsafe-inline'; img-src * data:; connect-src https://cdnjs.cloudflare.com;">
<style>
  body{margin:0;font-family:sans-serif;color:#e6edf3;background:#0d1117;}
  #err-overlay{position:fixed;inset:0;background:#2a1214;color:#ff9b93;padding:16px;font-family:monospace;font-size:12px;white-space:pre-wrap;overflow:auto;display:none;}
</style>
<script src="${REACT_CDN}"></script>
<script src="${REACT_DOM_CDN}"></script>
<script src="${BABEL_CDN}"></script>
</head>
<body>
<div id="root"></div>
<div id="err-overlay"></div>
<script>
(function(){
  function serialize(args){
    return Array.prototype.map.call(args, function(a){
      if(typeof a === 'string') return a;
      try { return JSON.stringify(a); } catch(e){ return String(a); }
    }).join(' ');
  }
  ['log','info','warn','error'].forEach(function(level){
    var orig = console[level];
    console[level] = function(){
      parent.postMessage({ __pg: true, type: (level === 'error' || level === 'warn') ? 'error' : 'log', message: serialize(arguments) }, '*');
      if(orig) orig.apply(console, arguments);
    };
  });
})();
</script>
<script>
function showError(msg, lineno, colno){
  var pos = (lineno != null) ? (' (riga ' + lineno + (colno != null ? ', col ' + colno : '') + ')') : '';
  var o = document.getElementById('err-overlay');
  o.style.display = 'block';
  o.textContent = 'Errore' + pos + ':\\n' + msg;
  parent.postMessage({ __pg: true, type: 'error', message: String(msg), line: lineno, col: colno }, '*');
}
window.onerror = function(msg, source, lineno, colno, error){
  showError((error && error.stack) ? error.stack : msg, lineno, colno);
  return true;
};
window.addEventListener('unhandledrejection', function(ev){
  var r = ev.reason;
  showError('Promise non gestita: ' + ((r && r.stack) || r), null, null);
});
</script>
<script>
(function(){
  try {
    var compiled = Babel.transform(${toScriptString(fullCode)}, {
      presets: ['react'],
      filename: 'playground.jsx'
    }).code;
    new Function(compiled)();
  } catch(e) {
    var loc = e.loc ? (' (riga ' + e.loc.line + ', col ' + e.loc.column + ')') : '';
    showError((e.message || String(e)) + loc, e.loc && e.loc.line, e.loc && e.loc.column);
  }
})();
</script>
</body>
</html>`
}