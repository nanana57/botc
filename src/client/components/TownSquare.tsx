import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ROLES, type RoleId } from '../../shared/roles';
import { Icon, Sigil } from './Sigil';

export interface SeatVM {
  id: string;
  name: string;
  alive: boolean;
  ghostVote: boolean;
  isBot: boolean;
  /** Rôle affiché (Conteur, fin de partie ou soi-même). */
  role?: RoleId | null;
  /** Le joueur croit être… (Ivrogne, Grimoire). */
  believed?: RoleId | null;
  me?: boolean;
  marks?: Array<{ label: string; tone: 'poison' | 'protect' | 'drunk' | 'herring' | 'master' | 'info' }>;
  hand?: boolean;
  voted?: 'yes' | 'no';
  selectable?: boolean;
  selected?: boolean;
  nominee?: boolean;
  nominator?: boolean;
  onBlock?: boolean;
  speaking?: boolean;
  bubble?: string;
}

const initials = (n: string) => n.split(/[\s-]+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();

export const TownSquare = ({ seats, center, onSeat, needleIndex, compact }: {
  seats: SeatVM[]; center?: ReactNode; onSeat?: (id: string) => void; needleIndex?: number | null; compact?: boolean;
}) => {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.min(e.contentRect.width, e.contentRect.height || e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const n = Math.max(seats.length, 1);
  const R = w * 0.4;
  const chord = 2 * R * Math.sin(Math.PI / Math.max(n, 5));
  const seat = Math.round(Math.max(40, Math.min(compact ? 72 : 96, chord * 0.72, w * 0.16)));
  const angle = (i: number) => (i / n) * 2 * Math.PI - Math.PI / 2;
  const needleDeg = needleIndex != null && needleIndex >= 0 ? (needleIndex / n) * 360 : null;

  return (
    <div className="town" ref={box} style={{ ['--seat' as string]: `${seat}px` }}>
      <div className="town-ring" aria-hidden="true" />
      {needleDeg !== null && (
        <div className="needle" style={{ transform: `rotate(${needleDeg}deg)` }} aria-hidden="true"><span /></div>
      )}
      <div className="town-center">{center}</div>
      <ol className="town-seats" aria-label="Place du village (sens horaire)">
        {seats.map((s, i) => {
          const x = 50 + (Math.cos(angle(i)) * R / w) * 100;
          const y = 50 + (Math.sin(angle(i)) * R / w) * 100;
          const r = s.role ? ROLES[s.role] : null;
          const cls = ['seat', s.alive ? 'alive' : 'dead', s.me && 'me', s.selectable && 'selectable', s.selected && 'selected', s.nominee && 'nominee', s.nominator && 'nominator', s.onBlock && 'on-block', s.hand && 'hand-up', s.speaking && 'speaking', r && `team-${r.team}`].filter(Boolean).join(' ');
          const label = `${s.name}${s.me ? ' (toi)' : ''}${r ? `, ${r.name}` : ''}${s.alive ? '' : ', mort'}${s.hand ? ', main levée' : ''}`;
          return (
            <li key={s.id} className="seat-slot" style={{ left: `${x}%`, top: `${y}%` }}>
              <button className={cls} onClick={onSeat ? () => onSeat(s.id) : undefined} disabled={!onSeat} aria-label={label} aria-pressed={s.selected || undefined}>
                <span className="medal">
                  {r ? <Sigil id={r.sigil} size={Math.round(seat * 0.58)} /> : <span className="initials title">{initials(s.name)}</span>}
                  {!s.alive && <span className="shroud" aria-hidden="true" />}
                </span>
                <span className="plate">
                  <span className="plate-name">{s.name}</span>
                  {r && !compact && <span className="plate-role team-text">{r.name}{s.believed && s.believed !== s.role ? ` · croit ${ROLES[s.believed].name}` : ''}</span>}
                </span>
                <span className="badges" aria-hidden="true">
                  {s.isBot && <span className="badge bot" title="Joueur IA"><Icon name="bot" size={12} /></span>}
                  {!s.alive && s.ghostVote && <span className="badge ghost" title="Vote fantôme disponible" />}
                  {s.hand && <span className="badge hand"><Icon name="hand" size={14} /></span>}
                  {s.voted === 'yes' && <span className="badge voted">✓</span>}
                </span>
                {s.marks && s.marks.length > 0 && (
                  <span className="marks" aria-hidden="true">
                    {s.marks.map((m, k) => <span key={k} className={`mark mark-${m.tone}`}>{m.label}</span>)}
                  </span>
                )}
                {s.bubble && <span className="bubble" role="status">{s.bubble}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
