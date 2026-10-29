const REACT_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js'
const REACT_DOM_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js'
const BABEL_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js'

export interface PlaygroundMessage {
    __pg: true
    runToken: string
    type: 'log' | 'error'
    message: string
    phase?: 'console' | 'syntax' | 'runtime'
    /** null identifica App.tsx; undefined significa posizione sconosciuta. */
    fileId?: string | null
    fileName?: string
    line?: number | null
    col?: number | null
}

export function isPlaygroundMessage(data: unknown): data is PlaygroundMessage {
    if (typeof data !== 'object' || data === null) return false

    const value = data as Record<string, unknown>
    const validPosition = (position: unknown) =>
        position == null
        || (typeof position === 'number' && Number.isInteger(position) && position >= 1)

    return value.__pg === true
        && typeof value.runToken === 'string'
        && (value.type === 'log' || value.type === 'error')
        && typeof value.message === 'string'
        && (
            value.phase === undefined
            || value.phase === 'console'
            || value.phase === 'syntax'
            || value.phase === 'runtime'
        )
        && (value.fileId == null || typeof value.fileId === 'string')
        && (value.fileName === undefined || typeof value.fileName === 'string')
        && validPosition(value.line)
        && validPosition(value.col)
}

/** Serializza dati senza permettere la chiusura del tag script. */
function toScriptString(value: unknown): string {
    const json = JSON.stringify(value)
    if (json === undefined) throw new TypeError('Valore non serializzabile')

    return json
        .replace(/</g, '\\u003c')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029')
}

export interface ExtraFile {
    id: string
    name: string
    code: string
}

export function buildPreviewDocument(
    userCode: string,
    extraFiles: ExtraFile[] = [],
    runToken = '',
): string {
    const files = [
        ...extraFiles,
        { id: null, name: 'App.tsx', code: userCode },
    ]

    let fullCode = ''
    const ranges: {
        id: string | null
        name: string
        startLine: number
        endLine: number
    }[] = []

    for (const file of files) {
        // Il separatore evita che l'ultima espressione di un file
        // si unisca involontariamente alla prima del successivo.
        if (fullCode.length > 0) fullCode += '\n;\n'

        const code = file.code.replace(/\r\n?/g, '\n')
        const startLine = fullCode.split('\n').length

        ranges.push({
            id: file.id,
            name: file.name,
            startLine,
            endLine: startLine + code.split('\n').length - 1,
        })

        fullCode += code
    }

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
  var runToken = ${toScriptString(runToken)};
  var files = ${toScriptString(ranges)};
  var generatedMap = null;

  function send(payload){
    parent.postMessage(Object.assign({
      __pg: true,
      runToken: runToken
    }, payload), '*');
  }

  function serialize(args){
    return Array.prototype.map.call(args, function(value){
      if(typeof value === 'string') return value;
      if(value instanceof Error) return value.stack || value.message;
      try {
        var json = JSON.stringify(value);
        return json === undefined ? String(value) : json;
      } catch(error) {
        return String(value);
      }
    }).join(' ');
  }

  ['log','info','warn','error'].forEach(function(level){
    var original = console[level];
    console[level] = function(){
      send({
        type: level === 'error' || level === 'warn' ? 'error' : 'log',
        phase: 'console',
        message: serialize(arguments)
      });
      if(original) original.apply(console, arguments);
    };
  });

  function originalFilePosition(line, col){
    for(var i = 0; i < files.length; i++){
      var file = files[i];
      if(line >= file.startLine && line <= file.endLine){
        return {
          fileId: file.id,
          fileName: file.name,
          line: line - file.startLine + 1,
          col: col
        };
      }
    }
    return null;
  }

  // Decodifica un segmento Base64 VLQ della source map.
  function decodeSegment(segment){
    var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var values = [];
    var value = 0;
    var shift = 0;

    for(var i = 0; i < segment.length; i++){
      var digit = alphabet.indexOf(segment.charAt(i));
      if(digit < 0) return null;

      value += (digit & 31) * Math.pow(2, shift);

      if(digit & 32){
        shift += 5;
      } else {
        var negative = value % 2 === 1;
        var magnitude = Math.floor(value / 2);
        values.push(negative ? -magnitude : magnitude);
        value = 0;
        shift = 0;
      }
    }

    return shift === 0 ? values : null;
  }

  function mappedPosition(generatedLine, generatedCol){
    if(!generatedMap || generatedLine < 1 || generatedCol < 1) return null;

    var lines = generatedMap.mappings.split(';');
    if(generatedLine > lines.length) return null;

    var source = 0;
    var originalLine = 0;
    var originalCol = 0;
    var candidate = null;

    for(var lineIndex = 0; lineIndex < generatedLine; lineIndex++){
      var segments = lines[lineIndex].split(',');
      var generatedColumn = 0;

      for(var i = 0; i < segments.length; i++){
        if(!segments[i]) continue;

        var fields = decodeSegment(segments[i]);
        if(!fields || fields.length === 0) return null;

        generatedColumn += fields[0];

        if(fields.length >= 4){
          source += fields[1];
          originalLine += fields[2];
          originalCol += fields[3];
        }

        if(lineIndex === generatedLine - 1){
          if(generatedColumn > generatedCol - 1) break;

          candidate = fields.length >= 4 && source === 0
            ? { line: originalLine + 1, col: originalCol + 1 }
            : null;
        }
      }
    }

    return candidate
      ? originalFilePosition(candidate.line, candidate.col)
      : null;
  }

  function runtimePosition(error, source, line, col){
    var stack = error && typeof error.stack === 'string' ? error.stack : '';
    var match = stack.match(/playground-user\\.js:(\\d+):(\\d+)/);

    if(match){
      // La prima riga appartiene alla funzione wrapper aggiunta sotto.
      return mappedPosition(Number(match[1]) - 1, Number(match[2]));
    }

    if(
      typeof source === 'string'
      && /playground-user\\.js$/.test(source)
      && Number.isInteger(line)
      && Number.isInteger(col)
    ){
      return mappedPosition(line - 1, col);
    }

    return null;
  }

  function showError(message, phase, position){
    var where = position
      ? ' (' + position.fileName + ':' + position.line + ':' + position.col + ')'
      : '';

    var overlay = document.getElementById('err-overlay');
    overlay.style.display = 'block';
    overlay.textContent = 'Errore' + where + ':\\n' + message;

    send(Object.assign({
      type: 'error',
      phase: phase,
      message: String(message)
    }, position || {}));
  }

  window.addEventListener('error', function(event){
    showError(
      event.error && event.error.stack
        ? event.error.stack
        : event.message || 'Errore di esecuzione',
      'runtime',
      runtimePosition(event.error, event.filename, event.lineno, event.colno)
    );
    event.preventDefault();
  });

  window.addEventListener('unhandledrejection', function(event){
    var reason = event.reason;
    showError(
      'Promise non gestita: ' + (
        reason && reason.stack ? reason.stack : String(reason)
      ),
      'runtime',
      runtimePosition(reason, null, null, null)
    );
    event.preventDefault();
  });

  var result;
  try {
    result = Babel.transform(${toScriptString(fullCode)}, {
      presets: ['react'],
      filename: 'playground.jsx',
      sourceFileName: 'playground.jsx',
      sourceMaps: true
    });
    generatedMap = result.map;
  } catch(error) {
    var position = error.loc
      ? originalFilePosition(error.loc.line, error.loc.column + 1)
      : null;

    showError(error.message || String(error), 'syntax', position);
    return;
  }

  // Un vero script con sourceURL evita gli offset dipendenti dal motore
  // JavaScript introdotti dal costruttore new Function.
  var script = document.createElement('script');
  script.textContent = '(function(){\\n'
    + result.code
    + '\\n})();\\n//# sourceURL=playground-user.js';
  document.body.appendChild(script);
})();
</script>
</body>
</html>`;
}