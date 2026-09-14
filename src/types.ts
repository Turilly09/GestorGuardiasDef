export type EducationLevel = 'ESO' | 'Bachillerato' | 'FP Básica' | 'FP Media' | 'FP Superior' | 'Sin clasificar';

export interface Group {
  id?: string;
  name: string;
  level: EducationLevel;
}

export interface UserAvailability {
  dayOfWeek: number; // 1 = Lunes, 5 = Viernes
  period: number; // 1 to 6
}

export interface Teacher {
  id?: string;
  name: string;
  email?: string;
  availability: UserAvailability[];
  active?: boolean;
  shift?: 'mañana' | 'tarde';
}

export interface Guardia {
  id?: string;
  absentTeacherId: string;
  substituteTeacherId: string | null;
  dateStr: string; // YYYY-MM-DD
  period: number;
  group: string;
  level?: EducationLevel;
  subject: string;
  task: string;
  status: 'pending' | 'assigned';
  createdAt: number;
  contactEmail?: string;
}

export interface TurnConfig {
  period: number;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
}

export interface AppConfig {
  turns: TurnConfig[];
  groups?: string[];
  subjects?: string[];
}
