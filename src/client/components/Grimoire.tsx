import { useState } from 'react';
import { ROLES, TEAM_LABEL } from '../../shared/roles';
import type { GameState } from '../../shared/types';
import type { Game, StView } from '../useGame';
import { TownSquare, type SeatVM } from './TownSquare';
import { Chat, Chronicle, Modal, PhaseDial, Tabs } from './Parts';
import { Icon, Sigil } from './Sigil';
import { bubbles, useNow } from './Play';

export const Grimoire = ({ game }: { game: Game }) => {
  const v = game.view as StView;
  const s: GameState = v.state;
  const now = useNow(1000);
  const [tab, setTab] = useState<'nuit' | 'jour' | 'journal' | 'place' | 'murmures' | 'ia' | 'pensees'>(s.phase === 'night' ? 'place' : 'place');
  const [focus, setFocus] = useState<string | null>(null);
  const name = (id?: string | null) => s.seats.find(x => x.id === id)?.name ?? '?';
  const poisonerAlive = s.seats.some(x => x.role === 'poisoner' && x.alive);
  const nm = s.dayState.nomination;
  const bub = bubbles(s.chat, now);
  const st = (op: string, extra: Record<string, unknown> = {}) => game.send({ t: 'st', op, ...extra });

  const seats: SeatVM[] = s.seats.map(x => {
    const marks: SeatVM['marks'] = [];
    if (s.status.poisoned === x.id && poisonerAlive) marks.push({ label: 'Empoisonné', tone: 'poison' });
    if (s.status.protected === x.id) marks.push({ label: 'Protégé', tone: 'protect' });
    if (x.role === 'drunk') marks.push({ label: 'Ivre', tone: 'drunk' });
    if (s.status.redHerring === x.id) marks.push({ label: 'Leurre', tone: 'herring' });
    if (s.status.butlerMaster === x.id) marks.push({ label: 'Maître', tone: 'master' });
    if (s.status.killedTonight.includes(x.id)) marks.push({ label: 'Tué cette nuit', tone: 'poison' });
    const vote = nm?.votes.find(z => z.voterId === x.id);
    return {
      id: x.id, name: x.name, alive: x.alive, ghostVote: x.ghostVote, isBot: x.isBot, role: x.role, believed: x.believedRole, marks,
      selected: focus === x.id, nominee: nm?.nomineeId === x.id && nm.stage !== 'closed', nominator: nm?.nominatorId === x.id && nm.stage !== 'closed',
      onBlock: s.dayState.block?.playerId === x.id, hand: !!nm && nm.stage !== 'closed' && !!nm.hands[x.id] && !vote, voted: vote && nm?.stage !== 'closed' ? (vote.yes ? 'yes' : 'no') : undefined,
      speaking: s.night.awaiting?.seatId === x.id, bubble: s.phase === 'day' ? bub[x.id] : undefined,
    };
  });
  const voterIdx = nm && nm.stage === 'voting' ? s.seats.findIndex(x => x.id === nm.order[nm.cursor]) : null;
  const focused = s.seats.find(x => x.id === focus);
  const d = s.pendingDecision;

  return (
    <main className={`grimoire scene phase-${s.phase}`}>
      <header className="topbar">
        <button className="btn btn-ghost btn-sm" onClick={game.leave}><Icon name="door" /> Quitter</button>
        <p className="title topbar-title">{v.observer ? 'Partie automatique — Grimoire' : 'Grimoire du Conteur'} <span className="muted">· village {s.id}</span></p>
        <span className="chip">{s.phase === 'night' ? `Nuit ${s.day}` : s.phase === 'day' ? `Jour ${s.day}` : s.phase === 'ended' ? 'Fin' : 'Lobby'}</span>
      </header>
      <div className="play-grid">
        <section className="play-town">
          <TownSquare seats={seats} onSeat={id => setFocus(f => (f === id ? null : id))} needleIndex={voterIdx}
            center={<PhaseDial phase={s.phase} day={s.day} endsAt={s.dayState.endsAt} block={s.dayState.block?.votes} blockName={s.dayState.block ? name(s.dayState.block.playerId) : undefined} />} />
          <div className="action-dock panel">
            {focused ? (
              <div className="action st-focus">
                <div className={`st-focus-head team-${focused.role ? ROLES[focused.role].team : 'townsfolk'}`}>
                  <Sigil id={focused.role ? ROLES[focused.role].sigil : undefined} size={44} />
                  <div>
                    <p className="title">{focused.name} <span className="team-text">— {focused.role ? ROLES[focused.role].name : '?'}</span></p>
                    <p className="small muted">{focused.role ? `${TEAM_LABEL[ROLES[focused.role].team]} · ${ROLES[focused.role].short}` : ''}{focused.believedRole !== focused.role && focused.believedRole ? ` · croit être ${ROLES[focused.believedRole].name}` : ''}{focused.isBot ? ` · IA (${focused.persona})` : ''}</p>
                  </div>
                </div>
                <div className="row">
                  <button className="btn btn-sm" onClick={() => st('setAlive', { seatId: focused.id, alive: !focused.alive })}>{focused.alive ? 'Retirer (mort)' : 'Ressusciter'}</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => { setTab('murmures'); }}>Lui murmurer…</button>
                </div>
              </div>
            ) : s.phase === 'night' ? (
              <div className="action">
                <p className="display action-prompt">{s.night.awaiting ? <>On attend <strong>{name(s.night.awaiting.seatId)}</strong> ({ROLES[s.night.awaiting.role].name})</> : d ? 'Une décision t’attend.' : 'La nuit se déroule…'}</p>
                {s.night.awaiting && <button className="btn btn-sm" onClick={() => st('skip')}>Choisir à sa place (au hasard)</button>}
              </div>
            ) : s.phase === 'day' ? (
              <div className="action">
                <p className="display action-prompt">{nm && nm.stage !== 'closed' ? <><strong>{name(nm.nominatorId)}</strong> nomme <strong>{name(nm.nomineeId)}</strong></> : 'Débat ouvert sur la place.'}</p>
                <div className="row">
                  {nm?.stage === 'defense' && <button className="btn btn-primary" onClick={() => st('openVote')}><Icon name="hand" size={16} /> Ouvrir le vote</button>}
                  <button className="btn btn-blood" disabled={nm?.stage === 'voting'} onClick={() => st('endDay')}><Icon name="moon" size={16} /> {s.dayState.block ? `Exécuter ${name(s.dayState.block.playerId)} et clore le jour` : 'Clore le jour'}</button>
                </div>
              </div>
            ) : <div className="action"><p className="display action-prompt">{s.winner ? `Victoire du ${s.winner === 'good' ? 'Bien' : 'Mal'} : ${s.winReason}` : ''}</p></div>}
          </div>
        </section>
        <aside className="play-side panel">
          <Tabs value={tab} onChange={setTab} items={[
            { id: 'nuit', label: 'Nuit' }, { id: 'jour', label: 'Votes' }, { id: 'journal', label: 'Journal' },
            { id: 'place', label: 'Place' }, { id: 'murmures', label: 'Murmures' }, { id: 'ia', label: 'IA' }, { id: 'pensees', label: 'Pensées' },
          ]} />
          <div className="side-body">
            {tab === 'nuit' && (
              <div className="scroll pad">
                <p className="eyebrow">Ordre de réveil — nuit {s.day}</p>
                <ol className="night-order">
                  {s.night.queue.map((q, i) => (
                    <li key={i} className={i < s.night.cursor ? 'done' : i === s.night.cursor && s.phase === 'night' ? 'now' : ''}>
                      <Sigil id={ROLES[q.role].sigil} size={22} />
                      <span>{q.special === 'minion-info' ? 'Info des Sbires' : q.special === 'demon-info' ? 'Info du Démon' : ROLES[q.role].name}</span>
                      <span className="muted small">{name(q.seatId)}</span>
                    </li>
                  ))}
                </ol>
                <p className="eyebrow">Choix de la nuit</p>
                <ul className="plain small">{s.night.log.map((l, i) => <li key={i}>{l}</li>)}</ul>
                <p className="eyebrow">Bluffs du Démon</p>
                <p className="small">{s.bluffs.map(b => ROLES[b].name).join(' · ')}</p>
              </div>
            )}
            {tab === 'jour' && (
              <div className="scroll pad">
                <p className="small muted">Ont nommé : {s.dayState.nominators.map(name).join(', ') || 'personne'} · Nommés : {s.dayState.nominees.map(name).join(', ') || 'personne'}</p>
                <ol className="vote-history">
                  {[...s.voteHistory].reverse().map((h, i) => (
                    <li key={i}><span className="title">{h.at}</span> {name(h.nominatorId)} → <strong>{name(h.nomineeId)}</strong> : {h.total}/{h.required} <span className="muted small">({h.votes.filter(x => x.yes).map(x => name(x.voterId) + (x.ghost ? '†' : '') + (x.counted ? '' : '✗')).join(', ') || 'aucune main'})</span></li>
                  ))}
                </ol>
              </div>
            )}
            {tab === 'journal' && <div className="scroll pad grim-log">{[...s.grimoireLog].reverse().map((l, i) => <p key={i} className="small"><span className="title muted">{l.at}</span> {l.text}</p>)}</div>}
            {tab === 'place' && <Chat nameOf={id => name(id)} messages={s.chat.filter(m => m.channel === 'public')} meId="storyteller" onSend={text => game.send({ t: 'chat', text })} placeholder="Annoncer au village…" />}
            {tab === 'murmures' && (
              <div className="whispers">
                <select className="select" value={focus ?? ''} onChange={e => setFocus(e.target.value || null)} aria-label="Joueur">
                  <option value="">Choisir un joueur…</option>
                  {s.seats.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                {focus ? <Chat messages={s.chat.filter(m => m.channel === 'storyteller' && m.seatId === focus)} meId="storyteller" onSend={text => game.send({ t: 'chat', text, channel: 'storyteller', seatId: focus })} placeholder={`Murmurer à ${name(focus)}…`} />
                  : <p className="small muted pad">Les messages privés que tu échanges avec un joueur n’apparaissent que pour lui.</p>}
              </div>
            )}
            {tab === 'pensees' && (
              <div className="scroll pad thoughts">
                <p className="small muted">Raisonnements internes des bots (jamais visibles des joueurs) : intentions de vote, choix nocturnes et suspects du moment.</p>
                {[...(v.trace || [])].reverse().filter(e => ['croyances', 'nuit:choix', 'vote:intention', 'vote:changement', 'nomination', 'info-secrete'].includes(e.kind)).slice(0, 120).map((e, i) => (
                  <p key={i} className={`small thought thought-${e.kind.replace(':', '-')}`}><span className="title muted">{e.at}</span> <strong>{e.actor}</strong> {e.text}{(e.data as { raisonnement?: string } | undefined)?.raisonnement ? <em className="muted"> — {(e.data as { raisonnement: string }).raisonnement}</em> : null}</p>
                ))}
              </div>
            )}
            {tab === 'ia' && (
              <div className="scroll pad">
                <p className="eyebrow">Fournisseur</p>
                <p className="small">{v.ai.gateway ? `${v.ai.gateway.provider} · ${v.ai.gateway.model} · ${v.ai.gateway.calls} appels · ${v.ai.gateway.avgMs} ms en moyenne${v.ai.gateway.paused ? ' · en pause' : ''}` : 'Aucun fournisseur configuré : les bots raisonnent localement et parlent avec des phrases générées sans API.'}</p>
                <p className="small muted">Appels pour cette partie : {v.ai.llmCallsThisGame} / {v.ai.budget}</p>
                <button className="btn btn-sm" onClick={() => st(v.ai.botsPaused ? 'resumeBots' : 'pauseBots')}>{v.ai.botsPaused ? 'Relancer les bots' : 'Mettre les bots en pause'}</button>
                <p className="eyebrow">Activité des bots</p>
                <ul className="ai-log">{v.aiLog.map((l, i) => <li key={i} className="small"><strong>{l.seat}</strong> <span className="muted">[{l.kind}{l.llm ? (l.ok ? ' · LLM' : ' · LLM rejeté') : ''}]</span> {l.text}</li>)}</ul>
              </div>
            )}
          </div>
        </aside>
      </div>
      {d && (
        <Modal title={d.title}>
          <p className="small muted">{name(d.seatId)} — {ROLES[d.role].name}. Seules des options conformes aux règles sont proposées{d.kind === 'info' && (s.seats.find(x => x.id === d.seatId)?.role === 'drunk' || s.status.poisoned === d.seatId) ? ' (joueur ivre ou empoisonné : une info fausse est permise)' : ''}.</p>
          <ul className="options">
            {d.options.map((o, i) => (
              <li key={i}><button className={`btn btn-block option ${i === d.proposal ? 'proposed' : ''}`} onClick={() => st('decide', { decisionId: d.id, option: i })}>{o.label}{i === d.proposal && <span className="tiny muted"> · suggestion</span>}</button></li>
            ))}
          </ul>
        </Modal>
      )}
    </main>
  );
};

export { Chronicle };
