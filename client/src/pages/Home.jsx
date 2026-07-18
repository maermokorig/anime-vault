import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import AnimeCard from '../components/AnimeCard';
import './Home.css';

const CATEGORIES = [
  { key: 'popularity', label: 'Популярное', query: 'limit=24&order=popularity' },
  { key: 'ongoing',    label: 'Онгоинги',   query: 'limit=24&status=ongoing&order=popularity' },
  { key: 'movie',      label: 'Фильмы',     query: 'limit=24&kind=movie&order=popularity' },
];

const Home = () => {
  const [animeList, setAnimeList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hero, setHero] = useState(null);
  const [activeCategory, setActiveCategory] = useState('popularity');

  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const searchQuery = searchParams.get('q');
  const filterParam = searchParams.get('filter');

  useEffect(() => {
    if (filterParam && CATEGORIES.find(c => c.key === filterParam)) {
      setActiveCategory(filterParam);
    }
  }, [filterParam]);

  useEffect(() => {
    setLoading(true);
    setAnimeList([]);

    let queryStr;
    if (searchQuery) {
      queryStr = `limit=24&search=${encodeURIComponent(searchQuery)}`;
    } else {
      queryStr = CATEGORIES.find(c => c.key === activeCategory)?.query || CATEGORIES[0].query;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    fetch(`/api/animes?${queryStr}`, { signal: controller.signal })
      .then(r => {
        clearTimeout(timeoutId);
        if (!r.ok) throw new Error('Proxy failed');
        return r.json();
      })
      .then(list => {
        if (!Array.isArray(list)) throw new Error('Not an array');
        setAnimeList(list);
        if (list.length > 0) {
          setHero(list[Math.floor(Math.random() * Math.min(5, list.length))]);
        } else {
          setHero(null);
        }
        setLoading(false);
      })
      .catch(err => {
        console.warn('Proxy failed, trying Jikan API directly from browser:', err);
        const limit = 24;
        const fallbackUrl = searchQuery
          ? `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(searchQuery)}&limit=${limit}`
          : `https://api.jikan.moe/v4/top/anime?limit=${limit}&filter=bypopularity`;
        
        fetch(fallbackUrl)
          .then(r => r.json())
          .then(jData => {
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
            setAnimeList(mapped);
            if (mapped.length > 0) {
              setHero(mapped[Math.floor(Math.random() * Math.min(5, mapped.length))]);
            } else {
              setHero(null);
            }
          })
          .catch(e => console.error('All fetches failed:', e))
          .finally(() => setLoading(false));
      })
      .finally(() => {
        // We only set loading false here if the first fetch succeeded
        // otherwise the catch block's finally handles it
      });
  }, [searchQuery, activeCategory]);

  const heroTitle = hero?.russian || hero?.name;
  const rawImg = hero?.image?.original;
  const heroImg = rawImg ? (rawImg.startsWith('http') ? rawImg : `https://shikimori.one${rawImg}`) : null;
  const heroDesc  = "Присоединяйся к просмотру лучших аниме в нашей уютной базе.";

  return (
    <div className="home-page">

      {/* ── Hero ── */}
      {!searchQuery && hero && (
        <div className="hero" style={{ '--hero-bg': `url(${heroImg})` }}>
          <div className="hero-backdrop" />
          <div className="hero-content container animate-fade-up">
            <span className="hero-tag">Топ Просмотров</span>
            <h1 className="hero-title">{heroTitle}</h1>
            <p className="hero-desc">{heroDesc}</p>
            <div className="hero-meta flex-center">
              {hero.score && <span className="hero-badge">★ {hero.score}</span>}
              {hero.episodes > 0 && <span className="hero-badge">{hero.episodes} эп.</span>}
              {hero.status === 'ongoing' && <span className="hero-badge" style={{ color: '#C026D3', borderColor: '#C026D3' }}>Онгоинг</span>}
            </div>
          </div>
          <div className="hero-gradient-bottom" />
        </div>
      )}

      {/* ── Main content ── */}
      <div className={`home-content container ${(!hero || searchQuery) ? 'no-hero' : ''}`}>

        {/* Category tabs */}
        {!searchQuery && (
          <div className="category-tabs">
            {CATEGORIES.map(cat => (
              <button
                key={cat.key}
                className={`cat-tab ${activeCategory === cat.key ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat.key)}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}

        <div className="section-header flex-between">
          <h2 className="section-title">
            {searchQuery ? `Результаты: «${searchQuery}»` : CATEGORIES.find(c => c.key === activeCategory)?.label}
          </h2>
          {!loading && <span className="result-count">{animeList.length} тайтлов</span>}
        </div>

        {loading ? (
          <div className="skeleton-grid">
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="skeleton-card" style={{ animationDelay: `${i * 0.03}s` }}>
                <div className="skeleton skeleton-img" />
                <div className="skeleton skeleton-title" />
                <div className="skeleton skeleton-sub" />
              </div>
            ))}
          </div>
        ) : animeList.length === 0 ? (
          <div className="empty-state">
            <span>По запросу ничего не найдено</span>
          </div>
        ) : (
          <div className="anime-grid">
            {animeList.map((anime, i) => (
              <AnimeCard key={anime.id} anime={anime} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;
