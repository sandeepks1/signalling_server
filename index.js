// const http = require('http');
// const WebSocket = require('ws');

// const port = process.env.PORT || 8080;

// const server = http.createServer((req, res) => {
//   if (req.url === '/health') {
//     res.writeHead(200);
//     res.end('ok');
//     return;
//   }
//   res.writeHead(404);
//   res.end('not found');
// });

// const wss = new WebSocket.Server({ server, path: '/ws' });
// const sessions = {};

// server.listen(port, () => console.log(`[Server] Listening on port ${port}, path /ws`));

// wss.on('connection', (ws, req) => {
//   console.log(`[WS] New connection from ${req.socket.remoteAddress}`);

//   ws.on('message', (msg) => {
//     console.log(`[WS] Raw message: ${msg}`);
//     let data;
//     try {
//       data = JSON.parse(msg);
//     } catch {
//       console.error("[WS] Non-JSON message received");
//       return;
//     }

//     if (!ws.deviceId) {
//       const { deviceId, authCode } = data;
//       console.log(`[Auth] Attempting auth deviceId=${deviceId}, authCode=${authCode}`);

//       if (!deviceId || !authCode) {
//         ws.send(JSON.stringify({ type: 'error', message: 'Missing deviceId or authCode' }));
//         ws.close();
//         return;
//       }

//       if (!sessions[deviceId]) {
//         sessions[deviceId] = { authCode, host: null, controller: null };
//         console.log(`[Session] Created new session for deviceId=${deviceId}`);
//       }

//       const session = sessions[deviceId];
//       if (session.authCode !== authCode) {
//         console.log(`[Auth] FAILED for deviceId=${deviceId}`);
//         ws.send(JSON.stringify({ type: 'error', message: 'Authentication failed' }));
//         ws.close();
//         return;
//       }

//       if (!session.host) {
//         session.host = ws;
//         ws.role = 'host';
//         console.log(`[Role] deviceId=${deviceId} assigned as HOST`);
//       } else if (!session.controller) {
//         session.controller = ws;
//         ws.role = 'controller';
//         console.log(`[Role] deviceId=${deviceId} assigned as CONTROLLER`);
//       } else {
//         ws.send(JSON.stringify({ type: 'error', message: 'Device ID already in use by two clients' }));
//         ws.close();
//         console.log(`[Error] Session for deviceId=${deviceId} already full`);
//         return;
//       }

//       ws.deviceId = deviceId;

//       if (session.host && session.controller) {
//         console.log(`[Session] deviceId=${deviceId} -> HOST and CONTROLLER paired`);
//         session.host.send(JSON.stringify({ type: 'paired' }));
//         session.controller.send(JSON.stringify({ type: 'paired' }));
//       }
//     } else {
//       const session = sessions[ws.deviceId];
//       if (!session) return;

//       const target = (ws.role === 'host') ? session.controller : session.host;
//       if (target && target.readyState === WebSocket.OPEN) {
//         console.log(`[Relay] deviceId=${ws.deviceId}, role=${ws.role} -> forwarding message`);
//         target.send(msg);
//       } else {
//         console.log(`[Relay] deviceId=${ws.deviceId}, role=${ws.role} -> no target available`);
//       }
//     }
//   });

//   ws.on('close', () => {
//     if (ws.deviceId && sessions[ws.deviceId]) {
//       const session = sessions[ws.deviceId];
//       console.log(`[Close] deviceId=${ws.deviceId}, role=${ws.role}`);

//       const other = (ws.role === 'host') ? session.controller : session.host;
//       if (other && other.readyState === WebSocket.OPEN) {
//         other.send(JSON.stringify({ type: 'partner-disconnected' }));
//         console.log(`[Notify] deviceId=${ws.deviceId} -> notified other side of disconnect`);
//       }

//       if (ws.role === 'host') session.host = null;
//       else if (ws.role === 'controller') session.controller = null;

//       if (!session.host && !session.controller) {
//         delete sessions[ws.deviceId];
//         console.log(`[Cleanup] Session for deviceId=${ws.deviceId} removed`);
//       }
//     }
//   });
// });
// server.js
const http = require('http');
const WebSocket = require('ws');

const port = process.env.PORT || 8080;

// --- helper: extract best-guess client IP (proxy/CDN aware) ---
function getClientIp(req) {
  const hdr = (name) => (req.headers[name] || '').toString();
  // Common headers set by proxies/CDNs
  const xff = hdr('x-forwarded-for');        // "client, proxy1, proxy2"
  const xri = hdr('x-real-ip');              // single IP
  const cf  = hdr('cf-connecting-ip');       // Cloudflare

  let ip = null;
  if (cffHasValue(cf)) ip = cf;
  else if (cffHasValue(xri)) ip = xri;
  else if (cffHasValue(xff)) ip = xff.split(',')[0].trim();
  else ip = req.socket.remoteAddress;

  // Normalize IPv6-mapped IPv4 like ::ffff:203.0.113.5
  if (ip && ip.startsWith('::ffff:')) ip = ip.substring(7);
  return ip;
}
function cffHasValue(v) { return v && typeof v === 'string' && v.trim().length > 0; }

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
const sessions = {}; // deviceId -> { authCode, host: WebSocket|null, controller: WebSocket|null }

server.listen(port, () => console.log(`[Server] Listening on port ${port}, path /ws`));

wss.on('connection', (ws, req) => {
  const ip = getClientIp(req);
  ws.clientIp = ip;
  console.log(`[WS] New connection from ${ip}`);

  ws.on('message', (msg) => {
    // msg is a Buffer by default; show a safe preview for logs
    const preview = Buffer.isBuffer(msg) ? msg.toString('utf8') : String(msg);
    console.log(`[WS] (${ip}) Raw message: ${preview}`);

    let data;
    try {
      data = JSON.parse(preview);
    } catch {
      console.error(`[WS] (${ip}) Non-JSON message received`);
      return;
    }

    // First message must contain deviceId + authCode (your existing flow)
    if (!ws.deviceId) {
      const { deviceId, authCode } = data;
      console.log(`[Auth] (${ip}) Attempting auth deviceId=${deviceId}, authCode=${authCode}`);

      if (!deviceId || !authCode) {
        ws.send(JSON.stringify({ type: 'error', message: 'Missing deviceId or authCode' }));
        ws.close();
        return;
      }

      if (!sessions[deviceId]) {
        sessions[deviceId] = { authCode, host: null, controller: null };
        console.log(`[Session] (${ip}) Created new session for deviceId=${deviceId}`);
      }

      const session = sessions[deviceId];
      if (session.authCode !== authCode) {
        console.log(`[Auth] (${ip}) FAILED for deviceId=${deviceId}`);
        ws.send(JSON.stringify({ type: 'error', message: 'Authentication failed' }));
        ws.close();
        return;
      }

      // Assign role
      if (!session.host) {
        session.host = ws;
        ws.role = 'host';
        console.log(`[Role] (${ip}) deviceId=${deviceId} assigned as HOST`);
      } else if (!session.controller) {
        session.controller = ws;
        ws.role = 'controller';
        console.log(`[Role] (${ip}) deviceId=${deviceId} assigned as CONTROLLER`);
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'Device ID already in use by two clients' }));
        ws.close();
        console.log(`[Error] (${ip}) Session for deviceId=${deviceId} already full`);
        return;
      }

      ws.deviceId = deviceId;

      // If both sides present, notify
      if (session.host && session.controller) {
        console.log(`[Session] deviceId=${deviceId} -> HOST (${session.host.clientIp}) and CONTROLLER (${session.controller.clientIp}) paired`);
        try { session.host.send(JSON.stringify({ type: 'paired' })); } catch {}
        try { session.controller.send(JSON.stringify({ type: 'paired' })); } catch {}
      }
      return;
    }

    // After auth: relay signaling messages between host <-> controller
    const session = sessions[ws.deviceId];
    if (!session) {
      console.log(`[Relay] (${ip}) deviceId=${ws.deviceId} -> session not found`);
      return;
    }

    const target = (ws.role === 'host') ? session.controller : session.host;
    if (target && target.readyState === WebSocket.OPEN) {
      console.log(`[Relay] deviceId=${ws.deviceId}, from ${ws.role}@${ip} -> to ${target.role || 'peer'}@${target.clientIp}`);
      target.send(preview);
    } else {
      console.log(`[Relay] deviceId=${ws.deviceId}, from ${ws.role}@${ip} -> no target available/open`);
    }
  });

  ws.on('close', () => {
    const ipClose = ws.clientIp || 'unknown';
    if (ws.deviceId && sessions[ws.deviceId]) {
      const session = sessions[ws.deviceId];
      console.log(`[Close] deviceId=${ws.deviceId}, role=${ws.role}, ip=${ipClose}`);

      const other = (ws.role === 'host') ? session.controller : session.host;
      if (other && other.readyState === WebSocket.OPEN) {
        try {
          other.send(JSON.stringify({ type: 'partner-disconnected' }));
          console.log(`[Notify] deviceId=${ws.deviceId} -> notified other side (${other.role}@${other.clientIp}) of disconnect`);
        } catch {}
      }

      if (ws.role === 'host') session.host = null;
      else if (ws.role === 'controller') session.controller = null;

      if (!session.host && !session.controller) {
        delete sessions[ws.deviceId];
        console.log(`[Cleanup] Session for deviceId=${ws.deviceId} removed`);
      }
    } else {
      console.log(`[Close] ip=${ipClose} (no session bound)`);
    }
  });

  ws.on('error', (err) => {
    console.error(`[Error] ip=${ws.clientIp || 'unknown'}:`, err && err.message ? err.message : err);
  });
});
