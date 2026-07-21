import { User } from '../domain/User';
import { Profile } from '../domain/Profile';

export interface IAuthRepository {
  registerWithEmail(email: string, password: string): Promise<User>;
  loginWithEmail(email: string, password: string): Promise<{ user: User; token: string }>;
  
  createProfile(profile: Profile): Promise<Profile>;
  getProfileByUserId(userId: string): Promise<Profile | null>;
  updateProfile(profile: Profile): Promise<Profile>;
}
