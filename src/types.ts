export interface Task {
  id: string;
  userId: string;
  title: string;
  description: string;
  status: 'pending' | 'completed';
  priority: 'low' | 'medium' | 'high';
  color: string; // Tailwind bg-class name or custom hex
  posX: number;
  posY: number;
  pinned: boolean;
  reminderTime?: string; // ISO String
  createdAt: string;
  updatedAt: string;
  attachedImage?: string;
  attachedAudio?: string;
  attachedAudioName?: string;
  attachedLink?: string;
}

export interface DrawPoint {
  x: number;
  y: number;
}

export interface Stroke {
  points: DrawPoint[];
  color: string;
  width: number;
  style?: 'solid' | 'neon' | 'dashed' | 'dotted';
}

export interface BoardSettings {
  id: string;
  userId: string;
  theme: 'dark' | 'light';
  showGrid: boolean;
  panX: number;
  panY: number;
  zoom: number;
  updatedAt: string;
}

export interface PhysicsNode {
  id: string; // Matches task id
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  mass: number;
  pinned: boolean;
}

export interface RopeConstraint {
  id: string;
  nodeAId: string;
  nodeBId: string;
  restLength: number;
  stiffness: number;
}
