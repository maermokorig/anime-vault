import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import AnimeDetails from './pages/AnimeDetails';
import WatchLobby from './pages/WatchLobby';
import Header from './components/Header';

function App() {
  return (
    <Router>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/anime/:id" element={<AnimeDetails />} />
          <Route path="/watch/:id/:roomId?" element={<WatchLobby />} />
        </Routes>
      </main>
    </Router>
  );
}

export default App;
