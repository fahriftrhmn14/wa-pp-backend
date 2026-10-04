const express = require('express');
const cors = require('cors');
const { default: makeWASocket, useMultiFileAuthState, disconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 8080;
let sessions = {};

// Endpoint tes server
app.get('/', (req, res) => {
  res.send('Backend WA PP Fullscreen Aktif!');
});

// Endpoint untuk request Pairing Code / Cek Sesi
app.post('/api/pairing', async (req, res) => {
  const { number } = req.body;
  if (!number) return res.status(400).json({ status: false, message: 'Nomor wajib diisi' });

  const sessionDir = path.join(__dirname, 'sessions', number);

  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const sock = makeWASocket({
      auth: state,
      logger: pino({ level: 'silent' }),
      browser: ['Ubuntu', 'Chrome', '20.0.04']
    });

    sock.ev.on('creds.update', saveCreds);

    if (!sock.authState.creds.registered) {
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(number);
          sessions[number] = sock;
          res.json({ status: true, code: code });
        } catch (err) {
          res.status(500).json({ status: false, message: 'Gagal meminta pairing code' });
        }
      }, 3000);
    } else {
      sessions[number] = sock;
      res.json({ status: true, connected: true });
    }
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
});

// Endpoint untuk upload PP Fullscreen
app.post('/api/set-pp', async (req, res) => {
  const { number, imageBase64 } = req.body;
  if (!number || !imageBase64) return res.status(400).json({ status: false, message: 'Data tidak lengkap' });

  const sock = sessions[number];
  if (!sock) return res.status(400).json({ status: false, message: 'Sesi tidak ditemukan, lakukan pairing dulu' });

  try {
    const buffer = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const jid = number + '@s.whatsapp.net';

    // Mengubah PP Fullscreen langsung tanpa crop
    await sock.updateProfilePicture(jid, buffer);

    // Auto cleanup folder sesi setelah sukses agar server tidak penuh
    setTimeout(() => {
      try {
        sock.end();
        delete sessions[number];
        fs.rmSync(path.join(__dirname, 'sessions', number), { recursive: true, force: true });
      } catch (e) {}
    }, 5000);

    res.json({ status: true, message: 'PP Fullscreen Berhasil Dipasang!' });
  } catch (err) {
    res.status(500).json({ status: false, message: 'Gagal memasang PP: ' + err.message });
  }
});

app.listen(PORT, () => console.log(`Server berjalan di port ${PORT}`));
