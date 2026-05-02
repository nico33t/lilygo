import { TrackPoint } from '../types';

interface SimulatedTracker {
  id: string;
  name: string;
  isMoving: boolean;
  departureAt: number;
  currentPath: TrackPoint[];
  lastLat: number;
  lastLon: number;
  speed: number;
}

class TripSimulationEngine {
  private trackers: Map<string, SimulatedTracker> = new Map();
  private interval: ReturnType<typeof setInterval> | null = null;
  private listeners: ((trackers: SimulatedTracker[]) => void)[] = [];

  constructor() {
    this.initMockTrackers();
  }

  private initMockTrackers() {
    const startLat = 41.8902; // Roma
    const startLon = 12.4922;
    
    for (let i = 1; i <= 5; i++) {
      const id = `sim_v_${i}`;
      this.trackers.set(id, {
        id,
        name: `Veicolo ${i}`,
        isMoving: false,
        departureAt: 0,
        currentPath: [],
        lastLat: startLat + (Math.random() - 0.5) * 0.1,
        lastLon: startLon + (Math.random() - 0.5) * 0.1,
        speed: 0,
      });
    }
  }

  public startSimulation() {
    if (this.interval) return;
    this.interval = setInterval(() => this.tick(), 2000);
  }

  public stopSimulation() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private tick() {
    this.trackers.forEach((t) => {
      // 20% chance to start moving if stopped
      if (!t.isMoving && Math.random() > 0.8) {
        t.isMoving = true;
        t.departureAt = Date.now();
        t.currentPath = [{ lat: t.lastLat, lon: t.lastLon, timestamp: t.departureAt, speed: 0 }];
      }

      if (t.isMoving) {
        // Sim movimento
        const angle = Math.random() * Math.PI * 2;
        const dist = 0.0005 + Math.random() * 0.001;
        t.lastLat += Math.sin(angle) * dist;
        t.lastLon += Math.cos(angle) * dist;
        t.speed = Math.floor(Math.random() * 50) + 30;

        const newPoint = {
          lat: t.lastLat,
          lon: t.lastLon,
          timestamp: Date.now(),
          speed: t.speed,
        };

        t.currentPath.push(newPoint);

        // 5% chance to stop
        if (t.currentPath.length > 10 && Math.random() > 0.95) {
          t.isMoving = false;
        }
      }
    });

    this.notify();
  }

  private notify() {
    const list = Array.from(this.trackers.values());
    this.listeners.forEach((l) => l(list));
  }

  public subscribe(l: (trackers: SimulatedTracker[]) => void) {
    this.listeners.push(l);
    l(Array.from(this.trackers.values()));
    return () => {
      this.listeners = this.listeners.filter((li) => li !== l);
    };
  }

  /**
   * Effettua il recupero della "partenza -> ora" in modo efficiente.
   * Simula una chiamata API che recupera i punti del trip corrente.
   */
  public getPointsFromDeparture(trackerId: string): TrackPoint[] {
    const t = this.trackers.get(trackerId);
    if (!t) return [];
    return [...t.currentPath];
  }
}

export const tripSim = new TripSimulationEngine();
