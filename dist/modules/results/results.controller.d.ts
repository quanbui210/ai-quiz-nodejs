import { Request, Response } from "express";
export declare const getQuizResult: (req: Request & {
    user?: any;
}, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getResult: (req: Request & {
    user?: any;
}, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const listResults: (req: Request & {
    user?: any;
}, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getUserStats: (req: Request & {
    user?: any;
}, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=results.controller.d.ts.map