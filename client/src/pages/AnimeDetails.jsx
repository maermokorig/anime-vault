import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Play, Users, Star, Film, Calendar } from 'lucide-react';
import './AnimeDetails.css';

const AnimeDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [anime, setAnime] = useState(null);
  const [relations, setRelations] = useState([]);

  useEffect(() => {
    window.scrollTo(0, 0);
    fetch(`/api/animes/${id}`)
      .then(r => {
        if (!r.ok) throw new Error('Proxy failed');
        return r.json();
      })
      .then(animeJson => {
        setAnime(animeJson);
        return fetch(`/api/animes/${id}/franchise`)
          .then(r => r.json())
          .then(relJson => setRelations(relJson?.nodes || []))
          .catch(() => setRelations([]));
      })
      .catch(err => {
        console.warn('Proxy failed, fetching Jikan directly:', err);
        fetch(`https://api.jikan.moe/v4/anime/${id}`)
          .then(r => r.json())
          .then(jData => {
            const a = jData.data;
            if (a) {
              setAnime({
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
              });
            }
          })
          .catch(console.error);
      });
  }, [id]);

  const watchSolo  = () => navigate(`/watch/${id}`);
  const createRoom = () => navigate(`/watch/${id}/${Math.random().toString(36).slice(2, 9)}`);

  if (!anime) return (
    <div className="details-loading flex-center container" style={{ paddingTop: '120px', height: '60vh' }}>
      <div className="details-skeleton-wrap">
        <div className="skeleton details-sk-img" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="skeleton" style={{ height: 40, width: '60%', borderRadius: 8 }} />
          <div className="skeleton" style={{ height: 16, width: '40%', borderRadius: 4 }} />
          <div className="skeleton" style={{ height: 120, width: '100%', borderRadius: 8 }} />
        </div>
      </div>
    </div>
  );

  const title   = anime.russian || anime.name;
  const rawImg  = anime.image?.original;
  const image   = rawImg ? (rawImg.startsWith('http') ? rawImg : `https://shikimori.one${rawImg}`) : '';
  const synopsis = anime.description?.replace(/\[.*?\]/gi, '').trim() || 'Описание отсутствует.';
  const statusMap = { 'released': 'Завершено', 'ongoing': 'Онгоинг', 'anons': 'Анонс' };

  return (
    <div className="details-page animate-fade-in">

      {/* ── Hero backdrop ── */}
      <div
        className="details-backdrop"
        style={{ backgroundImage: `url(${image})` }}
      />
      <div className="details-backdrop-overlay" />

      {/* ── Main ── */}
      <div className="details-main container">
        <div className="details-layout">

          {/* Poster */}
          <div className="details-poster-col">
            <div className="details-poster">
              {image && <img src={image} alt={title} />}
            </div>
            {anime.score && (
              <div className="details-score">
                <Star size={18} fill="#A78BFA" color="#A78BFA" />
                <span>{anime.score}</span>
                <span className="score-sub">/ 10</span>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="details-info">
            <div className="details-tags">
              {anime.genres?.slice(0, 4).map(g => (
                <span key={g.id || g.name} className="detail-genre">{g.russian || g.name}</span>
              ))}
            </div>
            <h1 className="details-title">{title}</h1>
            {anime.name && anime.name !== title && <p className="details-orig-title">{anime.name}</p>}

            <div className="details-meta-row">
              <span className="meta-chip"><Film size={13} /> {statusMap[anime.status] || anime.status}</span>
              {anime.episodes > 0 && <span className="meta-chip"><Film size={13} /> {anime.episodes} эп.</span>}
              {anime.aired_on && <span className="meta-chip"><Calendar size={13} /> {anime.aired_on.split('-')[0]}</span>}
              {anime.studios?.[0] && <span className="meta-chip">{anime.studios[0].name}</span>}
            </div>

            <p className="details-synopsis">{synopsis}</p>

            <div className="details-actions">
              <button className="btn btn-primary" onClick={watchSolo}>
                <Play size={18} fill="white" /> Смотреть
              </button>
              <button className="btn btn-secondary" onClick={createRoom}>
                <Users size={18} /> Создать комнату
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Related / Seasons ── */}
      {relations.length > 0 && (
        <div className="relations-section container">
          <h2 className="section-title-sm">Связанное</h2>
          <div className="relations-grid">
            {relations.map(rel => (
              <Link key={rel.id} to={`/anime/${rel.id || rel.anime_id}`} className="relation-card panel">
                <div className="rel-relation">{rel.relation}</div>
                <div className="rel-name">{rel.name || rel.russian}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AnimeDetails;
