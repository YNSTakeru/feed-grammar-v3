import { NextResponse } from "next/server";

type TweetEntities = {
  hashtags?: unknown[];
  user_mentions?: unknown[];
  urls?: unknown[];
  symbols?: unknown[];
  [key: string]: unknown;
};

type TweetData = {
  entities?: TweetEntities;
  quoted_tweet?: TweetData;
  [key: string]: unknown;
};

/**
 * Normalize tweet entities to avoid react-tweet@3.3.0 bug:
 * `addEntities()` does `for (const entity of entities)` without a null guard,
 * throwing "TypeError: entities is not iterable" when a tweet has no hashtags,
 * user_mentions, urls, or symbols (e.g. image-only tweets).
 */
function normalizeEntities(tweet: TweetData | undefined): void {
  if (!tweet?.entities) return;
  const e = tweet.entities;
  e.hashtags ??= [];
  e.user_mentions ??= [];
  e.urls ??= [];
  e.symbols ??= [];
  if (tweet.quoted_tweet) normalizeEntities(tweet.quoted_tweet);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const upstream = await fetch(
    `https://react-tweet.vercel.app/api/tweet/${id}`,
    { next: { revalidate: 3600 } }
  );

  if (!upstream.ok) {
    const body = await upstream
      .json()
      .catch(() => ({ error: "Tweet not found" }));
    return NextResponse.json(body, { status: upstream.status });
  }

  const json = await upstream.json();
  normalizeEntities(json.data);

  return NextResponse.json(json);
}
