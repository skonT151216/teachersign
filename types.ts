
export interface Staff {
  id: string;
  name: string;
  department: string;
  affiliation?: string; // 소속 (For Office Mode: School/Org Name)
}

export interface Signature {
  staffId: string;
  staffName: string;
  department: string;
  affiliation?: string; // 소속 (For Office Mode)
  signatureData: string; // Base64 image
  timestamp: number;
}

export type SessionType = 'school' | 'office';

export interface TrainingSession {
  id: string;
  type: SessionType; // 'school' uses staff list, 'office' uses manual input
  title: string;
  date: string;
  time?: string; // Optional: Training time (e.g., "15:00~17:00")
  schoolName: string; // Used as 'Organizing Institution' for office type
  maxParticipants: number;
  authCode?: string; // Optional PIN for attendance verification
  staffList: Staff[];
  signatures: Signature[];
  createdAt: number;
}

export type ViewMode = 'landing' | 'admin' | 'signer' | 'report' | 'cloud_setup';

export interface CloudConfig {
  enabled: boolean;
  scriptUrl: string;
}
