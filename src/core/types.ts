export interface Session {
  userId: string;
  deviceId: string;
  name: string;
  avatar: string | null;
  baseUrl: string;
  accountHash: string;
}

export interface Preview {
  body: string;
  name: string;
  own: boolean;
}

export interface Room {
  roomId: string;
  name: string;
  avatar: string | null;
  topic: string;
  encrypted: boolean;
  lastTs: number;
  preview: Preview | null;
  unread: number;
  highlight: number;
  membership: string;
}

export interface Keys {
  ready: boolean;
}

export interface Discovery {
  baseUrl: string;
  password: boolean;
  registration: boolean;
}
