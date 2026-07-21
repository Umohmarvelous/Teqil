import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { IAuthRepository } from '../application/IAuthRepository';
import { User } from '../domain/User';
import { Profile } from '../domain/Profile';

export class SupabaseAuthRepository implements IAuthRepository {
  private supabase: SupabaseClient;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async registerWithEmail(email: string, password: string): Promise<User> {
    const { data, error } = await this.supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('User creation failed');

    return User.create(data.user.id, data.user.email!);
  }

  async loginWithEmail(email: string, password: string): Promise<{ user: User; token: string }> {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw new Error(error.message);
    if (!data.user || !data.session) throw new Error('Login failed');

    const user = new User(data.user.id, data.user.email!, new Date(data.user.created_at));
    return { user, token: data.session.access_token };
  }

  async createProfile(profile: Profile): Promise<Profile> {
    const { error } = await this.supabase
      .from('profiles')
      .insert({
        id: profile.id,
        user_id: profile.userId,
        full_name: profile.fullName,
        avatar_url: profile.avatarUrl,
        role: profile.role,
        created_at: profile.createdAt.toISOString(),
        updated_at: profile.updatedAt.toISOString()
      });

    if (error) throw new Error(error.message);
    return profile;
  }

  async getProfileByUserId(userId: string): Promise<Profile | null> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // not found
      throw new Error(error.message);
    }

    return new Profile(
      data.id,
      data.user_id,
      data.full_name,
      data.avatar_url,
      data.role,
      new Date(data.created_at),
      new Date(data.updated_at)
    );
  }

  async updateProfile(profile: Profile): Promise<Profile> {
    const { error } = await this.supabase
      .from('profiles')
      .update({
        full_name: profile.fullName,
        avatar_url: profile.avatarUrl,
        role: profile.role,
        updated_at: profile.updatedAt.toISOString()
      })
      .eq('id', profile.id);

    if (error) throw new Error(error.message);
    return profile;
  }
}
