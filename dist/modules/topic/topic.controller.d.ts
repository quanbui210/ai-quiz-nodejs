import { Request, Response } from "express";
export declare const listTopics: (
  req: Request & {
    user?: any;
  },
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
export declare const getTopic: (
  req: Request,
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
export declare const createTopic: (
  req: Request & {
    user?: any;
  },
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
export declare const updateTopic: (
  req: Request & {
    user?: any;
  },
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
export declare const deleteTopic: (
  req: Request & {
    user?: any;
  },
  res: Response,
) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=topic.controller.d.ts.map
