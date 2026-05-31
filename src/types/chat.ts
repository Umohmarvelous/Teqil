export interface Profile {
  id: string;
  driver_id: string | null;
  full_name: string | null;
}

export interface Chat {
  id: string;
  passenger_id: string;
  driver_id: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  text: string;
  status: 'queued' | 'sent' | 'delivered' | 'read';
  created_at: string;
}