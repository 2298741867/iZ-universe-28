export type CloudProvider = 'GCP' | 'AWS' | 'Azure' | 'Edge';

export interface CloudNode {
  id: string;
  name: string;
  provider: CloudProvider;
  region: string;
  lat: number;
  lng: number;
  status: 'healthy' | 'degraded' | 'failing' | 'repelling';
  latencyMs: number;
  throughputGbps: number;
  gravitonFieldStrength: number; // 0 to 100%
  repulsionShieldActive: boolean;
  activeWorkloads: number;
  locationName: string;
}

export interface NetworkConnection {
  fromId: string;
  toId: string;
  latencyMs: number;
  loadPct: number;
  active: boolean;
}

export interface GravitationalAnomaly {
  id: string;
  title: string;
  severity: 'low' | 'moderate' | 'critical';
  affectedRegion: string;
  description: string;
  resolved: boolean;
}
