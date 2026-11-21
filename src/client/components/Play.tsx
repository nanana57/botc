import { useEffect, useRef, useState } from 'react';
import { ROLES } from '../../shared/roles';
import type { PlayerView } from '../../shared/types';
import type { Game } from '../useGame';
import { TownSquare, type SeatVM } from './TownSquare';
import { Chat, Chronicle, Notebook, PhaseDial, RoleCard, Tabs } from './Parts';
import { Icon } from './Sigil';

type Mode = 'none' | 'night' | 'nominate' | 'slay';

export const useNow = (ms = 1000) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
};

export const bubbles = (chat: PlayerView['chat'], now: number) => {
  const out: Record<string, string> = {};
  for (const m of chat) if (m.channel === 'public' && now - m.ts < 7000) out[m.fromId] = m.text.length > 90 ? `${m.text.slice(0, 88)}…` : m.text;
  return out;
};

export const Play = ({ game }: { game: Game }) => {
  const v = game.view as PlayerView;
  const now = useNow(1000);
  const me = v.me;
  const [mode, setMode] = useState<Mode>('none');
  const [picked, setPicked] = useState<string[]>([]);
  const [tab, setTab] = useState<'carnet' | 'place' | 'chronique' | 'conteur'>('carnet');
  const nm = v.dayState.nomination;
  const name = (id?: string | null) => v.seats.find(s => s.id === id)?.name ?? '?';
  const publicCount = v.chat.filter(m => m.channel === 'public').length;
  const seen = useRef(publicCount);
  useEffect(() => { if (tab === 'place') seen.current = publicCount; }, [tab, publicCount]);
  const unread = tab === 'place' ? 0 : publicCount - seen.current;

  // Mode nuit : on bascule automatiquement quand le Conteur nous réveille
  useEffect(() => {
    if (me.awaiting) { setMode('night'); setPicked([]); setTab('carnet'); }
    else if (mode === 'night') setMode('none');
  }, [me.awaiting?.role, me.awaiting?.seatId, v.day]);
  useEffect(() => { if (v.phase !== 'day' && (mode === 'nominate' || mode === 'slay')) setMode('none'); }, [v.phase]);
  // Nouvelle info → ouvrir le carnet
  useEffect(() => { if (me.messages.length) setTab(t => (v.phase === 'night' ? 'carnet' : t)); }, [me.messages.length]);

  const need = mode === 'night' ? me.awaiting!.count : mode === 'none' ? 0 : 1;
  const canPick = (id: string) => {
    const s = v.seats.find(x => x.id === id)!;
    if (mode === 'night') { const a = me.awaiting!; return (a.allowSelf || id !== me.seatId) && (!a.aliveOnly || s.alive); }
    if (mode === 'nominate') return me.canBeNominatedIds.includes(id);
    if (mode === 'slay') return id !== me.seatId;
    return false;
  };
  const toggle = (id: string) => {
    if (!canPick(id)) return;
    setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : need === 1 ? [id] : [...p, id].slice(-need)));
  };
  const confirm = () => {
    if (mode === 'night') game.send({ t: 'night', targets: picked });
    if (mode === 'nominate') game.send({ t: 'nominate', nomineeId: picked[0] });
    if (mode === 'slay') game.send({ t: 'slay', targetId: picked[0] });
    setPicked([]); setMode('none');
  };

  const bub = bubbles(v.chat, now);
  const voterIdx = nm && nm.stage === 'voting' ? v.seats.findIndex(s => s.id === nm.order[nm.cursor]) : null;
  const seats: SeatVM[] = v.seats.map(s => {
    const vote = nm?.votes.find(x => x.voterId === s.id);
    return {
      id: s.id, name: s.name, alive: s.alive, ghostVote: s.ghostVote, isBot: s.isBot,
      role: s.id === me.seatId ? me.role : s.revealedRole ?? null,
      me: s.id === me.seatId,
      hand: !!nm && nm.stage !== 'closed' && !!nm.hands[s.id] && !vote,
      voted: vote && nm?.stage !== 'closed' ? (vote.yes ? 'yes' : 'no') : undefined,
      selectable: mode !== 'none' && canPick(s.id),
      selected: picked.includes(s.id),
      nominee: nm?.nomineeId === s.id && nm.stage !== 'closed',
      nominator: nm?.nominatorId === s.id && nm.stage !== 'closed',
      onBlock: v.dayState.block?.playerId === s.id,
      bubble: v.phase === 'day' ? bub[s.id] : undefined,
    };
  });

  const myOrder = nm ? nm.order.indexOf(me.seatId) : -1;
  const myVoteLocked = !!nm && myOrder < nm.cursor && nm.stage === 'voting';
  const handUp = !!nm?.hands[me.seatId];
  const canVote = (me.alive || me.ghostVote) && nm && nm.stage !== 'closed' && nm.nomineeId !== undefined && !myVoteLocked;
  const yesCount = nm ? nm.votes.filter(x => x.counted).length : 0;
  const required = Math.ceil(v.seats.filter(s => s.alive).length / 2);

  const action = (() => {
    if (v.phase === 'ended') {
      return (
        <div className={`banner ${v.winner}`}>
          <p className="title banner-title">{v.winner === 'good' ? 'Le Bien triomphe' : 'Le Mal triomphe'}</p>
          <p className="display">{v.winReason}</p>
          <p className="small muted">{me.alignment === v.winner ? 'Ton camp l’emporte.' : 'Ton camp a perdu.'} Les rôles sont révélés autour de la place.</p>
        </div>
      );
    }
    if (mode !== 'none') {
      const verb = mode === 'night' ? me.awaiting!.prompt : mode === 'nominate' ? 'Qui nommes-tu ?' : 'Sur qui tires-tu ?';
      return (
        <div className="action">
          <p className="display action-prompt">{verb}</p>
          <p className="small muted">{picked.length ? picked.map(name).join(', ') : `Touche ${need > 1 ? `${need} joueurs` : 'un joueur'} sur la place.`}</p>
          <div className="row">
            <button className="btn btn-primary" disabled={picked.length !== need} onClick={confirm}>{mode === 'night' ? 'Confier mon choix au Conteur' : mode === 'nominate' ? 'Nommer' : 'Tirer'}</button>
            {mode !== 'night' && <button className="btn btn-ghost" onClick={() => { setMode('none'); setPicked([]); }}>Annuler</button>}
          </div>
        </div>
      );
    }
    if (v.phase === 'night') return <div className="action"><p className="display action-prompt">Le village dort.</p><p className="small muted">{me.alive ? 'Le Conteur passe de porte en porte. Garde un œil sur ton carnet.' : 'Les morts veillent en silence.'}</p></div>;
    if (nm && nm.stage !== 'closed') {
      return (
        <div className="action">
          <p className="display action-prompt"><strong>{name(nm.nominatorId)}</strong> nomme <strong>{name(nm.nomineeId)}</strong></p>
          <p className="small muted">{nm.stage === 'defense' ? 'Plaidoiries… le vote va s’ouvrir.' : `L’aiguille tourne : ${yesCount} voix, seuil ${required}${v.dayState.block ? `, à battre : ${v.dayState.block.votes}` : ''}.`}</p>
          {canVote && nm.nomineeId && (
            <button className={`btn hand-btn ${handUp ? 'btn-blood' : ''}`} onClick={() => game.send({ t: 'hand', yes: !handUp })} aria-pressed={handUp}>
              <Icon name="hand" size={20} /> {handUp ? 'Main levée — baisser' : me.alive ? 'Lever la main' : 'Lever la main (vote fantôme)'}
            </button>
          )}
          {myVoteLocked && <p className="small">Ton vote est verrouillé.</p>}
        </div>
      );
    }
    return (
      <div className="action">
        <p className="display action-prompt">{v.dayState.executionDone ? 'Le village a rendu sa sentence.' : 'La place est à vous.'}</p>
        <div className="row">
          <button className="btn" disabled={!me.canNominate} onClick={() => { setMode('nominate'); setPicked([]); }}><Icon name="gavel" size={16} /> Nommer</button>
          {me.canSlay && <button className="btn btn-blood" onClick={() => { setMode('slay'); setPicked([]); }}>Pourfendre</button>}
        </div>
        {!me.alive && <p className="small muted">Les morts parlent encore, mais ne nomment plus.{me.ghostVote ? ' Il te reste un vote fantôme.' : ''}</p>}
      </div>
    );
  })();

  const r = me.role ? ROLES[me.role] : null;
  return (
    <main className={`play scene phase-${v.phase}`}>
      <header className="topbar">
        <button className="btn btn-ghost btn-sm" onClick={game.leave}><Icon name="door" /> Quitter</button>
        <p className="title topbar-title">{v.phase === 'night' ? `Nuit ${v.day}` : v.phase === 'day' ? `Jour ${v.day}` : 'Dénouement'} <span className="muted">· village {game.joined?.roomId}</span></p>
        <span className={`chip ${r ? `team-${r.team}` : ''}`}>{r ? <span className="team-text">{r.name}</span> : '—'}{!me.alive && ' · mort'}</span>
      </header>
      <div className="play-grid">
        <section className="play-town">
          <TownSquare
            seats={seats}
            onSeat={mode !== 'none' ? toggle : undefined}
            needleIndex={voterIdx}
            center={<PhaseDial phase={v.phase} day={v.day} endsAt={v.dayState.endsAt} block={v.dayState.block?.votes} blockName={v.dayState.block ? name(v.dayState.block.playerId) : undefined} />}
          />
          <div className="action-dock panel">{action}</div>
        </section>
        <aside className="play-side panel">
          <Tabs value={tab} onChange={setTab} items={[
            { id: 'carnet', label: 'Carnet', badge: me.awaiting ? 1 : 0 },
            { id: 'place', label: 'Place', badge: tab === 'place' ? 0 : Math.max(0, unread) },
            { id: 'chronique', label: 'Chronique' },
            ...(v.settings.storyteller === 'human' ? [{ id: 'conteur' as const, label: 'Conteur' }] : []),
          ]} />
          <div className="side-body">
            {tab === 'carnet' && (
              <div className="scroll carnet">
                <RoleCard role={me.role} alignment={me.alignment} />
                <h3 className="eyebrow carnet-h">Ce que le Conteur t’a confié</h3>
                <Notebook messages={me.messages} />
              </div>
            )}
            {tab === 'place' && <Chat messages={v.chat.filter(m => m.channel === 'public')} meId={me.seatId} onSend={text => game.send({ t: 'chat', text })} disabled={v.phase === 'night' ? 'La nuit, le village se tait.' : false} />}
            {tab === 'chronique' && <Chronicle events={v.publicLog} />}
            {tab === 'conteur' && <Chat messages={v.chat.filter(m => m.channel === 'storyteller')} meId={me.seatId} onSend={text => game.send({ t: 'chat', text, channel: 'storyteller' })} placeholder="Écrire en secret au Conteur…" />}
          </div>
        </aside>
      </div>
    </main>
  );
};
