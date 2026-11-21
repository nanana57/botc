import { useState } from 'react';
import type { Game } from '../useGame';
import { VillageScene } from './Village';

export const Home = ({ game }: { game: Game }) => {
  const params = new URLSearchParams(location.search);
  const [tab, setTab] = useState<'create' | 'join'>(params.get('salon') ? 'join' : 'create');
  const [name, setName] = useState(() => { try { return localStorage.getItem('mac.name') || ''; } catch { return ''; } });
  const [mode, setMode] = useState<'auto' | 'human' | 'watch'>('auto');
  const [code, setCode] = useState(params.get('salon') || '');
  const remember = () => { try { localStorage.setItem('mac.name', name); } catch { /* */ } };

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'auto' && !name.trim()) return game.toast('Choisis un nom pour t’asseoir à la table.');
    remember();
    game.send({ t: 'create', name: name.trim() || (mode === 'watch' ? 'Observateur' : 'Le Conteur'), mode });
  };
  const join = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return game.toast('Choisis un nom.');
    if (code.trim().length < 5) return game.toast('Le code du village compte cinq signes.');
    remember();
    game.send({ t: 'join', roomId: code.trim().toUpperCase(), name: name.trim() });
  };

  return (
    <main className="home scene phase-night">
      <VillageScene />
      <div className="home-inner">
        <header className="home-hero">
          <p className="eyebrow">Un jeu de déduction sociale · de 5 à 15 âmes</p>
          <h1 className="title home-title">Minuit au Clocher</h1>
          <p className="display home-tagline">Chaque nuit, quelqu’un ne se réveille pas. Chaque jour, le village doit désigner un coupable — et le Démon vote avec vous.</p>
        </header>

        <section className="home-card panel" aria-label="Entrer au village">
          <div className="home-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'create'} className="home-tab" onClick={() => setTab('create')}>Fonder un village</button>
            <button role="tab" aria-selected={tab === 'join'} className="home-tab" onClick={() => setTab('join')}>Rejoindre</button>
          </div>
          {tab === 'create' ? (
            <form className="panel-body home-form" onSubmit={create}>
              <fieldset className="mode-pick">
                <legend className="sr-only">Qui mène la partie ?</legend>
                <label className={`mode ${mode === 'auto' ? 'on' : ''}`}>
                  <input type="radio" name="mode" checked={mode === 'auto'} onChange={() => setMode('auto')} />
                  <strong className="title">Je joue</strong>
                  <span className="small muted">Le Conteur automatique mène la partie ; tu t’assieds parmi les joueurs.</span>
                </label>
                <label className={`mode ${mode === 'human' ? 'on' : ''}`}>
                  <input type="radio" name="mode" checked={mode === 'human'} onChange={() => setMode('human')} />
                  <strong className="title">Je conte</strong>
                  <span className="small muted">Tu tiens le Grimoire : tu vois tout et tu valides les informations.</span>
                </label>
                <label className={`mode ${mode === 'watch' ? 'on' : ''}`}>
                  <input type="radio" name="mode" checked={mode === 'watch'} onChange={() => setMode('watch')} />
                  <strong className="title">J’observe</strong>
                  <span className="small muted">Une partie entière entre joueurs IA, menée par le Conteur automatique.</span>
                </label>
              </fieldset>
              <label className="field">
                <span>{mode === 'auto' ? 'Ton nom au village' : mode === 'human' ? 'Ton nom de Conteur' : 'Ton nom d’observateur'}</span>
                <input className="input" value={name} onChange={e => setName(e.target.value)} maxLength={24} placeholder={mode === 'auto' ? 'Ex. Mathilde' : 'Le Conteur'} autoComplete="nickname" />
              </label>
              <button className="btn btn-primary btn-block" type="submit" disabled={game.conn !== 'open'}>Allumer la première lanterne</button>
            </form>
          ) : (
            <form className="panel-body home-form" onSubmit={join}>
              <label className="field">
                <span>Code du village</span>
                <input className="input input-code" value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={5} placeholder="•••••" autoCapitalize="characters" />
              </label>
              <label className="field">
                <span>Ton nom</span>
                <input className="input" value={name} onChange={e => setName(e.target.value)} maxLength={24} placeholder="Ex. Mathilde" autoComplete="nickname" />
              </label>
              <button className="btn btn-primary btn-block" type="submit" disabled={game.conn !== 'open'}>Frapper à la porte</button>
            </form>
          )}
          <p className="conn tiny muted" aria-live="polite">{game.conn === 'open' ? 'Le village vous attend.' : game.conn === 'connecting' ? 'Connexion au village…' : 'Serveur injoignable — nouvelle tentative…'}</p>
        </section>

        <section className="home-how" aria-label="Le principe">
          <div><span className="title num">I</span><p><strong>La nuit</strong>, chacun reçoit en secret ce que son rôle lui révèle. Le Démon choisit sa victime.</p></div>
          <div><span className="title num">II</span><p><strong>Le jour</strong>, on parle, on bluffe, on accuse. Une nomination, un vote : le billot attend.</p></div>
          <div><span className="title num">III</span><p><strong>Le Bien</strong> gagne en exécutant le Démon. <strong>Le Mal</strong> gagne s’il ne reste que deux vivants.</p></div>
        </section>
        <footer className="home-foot tiny muted">Projet de fan non officiel, compatible avec les règles de <em>Blood on the Clocktower</em> (The Pandemonium Institute). Textes et illustrations originaux.</footer>
      </div>
    </main>
  );
};
