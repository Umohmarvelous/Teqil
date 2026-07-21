import { Request, Response } from 'express';
import { CreditsUseCases } from '../application/CreditsUseCases';

export class CreditsController {
  constructor(private creditsUseCases: CreditsUseCases) {}

  getBalance = async (req: Request, res: Response) => {
    try {
      // In a real app, userId should come from verified JWT in req.user
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const balance = await this.creditsUseCases.getBalance(userId);
      return res.status(200).json({ balance });
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  };

  earnCredits = async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { actionType, targetId } = req.body;
      if (!actionType || !targetId) {
        return res.status(400).json({ error: 'actionType and targetId are required' });
      }

      await this.creditsUseCases.earnCredits(userId, actionType, targetId);
      return res.status(200).json({ message: 'Credits successfully earned' });
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  };

  spendCredits = async (req: Request, res: Response) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { amount, transactionId } = req.body;
      if (!amount || !transactionId) {
        return res.status(400).json({ error: 'amount and transactionId are required' });
      }

      await this.creditsUseCases.spendCredits(userId, amount, transactionId);
      return res.status(200).json({ message: 'Credits successfully deducted' });
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  };
}
