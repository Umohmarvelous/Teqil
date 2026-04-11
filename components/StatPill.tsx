import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Colors } from "@/constants/colors";



interface StatPillProps { 
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  color: string;
}



export default function StatPill({ icon, label, value, color }: StatPillProps) {

  return (
    <View style={styles.statPill}>
      <View style={[styles.statIconBox, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({

  statsStrip: {
    flexDirection: "row",
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  statPill: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 },
  statIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontFamily: "Poppins_700Bold", fontSize: 14, color: Colors.textSecondary
  },
  statLabel: {
    fontFamily: "Poppins_400Regular", fontSize: 10, color: Colors.textSecondary
  },
  statsDivider: {
    width: 1, height: 32, backgroundColor: Colors.border
  },
})