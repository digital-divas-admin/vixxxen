/**
 * Chat Socket.IO Tests
 * Tests for real-time chat functionality
 */

// Mock Supabase before importing chat module
const mockSupabase = {
  from: jest.fn()
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase)
}));

// Set env vars
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

const { initializeChat, createMentorChannel } = require('../../chat');

describe('Chat Module', () => {
  let mockIo;
  let mockSocket;
  let eventHandlers;

  beforeEach(() => {
    jest.clearAllMocks();

    // Capture event handlers registered on socket
    eventHandlers = {};

    mockSocket = {
      id: 'socket-123',
      userId: null,
      userTier: null,
      isAdmin: false,
      currentChannel: null,
      rooms: new Set(['socket-123']), // Default room is socket id
      on: jest.fn((event, handler) => {
        eventHandlers[event] = handler;
      }),
      emit: jest.fn(),
      join: jest.fn((room) => {
        mockSocket.rooms.add(room);
      }),
      leave: jest.fn((room) => {
        mockSocket.rooms.delete(room);
      }),
      to: jest.fn(() => ({ emit: jest.fn() }))
    };

    mockIo = {
      on: jest.fn((event, handler) => {
        if (event === 'connection') {
          handler(mockSocket);
        }
      }),
      to: jest.fn(() => ({ emit: jest.fn() })),
      sockets: {
        adapter: {
          rooms: new Map()
        }
      }
    };
  });

  describe('initializeChat', () => {
    it('should register connection handler', () => {
      initializeChat(mockIo);

      expect(mockIo.on).toHaveBeenCalledWith('connection', expect.any(Function));
    });

    it('should register socket event handlers', () => {
      initializeChat(mockIo);

      expect(mockSocket.on).toHaveBeenCalledWith('authenticate', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('join_channel', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('send_message', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('typing_start', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('typing_stop', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('get_all_members', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('delete_message', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('add_reaction', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('remove_reaction', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    });
  });

  describe('authenticate event', () => {
    beforeEach(() => {
      initializeChat(mockIo);
    });

    it('should require user ID', async () => {
      await eventHandlers.authenticate({});

      expect(mockSocket.emit).toHaveBeenCalledWith('auth_error', {
        message: 'No user ID provided'
      });
    });

    it('should authenticate regular user successfully', async () => {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'memberships') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { tier: 'supernova', is_active: true },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'profiles') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { role: 'user' },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'channels') {
          return {
            select: jest.fn().mockReturnValue({
              or: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({
                  data: [{ id: 'ch-1', name: 'General' }],
                  error: null
                })
              })
            })
          };
        }
        if (table === 'channel_members') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: [],
                error: null
              })
            })
          };
        }
      });

      await eventHandlers.authenticate({
        userId: 'user-123',
        email: 'test@example.com',
        displayName: 'Test User'
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('authenticated', expect.objectContaining({
        success: true,
        tier: 'supernova',
        isAdmin: false
      }));
      expect(mockSocket.userId).toBe('user-123');
      expect(mockSocket.userTier).toBe('supernova');
    });

    it('should authenticate admin user with all channels', async () => {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'memberships') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { tier: 'mentorship', is_active: true },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'profiles') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { role: 'admin' },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'channels') {
          return {
            select: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                order: jest.fn().mockResolvedValue({
                  data: [
                    { id: 'ch-1', name: 'Public', is_private: false },
                    { id: 'ch-2', name: 'Private', is_private: true }
                  ],
                  error: null
                })
              })
            })
          };
        }
      });

      await eventHandlers.authenticate({
        userId: 'admin-123',
        displayName: 'Admin User'
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('authenticated', expect.objectContaining({
        success: true,
        isAdmin: true,
        channels: expect.arrayContaining([
          expect.objectContaining({ name: 'Public' }),
          expect.objectContaining({ name: 'Private' })
        ])
      }));
      expect(mockSocket.isAdmin).toBe(true);
    });

    it('should handle users with no membership', async () => {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'memberships') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: null,
                  error: { code: 'PGRST116' }
                })
              })
            })
          };
        }
        if (table === 'profiles') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { role: 'user' },
                  error: null
                })
              })
            })
          };
        }
      });

      await eventHandlers.authenticate({
        userId: 'nomember-123',
        displayName: 'No Membership'
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('authenticated', expect.objectContaining({
        success: true,
        tier: null,
        channels: []
      }));
    });
  });

  describe('join_channel event', () => {
    beforeEach(() => {
      initializeChat(mockIo);
      // Simulate authenticated user
      mockSocket.userId = 'user-123';
      mockSocket.userTier = 'supernova';
      mockSocket.isAdmin = false;
    });

    it('should require authentication', async () => {
      // Reset modules to get fresh connectedUsers Map
      jest.resetModules();

      // Re-setup mock
      const mockSupabaseFresh = { from: jest.fn() };
      jest.mock('@supabase/supabase-js', () => ({
        createClient: jest.fn(() => mockSupabaseFresh)
      }));

      const { initializeChat: initFresh } = require('../../chat');

      // Create fresh socket that was never authenticated
      const freshEventHandlers = {};
      const freshSocket = {
        id: 'fresh-socket-999',
        userId: null,
        on: jest.fn((event, handler) => {
          freshEventHandlers[event] = handler;
        }),
        emit: jest.fn(),
        join: jest.fn(),
        leave: jest.fn(),
        rooms: new Set(['fresh-socket-999']),
        to: jest.fn(() => ({ emit: jest.fn() }))
      };

      const freshIo = {
        on: jest.fn((event, handler) => {
          if (event === 'connection') handler(freshSocket);
        }),
        to: jest.fn(() => ({ emit: jest.fn() })),
        sockets: { adapter: { rooms: new Map() } }
      };

      initFresh(freshIo);

      // Now join channel without authenticating first
      await freshEventHandlers.join_channel({ channelId: 'ch-123' });

      expect(freshSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Not authenticated'
      });
    });

    it('should deny access to unauthorized channel', async () => {
      // Simulate no access to channel
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'channels') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'ch-private', tier_required: 'mentorship', is_private: false },
                  error: null
                })
              })
            })
          };
        }
      });

      // First authenticate to populate connectedUsers
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'memberships') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { tier: 'supernova', is_active: true },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'profiles') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { role: 'user' },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'channels') {
          return {
            select: jest.fn().mockReturnValue({
              or: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ data: [], error: null })
              }),
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'ch-mentor', tier_required: 'mentorship', is_private: false },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'channel_members') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: [], error: null })
            })
          };
        }
      });

      await eventHandlers.authenticate({
        userId: 'user-123',
        displayName: 'Test User'
      });

      mockSocket.emit.mockClear();

      await eventHandlers.join_channel({ channelId: 'ch-mentor' });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'You do not have access to this channel'
      });
    });
  });

  describe('send_message event', () => {
    beforeEach(() => {
      initializeChat(mockIo);
    });

    it('should require authentication', async () => {
      await eventHandlers.send_message({
        channelId: 'ch-123',
        content: 'Hello world'
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Not authenticated'
      });
    });

    it('should ignore empty messages', async () => {
      // Authenticate first
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'memberships') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { tier: 'supernova', is_active: true },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'profiles') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { role: 'user' },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'channels') {
          return {
            select: jest.fn().mockReturnValue({
              or: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          };
        }
        if (table === 'channel_members') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: [], error: null })
            })
          };
        }
      });

      await eventHandlers.authenticate({
        userId: 'user-123',
        displayName: 'Test'
      });

      mockSocket.emit.mockClear();

      // Send empty message
      await eventHandlers.send_message({
        channelId: 'ch-123',
        content: '   '
      });

      // Should not emit error for empty messages (just ignored)
      expect(mockSocket.emit).not.toHaveBeenCalledWith('error', expect.anything());
    });
  });

  describe('get_all_members event (Admin)', () => {
    beforeEach(() => {
      initializeChat(mockIo);
    });

    it('should require admin access', async () => {
      // Authenticate as non-admin
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'memberships') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { tier: 'supernova', is_active: true },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'profiles') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { role: 'user' }, // Not admin
                  error: null
                })
              })
            })
          };
        }
        if (table === 'channels') {
          return {
            select: jest.fn().mockReturnValue({
              or: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          };
        }
        if (table === 'channel_members') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: [], error: null })
            })
          };
        }
      });

      await eventHandlers.authenticate({
        userId: 'user-123',
        displayName: 'Regular User'
      });

      mockSocket.emit.mockClear();

      await eventHandlers.get_all_members();

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Admin access required'
      });
    });

    it('should return all members for admin', async () => {
      // Authenticate as admin
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'memberships') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { tier: 'mentorship', is_active: true },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'profiles') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { role: 'admin' },
                  error: null
                })
              }),
              order: jest.fn().mockResolvedValue({
                data: [
                  { id: 'u1', display_name: 'User 1', email: 'u1@test.com', role: 'user' },
                  { id: 'u2', display_name: 'User 2', email: 'u2@test.com', role: 'admin' }
                ],
                error: null
              })
            })
          };
        }
        if (table === 'channels') {
          return {
            select: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                order: jest.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          };
        }
      });

      await eventHandlers.authenticate({
        userId: 'admin-123',
        displayName: 'Admin'
      });

      mockSocket.emit.mockClear();

      // Mock for getAllMembers query
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'profiles') {
          return {
            select: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({
                data: [
                  { id: 'u1', display_name: 'User 1', email: 'u1@test.com', role: 'user', created_at: '2024-01-01' }
                ],
                error: null
              })
            })
          };
        }
        if (table === 'memberships') {
          return {
            select: jest.fn().mockResolvedValue({
              data: [{ user_id: 'u1', tier: 'supernova', is_active: true }],
              error: null
            })
          };
        }
      });

      await eventHandlers.get_all_members();

      expect(mockSocket.emit).toHaveBeenCalledWith('all_members', expect.objectContaining({
        members: expect.any(Array)
      }));
    });
  });

  describe('delete_message event (Admin)', () => {
    beforeEach(() => {
      initializeChat(mockIo);
    });

    it('should require admin access', async () => {
      // Authenticate as non-admin
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'memberships') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { tier: 'supernova', is_active: true },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'profiles') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { role: 'user' },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'channels') {
          return {
            select: jest.fn().mockReturnValue({
              or: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          };
        }
        if (table === 'channel_members') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: [], error: null })
            })
          };
        }
      });

      await eventHandlers.authenticate({
        userId: 'user-123',
        displayName: 'User'
      });

      mockSocket.emit.mockClear();

      await eventHandlers.delete_message({
        messageId: 'msg-123',
        channelId: 'ch-123'
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Admin access required'
      });
    });
  });

  describe('add_reaction event', () => {
    beforeEach(() => {
      initializeChat(mockIo);
    });

    it('should require authentication', async () => {
      await eventHandlers.add_reaction({
        messageId: 'msg-123',
        channelId: 'ch-123',
        emoji: '👍'
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Not authenticated'
      });
    });

    it('should validate allowed emojis', async () => {
      // Authenticate first
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'memberships') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { tier: 'supernova', is_active: true },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'profiles') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { role: 'user' },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'channels') {
          return {
            select: jest.fn().mockReturnValue({
              or: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          };
        }
        if (table === 'channel_members') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: [], error: null })
            })
          };
        }
      });

      await eventHandlers.authenticate({
        userId: 'user-123',
        displayName: 'Test'
      });

      mockSocket.emit.mockClear();

      // Try invalid emoji
      await eventHandlers.add_reaction({
        messageId: 'msg-123',
        channelId: 'ch-123',
        emoji: '🚀' // Not in allowed list
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Invalid emoji'
      });
    });
  });

  describe('typing indicators', () => {
    beforeEach(() => {
      initializeChat(mockIo);
    });

    it('should broadcast typing_start to channel', async () => {
      // Authenticate first
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'memberships') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { tier: 'supernova', is_active: true },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'profiles') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { role: 'user' },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'channels') {
          return {
            select: jest.fn().mockReturnValue({
              or: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          };
        }
        if (table === 'channel_members') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: [], error: null })
            })
          };
        }
      });

      await eventHandlers.authenticate({
        userId: 'user-123',
        displayName: 'Typer'
      });

      const mockToEmit = jest.fn();
      mockSocket.to.mockReturnValue({ emit: mockToEmit });

      eventHandlers.typing_start({ channelId: 'ch-123' });

      expect(mockSocket.to).toHaveBeenCalledWith('ch-123');
      expect(mockToEmit).toHaveBeenCalledWith('user_typing', {
        displayName: 'Typer'
      });
    });
  });

  describe('disconnect event', () => {
    beforeEach(() => {
      initializeChat(mockIo);
    });

    it('should notify channel when user disconnects', async () => {
      // Authenticate and join channel
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'memberships') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { tier: 'supernova', is_active: true },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'profiles') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { role: 'user' },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'channels') {
          return {
            select: jest.fn().mockReturnValue({
              or: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          };
        }
        if (table === 'channel_members') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: [], error: null })
            })
          };
        }
      });

      await eventHandlers.authenticate({
        userId: 'user-123',
        displayName: 'Leaving User'
      });

      mockSocket.currentChannel = 'ch-123';

      const mockToEmit = jest.fn();
      mockSocket.to.mockReturnValue({ emit: mockToEmit });

      eventHandlers.disconnect();

      expect(mockSocket.to).toHaveBeenCalledWith('ch-123');
      expect(mockToEmit).toHaveBeenCalledWith('user_left', {
        displayName: 'Leaving User'
      });
    });
  });

  describe('createMentorChannel', () => {
    it('should create private mentor channel', async () => {
      const mockChannel = {
        id: 'mentor-ch-123',
        name: 'mentor-TestStudent',
        description: 'Private mentorship channel',
        tier_required: 'mentorship',
        is_private: true
      };

      mockSupabase.from.mockImplementation((table) => {
        if (table === 'channels') {
          return {
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({ data: mockChannel, error: null })
              })
            })
          };
        }
        if (table === 'channel_members') {
          return {
            insert: jest.fn().mockResolvedValue({ error: null })
          };
        }
      });

      const result = await createMentorChannel('mentor-id', 'student-id', 'TestStudent');

      expect(result).toEqual(mockChannel);
    });

    it('should return null on error', async () => {
      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Insert failed' }
            })
          })
        })
      });

      const result = await createMentorChannel('mentor-id', 'student-id', 'TestStudent');

      expect(result).toBeNull();
    });
  });
});
