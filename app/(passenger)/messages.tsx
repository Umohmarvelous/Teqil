import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMessagesStore, Conversation } from '@/src/store/useMessagesStore';
import { useAuthStore } from '@/src/store/useStore';
import { useSettingsStore } from '@/src/store/useSettingsStore';
import { Colors } from '@/constants/colors';
import Avatar from '@/components/Avatar';
import ChatScreen from '@/components/ChatScreen'; // We'll create a reusable chat component
import { HugeiconsIcon } from '@hugeicons/react-native';
import { PlusSignIcon, Search02Icon } from '@hugeicons/core-free-icons';
import { supabase } from '@/src/services/supabase';

export default function PassengerMessagesScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { theme } = useSettingsStore();
  const { conversations, loadConversations, startConversation, getUnreadCount, subscribeToMessages } = useMessagesStore();
  const [activeChat, setActiveChat] = useState<Conversation | null>(null);
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  const isDark = theme === 'dark';
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const subTextColor = isDark ? Colors.textSecondary : Colors.textTertiary;
  const cardBg = isDark ? Colors.primaryDarker : '#fff';

  useEffect(() => {
    if (user?.id) {
      loadConversations(user.id, 'passenger');
      const unsubscribe = subscribeToMessages(user.id);
      return unsubscribe;
    }
  }, [user?.id]);

  const unreadTotal = getUnreadCount(user?.id || '', 'passenger');

  const handleSearchDriver = async (driverId: string) => {
    if (!driverId.trim() || !user) return;
    setLoading(true);
    try {
      // Search for driver by driver_id
      const { data: driver, error } = await supabase
        .from('users')
        .select('id, full_name, phone, driver_id, profile_photo')
        .eq('driver_id', driverId.trim().toUpperCase())
        .single();

      if (error || !driver) {
        Alert.alert('Driver not found', 'No driver found with that ID.');
        return;
      }

      const conv = await startConversation(
        driver.id,
        user.id,
        driver,
        { full_name: user.full_name, phone: user.phone }
      );
      if (conv) {
        setActiveChat(conv);
        setSearchModalVisible(false);
      }
    } catch (e) {
      Alert.alert('Error', 'Could not start conversation.');
    } finally {
      setLoading(false);
    }
  };

  if (activeChat) {
    return (
      <ChatScreen
        conversation={activeChat}
        onBack={() => setActiveChat(null)}
        currentUserId={user?.id || ''}
        currentUserRole="passenger"
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? Colors.background : '#F5F5F5' }}>
      <View style={{
        paddingTop: insets.top + 12,
        paddingHorizontal: 20,
        paddingBottom: 12,
        backgroundColor: cardBg,
        borderBottomWidth: 1,
        borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : '#E8ECF0',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <View>
          <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 24, color: textColor }}>Messages</Text>
          {unreadTotal > 0 && (
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: Colors.primary }}>
              {unreadTotal} unread message{unreadTotal > 1 ? 's' : ''}
            </Text>
          )}
        </View>
        <Pressable onPress={() => setSearchModalVisible(true)} style={{ padding: 8 }}>
          <HugeiconsIcon icon={PlusSignIcon} size={24} color={textColor} />
        </Pressable>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            style={{
              flexDirection: 'row',
              padding: 16,
              backgroundColor: cardBg,
              marginBottom: 1,
            }}
            onPress={() => setActiveChat(item)}
          >
            <Avatar name={item.participant_name} size={50} photoUri={item.participant_photo} />
            <View style={{ flex: 1, marginLeft: 12, justifyContent: 'center' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: textColor }}>
                  {item.participant_name}
                </Text>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: subTextColor }}>
                  {item.last_message_at ? new Date(item.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: 'Poppins_400Regular',
                    fontSize: 14,
                    color: item.unread_count_passenger > 0 ? textColor : subTextColor,
                    flex: 1,
                  }}
                >
                  {item.last_message || 'Start a conversation'}
                </Text>
                {item.unread_count_passenger > 0 && (
                  <View style={{
                    backgroundColor: Colors.primary,
                    borderRadius: 12,
                    minWidth: 24,
                    height: 24,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 8,
                  }}>
                    <Text style={{ color: '#fff', fontFamily: 'Poppins_700Bold', fontSize: 12 }}>
                      {item.unread_count_passenger}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: 80 }}>
            <Text style={{ color: subTextColor }}>No messages yet</Text>
            <Pressable
              onPress={() => setSearchModalVisible(true)}
              style={{ marginTop: 16, backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 30 }}
            >
              <Text style={{ color: '#fff', fontFamily: 'Poppins_600SemiBold' }}>Message a Driver</Text>
            </Pressable>
          </View>
        }
      />

      {/* Search Driver Modal */}
      <SearchDriverModal
        visible={searchModalVisible}
        onClose={() => setSearchModalVisible(false)}
        onSearch={handleSearchDriver}
        loading={loading}
        isDark={isDark}
      />
    </View>
  );
}

function SearchDriverModal({ visible, onClose, onSearch, loading, isDark }) {
  const [driverId, setDriverId] = useState('');
  const textColor = isDark ? Colors.textWhite : Colors.text;
  const bgColor = isDark ? Colors.primaryDarker : '#fff';

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: bgColor, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
          <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 20, color: textColor, marginBottom: 16 }}>Message a Driver</Text>
          <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: isDark ? Colors.textSecondary : Colors.textTertiary, marginBottom: 20 }}>
            {`Enter the driver's ID (e.g., DRV-123456)`}
          </Text>
          <TextInput
            style={{
              backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#F4F6FA',
              borderRadius: 16,
              padding: 16,
              fontFamily: 'Poppins_400Regular',
              fontSize: 16,
              color: textColor,
              marginBottom: 20,
            }}
            placeholder="DRV-XXXXXX"
            placeholderTextColor={isDark ? Colors.textSecondary : Colors.textTertiary}
            value={driverId}
            onChangeText={setDriverId}
            autoCapitalize="characters"
            autoFocus
          />
          <Pressable
            onPress={() => onSearch(driverId)}
            disabled={loading || driverId.length < 3}
            style={{
              backgroundColor: Colors.primary,
              opacity: (loading || driverId.length < 3) ? 0.6 : 1,
              borderRadius: 30,
              paddingVertical: 16,
              alignItems: 'center',
            }}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontFamily: 'Poppins_600SemiBold', fontSize: 16 }}>Start Chat</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}