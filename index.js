// server.js
const WebSocket = require('ws');

// Bind to port provided by Render
const port = process.env.PORT || 8080;

// IMPORTANT: attach to an HTTP server to serve WS on a path
const http = require('http');
const server = http.createServer((req, res) => {
  // (optional) health check
  if (req.url === '/health') { res.writeHead(200); res.end('ok'); return; }
  res.writeHead(404); res.end('Not found');
});

// mount WS server at path `/ws`
const wss = new WebSocket.Server({ server, path: '/ws' });
server.listen(port, () => console.log(`Listening on :${port}`));

// --- your existing logic unchanged below ---
const sessions = {};
wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    let data; try { data = JSON.parse(msg); } catch { return; }
    if (!ws.deviceId) {
      const { deviceId, authCode } = data || {};
      if (!deviceId || !authCode) { ws.send(JSON.stringify({type:'error',message:'Missing deviceId or authCode'})); ws.close(); return; }
      if (!sessions[deviceId]) sessions[deviceId] = { authCode, host: null, controller: null };
      const session = sessions[deviceId];
      if (session.authCode !== authCode) { ws.send(JSON.stringify({type:'error',message:'Authentication failed'})); ws.close(); return; }
      if (!session.host) { session.host = ws; ws.role = 'host'; }
      else if (!session.controller) { session.controller = ws; ws.role = 'controller'; }
      else { ws.send(JSON.stringify({type:'error',message:'Device ID already in use by two clients'})); ws.close(); return; }
      ws.deviceId = deviceId;
      if (session.host && session.controller) {
        session.host.send(JSON.stringify({ type: 'paired' }));
        session.controller.send(JSON.stringify({ type: 'paired' }));
      }
    } else {
      const session = sessions[ws.deviceId];
      const target = (ws.role === 'host') ? session.controller : session.host;
      if (target && target.readyState === WebSocket.OPEN) target.send(msg);
    }
  });

  ws.on('close', () => {
    if (ws.deviceId && sessions[ws.deviceId]) {
      const session = sessions[ws.deviceId];
      const other = (ws.role === 'host') ? session.controller : session.host;
      if (other && other.readyState === WebSocket.OPEN) other.send(JSON.stringify({ type: 'partner-disconnected' }));
      if (ws.role === 'host') session.host = null; else if (ws.role === 'controller') session.controller = null;
      if (!session.host && !session.controller) delete sessions[ws.deviceId];
    }
  });
});
