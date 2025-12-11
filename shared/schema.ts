import { z } from "zod";

export type Room = {
  id: string;
  hostId: string;
  isActive: boolean;
  createdAt: Date;
};

export type Participant = {
  id: number;
  roomId: string;
  clientId: string;
  joinedAt: Date;
};

export const roomSchema = z.object({
  id: z.string(),
  hostId: z.string(),
  listenerCount: z.number().default(0),
  isActive: z.boolean().default(true),
});

export const wsMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_room"),
  }),
  z.object({
    type: z.literal("room_created"),
    roomId: z.string(),
  }),
  z.object({
    type: z.literal("join_room"),
    roomId: z.string(),
  }),
  z.object({
    type: z.literal("room_joined"),
    roomId: z.string(),
    hostConnected: z.boolean(),
  }),
  z.object({
    type: z.literal("audio_data"),
    data: z.string(),
    seq: z.number().optional(),
    timestamp: z.number().optional(),
  }),
  z.object({
    type: z.literal("listener_count"),
    count: z.number(),
  }),
  z.object({
    type: z.literal("host_disconnected"),
  }),
  z.object({
    type: z.literal("host_streaming"),
  }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
  }),
  z.object({
    type: z.literal("leave_room"),
  }),
]);

export type WsMessage = z.infer<typeof wsMessageSchema>;
