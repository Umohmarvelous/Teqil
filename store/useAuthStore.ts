// BEFORE
type User = {
  id: string;
  email: string;
  role: 'passenger' | 'driver';
  subaccount_code?: string;
};

// AFTER — add username
type User = {
  id: string;
  email: string;
  username: string;           // ← added
  role: 'passenger' | 'driver';
  subaccount_code?: string;
};

// In login/signup, pull username from profiles table or auth metadata:
// Example in signUp:
const { data: authData, error } = await supabase.auth.signUp({ email, password });
if (authData.user) {
  await supabase.from('profiles').insert({
    id: authData.user.id,
    username,               // ← persist
    role,
  });
  set({ user: { id: authData.user.id, email, username, role } });
}

// In login, fetch profile to rehydrate username:
const { data: profile } = await supabase
  .from('profiles')
  .select('username, role, subaccount_code')
  .eq('id', authData.user.id)
  .single();

set({ user: { ...authData.user, ...profile } });