import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';


type Transaction = {
  id: string;
  created_at: string;
  amount: number;
  bonus_amount: number;
  trip_type: string;
  reference: string;
  passengers: { username: string } | null;
};

export default function DriverTransactionsScreen() {
  const { user } = useAuthStore();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetch = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    const { data, error } = await supabase
      .from('transactions')
      .select('id, created_at, amount, bonus_amount, trip_type, reference, passengers:passenger_id(username)')
      .eq('driver_id', user?.id)
      .order('created_at', { ascending: false });

    if (!error && data) setTransactions(data as Transaction[]);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { fetch(); }, []);

  const total = transactions.reduce((sum, t) => sum + t.amount, 0);

  const renderItem = ({ item }: { item: Transaction }) => (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.name}>{item.passengers?.username ?? 'Passenger'}</Text>
        <Text style={styles.meta}>
          {new Date(item.created_at).toLocaleDateString()} · {item.trip_type}
        </Text>
        {item.bonus_amount > 0 && (
          <Text style={styles.bonus}>+₦{item.bonus_amount} bonus</Text>
        )}
      </View>
      <Text style={styles.amount}>₦{item.amount.toLocaleString()}</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>Total Received</Text>
        <Text style={styles.summaryAmount}>₦{total.toLocaleString()}</Text>
      </View>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetch(true)} />}
        ListEmptyComponent={
          <Text style={styles.empty}>No transactions yet.</Text>
        }
        contentContainerStyle={transactions.length === 0 && styles.emptyContainer}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  summary: {
    padding: 20,
    backgroundColor: '#007AFF',
    alignItems: 'center',
  },
  summaryLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  summaryAmount: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 4 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderColor: '#F0F0F0',
  },
  rowLeft: { flex: 1 },
  name: { fontWeight: '600', fontSize: 14, marginBottom: 3 },
  meta: { color: '#888', fontSize: 12 },
  bonus: { color: '#34C759', fontSize: 12, marginTop: 2 },
  amount: { fontWeight: '700', fontSize: 16, color: '#34C759' },
  empty: { textAlign: 'center', color: '#999', fontSize: 14 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});