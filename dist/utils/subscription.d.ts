export declare const getOrCreateDefaultSubscription: (
  userId: string,
) => Promise<
  {
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
  }
>;
export declare const updateSubscriptionFromPlan: (
  userId: string,
  planId: string,
) => Promise<
  {
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
  }
>;
export declare const updateSubscriptionLimits: (
  userId: string,
  limits: {
    maxTopics?: number;
    maxQuizzes?: number;
    maxDocuments?: number;
    allowedModels?: string[];
  },
) => Promise<
  {
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
  }
>;
//# sourceMappingURL=subscription.d.ts.map
