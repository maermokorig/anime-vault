import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Copy, Users, PlaySquare, AlertCircle, Loader, Layers } from 'lucide-react';
import './WatchLobby.css';

// ── Source config ──────────────────────────────────────────────────────
const SOURCES = [
  {
    id: 'yohoho',
    label: 'Yohoho (Агрегатор)',
    dub: 'Автоматический поиск рабочих плееров',
    type: 'iframe',
    note: 'Резервный плеер',
  },
  {
    id: 'kodik',
    label: 'Kodik (все озвучки)',
    dub: 'Множество озвучек (внутри плеера)',
    type: 'iframe',
  },
  {
    id: 'anilibria',
    label: 'AniLibria',
    dub: 'AniLibria (RU)',
    type: 'hls',
  },
  {
    id: 'alloha',
    label: 'Alloha',
    dub: 'AniDub / JAM / AniStar',
    type: 'iframe',
  },
  {
    id: 'collaps',
    label: 'Collaps',
    dub: 'Субтитры + озвучки',
    type: 'iframe',
  },
];

// ══════════════════════════════════════════════════════════════════════
const WatchLobby = () => {
  const { id, roomId } = useParams();
  const isSolo = !roomId;

  const [socket, setSocket] = useState(null);
  const [users, setUsers] = useState(1);

  const [activeSource, setActiveSource] = useState(SOURCES[0]);
  const [iframeUrls, setIframeUrls] = useState({ yohoho: '', kodik: '', alloha: '', collaps: '' });

  // Shikimori metadata
  const [shikimoriAnime, setShikimoriAnime] = useState(null);

  // AniLibria state
  const [libriaTitles, setLibriaTitles] = useState([]);
  const [selectedTitle, setSelectedTitle] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [selectedEpisode, setSelectedEpisode] = useState(null);
  const [quality, setQuality] = useState('hd');
  const [videoSrc, setVideoSrc] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const videoRef = useRef(null);
  const isSyncingRef = useRef(false);

  // ── 1. Fetch metadata and sources ──────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    
    // Default fallback iframe URLs
    const safeTitle = shikimoriAnime?.russian || shikimoriAnime?.name || 'аниме';
    setIframeUrls({
      yohoho: `https://yohoho.cc/videoplayer?os=shikimori&player=kodik,collaps,alloha,hdvb,bazon,ustore,trailer&title=${encodeURIComponent(safeTitle)}`,
      kodik: `https://kodik.info/find-player?shikimoriID=${id}`, 
      alloha: `https://api.alloha.tv/?shikimori=${id}`,
      collaps: `https://embed.collaps.org/shikimori/${id}`
    });

    // 1. Get Anime Name (to display in UI)
    fetch(`/api/animes/${id}`)
      .then(r => r.json())
      .then(d => { if (d && !d.error) setShikimoriAnime(d); })
      .catch(() => {
        // Fallback to Jikan directly
        fetch(`https://api.jikan.moe/v4/anime/${id}`)
          .then(r => r.json())
          .then(d => setShikimoriAnime({ name: d.data?.title, russian: d.data?.title_english || d.data?.title }))
          .catch(console.error);
      });

    // 2. Resolve true sources securely
    fetch(`/api/player-sources/${id}`)
      .then(r => {
        if (!r.ok) throw new Error('Proxy sources endpoint missing or failed');
        return r.json();
      })
      .then(data => {
        if (data.kodik) {
          setIframeUrls(prev => ({ ...prev, kodik: data.kodik }));
        }
        if (data.anilibria && data.anilibria.length > 0) {
          setLibriaTitles(data.anilibria);
          setSelectedTitle(data.anilibria[0]);
        } else {
          setError('API AniLibria заблокирован вашим провайдером. Используйте другие источники (например, Kinobox).');
        }
        setLoading(false);
      })
      .catch(err => {
        console.warn('Sources proxy failed:', err);
        setError('Бэкенд не отвечает. Часть источников может не работать.');
        setLoading(false);
      });
  }, [id]);

  // ── 3. Build episode list ────────────────────────────────────────────
  useEffect(() => {
    if (!selectedTitle?.player?.list) return;
    const eps = Object.values(selectedTitle.player.list).sort((a, b) => a.episode - b.episode);
    setEpisodes(eps);
    setSelectedEpisode(eps[0] || null);
    setLoading(false);
  }, [selectedTitle]);

  // ── 4. Build HLS video src ───────────────────────────────────────────
  useEffect(() => {
    if (!selectedEpisode) return;
    const hls = selectedEpisode?.hls;
    if (!hls) { setError('Видео для этой серии недоступно.'); return; }
    const base = 'https://cache.libria.fun';
    const src = hls[quality] || hls.hd || hls.sd || hls.fhd;
    if (src) { setVideoSrc(base + src); setError(''); }
  }, [selectedEpisode, quality]);

  // ── 5. Socket.io sync ────────────────────────────────────────────────
  useEffect(() => {
    if (isSolo) return;
    const sock = io('http://localhost:4000');
    setSocket(sock);
    sock.emit('join_room', roomId);

    sock.on('room_update', d => setUsers(d.userCount));

    sock.on('play_video', (data) => {
      if (!videoRef.current || isSyncingRef.current) return;
      isSyncingRef.current = true;
      if (Math.abs(videoRef.current.currentTime - data.time) > 1.5) videoRef.current.currentTime = data.time;
      videoRef.current.play();
      setTimeout(() => { isSyncingRef.current = false; }, 1000);
    });

    sock.on('pause_video', (data) => {
      if (!videoRef.current || isSyncingRef.current) return;
      isSyncingRef.current = true;
      videoRef.current.currentTime = data.time;
      videoRef.current.pause();
      setTimeout(() => { isSyncingRef.current = false; }, 1000);
    });

    sock.on('seek_video', (data) => {
      if (!videoRef.current || isSyncingRef.current) return;
      videoRef.current.currentTime = data.time;
    });

    sock.on('change_episode', (data) => {
      const ep = episodes.find(e => String(e.episode) === String(data.episode));
      if (ep) setSelectedEpisode(ep);
    });

    return () => sock.close();
  }, [roomId, isSolo, episodes]);

  const emitSync = (event, extra = {}) => {
    if (socket && !isSolo && !isSyncingRef.current)
      socket.emit(event, { roomId, time: videoRef.current?.currentTime || 0, ...extra });
  };

  const handleEpisodeChange = (ep) => {
    setSelectedEpisode(ep);
    emitSync('change_episode', { episode: ep.episode });
  };

  const copyLink = () => { navigator.clipboard.writeText(window.location.href); alert('Ссылка скопирована!'); };

  const title = shikimoriAnime?.russian || shikimoriAnime?.name || 'Загрузка...';

  return (
    <div className="watch-lobby animate-fade-in">

      {/* ── Top Bar ── */}
      <div className="lobby-topbar panel">
        <div className="lobby-info flex-center">
          {isSolo
            ? <PlaySquare size={20} style={{ color: 'var(--accent-primary)' }} />
            : <Users size={20} style={{ color: 'var(--accent-primary)' }} />
          }
          <span className="lobby-title">
            {isSolo ? 'Соло-просмотр' : `Комната: ${roomId}`}: {title}
          </span>
          {!isSolo && <span className="user-count">Смотрят: {users}</span>}
        </div>
        {!isSolo && (
          <button className="btn btn-secondary btn-sm" onClick={copyLink}>
            <Copy size={14} /> Скопировать ссылку
          </button>
        )}
      </div>

      {/* ── Source Tabs ── */}
      <div className="source-tabs panel">
        <div className="tabs-header flex-center" style={{ gap: 0 }}>
          <Layers size={16} style={{ color: 'var(--text-secondary)', marginRight: '12px', flexShrink: 0 }} />
          {SOURCES.map(src => (
            <button
              key={src.id}
              className={`source-tab ${activeSource.id === src.id ? 'active' : ''}`}
              onClick={() => { setActiveSource(src); setLoading(src.type === 'hls'); setError(''); }}
            >
              {src.label}
              {src.note && <span className="tab-badge">{src.note}</span>}
            </button>
          ))}
        </div>
        <div className="tab-dub-info">
          Озвучка: <strong>{activeSource.dub}</strong>
        </div>
      </div>

      {/* ── Main Layout ── */}
      <div className="watch-layout">
        <div className="player-column">
          <div className="video-section panel">
            {/* AniLibria: custom player */}
            {activeSource.type === 'hls' && (
              <>
                {loading && (
                  <div className="player-placeholder flex-center">
                    <Loader size={32} className="spin-icon" />
                    <span>Поиск в AniLibria...</span>
                  </div>
                )}
                {error && !loading && (
                  <div className="player-placeholder flex-center" style={{ gap: '12px', padding: '24px' }}>
                    <AlertCircle size={32} style={{ color: '#f87171', flexShrink: 0 }} />
                    <span style={{ color: '#f87171', textAlign: 'center' }}>{error}</span>
                  </div>
                )}
                {!loading && !error && videoSrc && (
                  <video
                    ref={videoRef}
                    className="sync-player"
                    src={videoSrc}
                    controls
                    onPlay={() => emitSync('play_video')}
                    onPause={() => emitSync('pause_video')}
                    onSeeked={() => emitSync('seek_video')}
                  />
                )}
              </>
            )}

            {/* Iframe sources */}
            {activeSource.type === 'iframe' && (
              <iframe
                key={activeSource.id}
                src={iframeUrls[activeSource.id] || ''}
                width="100%"
                height="100%"
                frameBorder="0"
                allowFullScreen
                allow="autoplay; fullscreen"
                sandbox="allow-scripts allow-same-origin allow-presentation allow-forms"
                title={activeSource.label}
                style={{ display: 'block', background: '#000' }}
              />
            )}
          </div>

          {/* Controls (only for AniLibria) */}
          {activeSource.type === 'hls' && !loading && !error && (
            <div className="player-controls panel">
              {libriaTitles.length > 1 && (
                <div className="control-row">
                  <span className="selector-label">Результат поиска:</span>
                  <select className="premium-select"
                    value={selectedTitle?.id}
                    onChange={e => setSelectedTitle(libriaTitles.find(t => String(t.id) === e.target.value))}>
                    {libriaTitles.map(t => (
                      <option key={t.id} value={t.id}>{t.names?.ru || t.names?.en}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="controls-row-flex">
                <div className="control-row">
                  <span className="selector-label">Качество:</span>
                  <select className="premium-select" value={quality} onChange={e => setQuality(e.target.value)}>
                    {selectedEpisode?.hls?.fhd && <option value="fhd">1080p (FHD)</option>}
                    {selectedEpisode?.hls?.hd  && <option value="hd">720p (HD)</option>}
                    {selectedEpisode?.hls?.sd  && <option value="sd">480p (SD)</option>}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Episode sidebar — only for AniLibria */}
        {activeSource.type === 'hls' && !loading && !error && episodes.length > 0 && (
          <div className="episode-sidebar panel">
            <h3 className="sidebar-title">Серии ({episodes.length})</h3>
            <div className="episode-list">
              {episodes.map(ep => (
                <button
                  key={ep.episode}
                  className={`episode-btn ${selectedEpisode?.episode === ep.episode ? 'active' : ''}`}
                  onClick={() => handleEpisodeChange(ep)}
                >
                  <span className="ep-number">{ep.episode}</span>
                  <span className="ep-name">{ep.name || `Серия ${ep.episode}`}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WatchLobby;
