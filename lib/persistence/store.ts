import type {
  ItemState,
  LearnerState,
  SchedulingPath,
} from '../scheduling/types';

// Everything the review service needs to read before scheduling one review.
export interface ReviewContext {
  itemStateId: string;
  item: ItemState;
  dueAt: Date;
  learner: LearnerState;
  // Stabilities of the learner's other items that are on the adaptive path.
  // Together with the reviewed item they give the learner prior (3.7.6).
  otherStabilities: number[];
}

export interface ReviewLogEntry {
  reviewedAt: Date;
  correct: boolean;
  responseTimeMs: number;
  elapsedDays: number | null; // null for an item's first review (Table 3.5)
  path: SchedulingPath;
  intervalAssigned: number; // days
}

// One review's results, written together or not at all.
export interface ReviewWrite {
  learnerId: string;
  itemStateId: string;
  // What the caller read before computing. The write is refused if either has
  // changed, which means another review got in first.
  expectedReviewCount: number;
  expectedRtCount: number;
  item: ItemState;
  dueAt: Date;
  learner: LearnerState;
  log: ReviewLogEntry;
}

export class ItemNotFoundError extends Error {
  constructor() {
    super('item not found');
    this.name = 'ItemNotFoundError';
  }
}

export class ReviewConflictError extends Error {
  constructor() {
    super('another review changed this item or learner first');
    this.name = 'ReviewConflictError';
  }
}

// The scheduling engine never sees this interface; only the review service
// does (3.3.3: the persistence layer is what keeps the engine free of I/O).
export interface ReviewStore {
  // Returns null when the item does not exist or is not the learner's.
  loadForReview(
    learnerId: string,
    itemStateId: string,
  ): Promise<ReviewContext | null>;
  // Throws ItemNotFoundError or ReviewConflictError.
  saveReview(write: ReviewWrite): Promise<void>;
}
