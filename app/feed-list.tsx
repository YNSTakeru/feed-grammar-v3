"use client";

import { FeedCard } from "@/components/feed-card";
import { FilterTabs } from "@/components/filter-tabs";
import { SearchBar } from "@/components/search-bar";
import { progressDB } from "@/lib/db/progress-db";
import { FeedItem } from "@/types";
import { useEffect, useMemo, useState } from "react";

interface FeedListProps {
  items: FeedItem[];
}

export default function FeedList({ items }: FeedListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [unlockedIds, setUnlockedIds] = useState<Set<number>>(new Set([1]));
  const [isLoading, setIsLoading] = useState(true);

  // 初期化時にアンロック状態を読み込む
  useEffect(() => {
    const loadUnlockedState = async () => {
      setIsLoading(true);
      try {
        const completedIds = await progressDB.getCompletedArticleIds();
        const unlocked = new Set<number>([1]); // ID=1は常にアンロック

        // 完了した記事の次の記事をアンロック
        completedIds.forEach((id) => {
          unlocked.add(id); // 完了した記事自体もアンロック
          const nextItem = items.find((item) => item.id === id + 1);
          if (nextItem) {
            unlocked.add(nextItem.id);
          }
        });

        setUnlockedIds(unlocked);
      } catch (error) {
        console.error("Failed to load unlock state:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadUnlockedState();
  }, [items]);

  const categories = useMemo(() => {
    const uniqueCategories = Array.from(
      new Set(items.map((item) => item.category))
    );
    return uniqueCategories.filter(Boolean);
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // アンロックされているかチェック
      const isUnlocked = unlockedIds.has(item.id);
      if (!isUnlocked) return false;

      const matchesSearch =
        searchQuery === "" ||
        item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.question_katakana
          .toLowerCase()
          .includes(searchQuery.toLowerCase()) ||
        item.theme?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory =
        selectedCategory === "all" || item.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [items, searchQuery, selectedCategory, unlockedIds]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <SearchBar value={searchQuery} onChange={setSearchQuery} />
        <FilterTabs
          categories={categories}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
        />
      </div>

      <div className="text-sm text-muted-foreground">
        {filteredItems.length} 件のフレーズ
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredItems.map((item) => (
          <FeedCard key={item.id} item={item} />
        ))}
      </div>

      {filteredItems.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            該当するフレーズが見つかりませんでした
          </p>
        </div>
      )}
    </div>
  );
}
