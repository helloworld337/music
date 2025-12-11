import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";

interface CreateRoomMessage { type: "create_room"; }
interface RoomCreatedMessage { type: "room_created"; roomId: string; }
interface JoinRoomMessage { type: "join_room"; roomId: string; }
interface RoomJoinedMessage { type: "room_joined"; roomId: string; hostConnected: boolean; }
interface AudioDataMessage { type: "audio_data"; data: string; seq?: number; timestamp?: number; }
interface ListenerCountMessage { type: "listener_count"; count: number; }
interface HostDisconnectedMessage { type: "host_disconnected"; }
interface ErrorMessage { type: "error"; message: string; }
interface LeaveRoomMessage { type: "leave_room"; }
interface HostStreamingMessage { type: "host_streaming"; }

type IncomingMessage = CreateRoomMessage | JoinRoomMessage | AudioDataMessage | LeaveRoomMessage;
type OutgoingMessage = RoomCreatedMessage | RoomJoinedMessage | AudioDataMessage |
  ListenerCountMessage | HostDisconnectedMessage | ErrorMessage | HostStreamingMessage;

interface ClientConnection {
  ws: WebSocket;
  clientId: string;
  roomId: string | null;
  isHost: boolean;
  isStreaming: boolean;
  lastAudioTime: number;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  const clients = new Map<string, ClientConnection>();

  function generateClientId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  function sendToClient(clientId: string, message: OutgoingMessage) {
    const client = clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  async function broadcastToListeners(roomId: string, message: OutgoingMessage) {
    // Since we don't have the list of listeners in memory anymore (it's in DB),
    // we technically should query the DB. BUT, for performance of audio streaming,
    // querying DB for every chunk is bad.
    // However, we still have `clients` map.
    // We can iterate over clients and check if they are in the room.
    // OR we can keep a local cache of listeners in memory for broadcasting?
    // Given the constraints, let's iterate over connected clients.
    // This is less efficient than the previous Set, but works with DB storage without caching.

    // Optimization: We can't query DB for every audio packet.
    // Let's iterate over local `clients` map.
    for (const [clientId, client] of Array.from(clients.entries())) {
      if (client.roomId === roomId && !client.isHost) {
        sendToClient(clientId, message);
      }
    }
  }

  async function sendListenerCountToHost(roomId: string) {
    const room = await storage.getRoom(roomId);
    if (room) {
      const count = await storage.getListenerCount(roomId);
      sendToClient(room.hostId, {
        type: "listener_count",
        count,
      });
    }
  }

  wss.on("connection", (ws) => {
    const clientId = generateClientId();
    const connection: ClientConnection = {
      ws,
      clientId,
      roomId: null,
      isHost: false,
      isStreaming: false,
      lastAudioTime: 0,
    };
    clients.set(clientId, connection);

    console.log(`Client connected: ${clientId}`);

    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString()) as IncomingMessage;

        switch (message.type) {
          case "create_room": {
            const room = await storage.createRoom(clientId);
            connection.roomId = room.id;
            connection.isHost = true;
            connection.isStreaming = false;

            sendToClient(clientId, {
              type: "room_created",
              roomId: room.id,
            });

            console.log(`Room created: ${room.id} by ${clientId}`);
            break;
          }

          case "join_room": {
            const roomId = message.roomId?.toUpperCase?.().trim?.();
            if (!roomId) {
              sendToClient(clientId, {
                type: "error",
                message: "Invalid room ID.",
              });
              break;
            }

            const room = await storage.getRoom(roomId);
            if (!room) {
              sendToClient(clientId, {
                type: "error",
                message: "Room not found. Please check the room ID.",
              });
              break;
            }

            if (await storage.addListener(roomId, clientId)) {
              connection.roomId = roomId;
              connection.isHost = false;

              const hostClient = clients.get(room.hostId);
              const hostConnected = hostClient?.isStreaming ?? false;

              sendToClient(clientId, {
                type: "room_joined",
                roomId: roomId,
                hostConnected: hostConnected,
              });

              await sendListenerCountToHost(roomId);
              console.log(`Client ${clientId} joined room ${roomId}`);
            } else {
              sendToClient(clientId, {
                type: "error",
                message: "Failed to join room. Please try again.",
              });
            }
            break;
          }

          case "audio_data": {
            if (!connection.isHost || !connection.roomId) {
              break;
            }

            connection.lastAudioTime = Date.now();

            if (!connection.isStreaming) {
              connection.isStreaming = true;
              await storage.setRoomActive(connection.roomId, true);

              await broadcastToListeners(connection.roomId, {
                type: "host_streaming",
              });
            }

            if (typeof message.data !== "string" || message.data.length === 0) {
              break;
            }

            if (message.data.length > 5242880) {
              console.log(`Audio data too large: ${message.data.length}`);
              break;
            }

            console.log(`Broadcasting audio data: ${message.data.length} bytes, seq: ${message.seq}`);

            await broadcastToListeners(connection.roomId, {
              type: "audio_data",
              data: message.data,
              seq: message.seq,
              timestamp: message.timestamp,
            });
            break;
          }

          case "leave_room": {
            await handleClientLeave(clientId, connection);
            break;
          }
        }
      } catch (error) {
        console.error("Error processing message:", error);
        sendToClient(clientId, {
          type: "error",
          message: "Invalid message format",
        });
      }
    });

    ws.on("close", async () => {
      console.log(`Client disconnected: ${clientId}`);
      await handleClientLeave(clientId, connection);
      clients.delete(clientId);
    });

    ws.on("error", (error) => {
      console.error(`WebSocket error for ${clientId}:`, error);
    });
  });

  async function handleClientLeave(clientId: string, connection: ClientConnection) {
    if (!connection.roomId) return;

    if (connection.isHost) {
      await broadcastToListeners(connection.roomId, {
        type: "host_disconnected",
      });
      await storage.deleteRoom(connection.roomId);
      console.log(`Room ${connection.roomId} deleted (host left)`);
    } else {
      await storage.removeListener(connection.roomId, clientId);
      await sendListenerCountToHost(connection.roomId);
      console.log(`Client ${clientId} left room ${connection.roomId}`);
    }

    connection.roomId = null;
    connection.isHost = false;
    connection.isStreaming = false;
  }

  return httpServer;
}
