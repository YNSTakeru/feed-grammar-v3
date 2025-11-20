#!/usr/bin/env python3
import json
import sys


def fix_article_text(data):
    """Fix article_text fields that contain invalid JSON strings"""
    for item in data:
        if 'article_text' in item and isinstance(item['article_text'], str):
            try:
                # Try to parse the article_text as JSON
                json.loads(item['article_text'])
                print(f"✓ Article ID {item['id']}: Valid JSON")
            except json.JSONDecodeError as e:
                print(f"✗ Article ID {item['id']}: Invalid JSON - {e}")
                print(f"  Position: {e.pos}, Line: {e.lineno}, Column: {e.colno}")

                # Show the problematic area
                text = item['article_text']
                start = max(0, e.pos - 50)
                end = min(len(text), e.pos + 50)
                print(f"  Context: ...{text[start:end]}...")
                print(f"           {' ' * (e.pos - start + 3)}^")
                print()

    return data

def main():
    input_file = 'lib/data/feed-data.json'

    print(f"Reading {input_file}...")
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    print(f"Found {len(data)} items\n")
    fix_article_text(data)

if __name__ == '__main__':
    main()
