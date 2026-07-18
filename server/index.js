const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
// Serve React build
app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // For development purposes
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 4000;

const CACHE = {
  animes: new Map(),
  details: new Map(),
  franchise: new Map(),
  sources: new Map()
};

async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 5000 } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const response = await fetch(resource, {
    ...options,
    signal: controller.signal  
  });
  clearTimeout(id);
  return response;
}

// Proxy Shikimori API with Jikan API fallback
app.get('/api/animes', async (req, res) => {
  const query = new URLSearchParams(req.query).toString();
  if (CACHE.animes.has(query)) return res.json(CACHE.animes.get(query));

  try {
    const response = await fetchWithTimeout(`https://shikimori.one/api/animes?${query}`, {
      headers: { 'User-Agent': 'AnimeVaultApp/1.0' },
      timeout: 4000 // 4 sec limit for shiki
    });
    if (!response.ok) throw new Error(`Shiki status ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('Not an array');
    
    CACHE.animes.set(query, data);
    setTimeout(() => CACHE.animes.delete(query), 60000); // 1 min cache
    return res.json(data);
  } catch (error) {
    console.error('Shikimori fetch failed, falling back to Jikan API:', error.message);
    try {
      const limit = req.query.limit || 24;
      const search = req.query.search;
      const url = search 
        ? `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(search)}&limit=${limit}`
        : `https://api.jikan.moe/v4/top/anime?limit=${limit}&filter=bypopularity`;
      
      const jRes = await fetchWithTimeout(url, { timeout: 5000 });
      const jData = await jRes.json();
      
      const mapped = (jData.data || []).map(a => ({
        id: a.mal_id,
        name: a.title,
        russian: a.title_english || a.title,
        image: { original: a.images?.webp?.large_image_url || a.images?.jpg?.large_image_url },
        score: a.score,
        episodes: a.episodes,
        status: a.status === 'Currently Airing' ? 'ongoing' : 'released',
        aired_on: a.aired?.from ? a.aired.from.split('T')[0] : null,
        kind: a.type?.toLowerCase()
      }));
      CACHE.animes.set(query, mapped);
      setTimeout(() => CACHE.animes.delete(query), 60000);
      return res.json(mapped);
    } catch (fallbackError) {
      console.error('Jikan fallback also failed:', fallbackError.message);
      return res.json([]);
    }
  }
});

app.get('/api/animes/:id', async (req, res) => {
  const id = req.params.id;
  if (CACHE.details.has(id)) return res.json(CACHE.details.get(id));

  try {
    const response = await fetchWithTimeout(`https://shikimori.one/api/animes/${id}`, {
      headers: { 'User-Agent': 'AnimeVaultApp/1.0' },
      timeout: 4000
    });
    if (!response.ok) throw new Error('Shiki failed');
    const data = await response.json();
    CACHE.details.set(id, data);
    return res.json(data);
  } catch (error) {
    try {
      const jRes = await fetchWithTimeout(`https://api.jikan.moe/v4/anime/${id}`, { timeout: 5000 });
      const jData = await jRes.json();
      const a = jData.data;
      if (!a) return res.status(404).json({error: 'Not found'});
      
      const mapped = {
        id: a.mal_id,
        name: a.title,
        russian: a.title_english || a.title,
        image: { original: a.images?.webp?.large_image_url || a.images?.jpg?.large_image_url },
        score: a.score,
        episodes: a.episodes,
        status: a.status === 'Currently Airing' ? 'ongoing' : 'released',
        aired_on: a.aired?.from ? a.aired.from.split('T')[0] : null,
        description: a.synopsis,
        genres: (a.genres || []).map(g => ({ id: g.mal_id, name: g.name, russian: g.name })),
        studios: (a.studios || []).map(s => ({ name: s.name }))
      };
      CACHE.details.set(id, mapped);
      return res.json(mapped);
    } catch (fallbackError) {
      return res.status(500).json({ error: 'Failed details' });
    }
  }
});

app.get('/api/animes/:id/franchise', async (req, res) => {
  const id = req.params.id;
  if (CACHE.franchise.has(id)) return res.json(CACHE.franchise.get(id));

  try {
    const response = await fetchWithTimeout(`https://shikimori.one/api/animes/${id}/franchise`, {
      headers: { 'User-Agent': 'AnimeVaultApp/1.0' },
      timeout: 4000
    });
    if (!response.ok) throw new Error('Shiki failed');
    const data = await response.json();
    CACHE.franchise.set(id, data);
    return res.json(data);
  } catch (error) {
    return res.json({ nodes: [] });
  }
});

app.get('/api/player-sources/:id', async (req, res) => {
  const shikimoriId = req.params.id;
  if (CACHE.sources.has(shikimoriId)) return res.json(CACHE.sources.get(shikimoriId));

  try {
    const sources = {
      kodik: null,
      anilibria: null
    };

    // 1. Fetch Kodik
    try {
      const kodikRes = await fetchWithTimeout(`https://kodikapi.com/search?token=8b6999cb0465dc1af5eb5fa97ee89b88&shikimori_id=${shikimoriId}`, { timeout: 4000 });
      const kodikData = await kodikRes.json();
      if (kodikData.results && kodikData.results.length > 0) {
        let link = kodikData.results[0].link;
        if (link.startsWith('//')) link = 'https:' + link;
        sources.kodik = link;
      }
    } catch (e) {
      console.error('Kodik fetch failed:', e.message);
    }

    // 2. Fetch AniLibria by name (we need the name first)
    try {
      let title = '';
      const jRes = await fetchWithTimeout(`https://api.jikan.moe/v4/anime/${shikimoriId}`, { timeout: 4000 });
      if (jRes.ok) {
        const jData = await jRes.json();
        title = jData.data?.title_english || jData.data?.title || '';
      }
      
      if (title) {
        const cleanTitle = title.replace(/[:\-—]/g, ' ').trim().split(' ')[0];
        // Use .top mirror instead of .tv
        const alRes = await fetchWithTimeout(`https://api.anilibria.top/v3/title/search?search=${encodeURIComponent(cleanTitle)}&limit=5`, { timeout: 5000 });
        const alData = await alRes.json();
        if (alData.list && alData.list.length > 0) {
          sources.anilibria = alData.list;
        }
      }
    } catch (e) {
      console.error('AniLibria fetch failed:', e.message);
    }

    CACHE.sources.set(shikimoriId, sources);
    return res.json(sources);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sources' });
  }
});

// Simple in-memory room store
const rooms = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    
    if (!rooms[roomId]) {
      rooms[roomId] = { users: [] };
    }
    
    if (!rooms[roomId].users.includes(socket.id)) {
      rooms[roomId].users.push(socket.id);
    }

    console.log(`User ${socket.id} joined room ${roomId}`);
    
    // Notify others in the room
    io.to(roomId).emit('room_update', { 
      userCount: rooms[roomId].users.length,
      users: rooms[roomId].users 
    });
  });

  socket.on('play_video', (data) => {
    console.log(`Play in room ${data.roomId} from ${socket.id}`);
    socket.to(data.roomId).emit('play_video', { time: data.time });
  });

  socket.on('pause_video', (data) => {
    console.log(`Pause in room ${data.roomId} from ${socket.id}`);
    socket.to(data.roomId).emit('pause_video', { time: data.time });
  });

  socket.on('seek_video', (data) => {
    console.log(`Seek in room ${data.roomId} to ${data.time} from ${socket.id}`);
    socket.to(data.roomId).emit('seek_video', { time: data.time });
  });

  socket.on('change_voiceover', (data) => {
    socket.to(data.roomId).emit('change_voiceover', { voiceover: data.voiceover });
  });

  socket.on('change_episode', (data) => {
    socket.to(data.roomId).emit('change_episode', { episode: data.episode });
  });

  socket.on('send_message', (data) => {
    io.to(data.roomId).emit('receive_message', {
      sender: socket.id,
      text: data.text,
      timestamp: new Date().toISOString()
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Remove user from any rooms they were in
    for (const roomId in rooms) {
      const userIndex = rooms[roomId].users.indexOf(socket.id);
      if (userIndex !== -1) {
        rooms[roomId].users.splice(userIndex, 1);
        io.to(roomId).emit('room_update', { 
          userCount: rooms[roomId].users.length,
          users: rooms[roomId].users 
        });
        
        // Clean up empty rooms
        if (rooms[roomId].users.length === 0) {
          delete rooms[roomId];
        }
      }
    }
  });
});

// All other routes -> serve React app
app.all('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`Lobby Server running on port ${PORT}`);
});
