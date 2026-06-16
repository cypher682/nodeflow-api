import { Request, Response, NextFunction } from "express";

export const apiVersion = (req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-API-Version", "v1");
  res.setHeader("X-Deprecated", "false");
  next();
};
