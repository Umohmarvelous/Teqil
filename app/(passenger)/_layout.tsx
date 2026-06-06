import { Stack } from 'expo-router';

export default function PassengerLayout() {
  return (
    <Stack>
      {/* 1. Your main dashboard screen (index.tsx)
        This will render normally as the base screen.
      */}
      <Stack.Screen 
        name="index" 
        options={{ headerShown: false }} 
      />
      
      {/* 2. The Find Driver Contact Card Modal
        presentation: 'transparentModal' makes the background see-through
        animation: 'slide_from_bottom' gives it that native sheet feel
      */}
      <Stack.Screen 
        name="find-driver" 
        options={{ 
          presentation: 'transparentModal', 
          animation: 'slide_from_bottom',
          headerShown: false 
        }} 
      />

      {/* 3. The Verify Driver Confirmation Modal 
      */}
      <Stack.Screen 
        name="verify-driver" 
        options={{ 
          presentation: 'transparentModal', 
          animation: 'slide_from_bottom',
          headerShown: false 
        }} 
      />
      
      {/* Note: If you have other screens in the (passenger) folder like 
        'pay-fare.tsx' or 'live-trip.tsx', you can define them here as well!
        Example: <Stack.Screen name="live-trip" options={{ headerShown: false }} />
      */}
    </Stack>
  );
}