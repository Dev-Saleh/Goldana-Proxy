const WebSocket = require('ws');
const axios = require('axios');
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());

const port = process.env.PORT || 3000;

const loginUrl = 'https://api-capital.backend-capital.com/api/v1/session';
const credentials = {
  identifier: process.env.LOGIN_EMAIL || 'dvlpr.saleh@gmail.com',
  password: process.env.LOGIN_PASSWORD || 'Cc-0537221210'
};

const TOKEN_FILE = path.join(__dirname, 'session.json');
let currentTokens = {
  cst: null,
  securityToken: null
};

// ====== SESSION MANAGEMENT ======
function saveTokensToFile(cst, securityToken) {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ cst, securityToken }));
}

function loadTokensFromFile() {
  if (fs.existsSync(TOKEN_FILE)) {
    const data = fs.readFileSync(TOKEN_FILE);
    const { cst, securityToken } = JSON.parse(data);
    return { cst, securityToken };
  }
  return null;
}

async function getSessionTokens() {
  try {
    const response = await axios.post(loginUrl, credentials, {
      headers: {
        'Content-Type': 'application/json',
        'X-CAP-API-KEY': process.env.API_KEY || 'vQ5hjpmakUVD0N3N'
      }
    });

    const cst = response.headers['cst'];
    const securityToken = response.headers['x-security-token'];

    saveTokensToFile(cst, securityToken);
    currentTokens = { cst, securityToken };

    console.log('✅ Session tokens refreshed');
    return currentTokens;
  } catch (error) {
    console.error('❌ فشل تسجيل الدخول:', error.response?.data || error.message);
    throw error;
  }
}

async function keepSessionAlive() {
  try {
    const { cst, securityToken } = currentTokens;
    await axios.get('https://api-capital.backend-capital.com/api/v1/ping', {
      headers: {
        'CST': cst,
        'X-SECURITY-TOKEN': securityToken
      }
    });
    console.log('🔁 Session ping successful');
  } catch (error) {
    console.error('⚠️ Session expired. Recreating...');
    await getSessionTokens();
  }
}

function startKeepAlive() {
  setInterval(keepSessionAlive, 9 * 60 * 1000); // كل 9 دقائق
}

// ====== LOAD TOKENS AT STARTUP ======
const stored = loadTokensFromFile();
if (stored) {
  currentTokens = stored;
} else {
  getSessionTokens();
}
startKeepAlive();

// ====== MAIN ROUTES ======
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'test.html'));
});

app.get('/healthz', (req, res) => {
  res.send('OK');
});

// ====== START SERVER ======
const server = app.listen(port, () => {
  console.log(`🚀 Server running on ws://localhost:${port}`);
});

// ====== WEBSOCKET SERVER ======
const wss = new WebSocket.Server({ server });
const clients = new Set();

wss.on('connection', (ws) => {
  console.log('🟢 New WebSocket client connected');
  clients.add(ws);
  subscribeToCapital(ws);
});

// ====== CAPITAL.COM WS STREAMING ======
async function subscribeToCapital(wsClient) {
  let capitalWs;

  async function connect() {
    const { cst, securityToken } = currentTokens;

    capitalWs = new WebSocket('wss://api-streaming-capital.backend-capital.com/connect');

    capitalWs.on('open', () => {
      console.log('✅ Connected to Capital.com WebSocket');

      const subscribeMessage = {
        destination: 'marketData.subscribe',
        correlationId: '100',
        cst,
        securityToken,
        payload: {
          epics: ['GOLD']
        }
      };

      capitalWs.send(JSON.stringify(subscribeMessage));
      console.log('📨 Sent subscription request for GOLD');
    });

    capitalWs.on('message', async (data) => {
      const msg = JSON.parse(data);

      if (msg.status === 'ERROR' && msg.errorCode === 'unauthorized') {
        console.log('⚠️ Token expired. Logging in again...');
        await getSessionTokens();
        capitalWs.terminate();
        connect();
        return;
      }

      if (msg.destination === 'quote') {
        const priceUpdate = {
          bid: msg.payload.bid,
          offer: msg.payload.ofr,
          timestamp: msg.payload.timestamp
        };
        wsClient.send(JSON.stringify(priceUpdate));
      }
    });

    capitalWs.on('error', (err) => {
      console.error('❌ WebSocket error:', err.message);
    });

    capitalWs.on('close', () => {
      console.log('🚪 WebSocket closed');
    });

    wsClient.on('close', () => {
      console.log('❎ Client disconnected');
      clients.delete(wsClient);
      if (capitalWs.readyState === WebSocket.OPEN) {
        capitalWs.close();
      }
    });
  }

  connect();
}
