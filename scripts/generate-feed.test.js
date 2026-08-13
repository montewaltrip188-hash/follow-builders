import assert from "node:assert/strict";
import test from "node:test";

import { fetchBlogContent } from "./generate-feed.js";

test("缺少发布日期的 Blog 文章不会进入 Feed 或已处理状态", async () => {
  const originalFetch = globalThis.fetch;
  const errors = [];
  const state = { seenArticles: {} };
  globalThis.fetch = async (url) => {
    if (url === "https://claude.com/blog") {
      return new Response('<a href="/blog/no-publication-date">No date</a>');
    }
    return new Response("<article><h1>No date</h1><p>Article body</p></article>");
  };

  try {
    const articles = await fetchBlogContent(
      [{ name: "Claude Blog", indexUrl: "https://claude.com/blog" }],
      state,
      errors,
    );

    assert.deepEqual(articles, []);
    assert.deepEqual(state.seenArticles, {});
    assert.match(errors.join("\n"), /publication date/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("正文页的合法发布日期会规范化后写入 Feed", async () => {
  const originalFetch = globalThis.fetch;
  const errors = [];
  const state = { seenArticles: {} };
  globalThis.fetch = async (url) => {
    if (url === "https://claude.com/blog") {
      return new Response('<a href="/blog/dated-article">Dated article</a>');
    }
    return new Response(`
      <script type="application/ld+json">
        {"@type":"BlogPosting","headline":"Dated article","datePublished":"2026-08-13T06:00:00+08:00"}
      </script>
      <article><p>Article body</p></article>
    `);
  };

  try {
    const articles = await fetchBlogContent(
      [{ name: "Claude Blog", indexUrl: "https://claude.com/blog" }],
      state,
      errors,
    );

    assert.equal(articles.length, 1);
    assert.equal(articles[0].publishedAt, "2026-08-12T22:00:00.000Z");
    assert.ok(state.seenArticles[articles[0].url]);
    assert.deepEqual(errors, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("非法发布日期的 Blog 文章不会进入 Feed 或已处理状态", async () => {
  const originalFetch = globalThis.fetch;
  const errors = [];
  const state = { seenArticles: {} };
  globalThis.fetch = async (url) => {
    if (url === "https://claude.com/blog") {
      return new Response('<a href="/blog/invalid-date">Invalid date</a>');
    }
    return new Response(`
      <script type="application/ld+json">
        {"@type":"BlogPosting","headline":"Invalid date","datePublished":"not-a-date"}
      </script>
      <article><p>Article body</p></article>
    `);
  };

  try {
    const articles = await fetchBlogContent(
      [{ name: "Claude Blog", indexUrl: "https://claude.com/blog" }],
      state,
      errors,
    );

    assert.deepEqual(articles, []);
    assert.deepEqual(state.seenArticles, {});
    assert.match(errors.join("\n"), /publication date/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Anthropic 正文页可从 article:published_time 元数据恢复发布日期", async () => {
  const originalFetch = globalThis.fetch;
  const errors = [];
  const state = { seenArticles: {} };
  globalThis.fetch = async (url) => {
    if (url === "https://www.anthropic.com/engineering") {
      return new Response('<a href="/engineering/metadata-date">Metadata date</a>');
    }
    return new Response(`
      <meta property="article:published_time" content="2026-08-13T06:00:00Z">
      <article><h1>Metadata date</h1><p>Article body</p></article>
    `);
  };

  try {
    const articles = await fetchBlogContent(
      [{ name: "Anthropic Engineering", indexUrl: "https://www.anthropic.com/engineering" }],
      state,
      errors,
    );

    assert.equal(articles.length, 1);
    assert.equal(articles[0].publishedAt, "2026-08-13T06:00:00.000Z");
    assert.deepEqual(errors, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
