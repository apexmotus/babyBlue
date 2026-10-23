export type Status = "waiting" | "in_consultation" | "done" | "cancelled";
export type Urgency = "routine" | "soon" | "urgent";
export type QType = "choice" | "scale" | "yesno" | "text";

export interface Note {
  id: string;
  text: string;
  by: string;
  date: string;
}

export interface Patient {
  id: string;
  first: string;
  last: string;
  phone: string;
  whatsapp: boolean;
  email?: string;
  idType: string;
  idNumber?: string;
  nationality: string;
  dob?: string; // YYYY-MM-DD
  age?: number;
  medicalAid?: string;
  address?: string;
  nextOfKin?: string;
  summary?: string;
  consent: boolean;
  consentDate?: string;
  visitsBase: number;
  notes: Note[];
}

export interface Visit {
  id: string;
  seq: number;
  patientId: string;
  day: string; // YYYY-MM-DD
  reason: string;
  urgency: Urgency;
  status: Status;
  source: "qr" | "walk-in" | "booked";
  kind: "Walk-in" | "Booked";
  joinedAt: string; // HH:MM
  bookedFor?: string;
  calledAt?: string;
  doneAt?: string;
  cancelledAt?: string;
  cancelledBy?: "reception" | "patient";
  room?: string;
  doctor?: string;
  detail?: string; // e.g. "Blood pressure check · Dr Mokoena"
  intake?: { answers: Record<string, string | number>; at: string };
  note?: string;
  feedback?: { rating: number; comment: string };
}

export interface Booking {
  id: string;
  patientId: string;
  day: string;
  time: string;
  doctor: string;
  reason: string;
}

export interface Question {
  id: string;
  type: QType;
  label: string;
  options?: string[];
  min?: number;
  max?: number;
  lowLabel?: string;
  highLabel?: string;
  required: boolean;
  active: boolean;
  note?: string;
}

export interface DayHours {
  open: string;
  close: string;
  closed: boolean;
}

export interface Block {
  id: string;
  title: string;
  start: string;
  end: string;
  days?: number[]; // 0 = Monday … 6 = Sunday, repeating weekly
  date?: string; // one-off YYYY-MM-DD
  allDay?: boolean;
  doctor?: string;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: "Admin" | "Reception" | "Clinician";
  last: string;
}

export interface Settings {
  name: string;
  slug: string;
  address: string;
  phone: string;
  avgConsult: number;
  medianWait: number;
  showEstimates: boolean;
  doctors: string[];
  hours: DayHours[];
  blocks: Block[];
  staff: StaffMember[];
}

export interface Profile {
  first: string;
  last: string;
  email: string;
  mobile: string;
  hpcsa: string;
  role: "Admin";
  alertWalkIn: boolean;
  dailySummary: boolean;
}

export interface Device {
  first: string;
  last: string;
  phone: string;
  whatsapp: boolean;
  idType: string;
  idNumber: string;
}

export interface DB {
  v: number;
  startedAt: number;
  updatedAt: number;
  nextSeq: number;
  nextId: number;
  patients: Patient[];
  visits: Visit[];
  bookings: Booking[];
  questions: Question[];
  settings: Settings;
  profile: Profile;
  session: { email: string; name: string } | null;
  device: Device | null;
}
