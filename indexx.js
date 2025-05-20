const WebSocket = require('ws');
const axios = require('axios');
const express = require('express');
const path = require('path');

const app = express();
const port = 3000;

const loginUrl = 'https://api-capital.backend-capital.com/api/v1/session';
const credentials = {
  identifier: 'dvlpr.saleh@gmail.com',
  password: 'Cc-0537221210'
};

let cst = null;
let securityToken = null;

// إنشاء الجلسة وتخزين التوكن
async function createSession() {
  try {
    const response = await axios.post(loginUrl, credentials, {
      headers: {
        'Content-Type': 'application/json',
        'X-CAP-API-KEY': 'vQ5hjpmakUVD0N3N'
      }
    });
    cst = response.headers['cst'];
    securityToken = response.headers['x-security-token'];
    console.log('✅ Session created');
  } catch (error) {
    console.error('❌ Error creating session:', error.response?.data || error.message);
  }
}
 
// خادم WebSocket
const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', async (ws) => {
  console.log('🔌 New client connected');

  if (!cst || !securityToken) {
    console.log('🔑 No active session. Creating one...');
    await createSession();
  }

  const capitalWs = new WebSocket('wss://api-streaming-capital.backend-capital.com/connect');

  capitalWs.on('open', () => {
    console.log('🌐 Connected to Capital.com WebSocket');

    const subscribeMessage = {
      destination: 'marketData.subscribe',
      correlationId: '100',
      cst: cst,
      securityToken: securityToken,
      payload: {
        epics: ['GOLD']
      }
    };

    capitalWs.send(JSON.stringify(subscribeMessage));
    console.log('📩 Sent subscription request for GOLD');
  });

  capitalWs.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.destination === 'quote') {
      const priceUpdate = {
        bid: msg.payload.bid,
        offer: msg.payload.ofr,
        timestamp: msg.payload.timestamp
      };
      ws.send(JSON.stringify(priceUpdate));
    }
  });

  capitalWs.on('error', (err) => {
    console.error('🚫 Capital.com WebSocket error:', err.message);
  });

  capitalWs.on('close', () => {
    console.log('🛑 Capital.com WebSocket connection closed');
  });

  ws.on('close', () => {
    console.log('❎ Client disconnected');
    capitalWs.close();
  });
});

const server = app.listen(port, async () => {
  console.log(`🚀 WebSocket server running on ws://localhost:${port}`);
  await createSession();
  startKeepAlive();
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'test.html'));
});
