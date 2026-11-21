import { useEffect, useRef, useState } from 'react';
import { ROLES, TEAM_LABEL, type RoleId } from '../../shared/roles';
import type { ChatMessage, PrivateMessage, PublicEvent } from '../../shared/types';
import { Icon, Sigil } from './Sigil';

/** Carte de rôle : un parchemin glissé sous la porte. */
export const RoleCard = ({ role, alignment }: { role: RoleId | null; alignment?: string | null }) => {
  if (!role) return null;
  const r = ROLES[role];
  return (
    <article className={`role-card parchment team-${r.team}`}>
      <div className="role-sigil"><Sigil id={r.sigil} size={64} /></div>
      <div>
        <p className="eyebrow role-team">{TEAM_LABEL[r.team]}{alignment === 'evil' ? ' · camp du Mal' : alignment === 'good' ? ' · camp du Bien' : ''}</p>
        <h3 className="title role-name">{r.name}</h3>
        <p className="role-ability">{r.ability}</p>
      </div>
    </article>
  );
};

/** Carnet : les informations secrètes reçues, dans l'ordre. */
export const Notebook = ({ messages }: { messages: PrivateMessage[] }) => (
  <ol className="notebook">
    {messages.length === 0 && <li className="muted small">Rien encore. Le Conteur passera cette nuit.</li>}
    {[...messages].reverse().map(m => (
      <li key={m.id} className={`note note-${m.info?.kind ?? 'text'}`}>
        <span className="note-at title">{m.at}</span>
        <span className="note-text">{m.text}</span>
      </li>
    ))}
  </ol>
);

/** Chronique publique du village. */
export const Chronicle = ({ events }: { events: PublicEvent[] }) => {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [events.length]);
  return (
    <div className="chronicle scroll">
      {events.map(e => (
        <p key={e.id} className={`chron chron-${e.kind}`}><span className="chron-at title">{e.at}</span> {e.text}</p>
      ))}
      <div ref={end} />
    </div>
  );
};

export const Chat = ({ messages, meId, onSend, disabled, placeholder, nameColor, nameOf }: {
  messages: ChatMessage[]; meId?: string | null; onSend: (text: string) => void; disabled?: string | false; placeholder?: string; nameColor?: (id: string) => string | undefined; nameOf?: (id: string) => string;
}) => {
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  useEffect(() => {
    const el = list.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length]);
  return (
    <div className="chat">
      <div className="chat-list scroll" ref={list} onScroll={e => { const el = e.currentTarget; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }} aria-live="polite">
        {messages.length === 0 && <p className="muted small chat-empty">Le silence pèse sur la place.</p>}
        {messages.map(m => (
          <p key={m.id} className={`msg ${m.fromId === meId ? 'mine' : ''} ${m.fromId === 'storyteller' ? 'st' : ''} ${m.replyTo ? 'reply' : ''}`}>
            <span className="msg-from" style={{ color: nameColor?.(m.fromId) }}>{m.fromName}{m.bot && <Icon name="bot" size={11} className="msg-bot" />}{m.to && nameOf && <span className="msg-to">→ {m.to === meId ? 'toi' : nameOf(m.to)}</span>}</span>
            <span className="msg-text">{m.text}</span>
          </p>
        ))}
      </div>
      <form className="chat-form" onSubmit={e => { e.preventDefault(); if (text.trim()) { onSend(text.trim()); setText(''); } }}>
        <input className="input" value={text} onChange={e => setText(e.target.value)} maxLength={400} disabled={!!disabled} placeholder={disabled || placeholder || 'Parler au village…'} aria-label="Message" />
        <button className="btn btn-sm" type="submit" disabled={!!disabled || !text.trim()}>Dire</button>
      </form>
    </div>
  );
};

export const PhaseDial = ({ phase, day, endsAt, block, blockName, compact }: { phase: string; day: number; endsAt?: number | null; block?: number | null; blockName?: string; compact?: boolean }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  const left = endsAt ? Math.max(0, Math.round((endsAt - now) / 1000)) : null;
  return (
    <div className={`dial ${phase}`}>
      <Icon name={phase === 'night' ? 'moon' : 'sun'} size={compact ? 22 : 30} className="dial-icon" />
      <p className="title dial-phase">{phase === 'night' ? `Nuit ${day}` : phase === 'day' ? `Jour ${day}` : phase === 'ended' ? 'Dénouement' : 'Rassemblement'}</p>
      {left !== null && phase === 'day' && <p className={`dial-timer num ${left < 60 ? 'late' : ''}`}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</p>}
      {blockName && <p className="dial-block small">Sur le billot : <strong>{blockName}</strong>{block ? ` (${block})` : ''}</p>}
    </div>
  );
};

export const Modal = ({ title, children, onClose }: { title: string; children: React.ReactNode; onClose?: () => void }) => (
  <div className="modal-back" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
    <div className="modal panel" onClick={e => e.stopPropagation()}>
      <div className="panel-head"><h2 className="title">{title}</h2>{onClose && <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Fermer"><Icon name="x" /></button>}</div>
      <div className="panel-body">{children}</div>
    </div>
  </div>
);

export const Tabs = <T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: Array<{ id: T; label: string; badge?: number }> }) => (
  <div className="tabs" role="tablist">
    {items.map(it => (
      <button key={it.id} role="tab" aria-selected={value === it.id} className="tab" onClick={() => onChange(it.id)}>
        {it.label}{it.badge ? <span className="tab-badge num">{it.badge}</span> : null}
      </button>
    ))}
  </div>
);
