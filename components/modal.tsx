import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, ScrollView, Text, View } from "react-native";

function ActionSheetModal({
  visible,
  onClose,
  trip,
  passengers,
  myPassenger,
  isDriver,
  earningsCoins,
  elapsedSeconds,
  isEnding,
  onEndTrip,
  onLeaveTrip,
  onSOS,
  t,
}: {
  visible: boolean;
  onClose: () => void;
  trip: Trip | null;
  passengers: Passenger[];
  myPassenger: Passenger | null;
  isDriver: boolean;
  earningsCoins: number;
  elapsedSeconds: number;
  isEnding: boolean;
  onEndTrip: () => void;
  onLeaveTrip: () => void;
  onSOS: () => void;
  t: (key: string) => string;
}) {
  const SHEET_HEIGHT = Math.min(SCREEN_HEIGHT * 0.72, 560);

  // Use refs so the PanResponder closure is stable across renders
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          damping: 22,
          stiffness: 180,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SHEET_HEIGHT,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 240,
          useNativeDriver: true,
        }),
      ]).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]); // translateY, backdropOpacity, SHEET_HEIGHT are stable refs/constants

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) {
          translateY.setValue(gs.dy);
          backdropOpacity.setValue(
            Math.max(0, 1 - gs.dy / SHEET_HEIGHT)
          );
        }
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > SHEET_HEIGHT * 0.35 || gs.vy > 0.6) {
          onClose();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            damping: 22,
            stiffness: 180,
            useNativeDriver: true,
          }).start();
          Animated.timing(backdropOpacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current; // stable ref — don't recreate

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: "rgba(0,0,0,0.7)", opacity: backdropOpacity },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          sheetStyles.sheet,
          { height: SHEET_HEIGHT, transform: [{ translateY }] },
        ]}
      >
        {/* Drag handle */}
        <View {...panResponder.panHandlers} style={sheetStyles.handleArea}>
          <View style={sheetStyles.handle} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={sheetStyles.scrollContent}
          bounces={false}
        >
          {/* Trip meta */}
          <View style={sheetStyles.metaRow}>
            <View style={sheetStyles.codeChip}>
              <Ionicons
                name="barcode-outline"
                size={13}
                color="rgba(255,255,255,0.5)"
              />
              <Text style={sheetStyles.codeText}>
                {trip?.trip_code ?? "—"}
              </Text>
            </View>
            <Text style={sheetStyles.durationText}>
              {formatDuration(elapsedSeconds)}
            </Text>
            {isDriver && (
              <View style={sheetStyles.earningsChip}>
                <Ionicons name="star" size={13} color={Colors.gold} />
                <Text style={sheetStyles.earningsChipText}>
                  {formatCoins(earningsCoins)}
                </Text>
              </View>
            )}
          </View>

          {/* Route summary */}
          {trip && (
            <View style={sheetStyles.routeRow}>
              <View style={sheetStyles.routeTrack}>
                <View style={sheetStyles.routeDotGreen} />
                <View style={sheetStyles.routeConnector} />
                <View style={sheetStyles.routeDotRed} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={sheetStyles.routeStop} numberOfLines={1}>
                  {trip.origin}
                </Text>
                <Text style={sheetStyles.routeStop} numberOfLines={1}>
                  {trip.destination}
                </Text>
              </View>
            </View>
          )}

          {/* Passenger chips (driver only) */}
          {isDriver && passengers.length > 0 && (
            <View style={sheetStyles.section}>
              <Text style={sheetStyles.sectionLabel}>
                {t("trip.passengers")}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={sheetStyles.passengerRow}
              >
                {passengers.map((p, i) => (
                  <PassengerChip key={p.id} passenger={p} index={i} />
                ))}
              </ScrollView>
            </View>
          )}

          {isDriver && passengers.length === 0 && (
            <View style={sheetStyles.noPassRow}>
              <Ionicons
                name="person-add-outline"
                size={16}
                color="rgba(255,255,255,0.3)"
              />
              <Text style={sheetStyles.noPassText}>
                {t("trip.noPassengers")}
              </Text>
            </View>
          )}

          {!isDriver && myPassenger?.destination && (
            <View style={sheetStyles.myDestRow}>
              <Ionicons name="location" size={14} color={Colors.primary} />
              <Text style={sheetStyles.myDestText} numberOfLines={1}>
                Your stop: {myPassenger.destination}
              </Text>
            </View>
          )}

          <View style={sheetStyles.aboardRow}>
            <Ionicons
              name="people-outline"
              size={14}
              color="rgba(255,255,255,0.4)"
            />
            <Text style={sheetStyles.aboardText}>
              {passengers.length} {t("trip.passengersOnboard")}
            </Text>
          </View>

          {/* Action buttons */}
          <View style={sheetStyles.actionRow}>
            <Pressable
              style={({ pressed }) => [
                sheetStyles.sosBtn,
                pressed && { opacity: 0.8 },
              ]}
              onPress={onSOS}
            >
              <Ionicons name="warning" size={18} color={Colors.error} />
              <Text style={sheetStyles.sosBtnText}>{t("trip.sos")}</Text>
            </Pressable>

            {isDriver ? (
              <Pressable
                style={({ pressed }) => [
                  sheetStyles.endBtn,
                  isEnding && sheetStyles.endBtnDisabled,
                  pressed && !isEnding && { opacity: 0.88 },
                ]}
                onPress={onEndTrip}
                disabled={isEnding}
              >
                <LinearGradient
                  colors={[Colors.primary, Colors.primaryDark]}
                  style={sheetStyles.endBtnGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons name="flag" size={18} color="#fff" />
                  <Text style={sheetStyles.endBtnText}>
                    {isEnding ? "Ending..." : t("trip.endTrip")}
                  </Text>
                </LinearGradient>
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [
                  sheetStyles.endBtn,
                  isEnding && sheetStyles.endBtnDisabled,
                  pressed && !isEnding && { opacity: 0.88 },
                ]}
                onPress={onLeaveTrip}
                disabled={isEnding}
              >
                <LinearGradient
                  colors={["#3B82F6", "#1D4ED8"]}
                  style={sheetStyles.endBtnGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons name="exit-outline" size={18} color="#fff" />
                  <Text style={sheetStyles.endBtnText}>
                    {isEnding ? "Leaving..." : "Leave Trip"}
                  </Text>
                </LinearGradient>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}
