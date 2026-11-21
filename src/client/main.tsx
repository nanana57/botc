import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/theme.css';
import './styles/app.css';
import { useGame } from './useGame';
import { Home } from './components/Home';
import { Lobby } from './components/Lobby';
import { Play } from './components/Play';
import { Grimoire } from './components/Grimoire';

const App = () => {
  const game = useGame();
  const v = game.view;
  let screen;
  if (!game.joined || !v) screen = <Home game={game} />;
  else if (v.role === 'storyteller') screen = v.state.phase === 'lobby' ? <Lobby game={game} /> : <Grimoire game={game} />;
  else if (v.role === 'player') screen = v.phase === 'lobby' ? <Lobby game={game} /> : <Play game={game} />;
  else screen = <Home game={game} />;
  return (
    <div className="grain app">
      {screen}
      <div className="toasts" aria-live="assertive">
        {game.toasts.map(t => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
