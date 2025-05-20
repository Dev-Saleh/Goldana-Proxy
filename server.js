// gold-price-proxy/index.js

const express = require('express');
const WebSocket = require('ws');
const axios = require('axios');
const app = express();
const port = 3000;

// خزن الرموز مؤقتًا في الذاكرة
let sessionTokens = {
    CST: null,
    SECURITY_TOKEN: null
};

// بيانات الدخول الخاصة بك في Capital.com
const credentials = {
    identifier: 'dvlpr.saleh@gmail.com',
    password: 'Cc-0537221210'
};

// دالة لإنشاء جلسة جديدة
async function createSession() {
    try {
        const response = await axios.post(
            'https://api-capital.backend-capital.com/api/v1/session',
            credentials,
            { headers: { 'Content-Type': 'application/json' } }
        );
        sessionTokens.CST = response.headers['cst'];
        sessionTokens.SECURITY_TOKEN = response.headers['x-security-token'];
        console.log('Session created');
    } catch (error) {
        console.error('Failed to create session:', error.message);
    }
}

// إنشاء WebSocket ونقل البيانات إلى العميل
let wsClient = null;

function connectWebSocket(clientSocket) {
    const ws = new WebSocket('wss://api-streaming-capital.backend-capital.com/connect');

    ws.on('open', () => {
        ws.send(JSON.stringify({
            destination: 'marketData.subscribe',
            correlationId: '100',
            cst: sessionTokens.CST,
            securityToken: sessionTokens.SECURITY_TOKEN,
            payload: {
                epics: ['GOLD']
            }
        }));
    });

    ws.on('message', (data) => {
        const message = JSON.parse(data);
        if (message.destination === 'quote') {
            // أرسل السعر إلى تطبيقك
            clientSocket.send(JSON.stringify({
                bid: message.payload.bid,
                offer: message.payload.ofr,
                timestamp: message.payload.timestamp
            }));
        }
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
    });

    wsClient = ws;
}

// WebSocket Proxy Endpoint
const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', async (clientSocket) => {
    if (!sessionTokens.CST || !sessionTokens.SECURITY_TOKEN) {
        await createSession();
    }
    connectWebSocket(clientSocket);
});

// HTTP Upgrade لربط WebSocket
const server = app.listen(port, () => {
    console.log(`Proxy server running on http://localhost:${port}`);
}); 

server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});
