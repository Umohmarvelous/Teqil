import { Request, Response } from 'express';
import { AuthUseCases } from '../application/AuthUseCases';

export class AuthController {
  constructor(private authUseCases: AuthUseCases) {}

  register = async (req: Request, res: Response) => {
    try {
      const { email, password, fullName } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const { user, profile } = await this.authUseCases.registerUser(email, password, fullName);
      return res.status(201).json({ user, profile });
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  };

  login = async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const { user, token, profile } = await this.authUseCases.loginUser(email, password);
      return res.status(200).json({ user, token, profile });
    } catch (error: any) {
      return res.status(401).json({ error: error.message });
    }
  };
}
