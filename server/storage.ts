import { type Room, type Participant } from "@shared/schema";

export interface IStorage {
  createRoom(hostId: string): Promise<Room>;
  getRoom(roomId: string): Promise<Room | undefined>;
  getRoomByHostId(hostId: string): Promise<Room | undefined>;
  addListener(roomId: string, listenerId: string): Promise<boolean>;
  removeListener(roomId: string, listenerId: string): Promise<boolean>;
  deleteRoom(roomId: string): Promise<boolean>;
  getListenerCount(roomId: string): Promise<number>;
  setRoomActive(roomId: string, isActive: boolean): Promise<void>;
  getRoomByListenerId(listenerId: string): Promise<Room | undefined>;
}

function generateRoomId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export class MemStorage implements IStorage {
  private rooms: Map<string, Room>;
  private participants: Map<string, Participant>;
  private currentId: number;

  constructor() {
    this.rooms = new Map();
    this.participants = new Map();
    this.currentId = 1;
  }

  async createRoom(hostId: string): Promise<Room> {
    let roomId = generateRoomId();
    while (this.rooms.has(roomId)) {
      roomId = generateRoomId();
    }

    const room: Room = {
      id: roomId,
      hostId,
      isActive: false,
      createdAt: new Date(),
    };

    this.rooms.set(roomId, room);
    return room;
  }

  async getRoom(roomId: string): Promise<Room | undefined> {
    return this.rooms.get(roomId);
  }

  async getRoomByHostId(hostId: string): Promise<Room | undefined> {
    return Array.from(this.rooms.values()).find(
      (room) => room.hostId === hostId,
    );
  }

  async addListener(roomId: string, listenerId: string): Promise<boolean> {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const participant: Participant = {
      id: this.currentId++,
      roomId,
      clientId: listenerId,
      joinedAt: new Date(),
    };

    this.participants.set(listenerId, participant);
    return true;
  }

  async removeListener(roomId: string, listenerId: string): Promise<boolean> {
    const participant = this.participants.get(listenerId);
    if (participant && participant.roomId === roomId) {
      this.participants.delete(listenerId);
      return true;
    }
    return false;
  }

  async deleteRoom(roomId: string): Promise<boolean> {
    // Remove all participants in this room
    for (const [clientId, participant] of Array.from(this.participants.entries())) {
      if (participant.roomId === roomId) {
        this.participants.delete(clientId);
      }
    }
    return this.rooms.delete(roomId);
  }

  async getListenerCount(roomId: string): Promise<number> {
    let count = 0;
    for (const participant of Array.from(this.participants.values())) {
      if (participant.roomId === roomId) {
        count++;
      }
    }
    return count;
  }

  async setRoomActive(roomId: string, isActive: boolean): Promise<void> {
    const room = this.rooms.get(roomId);
    if (room) {
      room.isActive = isActive;
      this.rooms.set(roomId, room);
    }
  }

  async getRoomByListenerId(listenerId: string): Promise<Room | undefined> {
    const participant = this.participants.get(listenerId);
    if (participant) {
      return this.rooms.get(participant.roomId);
    }
    return undefined;
  }
}

export const storage = new MemStorage();
