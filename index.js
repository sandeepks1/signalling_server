const http = require('http');
const WebSocket = require('ws');

const port = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200);
    res.end('ok');
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

const wss = new WebSocket.Server({ server, path: '/ws' });
const sessions = {};

server.listen(port, () => console.log(`[Server] Listening on port ${port}, path /ws`));

wss.on('connection', (ws, req) => {
  console.log(`[WS] New connection from ${req.socket.remoteAddress}`);

  ws.on('message', (msg) => {
    console.log(`[WS] Raw message: ${msg}`);
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      console.error("[WS] Non-JSON message received");
      return;
    }

    if (!ws.deviceId) {
      const { deviceId, authCode } = data;
      console.log(`[Auth] Attempting auth deviceId=${deviceId}, authCode=${authCode}`);

      if (!deviceId || !authCode) {
        ws.send(JSON.stringify({ type: 'error', message: 'Missing deviceId or authCode' }));
        ws.close();
        return;
      }

      if (!sessions[deviceId]) {
        sessions[deviceId] = { authCode, host: null, controller: null };
        console.log(`[Session] Created new session for deviceId=${deviceId}`);
      }

      const session = sessions[deviceId];
      if (session.authCode !== authCode) {
        console.log(`[Auth] FAILED for deviceId=${deviceId}`);
        ws.send(JSON.stringify({ type: 'error', message: 'Authentication failed' }));
        ws.close();
        return;
      }

      if (!session.host) {
        session.host = ws;
        ws.role = 'host';
        console.log(`[Role] deviceId=${deviceId} assigned as HOST`);
      } else if (!session.controller) {
        session.controller = ws;
        ws.role = 'controller';
        console.log(`[Role] deviceId=${deviceId} assigned as CONTROLLER`);
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'Device ID already in use by two clients' }));
        ws.close();
        console.log(`[Error] Session for deviceId=${deviceId} already full`);
        return;
      }

      ws.deviceId = deviceId;

      if (session.host && session.controller) {
        console.log(`[Session] deviceId=${deviceId} -> HOST and CONTROLLER paired`);
        session.host.send(JSON.stringify({ type: 'paired' }));
        session.controller.send(JSON.stringify({ type: 'paired' }));
      }
    } else {
      const session = sessions[ws.deviceId];
      if (!session) return;

      const target = (ws.role === 'host') ? session.controller : session.host;
      if (target && target.readyState === WebSocket.OPEN) {
        console.log(`[Relay] deviceId=${ws.deviceId}, role=${ws.role} -> forwarding message`);
        target.send(msg);
      } else {
        console.log(`[Relay] deviceId=${ws.deviceId}, role=${ws.role} -> no target available`);
      }
    }
  });

  ws.on('close', () => {
    if (ws.deviceId && sessions[ws.deviceId]) {
      const session = sessions[ws.deviceId];
      console.log(`[Close] deviceId=${ws.deviceId}, role=${ws.role}`);

      const other = (ws.role === 'host') ? session.controller : session.host;
      if (other && other.readyState === WebSocket.OPEN) {
        other.send(JSON.stringify({ type: 'partner-disconnected' }));
        console.log(`[Notify] deviceId=${ws.deviceId} -> notified other side of disconnect`);
      }

      if (ws.role === 'host') session.host = null;
      else if (ws.role === 'controller') session.controller = null;

      if (!session.host && !session.controller) {
        delete sessions[ws.deviceId];
        console.log(`[Cleanup] Session for deviceId=${ws.deviceId} removed`);
      }
    }
  });
});
