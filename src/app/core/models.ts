export type Role = 'trainer' | 'customer';
export type LngLat = [number, number];

export interface GeoPoint {
  type: 'Point';
  coordinates: LngLat;
}

export interface GeoLine {
  type: 'LineString';
  coordinates: LngLat[];
}

export interface School {
  id: string;
  name: string;
}

export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
}

export interface Membership {
  user_id: string;
  school_id: string;
  role: Role;
  schools?: School;
  profiles?: Profile;
}

export interface Dog {
  id: string;
  owner_id: string;
  name: string;
  breed: string | null;
  birth_date: string | null;
  notes: string | null;
  photo_url: string | null;
}

export type AppointmentStatus = 'planned' | 'cancelled';
export type ParticipantStatus = 'registered' | 'waitlist' | 'cancelled';

export interface Appointment {
  id: string;
  school_id: string;
  poll_id: string | null;
  title: string;
  starts_at: string;
  ends_at: string | null;
  meeting_point: GeoPoint | null;
  meeting_address: string | null;
  max_dogs: number | null;
  registration_deadline: string | null;
  status: AppointmentStatus;
  notes: string | null;
}

export interface AppointmentSummary {
  appointment_id: string;
  registered_dogs: number;
  waitlist_dogs: number;
}

export interface Participant {
  id: string;
  appointment_id: string;
  dog_id: string;
  user_id: string;
  status: ParticipantStatus;
  created_at: string;
  dogs?: Pick<Dog, 'id' | 'name' | 'breed'>;
  profiles?: Pick<Profile, 'id' | 'full_name'>;
}

export type PollStatus = 'open' | 'closed' | 'finalized';

export interface Poll {
  id: string;
  school_id: string;
  title: string;
  description: string | null;
  meeting_point: GeoPoint | null;
  meeting_address: string | null;
  status: PollStatus;
  created_at: string;
  poll_options?: PollOption[];
}

export interface PollOption {
  id: string;
  poll_id: string;
  starts_at: string;
  max_dogs: number | null;
  /** Gesetzt, sobald der Vorschlag als Termin festgelegt wurde. */
  appointment_id: string | null;
}

export interface PollOptionSummary {
  poll_option_id: string;
  poll_id: string;
  dogs: number;
  people: number;
}

/** Ein Hund, mit dem jemand zu einem Vorschlag kommen möchte (Trainer-Ansicht). */
export interface PollChoice {
  poll_option_id: string;
  user_id: string;
  dog_id: string;
  created_at: string;
  dogs?: Pick<Dog, 'id' | 'name'>;
  profiles?: Pick<Profile, 'id' | 'full_name'>;
}

export type WaypointType = 'start' | 'via' | 'hide' | 'article' | 'turn' | 'note';
export type SegmentMode = 'follow' | 'straight' | 'recorded';

export interface TrailPoint {
  id: string;
  lng: number;
  lat: number;
  type: WaypointType;
  note?: string;
}

export interface TrailSegment {
  mode: SegmentMode;
  /** Koordinaten inkl. Anfangs- und Endpunkt; null solange das Routing läuft. */
  coords: LngLat[] | null;
  /** true, wenn das Routing fehlgeschlagen ist und eine Luftlinie verwendet wird. */
  fallback?: boolean;
}

export interface Trail {
  id: string;
  school_id: string;
  created_by: string | null;
  appointment_id: string | null;
  name: string;
  description: string | null;
  difficulty: number | null;
  surface: string | null;
  route: GeoLine | null;
  waypoints: TrailPoint[];
  segments: TrailSegment[];
  length_m: number;
  share_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrailAssignment {
  id: string;
  trail_id: string;
  customer_id: string;
  message: string | null;
  created_at: string;
  seen_at: string | null;
  trails?: Trail;
  profiles?: Pick<Profile, 'id' | 'full_name'>;
}

export interface SharedTrail {
  id: string;
  name: string;
  description: string | null;
  difficulty: number | null;
  surface: string | null;
  route: GeoLine | null;
  waypoints: TrailPoint[];
  length_m: number;
  school_name: string;
}
