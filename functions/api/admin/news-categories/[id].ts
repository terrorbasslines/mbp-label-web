import {
  isResponse,
  json,
  methodNotAllowed,
  optionalString,
  readJson,
  requireAdmin,
  requireDb,
  requiredString,
  type Env
} from "../../_shared";
import { ensureDefaultNewsCategories, isNewsTableMissing, normalizeAccentColor, uniqueNewsCategorySlug, type NewsCategoryRow } from "../../_news";

export const onRequestPut: PagesFunction<Env> = async ({ params, request, env }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  const categoryId = String(params.id ?? "");
  try {
    await ensureDefaultNewsCategories(db);
    const existing = await db.prepare("SELECT * FROM news_categories WHERE id = ? LIMIT 1").bind(categoryId).first<NewsCategoryRow>();
    if (!existing) return json({ ok: false, error: "News category not found." }, { status: 404 });

    const body = await readJson<Record<string, unknown>>(request);
    if (body instanceof Response) return body;

    const name = requiredString(body.name, "name", 2, 120);
    if (isResponse(name)) return name;

    const slug = await uniqueNewsCategorySlug(db, name, optionalString(body.slug, 120) ?? existing.slug, categoryId);
    const accentColor = normalizeAccentColor(body.accent_color ?? existing.accent_color);
    await db
      .prepare(
        `UPDATE news_categories
         SET slug = ?, name = ?, description = ?, accent_color = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(slug, name, optionalString(body.description, 500), accentColor, categoryId)
      .run();

    await db
      .prepare("UPDATE news_articles SET category = ?, accent_color = COALESCE(accent_color, ?), updated_at = CURRENT_TIMESTAMP WHERE category_id = ?")
      .bind(name, accentColor, categoryId)
      .run();

    const category = await db.prepare("SELECT * FROM news_categories WHERE id = ? LIMIT 1").bind(categoryId).first<NewsCategoryRow>();
    return json({ ok: true, category });
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

export const onRequestDelete: PagesFunction<Env> = async ({ params, request, env }) => {
  const admin = await requireAdmin(request, env);
  if (isResponse(admin)) return admin;

  const db = requireDb(env);
  if (isResponse(db)) return db;

  const categoryId = String(params.id ?? "");
  try {
    await db
      .prepare("UPDATE news_articles SET category_id = NULL, category = NULL, updated_at = CURRENT_TIMESTAMP WHERE category_id = ?")
      .bind(categoryId)
      .run();
    await db.prepare("DELETE FROM news_categories WHERE id = ?").bind(categoryId).run();
    return json({ ok: true });
  } catch (error) {
    if (isNewsTableMissing(error)) return json({ ok: true });
    throw error;
  }
};

export const onRequest: PagesFunction<Env> = async () => methodNotAllowed(["PUT", "DELETE"]);
