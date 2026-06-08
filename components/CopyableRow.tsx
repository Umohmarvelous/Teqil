// import React, { useState } from 'react';
// import { View, Text, StyleSheet, Pressable, useColorScheme } from 'react-native';
// import { Ionicons } from '@expo/vector-icons';
// import * as Clipboard from 'expo-clipboard';
// import * as Haptics from 'expo-haptics';

// interface CopyableRowProps {
//   label: string;
//   value: string;
//   isCopyable?: boolean;
// }

// export default function CopyableRow({ label, value, isCopyable = true }: CopyableRowProps) {
//   const [copied, setCopied] = useState(false);
//   const colorScheme = useColorScheme();
//   const isDark = colorScheme === 'dark';

//   const theme = {
//     surface: isDark ? '#2C2C2E' : '#F3F4F6',
//     textPrimary: isDark ? '#FFFFFF' : '#111827',
//     textSecondary: isDark ? '#8E8E93' : '#6B7280',
//     iconDefault: isDark ? '#8E8E93' : '#9CA3AF',
//     iconSuccess: '#10B981', // Green checkmark color
//   };

//   const handleCopy = async () => {
//     if (!value) return;
    
//     await Clipboard.setStringAsync(value);
//     Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
//     setCopied(true);
//     setTimeout(() => setCopied(false), 2000); // Reset icon after 2 seconds
//   };

//   return (
//     <View style={styles.row}>
//       <View style={styles.textContainer}>
//         <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
//         <Text style={[styles.value, { color: theme.textPrimary }]} numberOfLines={1}>
//           {value || 'N/A'}
//         </Text>
//       </View>

//       {isCopyable && (
//         <Pressable 
//           onPress={handleCopy} 
//           style={({ pressed }) => [
//             styles.iconBtn, 
//             { backgroundColor: theme.surface, opacity: pressed ? 0.7 : 1 }
//           ]}
//         >
//           <Ionicons 
//             name={copied ? "checkmark" : "copy-outline"} 
//             size={18} 
//             color={copied ? theme.iconSuccess : theme.iconDefault} 
//           />
//         </Pressable>
//       )}
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   row: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     justifyContent: 'space-between',
//     paddingVertical: 12,
//     borderBottomWidth: StyleSheet.hairlineWidth,
//     borderBottomColor: 'rgba(150, 150, 150, 0.2)',
//   },
//   textContainer: {
//     flex: 1,
//     paddingRight: 16,
//   },
//   label: {
//     fontFamily: 'Poppins_400Regular',
//     fontSize: 12,
//     marginBottom: 2,
//   },
//   value: {
//     fontFamily: 'Poppins_600SemiBold',
//     fontSize: 15,
//   },
//   iconBtn: {
//     width: 36,
//     height: 36,
//     borderRadius: 18,
//     alignItems: 'center',
//     justifyContent: 'center',
//   },
// });