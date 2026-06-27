import { verifySession, type Env } from "../api/_shared";
import { absoluteUrl, escapeHtml, htmlResponse, notFoundPage, pageShell, SITE_NAME, SITE_URL } from "../_seo";
import {
  articleSeoDescription,
  articleSeoTitle,
  findArticleBySlug,
  findPublishedArticle,
  isNewsTableMissing,
  NEWS_REACTIONS,
  renderArticleHtml,
  type NewsArticleRow
} from "../api/_news";

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en", { year: "numeric", month: "long", day: "numeric" }).format(date);
}

function renderArticleBody(content: string) {
  const safeContent = renderArticleHtml(content);
  if (/<(p|h[1-6]|ul|ol|li|blockquote|strong|em|a|img|figure|br)\b/i.test(safeContent)) {
    return safeContent;
  }

  return safeContent
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
    respect: "Respect"
  };
  return labels[reaction] || reaction;
}

function reactionIcon(reaction: string) {
  const icons: Record<string, string> = {
    energy: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M18 2 6 18h10l-2 12 12-17H16l2-11Z"/></svg>`,
    massive: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 20c4-9 8-9 12 0s8 9 12 0"/><path d="M4 12c4 9 8 9 12 0s8-9 12 0"/></svg>`,
    support: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 27s-10-6.1-10-14a5.8 5.8 0 0 1 10-4.1A5.8 5.8 0 0 1 26 13c0 7.9-10 14-10 14Z"/><path d="M9 21h5m8 0h-5"/></svg>`,
    respect: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="m16 3 3.7 7.5 8.3 1.2-6 5.8 1.4 8.2L16 21.8 8.6 25.7l1.4-8.2-6-5.8 8.3-1.2L16 3Z"/></svg>`
  };
  return icons[reaction] || icons.energy;
}

const NEWS_DETAIL_HEADERS = {
  "cache-control": "no-store, no-cache, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Cloudflare-CDN-Cache-Control": "no-store"
};

export const onRequestGet: PagesFunction<Env> = async ({ params, request, env }) => {
  if (!env.DB) return notFoundPage("News not available");

  const slug = String(params.slug ?? "").toLowerCase();
  let article: NewsArticleRow | null = null;
  try {
    article = await findPublishedArticle(env.DB, slug);
    if (!article && new URL(request.url).searchParams.get("preview") === "admin") {
      const session = await verifySession(request, env);
      if (session?.role === "admin") {
        article = await findArticleBySlug(env.DB, slug);
      }
    }
  } catch (error) {
    if (isNewsTableMissing(error)) return notFoundPage("News not available");
    throw error;
  }

  if (!article) return notFoundPage("News article not found");

  const isDraftPreview = article.status !== "published";
  const canonicalPath = `/news/${article.slug}`;
  const canonicalUrl = `${SITE_URL}${canonicalPath}`;
  const title = String(articleSeoTitle(article));
  const description = String(articleSeoDescription(article));
  const previewImageParam = isDraftPreview ? "&preview=admin" : "";
  const ogAsset = `/news/${article.slug}/social-image.svg?platform=og${previewImageParam}`;
  const instagramPostAsset = `/news/${article.slug}/social-image.svg?platform=instagram-post${previewImageParam}`;
  const instagramStoryAsset = `/news/${article.slug}/social-image.svg?platform=instagram-story${previewImageParam}`;
  const articleCoverImage = article.cover_image_url || "/assets/brand/season4-banner.png";
  const image = ogAsset;
  const socialFileSlug = article.slug.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "mbp-news";
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
      noindex: isDraftPreview,
      content: `
        <style>
          .news-article{width:min(1040px,100%);margin:0 auto;padding-bottom:76px}.news-cover{width:100%;aspect-ratio:16/9;border:1px solid var(--line);border-radius:8px;background:#000;object-fit:cover}.article-body{margin-top:32px}.article-body p{font-size:17px;line-height:1.85}.article-body h2,.article-body h3{margin:34px 0 10px;font-size:clamp(24px,3vw,34px);text-transform:uppercase;letter-spacing:0;font-weight:1000}.article-body ul{margin:18px 0 0;padding-left:22px;color:var(--muted);line-height:1.8}.article-body img{max-width:100%;border:1px solid var(--line);border-radius:8px;background:#000}.article-body figure{margin:26px 0}.article-body .media-embed{overflow:hidden;border:1px solid var(--line);border-radius:8px;background:#000}.article-body .media-embed iframe,.article-body .media-embed video{display:block;width:100%;aspect-ratio:16/9;border:0;background:#000}.article-body .media-embed audio{display:block;width:100%;border:0}.share-panel{margin-top:44px}.share-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.reaction-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.reaction-grid button{display:grid;min-height:104px;place-items:center;gap:5px;border:1px solid var(--line);border-radius:8px;background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.025));color:#fff;padding:12px 8px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;cursor:pointer}.reaction-grid button:hover,.reaction-grid button:focus-visible{border-color:var(--cyan);color:var(--cyan);outline:none;box-shadow:0 0 0 1px rgba(34,247,255,.38),0 0 22px rgba(34,247,255,.14)}.reaction-icon{display:grid;width:34px;height:34px;place-items:center;color:var(--cyan);filter:drop-shadow(0 0 8px rgba(34,247,255,.34))}.reaction-icon svg{display:block;width:34px;height:34px;fill:none;stroke:currentColor;stroke-width:2.35;stroke-linecap:round;stroke-linejoin:round}.reaction-count{display:block;font-size:18px;line-height:1;color:#fff}.reaction-name{display:block;font-size:10px;line-height:1.1;color:#aeb5c8;letter-spacing:.11em}.comment{border:1px solid var(--line);border-radius:6px;padding:14px;background:rgba(255,255,255,.035)}textarea{width:100%;min-height:120px;border:1px solid var(--line);border-radius:6px;background:#050508;color:#fff;padding:12px;font:inherit}button.submit{border:0;border-radius:6px;background:#fff;color:#000;padding:12px 16px;font-weight:1000;text-transform:uppercase;letter-spacing:.12em;cursor:pointer}.thumb-links{display:grid;gap:8px;margin-top:12px}.thumb-links a,.thumb-links button{display:block;width:100%;border:1px solid var(--line);border-radius:6px;background:transparent;padding:10px 12px;text-align:left;text-decoration:none;font:inherit;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#d6d8e2;cursor:pointer}.thumb-links a:hover,.thumb-links button:hover,.thumb-links button:focus-visible{border-color:var(--cyan);color:var(--cyan);outline:none}.thumb-links button:disabled{cursor:wait;opacity:.58}.share-status{margin-top:10px;font-size:13px;color:var(--muted)}@media (max-width:860px){.share-grid{grid-template-columns:1fr 1fr}.reaction-grid{grid-template-columns:1fr 1fr}.reaction-grid button{min-height:98px}}@media (max-width:520px){.reaction-grid,.share-grid{grid-template-columns:1fr}}
        </style>
        <section class="hero">
          <p class="eyebrow">${escapeHtml(article.category || "MBP News")}</p>
          <h1>${escapeHtml(article.title)}</h1>
          <p>${escapeHtml(description)}</p>
          <div class="meta">
            ${isDraftPreview ? `<span class="pill">Admin draft preview</span>` : ""}
            ${publishedDate ? `<span class="pill">${escapeHtml(publishedDate)}</span>` : ""}
            <span class="pill">${escapeHtml(article.author_name || SITE_NAME)}</span>
          </div>
        </section>
        <section class="news-article">
          <img class="news-cover" src="${escapeHtml(absoluteUrl(articleCoverImage))}" alt="${escapeHtml(article.title)} news artwork" />
          <article class="article-body">${renderArticleBody(article.content)}</article>
          <section class="card share-panel">
            <p class="eyebrow">Share article</p>
            <h2>Social-ready story</h2>
            <p>Share this MBP news update directly. Instagram post and story assets export as JPEG; Android downloads the file for Instagram import, while supported mobile browsers can open the system share sheet.</p>
            ${
              isDraftPreview
                ? `<p class="status" style="font-size:13px;color:var(--muted)">Draft previews are private. Publish this article before using public social share links.</p>`
                : `<div class="links share-grid">
                    <a href="https://www.facebook.com/sharer/sharer.php?u=${shareUrl}" target="_blank" rel="noreferrer">Facebook</a>
                    <a href="https://twitter.com/intent/tweet?url=${shareUrl}&text=${encodedTitle}" target="_blank" rel="noreferrer">X / Twitter</a>
                    <a href="https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}" target="_blank" rel="noreferrer">LinkedIn</a>
                    <a href="https://api.whatsapp.com/send?text=${encodedTitle}%20${shareUrl}" target="_blank" rel="noreferrer">WhatsApp</a>
                  </div>`
            }
            <div class="thumb-links">
              <a href="${escapeHtml(ogAsset)}" target="_blank" rel="noreferrer">Open Graph 1200x630</a>
              <button data-social-asset data-social-url="${escapeHtml(instagramPostAsset)}" data-social-width="1080" data-social-height="1080" data-social-name="${escapeHtml(`${socialFileSlug}-instagram-post.jpg`)}" type="button">Instagram post 1080x1080</button>
              <button data-social-asset data-social-url="${escapeHtml(instagramStoryAsset)}" data-social-width="1080" data-social-height="1920" data-social-name="${escapeHtml(`${socialFileSlug}-instagram-story.jpg`)}" type="button">Instagram story 1080x1920</button>
            </div>
            <p class="share-status" data-social-share-status></p>
            <div class="card" style="margin-top:22px;padding:18px">
              <p class="eyebrow">Artist reactions</p>
              <div class="reaction-grid" data-news-reactions>
                ${NEWS_REACTIONS.map(
                  (reaction) =>
                    `<button data-reaction="${reaction}" type="button" aria-label="${escapeHtml(reactionLabel(reaction))} reaction"><span class="reaction-icon">${reactionIcon(reaction)}</span><span class="reaction-count" data-reaction-count="${reaction}">0</span><span class="reaction-name">${escapeHtml(reactionLabel(reaction))}</span></button>`
                ).join("")}
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
          </section>
        </section>
        <script>
          (function () {
            var slug = ${JSON.stringify(article.slug)};
            var labels = { energy: "Energy", massive: "Massive", support: "Support", respect: "Respect" };
            var statusEl = document.querySelector("[data-news-reaction-status]");
            var commentsEl = document.querySelector("[data-news-comments]");
            var commentForm = document.querySelector("[data-news-comment-form]");
            var commentLogin = document.querySelector("[data-news-comment-login]");
            var socialShareStatus = document.querySelector("[data-social-share-status]");
            var authenticated = false;
            var canEngage = false;
            var shareTitle = ${JSON.stringify(shareText)};
            function esc(value) {
              return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
                return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char];
              });
            }
            function setSocialStatus(message) {
              if (socialShareStatus) socialShareStatus.textContent = message || "";
            }
            function isLikelyMobile() {
              return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
            }
            function isAndroid() {
              return /Android/i.test(navigator.userAgent);
            }
            function loadImage(src) {
              return new Promise(function (resolve, reject) {
                var image = new Image();
                image.onload = function () { resolve(image); };
                image.onerror = function () { reject(new Error("Social artwork could not be rendered.")); };
                image.src = src;
              });
            }
            function blobFromCanvas(canvas, mimeType) {
              return new Promise(function (resolve, reject) {
                canvas.toBlob(function (blob) {
                  if (blob) resolve(blob);
                  else reject(new Error("Image export is not available in this browser."));
                }, mimeType || "image/jpeg", 0.92);
              });
            }
            function downloadBlob(blob, filename) {
              var url = URL.createObjectURL(blob);
              var link = document.createElement("a");
              link.href = url;
              link.download = filename || "mbp-news.jpg";
              document.body.appendChild(link);
              link.click();
              link.remove();
              window.setTimeout(function () { URL.revokeObjectURL(url); }, 1200);
            }
            function decodeSvgAttribute(value) {
              return String(value || "")
                .replace(/&amp;/g, "&")
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">");
            }
            function blobToDataUrl(blob) {
              return new Promise(function (resolve, reject) {
                var reader = new FileReader();
                reader.onload = function () { resolve(String(reader.result || "")); };
                reader.onerror = function () { reject(new Error("Image asset could not be embedded.")); };
                reader.readAsDataURL(blob);
              });
            }
            function fallbackImageFor(href) {
              return /logo/i.test(href) ? "/assets/brand/logo-official-purple.png" : "/assets/brand/season4-banner.png";
            }
            async function fetchImageDataUrl(href) {
              var decodedHref = decodeSvgAttribute(href);
              var candidates = [decodedHref, fallbackImageFor(decodedHref)]
                .filter(Boolean)
                .map(function (candidate) { return new URL(candidate, window.location.href).toString(); });
              var seen = {};
              for (var index = 0; index < candidates.length; index += 1) {
                var candidateUrl = candidates[index];
                if (seen[candidateUrl]) continue;
                seen[candidateUrl] = true;
                try {
                  var response = await fetch(candidateUrl, { credentials: "same-origin", cache: "force-cache" });
                  if (!response.ok) continue;
                  return await blobToDataUrl(await response.blob());
                } catch (error) {
                  // Try the fallback. Some cross-origin artwork can display in SVG but cannot be fetched for canvas export.
                }
              }
              return "";
            }
            async function inlineSvgImageAssets(svg) {
              var imagePattern = /<image\\b[^>]*\\s(?:href|xlink:href)=(["'])(.*?)\\1/gi;
              var hrefs = [];
              var match;
              while ((match = imagePattern.exec(svg))) {
                var rawHref = match[2];
                if (rawHref && !/^data:/i.test(rawHref) && hrefs.indexOf(rawHref) === -1) hrefs.push(rawHref);
              }
              var output = svg;
              for (var index = 0; index < hrefs.length; index += 1) {
                var href = hrefs[index];
                var dataUrl = await fetchImageDataUrl(href);
                if (dataUrl) output = output.split(href).join(dataUrl);
              }
              return output;
            }
            async function renderSocialImage(assetUrl, width, height) {
              var response = await fetch(assetUrl, { credentials: "same-origin", cache: "no-store" });
              if (!response.ok) throw new Error("Social artwork is not available.");
              var svg = await inlineSvgImageAssets(await response.text());
              var svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
              try {
                var image = await loadImage(svgUrl);
                var canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                var context = canvas.getContext("2d");
                if (!context) throw new Error("Canvas is not available in this browser.");
                context.fillStyle = "#050508";
                context.fillRect(0, 0, width, height);
                context.drawImage(image, 0, 0, width, height);
                return await blobFromCanvas(canvas, "image/jpeg");
              } finally {
                URL.revokeObjectURL(svgUrl);
              }
            }
            async function handleSocialAsset(button) {
              var assetUrl = button.getAttribute("data-social-url") || "";
              var width = Number(button.getAttribute("data-social-width") || 1080);
              var height = Number(button.getAttribute("data-social-height") || 1080);
              var filename = button.getAttribute("data-social-name") || "mbp-news.jpg";
              var isStoryAsset = height > width;
              var originalText = button.textContent;
              button.disabled = true;
              button.textContent = "Preparing image...";
              setSocialStatus("");
              try {
                var blob = await renderSocialImage(assetUrl, width, height);
                var file = typeof File !== "undefined" ? new File([blob], filename.replace(/\\.png$/i, ".jpg"), { type: "image/jpeg" }) : null;
                var shareData = file
                  ? {
                    files: [file]
                  }
                  : null;
                if (isAndroid()) {
                  downloadBlob(blob, filename);
                  setSocialStatus(isStoryAsset ? "Story image downloaded. Open Instagram, create a Story, and choose this image from Downloads/Gallery." : "Post image downloaded. Open Instagram and choose this image from Downloads/Gallery.");
                } else if (isLikelyMobile() && shareData && navigator.canShare && navigator.canShare(shareData)) {
                  try {
                    await navigator.share(shareData);
                    setSocialStatus(isStoryAsset ? "Story image shared. If Instagram only shows Feed, save this file and choose Story manually inside Instagram." : "Instagram post image shared through the system share sheet.");
                  } catch (shareError) {
                    downloadBlob(blob, filename);
                    setSocialStatus(isStoryAsset ? "Story share was cancelled. The 1080x1920 image was downloaded so you can add it manually as an Instagram Story." : "Share was cancelled. The image was downloaded instead.");
                  }
                } else {
                  downloadBlob(blob, filename);
                  setSocialStatus(isStoryAsset ? "Story image downloaded. Open Instagram and add it manually as a Story." : "Image downloaded. Upload it to Instagram from the downloaded file.");
                }
              } catch (error) {
                setSocialStatus(error && error.message ? error.message : "Social artwork export failed. Opening the source image instead.");
                if (assetUrl) window.open(assetUrl, "_blank", "noopener,noreferrer");
              } finally {
                button.disabled = false;
                button.textContent = originalText;
              }
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
              var socialButton = target.closest("[data-social-asset]");
              if (socialButton) {
                handleSocialAsset(socialButton);
                return;
              }
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
    }),
    { headers: NEWS_DETAIL_HEADERS }
  );
};
