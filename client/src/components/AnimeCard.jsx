import { Link } from 'react-router-dom';
import './AnimeCard.css';

const AnimeCard = ({ anime, index = 0 }) => {
  const rawImg = anime.image?.original;
  const image = rawImg ? (rawImg.startsWith('http') ? rawImg : `https://shikimori.one${rawImg}`) : '';
  const title = anime.russian || anime.name;
  const score = anime.score;
  const year  = anime.aired_on ? anime.aired_on.split('-')[0] : '';
  const id    = anime.id;

  return (
    <Link
      to={`/anime/${id}`}
      className="anime-card"
      style={{ animationDelay: `${Math.min(index * 0.04, 0.6)}s` }}
    >
      <div className="card-poster">
        {image
          ? <img src={image} alt={title} className="card-img" loading="lazy" />
          : <div className="card-img-placeholder" />
        }
        <div className="card-overlay">
          <div className="card-score">★ {score ?? '—'}</div>
          <div className="card-play">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </div>
        {anime.type && <span className="card-type-badge">{anime.type}</span>}
      </div>

      <div className="card-info">
        <h3 className="card-title">{title}</h3>
        <p className="card-year">{year || 'Неизвестно'}{anime.episodes ? ` · ${anime.episodes} эп.` : ''}</p>
      </div>
    </Link>
  );
};

export default AnimeCard;
