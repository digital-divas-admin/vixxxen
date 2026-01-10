const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Store connected users
const connectedUsers = new Map();

function initializeChat(io) {
  io.on('connection', async (socket) => {
    console.log('User connected:', socket.id);

    // Handle authentication
    socket.on('authenticate', async (data) => {
      try {
        const { userId, email, displayName, avatar } = data;

        if (!userId) {
          socket.emit('auth_error', { message: 'No user ID provided' });
          return;
        }

        // Get user's membership tier
        const { data: membership, error } = await supabase
          .from('memberships')
          .select('tier, is_active')
          .eq('user_id', userId)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Error fetching membership:', error);
        }

        const userTier = membership?.is_active ? membership.tier : null;

        // Check if user is admin
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .single();

        const isAdmin = profile?.role === 'admin';

        // Store user info
        connectedUsers.set(socket.id, {
          userId: userId,
          email,
          displayName: displayName || 'New User',
          avatar,
          tier: userTier,
          isAdmin: isAdmin,
          socketId: socket.id
        });

        socket.userId = userId;
        socket.userTier = userTier;
        socket.isAdmin = isAdmin;

        // Get accessible channels based on tier (admins get all)
        const channels = await getAccessibleChannels(userId, userTier, isAdmin);

        socket.emit('authenticated', {
          success: true,
          tier: userTier,
          isAdmin: isAdmin,
          channels
        });

        console.log(`User ${displayName} authenticated with tier: ${userTier || 'none'}, admin: ${isAdmin}`);
      } catch (err) {
        console.error('Authentication error:', err);
        socket.emit('auth_error', { message: 'Authentication failed' });
      }
    });

    // Join a channel
    socket.on('join_channel', async (data) => {
      try {
        const { channelId } = data;
        const user = connectedUsers.get(socket.id);

        if (!user) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        // Admins can access any channel, others need to check access
        const hasAccess = socket.isAdmin || await checkChannelAccess(socket.userId, socket.userTier, channelId);

        if (!hasAccess) {
          socket.emit('error', { message: 'You do not have access to this channel' });
          return;
        }

        // Leave previous channels
        socket.rooms.forEach(room => {
          if (room !== socket.id) {
            socket.leave(room);
          }
        });

        // Join new channel
        socket.join(channelId);
        socket.currentChannel = channelId;

        // Get recent messages
        const messages = await getChannelMessages(channelId, 50);

        // Get online users in this channel
        const onlineUsers = getOnlineUsersInChannel(channelId, io);

        socket.emit('channel_joined', {
          channelId,
          messages,
          onlineUsers
        });

        // Notify others in channel
        socket.to(channelId).emit('user_joined', {
          user: {
            displayName: user.displayName,
            avatar: user.avatar
          }
        });

      } catch (err) {
        console.error('Join channel error:', err);
        socket.emit('error', { message: 'Failed to join channel' });
      }
    });

    // Send a message
    socket.on('send_message', async (data) => {
      try {
        const { channelId, content } = data;
        const user = connectedUsers.get(socket.id);

        if (!user || !socket.userId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        if (!content || content.trim().length === 0) {
          return;
        }

        // Admins can access any channel, others need to check access
        const hasAccess = socket.isAdmin || await checkChannelAccess(socket.userId, socket.userTier, channelId);

        if (!hasAccess) {
          socket.emit('error', { message: 'You do not have access to this channel' });
          return;
        }

        // Save message to database
        const { data: message, error } = await supabase
          .from('messages')
          .insert({
            channel_id: channelId,
            user_id: socket.userId,
            content: content.trim()
          })
          .select()
          .single();

        if (error) {
          console.error('Error saving message:', error);
          socket.emit('error', { message: 'Failed to send message' });
          return;
        }

        // Broadcast message to channel
        const messageData = {
          id: message.id,
          content: message.content,
          createdAt: message.created_at,
          user: {
            id: socket.userId,
            displayName: user.displayName,
            avatar: user.avatar
          }
        };

        io.to(channelId).emit('new_message', messageData);

      } catch (err) {
        console.error('Send message error:', err);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle typing indicator
    socket.on('typing_start', (data) => {
      const user = connectedUsers.get(socket.id);
      if (user && data.channelId) {
        socket.to(data.channelId).emit('user_typing', {
          displayName: user.displayName
        });
      }
    });

    socket.on('typing_stop', (data) => {
      const user = connectedUsers.get(socket.id);
      if (user && data.channelId) {
        socket.to(data.channelId).emit('user_stopped_typing', {
          displayName: user.displayName
        });
      }
    });

    // Get all members (admin only)
    socket.on('get_all_members', async () => {
      if (!socket.isAdmin) {
        socket.emit('error', { message: 'Admin access required' });
        return;
      }

      try {
        const members = await getAllMembers();
        socket.emit('all_members', { members });
      } catch (err) {
        console.error('Error getting members:', err);
        socket.emit('error', { message: 'Failed to get members' });
      }
    });

    // Delete message (admin only)
    socket.on('delete_message', async (data) => {
      if (!socket.isAdmin) {
        socket.emit('error', { message: 'Admin access required' });
        return;
      }

      try {
        const { messageId, channelId } = data;

        // Delete from database
        const { error } = await supabase
          .from('messages')
          .delete()
          .eq('id', messageId);

        if (error) {
          console.error('Error deleting message:', error);
          socket.emit('error', { message: 'Failed to delete message' });
          return;
        }

        // Broadcast to all users in channel
        io.to(channelId).emit('message_deleted', { messageId });
        console.log(`Admin ${socket.userId} deleted message ${messageId}`);
      } catch (err) {
        console.error('Delete message error:', err);
        socket.emit('error', { message: 'Failed to delete message' });
      }
    });

    // Add reaction to message
    socket.on('add_reaction', async (data) => {
      try {
        const { messageId, channelId, emoji } = data;
        const user = connectedUsers.get(socket.id);

        if (!user || !socket.userId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        // Validate emoji is one of our allowed set
        const allowedEmojis = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
        if (!allowedEmojis.includes(emoji)) {
          socket.emit('error', { message: 'Invalid emoji' });
          return;
        }

        // Insert reaction (upsert to handle duplicates gracefully)
        const { error } = await supabase
          .from('message_reactions')
          .upsert({
            message_id: messageId,
            user_id: socket.userId,
            emoji: emoji
          }, {
            onConflict: 'message_id,user_id,emoji'
          });

        if (error) {
          console.error('Error adding reaction:', error);
          socket.emit('error', { message: 'Failed to add reaction' });
          return;
        }

        // Broadcast to channel
        io.to(channelId).emit('reaction_added', {
          messageId,
          emoji,
          userId: socket.userId,
          displayName: user.displayName
        });

      } catch (err) {
        console.error('Add reaction error:', err);
        socket.emit('error', { message: 'Failed to add reaction' });
      }
    });

    // Remove reaction from message
    socket.on('remove_reaction', async (data) => {
      try {
        const { messageId, channelId, emoji } = data;
        const user = connectedUsers.get(socket.id);

        if (!user || !socket.userId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        // Delete the reaction
        const { error } = await supabase
          .from('message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', socket.userId)
          .eq('emoji', emoji);

        if (error) {
          console.error('Error removing reaction:', error);
          socket.emit('error', { message: 'Failed to remove reaction' });
          return;
        }

        // Broadcast to channel
        io.to(channelId).emit('reaction_removed', {
          messageId,
          emoji,
          userId: socket.userId
        });

      } catch (err) {
        console.error('Remove reaction error:', err);
        socket.emit('error', { message: 'Failed to remove reaction' });
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      const user = connectedUsers.get(socket.id);
      if (user && socket.currentChannel) {
        socket.to(socket.currentChannel).emit('user_left', {
          displayName: user.displayName
        });
      }
      connectedUsers.delete(socket.id);
      console.log('User disconnected:', socket.id);
    });
  });
}

// Helper functions
async function getAccessibleChannels(userId, userTier, isAdmin = false) {
  try {
    // Admins get ALL channels (public and private)
    if (isAdmin) {
      const { data: allChannels, error } = await supabase
        .from('channels')
        .select('*')
        .order('is_private', { ascending: true })
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching all channels for admin:', error);
        return [];
      }
      return allChannels || [];
    }

    let query = supabase.from('channels').select('*');

    // Build tier-based access
    if (userTier === 'mentorship') {
      // Mentorship users can access all channels
      query = query.or('tier_required.is.null,tier_required.eq.supernova,tier_required.eq.mentorship');
    } else if (userTier === 'supernova') {
      // Supernova users can only access supernova channels
      query = query.or('tier_required.is.null,tier_required.eq.supernova');
    } else {
      // No membership - no access
      return [];
    }

    const { data: publicChannels, error: publicError } = await query.eq('is_private', false);

    if (publicError) {
      console.error('Error fetching public channels:', publicError);
      return [];
    }

    // Get private channels user is a member of
    const { data: privateChannels, error: privateError } = await supabase
      .from('channel_members')
      .select('channels(*)')
      .eq('user_id', userId);

    if (privateError) {
      console.error('Error fetching private channels:', privateError);
    }

    const allChannels = [
      ...(publicChannels || []),
      ...(privateChannels || []).map(pc => pc.channels).filter(Boolean)
    ];

    return allChannels;
  } catch (err) {
    console.error('Error getting accessible channels:', err);
    return [];
  }
}

async function checkChannelAccess(userId, userTier, channelId) {
  try {
    // Get channel info
    const { data: channel, error } = await supabase
      .from('channels')
      .select('*')
      .eq('id', channelId)
      .single();

    if (error || !channel) {
      return false;
    }

    // Check private channel membership
    if (channel.is_private) {
      const { data: membership, error: memError } = await supabase
        .from('channel_members')
        .select('id')
        .eq('channel_id', channelId)
        .eq('user_id', userId)
        .single();

      return !memError && membership;
    }

    // Check tier access
    if (!channel.tier_required) {
      return true;
    }

    if (channel.tier_required === 'supernova') {
      return userTier === 'supernova' || userTier === 'mentorship';
    }

    if (channel.tier_required === 'mentorship') {
      return userTier === 'mentorship';
    }

    return false;
  } catch (err) {
    console.error('Error checking channel access:', err);
    return false;
  }
}

async function getChannelMessages(channelId, limit = 50) {
  try {
    const { data: messages, error } = await supabase
      .from('messages')
      .select(`
        id,
        content,
        created_at,
        user_id
      `)
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('Error fetching messages:', error);
      return [];
    }

    // Get user info for each message
    const userIds = [...new Set(messages.map(m => m.user_id))];
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', userIds);

    const profileMap = new Map();
    if (profiles) {
      profiles.forEach(p => profileMap.set(p.id, p));
    }

    // Get reactions for all messages
    const messageIds = messages.map(m => m.id);
    const { data: reactions, error: reactionsError } = await supabase
      .from('message_reactions')
      .select('message_id, emoji, user_id')
      .in('message_id', messageIds);

    // Group reactions by message
    const reactionsMap = new Map();
    if (reactions) {
      reactions.forEach(r => {
        if (!reactionsMap.has(r.message_id)) {
          reactionsMap.set(r.message_id, []);
        }
        reactionsMap.get(r.message_id).push({
          emoji: r.emoji,
          userId: r.user_id
        });
      });
    }

    return messages.map(m => {
      const profile = profileMap.get(m.user_id);
      return {
        id: m.id,
        content: m.content,
        createdAt: m.created_at,
        user: {
          id: m.user_id,
          displayName: profile?.display_name || 'New User',
          avatar: profile?.avatar_url
        },
        reactions: reactionsMap.get(m.id) || []
      };
    });
  } catch (err) {
    console.error('Error getting messages:', err);
    return [];
  }
}

function getOnlineUsersInChannel(channelId, io) {
  const users = [];
  const seenUserIds = new Set();

  // Get all sockets in this channel room
  const socketsInRoom = io?.sockets?.adapter?.rooms?.get(channelId);

  if (socketsInRoom) {
    socketsInRoom.forEach(socketId => {
      const user = connectedUsers.get(socketId);
      // Only add each user once (dedupe by userId)
      if (user && !seenUserIds.has(user.userId)) {
        seenUserIds.add(user.userId);
        users.push({
          userId: user.userId,
          displayName: user.displayName,
          avatar: user.avatar
        });
      }
    });
  }

  return users;
}

// Get all members with their membership info (for admin panel)
async function getAllMembers() {
  try {
    // Get all profiles with memberships
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, email, role, created_at')
      .order('created_at', { ascending: false });

    if (profileError) {
      console.error('Error fetching profiles:', profileError);
      return [];
    }

    // Get all memberships
    const { data: memberships, error: memError } = await supabase
      .from('memberships')
      .select('user_id, tier, is_active');

    const membershipMap = new Map();
    if (memberships) {
      memberships.forEach(m => membershipMap.set(m.user_id, m));
    }

    // Get online user IDs
    const onlineUserIds = new Set();
    connectedUsers.forEach((user) => {
      onlineUserIds.add(user.userId);
    });

    // Combine data
    return profiles.map(p => ({
      id: p.id,
      displayName: p.display_name || 'New User',
      email: p.email,
      avatar: p.avatar_url,
      role: p.role || 'user',
      tier: membershipMap.get(p.id)?.tier || null,
      isActive: membershipMap.get(p.id)?.is_active || false,
      isOnline: onlineUserIds.has(p.id),
      joinedAt: p.created_at
    }));
  } catch (err) {
    console.error('Error getting all members:', err);
    return [];
  }
}

// API endpoint to create private mentor channel
async function createMentorChannel(mentorId, studentId, studentName) {
  try {
    const { data: channel, error } = await supabase
      .from('channels')
      .insert({
        name: `mentor-${studentName}`,
        description: `Private mentorship channel`,
        tier_required: 'mentorship',
        is_private: true,
        mentor_id: mentorId
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating mentor channel:', error);
      return null;
    }

    // Add both mentor and student as members
    await supabase
      .from('channel_members')
      .insert([
        { channel_id: channel.id, user_id: mentorId },
        { channel_id: channel.id, user_id: studentId }
      ]);

    return channel;
  } catch (err) {
    console.error('Error creating mentor channel:', err);
    return null;
  }
}

module.exports = { initializeChat, createMentorChannel };
