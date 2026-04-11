// import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Colors } from "@/constants/colors";
import { HugeiconsIcon } from "@hugeicons/react-native";



interface StatPillProps { 
  iconName: any;
  label: string;
  value: string;
  color: string;
}



export default function StatPill({ iconName, label, value, color }: StatPillProps) {

  return (
    <View style={styles.statPill}>
      <View style={[styles.statIconBox, ]}>
        <HugeiconsIcon icon={iconName} size={28} color={color} />
      </View>
      <View>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({

  statPill: { 
    // flex: 1, 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: 'center',
    gap: 10, 
    paddingHorizontal: 4 
  },
  statIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontFamily: "Poppins_700Bold", 
    fontSize: 14, 
    color: Colors.textSecondary,
    flexWrap: 'wrap',
  },
  statLabel: {
    fontFamily: "Poppins_400Regular", 
    fontSize: 10, 
    color: Colors.textSecondary,
  },

})