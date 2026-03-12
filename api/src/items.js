import { sql } from "./db.js";
import { applyMigrationsOnce } from "./migrations.js";

export function normalizeItemName(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^(my|the|a|an)\s+/i, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, " ");
}

export async function ensureItemsTable() {
  await applyMigrationsOnce();
}

export async function upsertItemMemory(input) {
  const normalizedItemName = normalizeItemName(input.itemName);
  const [row] = await sql`
    INSERT INTO item_memories (
      user_id,
      item_name,
      normalized_item_name,
      location_description,
      category,
      source_message
    )
    VALUES (
      ${input.userId},
      ${input.itemName.trim()},
      ${normalizedItemName},
      ${input.locationDescription.trim()},
      ${input.category?.trim() || null},
      ${input.sourceMessage.trim()}
    )
    ON CONFLICT (user_id, normalized_item_name)
    DO UPDATE SET
      item_name = EXCLUDED.item_name,
      location_description = EXCLUDED.location_description,
      category = EXCLUDED.category,
      source_message = EXCLUDED.source_message,
      updated_at = NOW()
    RETURNING
      user_id AS "userId",
      item_name AS "itemName",
      normalized_item_name AS "normalizedItemName",
      location_description AS "locationDescription",
      category,
      source_message AS "sourceMessage",
      created_at::TEXT AS "createdAt",
      updated_at::TEXT AS "updatedAt"
  `;

  return row;
}

export async function listRecentItems(userId, limit = 8) {
  return sql`
    SELECT
      user_id AS "userId",
      item_name AS "itemName",
      normalized_item_name AS "normalizedItemName",
      location_description AS "locationDescription",
      category,
      source_message AS "sourceMessage",
      created_at::TEXT AS "createdAt",
      updated_at::TEXT AS "updatedAt"
    FROM item_memories
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
    LIMIT ${limit}
  `;
}

export async function searchItemMemories(input) {
  const items = await listRecentItems(input.userId, 100);
  const exact = normalizeItemName(input.itemName);
  const terms = new Set(
    [exact, ...(input.searchTerms ?? []).map(normalizeItemName)].filter(Boolean),
  );

  const exactMatches = items.filter((item) => item.normalizedItemName === exact);
  if (exactMatches.length > 0) {
    return exactMatches;
  }

  return items.filter((item) => {
    if (terms.has(item.normalizedItemName)) {
      return true;
    }

    return Array.from(terms).some(
      (term) =>
        item.normalizedItemName.includes(term) || term.includes(item.normalizedItemName),
    );
  });
}
