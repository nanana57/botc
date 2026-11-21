import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerView, StorytellerView, PublicSeat, GameState } from '../shared/types';

export interface SpectatorView { role: 'spectator'; gameId: string; version: number; phase: GameState['phase']; day: number; seats: PublicSeat[]; dayState: GameState['dayState']; publicLog: GameState['publicLog']; chat: GameState['chat']; winner: GameState['winner'] }
export interface AiLogEntry { ts: number; seat: string; kind: string; text: string; llm?: boolean; ms?: number; ok?: boolean }
export interface StView extends StorytellerView { aiLog: AiLogEntry[]; ai: { gateway: null | { provider: string; model: string; configured: boolean; paused: boolean; calls: number; errors: number; avgMs: number; lastError: string }; llmCallsThisGame: number; budget: number; botsPaused: boolean } }
export type View = PlayerView | StView | SpectatorView;

export interface Joined { roomId: string; token: string; seatId: string | null; storyteller: boolean; host: boolean }
export type Conn = 'connecting' | 'open' | 'closed';

const KEY = 'mac.session';
const loadSession = (): { roomId: string; token: string } | null => {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
};
const saveSession = (s: { roomId: string; token: string } | null) => {
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* stockage indisponible */ }
};

export const useGame = () => {
  const [conn, setConn] = useState<Conn>('connecting');
  const [joined, setJoined] = useState<Joined | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [toasts, setToasts] = useState<Array<{ id: number; text: string; kind: 'error' | 'info' }>>([]);
  const ws = useRef<WebSocket | null>(null);
  const retry = useRef(0);
  const joinedRef = useRef<Joined | null>(null);

  const toast = useCallback((text: string, kind: 'error' | 'info' = 'error') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4200);
  }, []);

  const connect = useCallback(() => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const sock = new WebSocket(`${proto}://${location.host}/ws`);
    ws.current = sock;
    setConn('connecting');
    sock.onopen = () => {
      setConn('open');
      retry.current = 0;
      const sess = joinedRef.current ?? loadSession();
      if (sess) sock.send(JSON.stringify({ t: 'resume', roomId: sess.roomId, token: sess.token }));
    };
    sock.onmessage = ev => {
      const m = JSON.parse(String(ev.data));
      if (m.t === 'joined') {
        const j: Joined = { roomId: m.roomId, token: m.token, seatId: m.seatId, storyteller: m.storyteller, host: m.host };
        joinedRef.current = j; setJoined(j); saveSession({ roomId: j.roomId, token: j.token });
        const url = new URL(location.href); url.searchParams.set('salon', j.roomId); history.replaceState(null, '', url);
      } else if (m.t === 'view') setView(m.view);
      else if (m.t === 'error') {
        if (/Jeton invalide|n’existe plus/.test(m.msg)) { saveSession(null); joinedRef.current = null; setJoined(null); setView(null); }
        toast(m.msg);
      }
    };
    sock.onclose = () => {
      setConn('closed');
      const delay = Math.min(8000, 500 * 2 ** retry.current++);
      setTimeout(connect, delay);
    };
  }, [toast]);

  useEffect(() => { connect(); return () => { ws.current?.close(); }; }, [connect]);

  const send = useCallback((msg: Record<string, unknown>) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg));
    else toast('Connexion perdue : nouvelle tentative…');
  }, [toast]);

  const leave = useCallback(() => {
    saveSession(null); joinedRef.current = null; setJoined(null); setView(null);
    const url = new URL(location.href); url.searchParams.delete('salon'); history.replaceState(null, '', url);
    ws.current?.close();
  }, []);

  return { conn, joined, view, send, toasts, toast, leave, hasSavedSession: !!loadSession() };
};

export type Game = ReturnType<typeof useGame>;
