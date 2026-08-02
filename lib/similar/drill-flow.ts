export type DrillCard<TItem extends { id: number }> = {
  item: TItem;
  streak: number;
};

export type RevealResult<TItem extends { id: number }> = {
  activeQueue: DrillCard<TItem>[];
  nextQueue: DrillCard<TItem>[];
  revealedCard: DrillCard<TItem> | null;
};

export type HeardRevealResult<TItem extends { id: number }> =
  RevealResult<TItem> & {
    graduatedId: number | null;
  };

export type MissedRevealResult<TItem extends { id: number }> =
  RevealResult<TItem> & {
    missedId: number | null;
  };

export type AdvanceAfterRevealInput<TItem extends { id: number }> = {
  activeQueue: DrillCard<TItem>[];
  nextQueue: DrillCard<TItem>[];
  loopCount: number;
};

export type AdvanceAfterRevealResult<TItem extends { id: number }> = {
  activeQueue: DrillCard<TItem>[];
  nextQueue: DrillCard<TItem>[];
  loopCount: number;
  isDone: boolean;
};

export function revealExposureCard<TItem extends { id: number }>(
  activeQueue: DrillCard<TItem>[],
  nextQueue: DrillCard<TItem>[],
): RevealResult<TItem> {
  const current = activeQueue[0] ?? null;
  if (!current) {
    return { activeQueue, nextQueue, revealedCard: null };
  }

  return {
    activeQueue: activeQueue.slice(1),
    nextQueue: [...nextQueue, current],
    revealedCard: current,
  };
}

export function revealHeardCard<TItem extends { id: number }>(
  activeQueue: DrillCard<TItem>[],
  nextQueue: DrillCard<TItem>[],
): HeardRevealResult<TItem> {
  const current = activeQueue[0] ?? null;
  if (!current) {
    return { activeQueue, nextQueue, revealedCard: null, graduatedId: null };
  }

  const revealedCard = {
    item: current.item,
    streak: current.streak + 1,
  };

  if (revealedCard.streak >= 2) {
    return {
      activeQueue: activeQueue.slice(1),
      nextQueue,
      revealedCard,
      graduatedId: revealedCard.item.id,
    };
  }

  return {
    activeQueue: activeQueue.slice(1),
    nextQueue: [...nextQueue, revealedCard],
    revealedCard,
    graduatedId: null,
  };
}

export function revealMissedCard<TItem extends { id: number }>(
  activeQueue: DrillCard<TItem>[],
  nextQueue: DrillCard<TItem>[],
): MissedRevealResult<TItem> {
  const current = activeQueue[0] ?? null;
  if (!current) {
    return { activeQueue, nextQueue, revealedCard: null, missedId: null };
  }

  const revealedCard = {
    item: current.item,
    streak: 0,
  };

  return {
    activeQueue: activeQueue.slice(1),
    nextQueue: [revealedCard, ...nextQueue],
    revealedCard,
    missedId: revealedCard.item.id,
  };
}

export function advanceAfterReveal<TItem extends { id: number }>({
  activeQueue,
  nextQueue,
  loopCount,
}: AdvanceAfterRevealInput<TItem>): AdvanceAfterRevealResult<TItem> {
  if (activeQueue.length > 0) {
    return { activeQueue, nextQueue, loopCount, isDone: false };
  }

  if (nextQueue.length > 0) {
    return {
      activeQueue: nextQueue,
      nextQueue: [],
      loopCount: loopCount + 1,
      isDone: false,
    };
  }

  return { activeQueue, nextQueue, loopCount, isDone: true };
}
