import { useEffect, useState } from 'react';
import { DISTRIBUTION, SCRIPTS, MIN_PLAYERS } from '../../shared/roles';
import type { GameState, PlayerView } from '../../shared/types';
import type { Game, StView } from '../useGame';
import { TownSquare } from './TownSquare';
import { Icon } from './Sigil';

interface PersonaDTO { id: string; label: string; summary: string; traits: Record<string, number> }

const TRAIT_LABEL: Record<string, string> = { talk: 'Parole', aggression: 'Agressivité', caution: 'Prudence', trust: 'Confiance', follow: 'Suivisme', analytic: 'Analyse', deception: 'Bluff', risk: 'Risque', charisma: 'Influence', opportunism: 'Opportunisme' };

export const usePersonas = () => {
  const [p, setP] = useState<PersonaDTO[]>([]);
  useEffect(() => { fetch('/api/catalog').then(r => r.json()).then(d => setP(d.personas)).catch(() => {}); }, []);
  return p;
};

export const Lobby = ({ game }: { game: Game }) => {
  const v = game.view as PlayerView | StView;
  const st = v.role === 'storyteller';
  const state: Pick<GameState, 'seats' | 'settings'> = st ? (v as StView).state : { seats: (v as PlayerView).seats.map(s => ({ ...s, role: null, believedRole: null, alignment: null })), settings: (v as PlayerView).settings } as never;
  const seats = state.seats;
  const host = !!game.joined?.host;
  const personas = usePersonas();
  const [persona, setPersona] = useState('');
  const [copied, setCopied] = useState(false);
  const n = seats.length;
  const dist = DISTRIBUTION[Math.min(Math.max(n, 5), 15)];
  const link = `${location.origin}/?salon=${game.joined?.roomId}`;
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { game.toast(link, 'info'); } };
  const selected = personas.find(p => p.id === persona);

  return (
    <main className="lobby scene phase-night">
      <header className="topbar">
        <button className="btn btn-ghost btn-sm" onClick={game.leave}><Icon name="door" /> Quitter</button>
        <p className="title topbar-title">Minuit au Clocher</p>
        <span className="chip" aria-label="Mode de Conteur">{state.settings.storyteller === 'auto' ? 'Conteur automatique' : 'Conteur humain'}</span>
      </header>

      <div className="lobby-grid">
        <section className="lobby-town" aria-label="Les places autour du puits">
          <TownSquare
            compact
            seats={seats.map(s => ({ id: s.id, name: s.name, alive: true, ghostVote: true, isBot: s.isBot, me: s.id === game.joined?.seatId }))}
            center={
              <div className="lobby-center">
                <p className="eyebrow">Code du village</p>
                <p className="title room-code num">{game.joined?.roomId}</p>
                <button className="btn btn-sm" onClick={copy}><Icon name="copy" size={14} /> {copied ? 'Lien copié' : 'Copier l’invitation'}</button>
                <p className="small muted">{n} / 15 · il en faut {MIN_PLAYERS}</p>
              </div>
            }
            onSeat={host ? undefined : undefined}
          />
        </section>

        <aside className="lobby-side">
          <section className="panel">
            <div className="panel-head"><h2 className="title">Le registre</h2><span className="small muted">{n} âme{n > 1 ? 's' : ''}</span></div>
            <ul className="registry scroll">
              {seats.map((s, i) => (
                <li key={s.id} className="registry-row">
                  <span className="num muted">{String(i + 1).padStart(2, '0')}</span>
                  <span className="registry-name">{s.name}{s.id === game.joined?.seatId && <em className="muted"> (toi)</em>}</span>
                  {s.isBot ? (
                    host ? (
                      <select className="select select-sm" value={s.persona} aria-label={`Personnalité de ${s.name}`} onChange={e => game.send({ t: 'setPersona', seatId: s.id, persona: e.target.value })}>
                        {personas.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </select>
                    ) : <span className="chip">{personas.find(p => p.id === s.persona)?.label ?? 'IA'}</span>
                  ) : <span className="chip">humain</span>}
                  {host && (s.isBot || s.id !== game.joined?.seatId) && <button className="btn btn-ghost btn-sm" aria-label={`Retirer ${s.name}`} onClick={() => game.send({ t: 'removeSeat', seatId: s.id })}><Icon name="x" size={14} /></button>}
                </li>
              ))}
            </ul>
          </section>

          {host && (
            <section className="panel">
              <div className="panel-head"><h2 className="title">Joueurs artificiels</h2><span className="small muted">ils ne voient que ce que voit leur personnage</span></div>
              <div className="panel-body bot-add">
                <div className="persona-grid" role="radiogroup" aria-label="Personnalité du prochain bot">
                  <button className="chip" role="radio" aria-checked={persona === ''} aria-pressed={persona === ''} onClick={() => setPersona('')}>Au hasard</button>
                  {personas.map(p => <button key={p.id} className="chip" role="radio" aria-checked={persona === p.id} aria-pressed={persona === p.id} onClick={() => setPersona(p.id)}>{p.label}</button>)}
                </div>
                {selected && (
                  <div className="persona-detail">
                    <p className="small">{selected.summary}</p>
                    <dl className="traits">
                      {Object.entries(selected.traits).filter(([k]) => k in TRAIT_LABEL).map(([k, val]) => (
                        <div key={k} className="trait"><dt className="tiny muted">{TRAIT_LABEL[k]}</dt><dd><span style={{ width: `${Math.round(val * 100)}%` }} /></dd></div>
                      ))}
                    </dl>
                  </div>
                )}
                <div className="row">
                  <button className="btn" onClick={() => game.send({ t: 'addBot', persona: persona || undefined })} disabled={n >= 15}><Icon name="plus" size={14} /> Inviter un bot</button>
                  <button className="btn btn-ghost" onClick={() => { for (let i = n; i < 8; i++) game.send({ t: 'addBot' }); }} disabled={n >= 8}>Compléter à 8</button>
                </div>
              </div>
            </section>
          )}

          <section className="panel">
            <div className="panel-head"><h2 className="title">Le script</h2></div>
            <div className="panel-body script-list">
              {SCRIPTS.map(sc => (
                <label key={sc.id} className={`script ${state.settings.scriptId === sc.id ? 'on' : ''} ${sc.supported ? '' : 'soon'}`}>
                  <input type="radio" name="script" disabled={!host || !sc.supported} checked={state.settings.scriptId === sc.id} onChange={() => game.send({ t: 'settings', patch: { scriptId: sc.id } })} />
                  <span className="title">{sc.name}</span>
                  <span className="small muted">{sc.supported ? sc.tagline : 'Pas encore pris en charge par le moteur.'}</span>
                </label>
              ))}
              {host && (
                <label className="field">
                  <span>Durée du débat chaque jour</span>
                  <select className="select" value={state.settings.dayDuration} onChange={e => game.send({ t: 'settings', patch: { dayDuration: Number(e.target.value) } })}>
                    {[180, 240, 300, 420, 600].map(s => <option key={s} value={s}>{s / 60} minutes</option>)}
                  </select>
                </label>
              )}
              <p className="small muted distribution">Avec {Math.max(n, 5)} joueurs : <span className="team-townsfolk team-text">{dist[0]} Villageois</span>, <span className="team-outsider team-text">{dist[1]} Étranger{dist[1] > 1 ? 's' : ''}</span>, <span className="team-minion team-text">{dist[2]} Sbire{dist[2] > 1 ? 's' : ''}</span>, <span className="team-demon team-text">1 Démon</span>.</p>
            </div>
          </section>

          {host ? (
            <button className="btn btn-primary btn-block start-btn" disabled={n < MIN_PLAYERS} onClick={() => game.send({ t: 'start' })}>
              {n < MIN_PLAYERS ? `Encore ${MIN_PLAYERS - n} joueur${MIN_PLAYERS - n > 1 ? 's' : ''}` : 'Sonner la cloche du soir'}
            </button>
          ) : <p className="waiting display">L’hôte sonnera la cloche quand le village sera réuni…</p>}
        </aside>
      </div>
    </main>
  );
};
