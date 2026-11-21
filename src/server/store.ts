/** Persistance des salons : un fichier JSON par salon (écriture atomique, différée). */
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Room } from './room';
import type { LlmGateway } from '../ai/providers';

export class RoomStore {
  private timers = new Map<string, NodeJS.Timeout>();
  constructor(private dir: string) { mkdirSync(dir, { recursive: true }); }

  save(room: Room, delayMs = 400) {
    clearTimeout(this.timers.get(room.id));
    this.timers.set(room.id, setTimeout(() => this.saveNow(room), delayMs));
  }

  saveNow(room: Room) {
    const file = join(this.dir, `${room.id}.json`);
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(room.serialize()));
    renameSync(tmp, file);
  }

  loadAll(gateway: LlmGateway | null, budget?: number): Room[] {
    if (!existsSync(this.dir)) return [];
    const out: Room[] = [];
    for (const f of readdirSync(this.dir).filter(x => x.endsWith('.json'))) {
      try { out.push(Room.restore(JSON.parse(readFileSync(join(this.dir, f), 'utf8')), gateway, budget)); }
      catch (e) { console.warn(`Salon illisible ignoré : ${f} (${(e as Error).message})`); }
    }
    return out;
  }

  /** Supprime les salons terminés ou abandonnés depuis plus de `maxAgeMs` (jamais appelé sans validation explicite). */
  remove(id: string) { rmSync(join(this.dir, `${id}.json`), { force: true }); }
}
