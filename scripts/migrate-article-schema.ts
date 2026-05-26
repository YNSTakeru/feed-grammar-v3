import fs from "fs";
import path from "path";

import type { ArticleData, FeedItem } from "../types";

type ScriptArgs = {
  dryRun: boolean;
  backup: boolean;
  includeSimilar: boolean;
  ids: Set<number> | null;
};

type FileSummary = {
  file: string;
  total: number;
  selected: number;
  migrated: number;
  skippedStringArticleText: number;
  skippedAlreadyNormalized: number;
};

type MigrationSummary = {
  dryRun: boolean;
  backup: boolean;
  includeSimilar: boolean;
  ids: number[] | null;
  files: number;
  filesChanged: number;
  totalItems: number;
  selectedItems: number;
  migratedItems: number;
  movedTsukkomi: number;
  movedTranslated: number;
  skippedStringArticleText: number;
  skippedAlreadyNormalized: number;
  skippedUnselected: number;
  willMigrateIds: number[];
  backupFiles: string[];
  perFile: FileSummary[];
};

type MigrationResult = {
  next: FeedItem;
  selected: boolean;
  migrated: boolean;
  movedTsukkomi: boolean;
  movedTranslated: boolean;
  skippedStringArticleText: boolean;
  skippedAlreadyNormalized: boolean;
};

function parseIds(raw: string): Set<number> {
  const ids = raw
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => !Number.isNaN(value));
  if (ids.length === 0) {
    throw new Error("`--ids` requires at least one numeric ID (example: --ids 1,2,3)");
  }
  return new Set(ids);
}

function parseArgs(argv: string[]): ScriptArgs {
  let dryRun = false;
  let backup = false;
  let includeSimilar = false;
  let ids: Set<number> | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--backup") {
      backup = true;
      continue;
    }
    if (arg === "--similar") {
      includeSimilar = true;
      continue;
    }
    if (arg === "--ids") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("`--ids` requires a value (example: --ids 1,2,3)");
      }
      ids = parseIds(value);
      i += 1;
      continue;
    }
    if (arg.startsWith("--ids=")) {
      ids = parseIds(arg.slice("--ids=".length));
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    dryRun,
    backup,
    includeSimilar,
    ids,
  };
}

function ensureArticleObject(
  item: FeedItem,
): (ArticleData & Record<string, unknown>) | null {
  if (typeof item.article_text === "string") {
    return null;
  }

  return item.article_text as ArticleData & Record<string, unknown>;
}

function migrateItem(item: FeedItem, args: ScriptArgs): MigrationResult {
  const selected = args.ids == null || args.ids.has(item.id);
  if (!selected) {
    return {
      next: item,
      selected: false,
      migrated: false,
      movedTsukkomi: false,
      movedTranslated: false,
      skippedStringArticleText: false,
      skippedAlreadyNormalized: false,
    };
  }

  const article = ensureArticleObject(item);
  if (!article) {
    return {
      next: item,
      selected: true,
      migrated: false,
      movedTsukkomi: false,
      movedTranslated: false,
      skippedStringArticleText: true,
      skippedAlreadyNormalized: false,
    };
  }

  let nextArticle: ArticleData & Record<string, unknown> = article;
  let movedTsukkomi = false;
  let movedTranslated = false;

  if (nextArticle.tsukkomi == null && item.tsukkomi != null) {
    nextArticle = { ...nextArticle, tsukkomi: item.tsukkomi };
    movedTsukkomi = true;
  }

  if (nextArticle.translated == null && item.translated != null) {
    nextArticle = { ...nextArticle, translated: item.translated };
    movedTranslated = true;
  }

  const migrated = movedTsukkomi || movedTranslated;
  if (!migrated) {
    return {
      next: item,
      selected: true,
      migrated: false,
      movedTsukkomi: false,
      movedTranslated: false,
      skippedStringArticleText: false,
      skippedAlreadyNormalized: true,
    };
  }

  return {
    next: {
      ...item,
      article_text: nextArticle,
    },
    selected: true,
    migrated: true,
    movedTsukkomi,
    movedTranslated,
    skippedStringArticleText: false,
    skippedAlreadyNormalized: false,
  };
}

function listTargets(root: string, includeSimilar: boolean): string[] {
  const targets: string[] = [path.join(root, "lib", "data", "feed-data.json")];
  if (!includeSimilar) {
    return targets;
  }

  const similarDir = path.join(root, "lib", "data", "similar");
  const similarFiles = fs
    .readdirSync(similarDir)
    .filter((file) => file.endsWith(".json"))
    .sort();

  for (const file of similarFiles) {
    targets.push(path.join(similarDir, file));
  }
  return targets;
}

function backupPathFor(filePath: string, timestamp: string): string {
  const ext = path.extname(filePath);
  const basename = path.basename(filePath, ext);
  return path.join(path.dirname(filePath), `${basename}.backup-${timestamp}${ext}`);
}

function run(): void {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const targets = listTargets(root, args.includeSimilar);
  const backupTimestamp = new Date().toISOString().replace(/[:.]/g, "-");

  const summary: MigrationSummary = {
    dryRun: args.dryRun,
    backup: args.backup,
    includeSimilar: args.includeSimilar,
    ids: args.ids == null ? null : Array.from(args.ids).sort((a, b) => a - b),
    files: 0,
    filesChanged: 0,
    totalItems: 0,
    selectedItems: 0,
    migratedItems: 0,
    movedTsukkomi: 0,
    movedTranslated: 0,
    skippedStringArticleText: 0,
    skippedAlreadyNormalized: 0,
    skippedUnselected: 0,
    willMigrateIds: [],
    backupFiles: [],
    perFile: [],
  };

  for (const filePath of targets) {
    const raw = fs.readFileSync(filePath, "utf-8");
    const items = JSON.parse(raw) as FeedItem[];
    if (!Array.isArray(items)) {
      throw new Error(`Expected array JSON: ${filePath}`);
    }

    summary.files += 1;
    summary.totalItems += items.length;

    const fileSummary: FileSummary = {
      file: path.relative(root, filePath),
      total: items.length,
      selected: 0,
      migrated: 0,
      skippedStringArticleText: 0,
      skippedAlreadyNormalized: 0,
    };

    const migratedItems = items.map((item) => {
      const result = migrateItem(item, args);
      if (!result.selected) {
        summary.skippedUnselected += 1;
        return result.next;
      }

      summary.selectedItems += 1;
      fileSummary.selected += 1;

      if (result.skippedStringArticleText) {
        summary.skippedStringArticleText += 1;
        fileSummary.skippedStringArticleText += 1;
      }
      if (result.skippedAlreadyNormalized) {
        summary.skippedAlreadyNormalized += 1;
        fileSummary.skippedAlreadyNormalized += 1;
      }
      if (result.migrated) {
        summary.migratedItems += 1;
        fileSummary.migrated += 1;
        summary.willMigrateIds.push(item.id);
      }
      if (result.movedTsukkomi) {
        summary.movedTsukkomi += 1;
      }
      if (result.movedTranslated) {
        summary.movedTranslated += 1;
      }

      return result.next;
    });

    summary.perFile.push(fileSummary);

    const changed = JSON.stringify(items) !== JSON.stringify(migratedItems);
    if (!changed || args.dryRun) {
      continue;
    }

    summary.filesChanged += 1;
    if (args.backup) {
      const backupPath = backupPathFor(filePath, backupTimestamp);
      fs.copyFileSync(filePath, backupPath);
      summary.backupFiles.push(path.relative(root, backupPath));
    }

    fs.writeFileSync(filePath, `${JSON.stringify(migratedItems, null, 2)}\n`, "utf-8");
  }

  summary.willMigrateIds.sort((a, b) => a - b);
  console.log(JSON.stringify(summary, null, 2));
}

run();
