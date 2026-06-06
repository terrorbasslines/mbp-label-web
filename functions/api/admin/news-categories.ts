import {
  id,
  isResponse,
  json,
  methodNotAllowed,
  optionalString,
  readJson,
  requireAdmin,
  requireDb,
  requiredString,
  type Env
} from "../_shared";
import { ensureDefaultNewsCategories, isNewsTableMissing, normalizeAccentColor, uniqueNewsCategorySlug, type NewsCategoryRow } from "../_news";

type CategoryWithCounts = NewsCategoryRow & {
  article_count?: number;
  published_count?: number;
  draft_count?: number;
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  try {
    await ensureDefaultNewsCategories(db);
    const result = await db
      .prepare(
        `SELECT c.*,
                (SELECT COUNT(*) FROM news_articles a WHERE a.category_id = c.id) AS article_count,
                (SELECT COUNT(*) FROM news_articles a WHERE a.category_id = c.id AND a.status = 'published') AS published_count,
                (SELECT COUNT(*) FROM news_articles a WHERE a.category_id = c.id AND a.status = 'draft') AS draft_count
         FROM news_categories c
         ORDER BY lower(c.name)`
      )
      .all<CategoryWithCounts>();

    return json({
      ok: true,
      categories: (result.results ?? []).map((category) => ({
        ...category,
        article_count: Number(category.article_count ?? 0),
        published_count: Number(category.published_count ?? 0),
        draft_count: Number(category.draft_count ?? 0)
      }))
    });
  } catch (error) {
    if (isNewsTableMissing(error)) return json({ ok: true, categories: [], migration_required: true });
    throw error;
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  const body = await readJson<Record<string, unknown>>(request);
  if (body instanceof Response) return body;

  const name = requiredString(body.name, "name", 2, 120);
  if (isResponse(name)) return name;

  try {
    await ensureDefaultNewsCategories(db);
    const categoryId = id("newscat");
    const slug = await uniqueNewsCategorySlug(db, name, optionalString(body.slug, 120));
    await db
      .prepare(
        `INSERT INTO news_categories (id, slug, name, description, accent_color, updated_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
      )
      .bind(categoryId, slug, name, optionalString(body.description, 500), normalizeAccentColor(body.accent_color))
      .run();

    const category = await db.prepare("SELECT * FROM news_categories WHERE id = ? LIMIT 1").bind(categoryId).first<NewsCategoryRow>();
    return json({ ok: true, category }, { status: 201 });
  } catch (error) {
    if (isNewsTableMissing(error)) {
      return json(
        { ok: false, error: "News categories are not installed yet. Run D1 migrations 0011, 0012 and 0013 for the production database." },
        { status: 409 }
      );
    }
    throw error;
  }
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["GET", "POST"]);
