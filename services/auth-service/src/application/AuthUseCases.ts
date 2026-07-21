import { IAuthRepository } from './IAuthRepository';
import { User } from '../domain/User';
import { Profile } from '../domain/Profile';

export class AuthUseCases {
  constructor(private authRepository: IAuthRepository) {}

  async registerUser(email: string, password: string, fullName: string | null): Promise<{ user: User; profile: Profile }> {
    const user = await this.authRepository.registerWithEmail(email, password);
    
    const profile = Profile.create(
      crypto.randomUUID(), 
      user.id, 
      fullName, 
      null, 
      'passenger'
    );
    
    await this.authRepository.createProfile(profile);
    
    return { user, profile };
  }

  async loginUser(email: string, password: string): Promise<{ user: User; token: string; profile: Profile | null }> {
    const { user, token } = await this.authRepository.loginWithEmail(email, password);
    const profile = await this.authRepository.getProfileByUserId(user.id);
    
    return { user, token, profile };
  }
}
