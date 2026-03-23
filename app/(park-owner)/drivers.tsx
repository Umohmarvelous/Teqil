import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/src/store/useStore";
import { Colors } from "@/constants/colors";
import { supabase } from "@/src/services/supabase";
import { useTranslation } from "react-i18next";
import type { User } from "@/src/models/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DriverWithStatus extends User {
  is_verified?: boolean;
}

// ─── Driver Card ──────────────────────────────────────────────────────────────

function DriverCard({
  driver,
  onVerify,
  verifying,
}: {
  driver: DriverWithStatus;
  onVerify: (driver: DriverWithStatus) => void;
  verifying: boolean;
}) {
  const { t } = useTranslation();
  const initials = (driver.full_name || "??")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <View style={styles.card}>
      {/* Avatar + Name Row */}
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>

        <View style={styles.driverInfo}>
          <Text style={styles.driverName} numberOfLines={1}>
            {driver.full_name || t("common.unknown", { defaultValue: "Unknown Driver" })}
          </Text>
          <View style={styles.driverIdRow}>
            <Ionicons name="id-card-outline" size={13} color={Colors.gold} />
            <Text style={styles.driverIdText}>
              {driver.driver_id || "—"}
            </Text>
          </View>
        </View>

        {/* Verified badge */}
        <View
          style={[
            styles.statusBadge,
            driver.is_verified ? styles.statusBadgeVerified : styles.statusBadgePending,
          ]}
        >
          <Ionicons
            name={driver.is_verified ? "checkmark-circle" : "time-outline"}
            size={12}
            color={driver.is_verified ? "#16A34A" : Colors.warning}
          />
          <Text
            style={[
              styles.statusText,
              driver.is_verified ? styles.statusTextVerified : styles.statusTextPending,
            ]}
          >
            {driver.is_verified
              ? t("parkOwner.verified", { defaultValue: "Verified" })
              : t("parkOwner.pending", { defaultValue: "Pending" })}
          </Text>
        </View>
      </View>

      {/* Details */}
      <View style={styles.cardBody}>
        {driver.vehicle_details ? (
          <View style={styles.detailRow}>
            <Ionicons name="car-outline" size={15} color={Colors.textSecondary} />
            <Text style={styles.detailText} numberOfLines={1}>
              {driver.vehicle_details}
            </Text>
          </View>
        ) : null}

        {driver.phone ? (
          <View style={styles.detailRow}>
            <Ionicons name="call-outline" size={15} color={Colors.textSecondary} />
            <Text style={styles.detailText}>{driver.phone}</Text>
          </View>
        ) : null}

        {driver.avg_rating !== undefined && driver.avg_rating !== null ? (
          <View style={styles.detailRow}>
            <Ionicons name="star" size={15} color={Colors.gold} />
            <Text style={styles.detailText}>
              {driver.avg_rating.toFixed(1)} rating
            </Text>
          </View>
        ) : null}
      </View>

      {/* Verify Button */}
      {!driver.is_verified && (
        <Pressable
          style={({ pressed }) => [
            styles.verifyBtn,
            pressed && styles.verifyBtnPressed,
            verifying && styles.verifyBtnLoading,
          ]}
          onPress={() => onVerify(driver)}
          disabled={verifying}
        >
          {verifying ? (
            <ActivityIndicator size="small" color={Colors.surface} />
          ) : (
            <>
              <Ionicons name="shield-checkmark-outline" size={16} color={Colors.surface} />
              <Text style={styles.verifyBtnText}>
                {t("parkOwner.verify", { defaultValue: "Verify Driver" })}
              </Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function DriversScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user } = useAuthStore();

  const [drivers, setDrivers] = useState<DriverWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;

  // ── Fetch drivers from Supabase ────────────────────────────────────────────
  const fetchDrivers = useCallback(async () => {
    if (!user?.park_name) {
      setDrivers([]);
      setLoading(false);
      return;
    }

    setError(null);

    try {
      const { data, error: sbError } = await supabase
        .from("users")
        .select("*")
        .eq("role", "driver")
        .eq("park_name", user.park_name);

      if (sbError) {
        // If Supabase is not configured or table doesn't exist yet,
        // fall back gracefully with empty list
        console.warn("[DriversScreen] Supabase fetch failed:", sbError.message);
        setDrivers([]);
        setError(
          "Could not load drivers from server. They will appear once sync is available."
        );
      } else {
        // Map to DriverWithStatus – is_verified comes from user_metadata or a column
        const mapped: DriverWithStatus[] = (data || []).map((row: Record<string, unknown>) => ({
          id: row.id as string,
          full_name: (row.full_name as string) || null,
          phone: (row.phone as string) || "",
          email: (row.email as string) || "",
          age: (row.age as number) || 0,
          role: "driver",
          driver_id: row.driver_id as string | undefined,
          profile_photo: row.profile_photo as string | undefined,
          vehicle_details: row.vehicle_details as string | undefined,
          park_location: row.park_location as string | undefined,
          park_name: row.park_name as string | undefined,
          points_balance: (row.points_balance as number) || 0,
          avg_rating: row.avg_rating as number | undefined,
          profile_complete: (row.profile_complete as boolean) || false,
          created_at: (row.created_at as string) || new Date().toISOString(),
          is_verified: (row.is_verified as boolean) || false,
        }));
        setDrivers(mapped);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Unknown error fetching drivers";
      console.warn("[DriversScreen] fetch error:", msg);
      setDrivers([]);
      setError(
        "Could not load drivers from server. They will appear once sync is available."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.park_name]);

  useEffect(() => {
    fetchDrivers();
  }, [fetchDrivers]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDrivers();
  };

  // ── Verify handler ─────────────────────────────────────────────────────────
  const handleVerify = async (driver: DriverWithStatus) => {
    Alert.alert(
      t("parkOwner.verify", { defaultValue: "Verify Driver" }),
      `Verify ${driver.full_name || "this driver"}?`,
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("parkOwner.verify", { defaultValue: "Verify" }),
          onPress: async () => {
            setVerifyingId(driver.id);
            try {
              // For now, just console.log – real implementation updates DB
              console.log("[DriversScreen] Verifying driver:", {
                id: driver.id,
                driver_id: driver.driver_id,
                full_name: driver.full_name,
              });

              // Optimistically update local state
              setDrivers((prev) =>
                prev.map((d) =>
                  d.id === driver.id ? { ...d, is_verified: true } : d
                )
              );
            } catch (err) {
              console.error("[DriversScreen] Verify error:", err);
              Alert.alert(
                "Error",
                "Could not verify driver right now. Please try again."
              );
            } finally {
              setVerifyingId(null);
            }
          },
        },
      ]
    );
  };

  // ── Stats bar ──────────────────────────────────────────────────────────────
  const verifiedCount = drivers.filter((d) => d.is_verified).length;
  const pendingCount = drivers.length - verifiedCount;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPadding + 16 }]}>
        <Text style={styles.headerTitle}>
          {t("parkOwner.drivers", { defaultValue: "Drivers" })}
        </Text>
        <Text style={styles.headerSubtitle}>
          {user?.park_name
            ? `${user.park_name}`
            : t("parkOwner.noDrivers", { defaultValue: "Manage and verify drivers" })}
        </Text>
      </View>

      {/* Stats Strip */}
      {drivers.length > 0 && (
        <View style={styles.statsStrip}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{drivers.length}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: "#16A34A" }]}>
              {verifiedCount}
            </Text>
            <Text style={styles.statLabel}>Verified</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: Colors.warning }]}>
              {pendingCount}
            </Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
        </View>
      )}

      {/* Body */}
      {loading ? (
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.centeredStateText}>Loading drivers...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
        >
          {/* Sync / error notice */}
          {error ? (
            <View style={styles.infoCard}>
              <Ionicons
                name="cloud-offline-outline"
                size={20}
                color={Colors.warning}
              />
              <Text style={styles.infoText}>{error}</Text>
            </View>
          ) : null}

          {/* Driver cards */}
          {drivers.length > 0 ? (
            drivers.map((driver) => (
              <DriverCard
                key={driver.id}
                driver={driver}
                onVerify={handleVerify}
                verifying={verifyingId === driver.id}
              />
            ))
          ) : (
            /* Empty state */
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name="people-outline"
                  size={48}
                  color={Colors.primary}
                />
              </View>
              <Text style={styles.emptyTitle}>
                {t("parkOwner.noDrivers", { defaultValue: "No drivers yet" })}
              </Text>
              <Text style={styles.emptySubtitle}>
                Drivers who register with your park name and location will
                appear here. Pull down to refresh.
              </Text>
            </View>
          )}

          {/* How it works card (always visible) */}
          <View style={styles.infoCard}>
            <Ionicons
              name="information-circle"
              size={20}
              color={Colors.info}
            />
            <Text style={styles.infoText}>
              Drivers complete their profile by entering your park name and
              location. Once registered, you can verify and monitor their trips
              and stats here.
            </Text>
          </View>

          <View
            style={{
              height: 100 + (Platform.OS === "web" ? 34 : 0),
            }}
          />
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Header
  header: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 24,
    color: Colors.text,
  },
  headerSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // Stats strip
  statsStrip: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.borderLight,
    marginVertical: 2,
  },
  statValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // List
  listContent: {
    padding: 20,
    gap: 12,
  },

  // Card
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 18,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: Colors.primary,
  },
  driverInfo: {
    flex: 1,
    gap: 3,
  },
  driverName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  driverIdRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  driverIdText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: Colors.gold,
    letterSpacing: 1,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusBadgeVerified: {
    backgroundColor: "#F0FDF4",
  },
  statusBadgePending: {
    backgroundColor: Colors.goldLight,
  },
  statusText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
  },
  statusTextVerified: {
    color: "#16A34A",
  },
  statusTextPending: {
    color: "#92400E",
  },

  // Card body
  cardBody: {
    gap: 6,
    paddingLeft: 60, // align under name
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
  },

  // Verify button
  verifyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  verifyBtnPressed: {
    opacity: 0.9,
  },
  verifyBtnLoading: {
    opacity: 0.7,
  },
  verifyBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: Colors.surface,
  },

  // Empty state
  emptyState: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
    color: Colors.text,
    textAlign: "center",
  },
  emptySubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },

  // Info card
  infoCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#EFF6FF",
    borderRadius: 16,
    padding: 16,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "#1E40AF",
    lineHeight: 22,
  },

  // Loading / error centered
  centeredState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingHorizontal: 32,
  },
  centeredStateText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
  },
});