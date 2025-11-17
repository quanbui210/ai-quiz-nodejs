export declare const getUserUsage: (userId: string) => Promise<{
  id: string;
  userId: string;
  topicsCount: number;
  quizzesCount: number;
  documentsCount: number;
  lastResetAt: Date;
}>;
export declare const incrementTopicCount: (userId: string) => Promise<void>;
export declare const decrementTopicCount: (userId: string) => Promise<void>;
export declare const incrementQuizCount: (userId: string) => Promise<void>;
export declare const decrementQuizCount: (userId: string) => Promise<void>;
export declare const incrementDocumentCount: (userId: string) => Promise<void>;
export declare const decrementDocumentCount: (userId: string) => Promise<void>;
export declare const getUserSubscription: (userId: string) => Promise<
  | ({
      plan: {
        name: string;
        id: string;
        maxTopics: number;
        maxQuizzes: number;
        maxDocuments: number;
        allowedModels: string[];
        createdAt: Date;
        updatedAt: Date;
        stripePriceId: string | null;
        stripeProductId: string | null;
        isDefault: boolean;
        isActive: boolean;
        isCustom: boolean;
      };
    } & {
      id: string;
      userId: string;
      stripeCustomerId: string | null;
      stripeSubscriptionId: string | null;
      planId: string;
      maxTopics: number;
      maxQuizzes: number;
      maxDocuments: number;
      allowedModels: string[];
      status: import(".prisma/client").$Enums.SubscriptionStatus;
      currentPeriodStart: Date | null;
      currentPeriodEnd: Date | null;
      cancelAtPeriodEnd: boolean;
      createdAt: Date;
      updatedAt: Date;
    })
  | null
>;
//# sourceMappingURL=usage.d.ts.map
