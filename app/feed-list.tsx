"use client";

import { FeedCard } from "@/components/feed-card";
import { FilterTabs } from "@/components/filter-tabs";
import { SearchBar } from "@/components/search-bar";
import { FeedItem } from "@/types";
import { useMemo, useState } from "react";

interface FeedListProps {
  items: FeedItem[];
}

export default function FeedList({ items }: FeedListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const categories = useMemo(() => {
    const uniqueCategories = Array.from(
      new Set(items.map((item) => item.category))
    );
    return uniqueCategories.filter(Boolean);
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
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
  }, [items, searchQuery, selectedCategory]);

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
