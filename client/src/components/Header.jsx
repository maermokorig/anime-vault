import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Tv } from 'lucide-react';
import './Header.css';

const Header = () => {
  const [query, setQuery] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    if (query.trim()) navigate(`/?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <header className={`site-header ${scrolled ? 'scrolled' : ''}`}>
      <div className="header-inner container flex-between">
        <Link to="/" className="logo flex-center">
          <div className="logo-icon"><Tv size={18} /></div>
          <span className="logo-text">Аниме<span className="logo-accent">Плюс</span></span>
        </Link>

        <nav className="nav-links flex-center">
          <Link to="/" className="nav-link">Главная</Link>
          <Link to="/?filter=top" className="nav-link">Популярное</Link>
          <Link to="/?filter=airing" className="nav-link">Онгоинги</Link>
        </nav>

        <form className="search-form" onSubmit={handleSearch}>
          <Search size={15} className="search-icon" />
          <input
            className="search-input"
            type="text"
            placeholder="Найти аниме..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </form>
      </div>
    </header>
  );
};

export default Header;
