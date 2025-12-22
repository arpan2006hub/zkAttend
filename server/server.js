/* Simple Socket.IO server for rotating attendance codes.
   Rooms are keyed by the class uniqueCode. */
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');
const { solidityPackedKeccak256 } = require('ethers');
const pinataSDK = require('@pinata/sdk');

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: ['http://localhost:5173'], methods: ['GET', 'POST'] },
});

// In-memory session store: room => { code, ts, attendees:Set }
const sessions = Object.create(null);
// Finalized cache: room => { tree, rootHex, total, contentHashHex, leafMap }
const finalized = Object.create(null);

// simple info endpoint to retrieve attendees for a room
app.get('/session/:room', (req, res) => {
  const room = req.params.room;
  const s = sessions[room];
  const addresses = s?.attendees ? Array.from(s.attendees) : [];
  res.json({ addresses, code: s?.code || '', ts: s?.ts || 0 });
});

// Build Merkle tree helpers for Option A
const CHAIN_ID = Number(process.env.CHAIN_ID || 11155111); // Sepolia
const CONTRACT_ADDRESS = (process.env.CONTRACT_ADDRESS || '0xDf5A5998e4c915dA467c7edca583f6bca3f27327').toLowerCase();

const pinataJwt = process.env.PINATA_JWT;
const pinata = pinataJwt ? new pinataSDK({ pinataJWTKey: pinataJwt }) : null;

async function pinSessionToIpfs(payload, uniqueCode) {
  if (!pinata) {
    throw new Error('PINATA_JWT not configured on server');
  }
  const metadata = {
    name: `zkAttend-${uniqueCode}-${payload.timestamp}`,
    keyvalues: {
      uniqueCode,
      chainId: String(payload.chainId),
    },
  };
  const result = await pinata.pinJSONToIPFS(payload, { pinataMetadata: metadata });
  return result.IpfsHash;
}

function buildLeaves(room, chainId, contractAddr) {
  const s = sessions[room];
  const addrs = s ? Array.from(s.attendees || new Set()) : [];
  return addrs.map((a) => {
    const leafHex = solidityPackedKeccak256(
      ['uint256', 'address', 'string', 'address'],
      [chainId, contractAddr, room, a]
    );
    return { a, leafHex };
  });
}

function buildTree(room, chainId, contractAddr) {
  const leafObjs = buildLeaves(room, chainId, contractAddr);
  const leavesBuf = leafObjs.map((o) => Buffer.from(o.leafHex.slice(2), 'hex'));
  const tree = new MerkleTree(leavesBuf, keccak256, { sortPairs: true });
  const rootHex = '0x' + (tree.getRoot()?.toString('hex') || ''.padStart(64, '0'));
  const addresses = leafObjs.map((o) => o.a);
  const contentHashHex = '0x' + keccak256(Buffer.from(JSON.stringify(addresses))).toString('hex');
  const leafMap = new Map(leafObjs.map((o) => [o.a.toLowerCase(), Buffer.from(o.leafHex.slice(2), 'hex')]));
  return { tree, rootHex, total: addresses.length, contentHashHex, leafMap, addresses };
}

app.get('/api/finalize/:room', async (req, res) => {
  const room = req.params.room;
  const s = sessions[room];
  if (!s) return res.status(404).json({ error: 'No session' });
  const paramChainId = Number(req.query.chainId) || CHAIN_ID;
  const paramContract = (req.query.contract || CONTRACT_ADDRESS).toString().toLowerCase();
  try {
    const { tree, rootHex, total, contentHashHex, leafMap, addresses } = buildTree(room, paramChainId, paramContract);
    const payload = {
      version: 1,
      chainId: paramChainId,
      contract: paramContract,
      uniqueCode: room,
      attendees: addresses,
      total,
      contentHash: contentHashHex,
      timestamp: Date.now(),
    };
    const cid = await pinSessionToIpfs(payload, room);
    finalized[room] = { tree, rootHex, total, contentHashHex, leafMap, chainId: paramChainId, contract: paramContract, cid };
    res.json({ root: rootHex, total, contentHash: contentHashHex, chainId: paramChainId, contract: paramContract, cid });
  } catch (err) {
    console.error('Finalize pinning error', err);
    res.status(500).json({ error: err?.message || 'Failed to prepare finalize payload' });
  }
});

app.get('/api/proof/:room', (req, res) => {
  const room = req.params.room;
  const address = (req.query.address || '').toString().toLowerCase();
  const cache = finalized[room];
  if (!cache) return res.status(404).json({ error: 'Not finalized on server' });
  const leafBuf = cache.leafMap.get(address);
  if (!leafBuf) return res.status(404).json({ error: 'Address not in attendees' });
  const proof = cache.tree.getProof(leafBuf).map((p) => '0x' + p.data.toString('hex'));
  res.json({ root: cache.rootHex, proof, chainId: cache.chainId, contract: cache.contract, cid: cache.cid });
});

// Optional: simple attendees listing (debug/inspection)
app.get('/api/attendees/:room', (req, res) => {
  const room = req.params.room;
  const s = sessions[room];
  const attendees = s ? Array.from(s.attendees || new Set()) : [];
  res.json({ attendees, count: attendees.length, code: s?.code || '', ts: s?.ts || 0 });
});

io.on('connection', (socket) => {
  socket.on('join', ({ room, role }) => {
    if (!room) return;
    socket.join(room);
    socket.data.role = role;
    socket.data.room = room;
    const s = sessions[room];
    if (s?.code) {
      socket.emit('codeUpdate', { code: s.code, ts: s.ts });
    }
  });

  socket.on('codeUpdate', ({ room, code, ts }) => {
    if (!room || !code || typeof ts !== 'number') return;
    sessions[room] = sessions[room] || { code: '', ts: 0, attendees: new Set() };
    sessions[room].code = code;
    sessions[room].ts = ts;
    io.to(room).emit('codeUpdate', { code, ts });
  });

  socket.on('endSession', ({ room }) => {
    if (!room) return;
    if (sessions[room]) {
      sessions[room].code = '';
      sessions[room].ts = 0;
    }
    io.to(room).emit('codeUpdate', { code: '', ts: 0 });
  });

  socket.on('markAttempt', ({ room, address, code }) => {
    const s = sessions[room];
    if (!s || !s.code) {
      socket.emit('markResult', { ok: false, reason: 'No active code' });
      return;
    }
    const now = Date.now();
    const withinWindow = now - s.ts <= 7000; // 7s grace
    const notDup = !s.attendees?.has(address?.toLowerCase?.());
    const correct = code === s.code;

    if (correct && withinWindow && notDup) {
      s.attendees.add((address || '').toLowerCase());
      socket.emit('markResult', { ok: true });
      io.to(room).emit('stats', { count: s.attendees.size });
    } else {
      let reason = 'Invalid';
      if (!withinWindow) reason = 'Expired';
      else if (!correct) reason = 'Wrong code';
      else if (!notDup) reason = 'Already marked';
      socket.emit('markResult', { ok: false, reason });
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Realtime server listening on http://localhost:${PORT}`);
});
