import { Request, Response } from 'express';
import { TripUseCases } from '../application/TripUseCases';
import { Location } from '../domain/Trip';

/**
 * Express types a route param as `string | string[]`, because a pattern is
 * allowed to repeat a name. Every route here uses a single `:tripId` segment,
 * so the array form can't actually occur — but the type still has to be
 * narrowed rather than asserted away.
 */
function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] : (value ?? '');
}

export class TripController {
  constructor(private tripUseCases: TripUseCases) {}

  createTrip = async (req: Request, res: Response) => {
    try {
      const driverId = req.headers['x-user-id'] as string;
      if (!driverId) return res.status(401).json({ error: 'Unauthorized' });

      const { start, end, baseFare } = req.body;
      const startLoc = new Location(start.latitude, start.longitude, start.address);
      const endLoc = new Location(end.latitude, end.longitude, end.address);

      const trip = await this.tripUseCases.createTrip(driverId, startLoc, endLoc, baseFare);
      return res.status(201).json({ trip });
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  };

  joinTrip = async (req: Request, res: Response) => {
    try {
      const passengerId = req.headers['x-user-id'] as string;
      if (!passengerId) return res.status(401).json({ error: 'Unauthorized' });

      const tripId = routeParam(req.params.tripId);
      const trip = await this.tripUseCases.joinTrip(tripId, passengerId);
      return res.status(200).json({ trip });
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  };

  startTrip = async (req: Request, res: Response) => {
    try {
      const driverId = req.headers['x-user-id'] as string;
      const tripId = routeParam(req.params.tripId);
      
      const trip = await this.tripUseCases.startTrip(tripId, driverId);
      return res.status(200).json({ trip });
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  };

  completeTrip = async (req: Request, res: Response) => {
    try {
      const driverId = req.headers['x-user-id'] as string;
      const tripId = routeParam(req.params.tripId);
      
      const trip = await this.tripUseCases.completeTrip(tripId, driverId);
      return res.status(200).json({ trip });
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  };
}
