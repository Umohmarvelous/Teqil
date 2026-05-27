        import React, { useEffect, useState } from 'react';
        import { StyleSheet } from 'react-native';
        import { Gesture, GestureDetector } from 'react-native-gesture-handler';
        import Animated, {
          runOnJS,
          useAnimatedStyle,
          useSharedValue,
          withSpring,
          withTiming,
        } from 'react-native-reanimated';

        const DRAWER_WIDTH = 330;

        interface SwipeableSidebarProps {
          children: React.ReactNode;
          isOpen: boolean;
          onClose: () => void;
        }

        export default function SwipeableSidebar({ children, isOpen, onClose }: SwipeableSidebarProps) {
            const [isVisible, setIsVisible] = useState(false);

          const translateX = useSharedValue(isOpen ? DRAWER_WIDTH : 0);
          const backdropOpacity = useSharedValue(isOpen ? 1 : 0);
          const startX = useSharedValue(0);

          // Sync external isOpen state with animation
          useEffect(() => {
            if (isOpen) {
              translateX.value = withSpring(DRAWER_WIDTH, 
              );
            } else {
              translateX.value = withSpring(0, 
              );
            }
          }, [isOpen, translateX, backdropOpacity]);

          const openDrawer = () => {
            setIsVisible(true)
            translateX.value = withSpring(DRAWER_WIDTH, 
            );
            backdropOpacity.value = withTiming(1, { duration: 200 });
          };

          const closeDrawer = () => {
            translateX.value = withSpring(0, 
            );
            backdropOpacity.value = withTiming(0, { duration: 200 });
            runOnJS(setIsVisible)(false);

          };


          const panGesture = Gesture.Pan()
            .onStart(() => {
              startX.value = translateX.value;
            })
            .onUpdate((event) => {
              const newX = startX.value + event.translationX;
              // Clamp between 0 and DRAWER_WIDTH
              translateX.value = Math.min(DRAWER_WIDTH, Math.max(0, newX));
              backdropOpacity.value = translateX.value / DRAWER_WIDTH;
            })
            .onEnd((event) => {
              const velocity = event.velocityX;
              const currentX = translateX.value;

              if (currentX > DRAWER_WIDTH * 0.5 || velocity > 500) {
                runOnJS(openDrawer)();
              } else {
                runOnJS(closeDrawer)();
              }
            });

          const contentStyle = useAnimatedStyle(() => ({
            transform: [{ translateX: translateX.value }],
          }));

          const backdropStyle = useAnimatedStyle(() => ({
            opacity: backdropOpacity.value,
            backgroundColor: 'rgba(0,0,0,0.5)',
          }));

          return (
            <GestureDetector gesture={panGesture}>
              <Animated.View style={styles.container}>


                {/* Main content that slides right */}
                <Animated.View style={[styles.content, contentStyle]}>
                  {children}
                </Animated.View>

                {/* Backdrop that appears when content is shifted (tap to close) */}
                <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]} pointerEvents={isOpen ? 'auto' : 'none'}>

                </Animated.View>
              </Animated.View>
            </GestureDetector>
          );
        }

        const styles = StyleSheet.create({
          container: {
            flex: 1,
          },
          sidebarContainer: {
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: DRAWER_WIDTH,
            zIndex: 0,
          },
          content: {
            flex: 1,
            zIndex: 1,
            backgroundColor: 'white', // must be opaque to hide sidebar when closed
          },
        });