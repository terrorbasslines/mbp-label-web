import type { Env } from "../api/_shared";
import { absoluteUrl, escapeHtml, htmlResponse, notFoundPage, pageShell, SITE_NAME, SITE_URL } from "../_seo";
import { articleExcerpt, findPublishedArticle, isNewsTableMissing, NEWS_REACTIONS, serializeArticle, type NewsArticleRow } from "../api/_news";

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en", { year: "numeric", month: "long", day: "numeric" }).format(date);
}

function renderArticleBody(content: string) {
  return content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      if (/^###\s+/.test(block)) return `<h3>${escapeHtml(block.replace(/^###\s+/, ""))}</h3>`;
      if (/^##\s+/.test(block)) return `<h2>${escapeHtml(block.replace(/^##\s+/, ""))}</h2>`;
      if (/^#\s+/.test(block)) return `<h2>${escapeHtml(block.replace(/^#\s+/, ""))}</h2>`;
      if (/^-\s+/m.test(block)) {
        const items = block
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.startsWith("- "))
          .map((line) => `<li>${escapeHtml(line.slice(2))}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      return `<p>${escapeHtml(block).replace(/\n/g, "<br />")}</p>`;
    })
    .join("");
}

function reactionLabel(reaction: string) {
  const labels: Record<string, string> = {
    energy: "Energy",
    massive: "Massive",
    support: "Support",
    replay: "Replay",
    respect: "Respect"
  };
  return labels[reaction] || reaction;
}

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  if (!env.DB) return notFoundPage("News not available");

  const slug = String(params.slug ?? "").toLowerCase();
  let article: NewsArticleRow | null = null;
  try {
    article = await findPublishedArticle(env.DB, slug);
  } catch (error) {
    if (isNewsTableMissing(error)) return notFoundPage("News not available");
    throw error;
  }

  if (!article) return notFoundPage("News article not found");

  const serialized = serializeArticle(article);
  const canonicalPath = `/news/${article.slug}`;
  const canonicalUrl = `${SITE_URL}${canonicalPath}`;
  const title = String(serialized.social_title || article.title);
  const description = String(serialized.social_description || articleExcerpt(article));
  const image = article.cover_image_url || `/news/${article.slug}/social-image.svg?platform=og`;
  const publishedDate = formatDate(article.published_at || article.created_at);
  const shareText = `${article.title} | ${SITE_NAME}`;
  const shareUrl = encodeURIComponent(canonicalUrl);
  const encodedTitle = encodeURIComponent(shareText);
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      "@id": `${canonicalUrl}#article`,
      headline: article.title,
      description,
      image: absoluteUrl(image),
      datePublished: article.published_at || article.created_at,
      dateModified: article.updated_at,
      author: {
        "@type": "Organization",
        name: article.author_name || SITE_NAME
      },
      publisher: {
        "@id": `${SITE_URL}/#organization`
      },
      mainEntityOfPage: canonicalUrl
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "News", item: `${SITE_URL}/news/` },
        { "@type": "ListItem", position: 3, name: article.title, item: canonicalUrl }
      ]
    }
  ];

  return htmlResponse(
    pageShell({
      title,
      description,
      canonicalPath,
      image,
      ogType: "article",
      jsonLd,
      content: `
        <style>
          .news-article{padding-bottom:76px}.news-shell{display:grid;grid-template-columns:minmax(0,.92fr) minmax(0,1.08fr);gap:32px}.news-cover{width:100%;aspect-ratio:16/9;border:1px solid var(--line);border-radius:8px;background:#000;object-fit:cover}.article-body{margin-top:28px}.article-body p{font-size:17px;line-height:1.85}.article-body h2,.article-body h3{margin:34px 0 10px;font-size:clamp(24px,3vw,34px);text-transform:uppercase;letter-spacing:0;font-weight:1000}.article-body ul{margin:18px 0 0;padding-left:22px;color:var(--muted);line-height:1.8}.share-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.reaction-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.reaction-grid button{border:1px solid var(--line);border-radius:6px;background:rgba(255,255,255,.04);color:#fff;padding:10px 8px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;cursor:pointer}.reaction-grid button:hover{border-color:var(--cyan);color:var(--cyan)}.comment{border:1px solid var(--line);border-radius:6px;padding:14px;background:rgba(255,255,255,.035)}textarea{width:100%;min-height:120px;border:1px solid var(--line);border-radius:6px;background:#050508;color:#fff;padding:12px;font:inherit}button.submit{border:0;border-radius:6px;background:#fff;color:#000;padding:12px 16px;font-weight:1000;text-transform:uppercase;letter-spacing:.12em;cursor:pointer}.thumb-links{display:grid;gap:8px;margin-top:12px}.thumb-links a{display:block;border:1px solid var(--line);border-radius:6px;padding:10px 12px;text-decoration:none;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#d6d8e2}.thumb-links a:hover{border-color:var(--cyan);color:var(--cyan)}@media (max-width:860px){.news-shell{display:block}.card{margin-top:20px}.reaction-grid,.share-grid{grid-template-columns:1fr 1fr}}
        </style>
        <section class="hero">
          <p class="eyebrow">${escapeHtml(article.category || "MBP News")}</p>
          <h1>${escapeHtml(article.title)}</h1>
          <p>${escapeHtml(description)}</p>
          <div class="meta">
            ${publishedDate ? `<span class="pill">${escapeHtml(publishedDate)}</span>` : ""}
            <span class="pill">${escapeHtml(article.author_name || SITE_NAME)}</span>
          </div>
        </section>
        <section class="news-article news-shell">
          <div>
            <img class="news-cover" src="${escapeHtml(absoluteUrl(article.cover_image_url || "/assets/brand/season4-banner.png"))}" alt="${escapeHtml(article.title)} news artwork" />
            <article class="article-body">${renderArticleBody(article.content)}</article>
          </div>
          <aside class="card">
            <p class="eyebrow">Share article</p>
            <h2>Social-ready story</h2>
            <p>Share this MBP news update directly, or open generated thumbnails prepared for common social formats.</p>
            <div class="links share-grid">
              <a href="https://www.facebook.com/sharer/sharer.php?u=${shareUrl}" target="_blank" rel="noreferrer">Facebook</a>
              <a href="https://twitter.com/intent/tweet?url=${shareUrl}&text=${encodedTitle}" target="_blank" rel="noreferrer">X / Twitter</a>
              <a href="https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}" target="_blank" rel="noreferrer">LinkedIn</a>
              <a href="https://api.whatsapp.com/send?text=${encodedTitle}%20${shareUrl}" target="_blank" rel="noreferrer">WhatsApp</a>
            </div>
            <div class="thumb-links">
              <a href="/news/${escapeHtml(article.slug)}/social-image.svg?platform=og" target="_blank" rel="noreferrer">Open 1200x630 thumbnail</a>
              <a href="/news/${escapeHtml(article.slug)}/social-image.svg?platform=square" target="_blank" rel="noreferrer">Open 1080x1080 thumbnail</a>
              <a href="/news/${escapeHtml(article.slug)}/social-image.svg?platform=story" target="_blank" rel="noreferrer">Open 1080x1920 story</a>
            </div>
            <div class="card" style="margin-top:22px;padding:18px">
              <p class="eyebrow">Artist reactions</p>
              <div class="reaction-grid" data-news-reactions>
                ${NEWS_REACTIONS.map((reaction) => `<button data-reaction="${reaction}" type="button">${reactionLabel(reaction)} <span data-reaction-count="${reaction}">0</span></button>`).join("")}
              </div>
              <p class="status" data-news-reaction-status style="font-size:13px;color:var(--muted)">Artists can react after login.</p>
            </div>
            <div class="card" style="margin-top:18px;padding:18px">
              <p class="eyebrow">Artist comments</p>
              <form data-news-comment-form hidden>
                <textarea name="body" required minlength="2" maxlength="2000" placeholder="Add a comment as your claimed MBP artist profile"></textarea>
                <button class="submit" style="margin-top:10px" type="submit">Post comment</button>
              </form>
              <p data-news-comment-login style="font-size:13px;color:var(--muted)">Login with a claimed artist profile to comment.</p>
              <div class="list" data-news-comments></div>
            </div>
          </aside>
        </section>
        <script>
          (function () {
            var slug = ${JSON.stringify(article.slug)};
            var labels = { energy: "Energy", massive: "Massive", support: "Support", replay: "Replay", respect: "Respect" };
            var statusEl = document.querySelector("[data-news-reaction-status]");
            var commentsEl = document.querySelector("[data-news-comments]");
            var commentForm = document.querySelector("[data-news-comment-form]");
            var commentLogin = document.querySelector("[data-news-comment-login]");
            var authenticated = false;
            var canEngage = false;
            function esc(value) {
              return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
                return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char];
              });
            }
            function request(path, options) {
              return fetch(path, Object.assign({ credentials: "same-origin" }, options || {}, {
                headers: Object.assign({ "content-type": "application/json" }, options && options.headers ? options.headers : {})
              })).then(function (response) {
                return response.json().catch(function () { return { ok: false, error: "Invalid API response." }; }).then(function (data) {
                  if (!response.ok || data.ok === false) throw new Error(data.error || "Request failed.");
                  return data;
                });
              });
            }
            function renderCounts(counts) {
              Object.keys(labels).forEach(function (reaction) {
                var count = document.querySelector('[data-reaction-count="' + reaction + '"]');
                if (count) count.textContent = String(counts && counts[reaction] ? counts[reaction] : 0);
              });
            }
            function renderComments(comments) {
              if (!commentsEl) return;
              commentsEl.innerHTML = comments && comments.length
                ? comments.map(function (comment) {
                    return '<div class="comment"><strong>' + esc(comment.artist_name) + '</strong><p>' + esc(comment.body) + '</p></div>';
                  }).join("")
                : '<p>No artist comments yet.</p>';
            }
            request("/api/auth/me", { method: "GET", headers: {} }).then(function (data) {
              authenticated = Boolean(data.authenticated);
              canEngage = authenticated && data.session && Array.isArray(data.session.artistIds) && data.session.artistIds.length > 0;
              if (commentForm) commentForm.hidden = !canEngage;
              if (commentLogin) commentLogin.hidden = canEngage;
              if (statusEl) statusEl.textContent = canEngage ? "Choose one reaction from your artist profile." : "Artists can react after login.";
            }).catch(function () {});
            request("/api/news/" + encodeURIComponent(slug) + "/reactions", { method: "GET", headers: {} }).then(function (data) { renderCounts(data.counts); }).catch(function () {});
            request("/api/news/" + encodeURIComponent(slug) + "/comments", { method: "GET", headers: {} }).then(function (data) { renderComments(data.comments || []); }).catch(function () {});
            document.addEventListener("click", function (event) {
              var target = event.target;
              if (!(target instanceof HTMLElement)) return;
              var button = target.closest("[data-reaction]");
              if (!button) return;
              if (!canEngage) {
                if (statusEl) statusEl.textContent = authenticated ? "Only claimed artist profiles can react." : "Login with a claimed artist profile first.";
                return;
              }
              request("/api/news/" + encodeURIComponent(slug) + "/reactions", {
                method: "POST",
                body: JSON.stringify({ reaction: button.getAttribute("data-reaction") })
              }).then(function (data) {
                renderCounts(data.counts);
                if (statusEl) statusEl.textContent = "Reaction saved.";
              }).catch(function (error) {
                if (statusEl) statusEl.textContent = error.message;
              });
            });
            if (commentForm) {
              commentForm.addEventListener("submit", function (event) {
                event.preventDefault();
                var formData = new FormData(commentForm);
                request("/api/news/" + encodeURIComponent(slug) + "/comments", {
                  method: "POST",
                  body: JSON.stringify({ body: formData.get("body") })
                }).then(function () {
                  commentForm.reset();
                  return request("/api/news/" + encodeURIComponent(slug) + "/comments", { method: "GET", headers: {} });
                }).then(function (data) {
                  renderComments(data.comments || []);
                }).catch(function (error) {
                  if (commentLogin) {
                    commentLogin.hidden = false;
                    commentLogin.textContent = error.message;
                  }
                });
              });
            }
          })();
        </script>
      `
    })
  );
};
