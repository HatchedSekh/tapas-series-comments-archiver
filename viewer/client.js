(function () {
  "use strict";

  function applyStoredTheme() {
    try {
      var saved = localStorage.getItem("theme");
      if (saved) document.documentElement.dataset.theme = saved;
    } catch (e) {}
  }
  applyStoredTheme();

  document.getElementById("theme-toggle").addEventListener("click", function () {
    var current = document.documentElement.dataset.theme;
    var isDark = current ? current === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    var next = isDark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch (e) {}
  });

  function sharedStyle() {
    var style = document.createElement("style");
    style.textContent = `
      :host {
        display: block;
        color: var(--fg);
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      }
      .empty {
        color: var(--muted);
        padding: 0.75rem 1rem;
        font-size: 0.9rem;
      }
    `;
    return style;
  }

  class SeriesPickerElement extends HTMLElement {
    connectedCallback() {
      var shadow = this.attachShadow({ mode: "open" });
      shadow.appendChild(sharedStyle());

      var extra = document.createElement("style");
      extra.textContent = `
        ul {
          list-style: none;
          margin: 0;
          padding: 0.5rem 1rem;
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        button {
          background: var(--bg-alt);
          color: var(--fg);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 0.3rem 0.7rem;
          cursor: pointer;
          font-size: 0.85rem;
        }
        button[aria-pressed="true"] {
          background: var(--accent);
          color: var(--accent-fg);
          border-color: var(--accent);
        }
      `;
      shadow.appendChild(extra);

      this._root = shadow;
      this._load();
    }

    _load() {
      var self = this;
      fetch("/api/series")
        .then(function (r) { return r.json(); })
        .then(function (series) { self._render(series); })
        .catch(function () { self._renderError(); });
    }

    _renderError() {
      var div = document.createElement("div");
      div.className = "empty";
      div.textContent = "Couldn't load series list.";
      this._root.appendChild(div);
    }

    _render(series) {
      if (!series || series.length === 0) {
        var div = document.createElement("div");
        div.className = "empty";
        div.textContent = "No series found.";
        this._root.appendChild(div);
        return;
      }

      if (series.length === 1) {
        this._dispatch(series[0]);
        return;
      }

      var ul = document.createElement("ul");
      var self = this;
      series.forEach(function (s) {
        var li = document.createElement("li");
        var btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = s.name + " (#" + s.id + ")";
        btn.setAttribute("aria-pressed", "false");
        btn.addEventListener("click", function () {
          ul.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
          btn.setAttribute("aria-pressed", "true");
          self._dispatch(s);
        });
        li.appendChild(btn);
        ul.appendChild(li);
      });
      this._root.appendChild(ul);
    }

    _dispatch(series) {
      window.dispatchEvent(new CustomEvent("series-selected", { detail: series }));
    }
  }

  class EpisodeListElement extends HTMLElement {
    connectedCallback() {
      var shadow = this.attachShadow({ mode: "open" });
      shadow.appendChild(sharedStyle());

      var extra = document.createElement("style");
      extra.textContent = `
        :host {
          width: 280px;
          flex-shrink: 0;
          overflow-y: auto;
          border-right: 1px solid var(--border);
        }
        ul {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        li {
          border-bottom: 1px solid var(--border);
        }
        button {
          width: 100%;
          text-align: left;
          background: transparent;
          color: var(--fg);
          border: none;
          padding: 0.6rem 1rem;
          cursor: pointer;
          font-size: 0.85rem;
        }
        button:hover {
          background: var(--bg-alt);
        }
        button[aria-current="true"] {
          background: var(--accent);
          color: var(--accent-fg);
        }
        .name {
          display: block;
        }
        .count {
          display: block;
          font-size: 0.75rem;
          opacity: 0.8;
          margin-top: 0.15rem;
        }
      `;
      shadow.appendChild(extra);

      this._root = shadow;

      var self = this;
      window.addEventListener("series-selected", function (ev) { self._loadEpisodes(ev.detail); });
    }

    _loadEpisodes(series) {
      this._series = series;
      this._root.querySelectorAll("ul, .empty").forEach(function (el) { el.remove(); });
      var self = this;
      fetch("/api/series/" + encodeURIComponent(series.dirName) + "/episodes")
        .then(function (r) { return r.json(); })
        .then(function (episodes) { self._render(episodes); })
        .catch(function () { self._renderError(); });
    }

    _renderError() {
      var div = document.createElement("div");
      div.className = "empty";
      div.textContent = "Couldn't load episodes.";
      this._root.appendChild(div);
    }

    _render(episodes) {
      if (!episodes || episodes.length === 0) {
        var div = document.createElement("div");
        div.className = "empty";
        div.textContent = "No episodes found.";
        this._root.appendChild(div);
        return;
      }

      var ul = document.createElement("ul");
      var self = this;
      episodes.forEach(function (ep) {
        var li = document.createElement("li");
        var btn = document.createElement("button");
        btn.type = "button";
        btn.setAttribute("aria-current", "false");

        var name = document.createElement("span");
        name.className = "name";
        name.textContent = ep.episodeName || "[untitled]";

        var count = document.createElement("span");
        count.className = "count";
        count.textContent = (ep.commentCount || 0) + " comment" + (ep.commentCount === 1 ? "" : "s");

        btn.appendChild(name);
        btn.appendChild(count);
        btn.addEventListener("click", function () {
          ul.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-current", "false"); });
          btn.setAttribute("aria-current", "true");
          window.dispatchEvent(new CustomEvent("episode-selected", {
            detail: { dirName: self._series.dirName, fileName: ep.fileName, episodeName: ep.episodeName },
          }));
        });

        li.appendChild(btn);
        ul.appendChild(li);
      });
      this._root.appendChild(ul);
    }
  }

  class CommentThreadElement extends HTMLElement {
    connectedCallback() {
      var shadow = this.attachShadow({ mode: "open" });
      shadow.appendChild(sharedStyle());

      var extra = document.createElement("style");
      extra.textContent = `
        :host {
          flex: 1;
          overflow-y: auto;
          padding: 1rem 1.25rem;
        }
        h2 {
          font-size: 1rem;
          margin: 0 0 1rem;
        }
        .comment {
          padding: 0.6rem 0;
          border-bottom: 1px solid var(--border);
        }
        .reply {
          margin-left: 1.5rem;
          border-bottom: none;
        }
        .meta {
          font-size: 0.75rem;
          color: var(--muted);
          margin-bottom: 0.25rem;
        }
        .author {
          font-weight: 600;
          color: var(--fg);
        }
        .body {
          font-size: 0.9rem;
          white-space: pre-wrap;
        }
        details.replies {
          margin-left: 1.5rem;
          border-bottom: 1px solid var(--border);
        }
        details.replies > summary {
          cursor: pointer;
          padding: 0.4rem 0;
          font-size: 0.8rem;
          color: var(--accent);
          list-style: revert;
        }
        details.replies > summary:hover {
          text-decoration: underline;
        }
        details.replies[open] > summary {
          margin-bottom: 0.25rem;
        }
      `;
      shadow.appendChild(extra);

      this._root = shadow;
      this._renderEmpty("Pick a series and episode to see its comments.");

      var self = this;
      window.addEventListener("episode-selected", function (ev) { self._loadEpisode(ev.detail); });
    }

    _renderEmpty(message) {
      this._root.querySelectorAll("*:not(style)").forEach(function (el) { el.remove(); });
      var div = document.createElement("div");
      div.className = "empty";
      div.textContent = message;
      this._root.appendChild(div);
    }

    _loadEpisode(ref) {
      this._renderEmpty("Loading...");
      var self = this;
      fetch("/api/series/" + encodeURIComponent(ref.dirName) + "/episodes/" + encodeURIComponent(ref.fileName))
        .then(function (r) { return r.json(); })
        .then(function (data) { self._render(data); })
        .catch(function () { self._renderEmpty("Couldn't load that episode."); });
    }

    _render(data) {
      this._root.querySelectorAll("*:not(style)").forEach(function (el) { el.remove(); });

      var h2 = document.createElement("h2");
      h2.textContent = data.episodeName || "[untitled episode]";
      this._root.appendChild(h2);

      var comments = data.comments || [];
      if (comments.length === 0) {
        var div = document.createElement("div");
        div.className = "empty";
        div.textContent = "No comments for this episode.";
        this._root.appendChild(div);
        return;
      }

      var repliesByParent = new Map();
      var roots = [];
      comments.forEach(function (c) {
        if (c.parentId === null || c.parentId === undefined) {
          roots.push(c);
        } else {
          var list = repliesByParent.get(c.parentId) || [];
          list.push(c);
          repliesByParent.set(c.parentId, list);
        }
      });

      var self = this;
      roots.forEach(function (root) {
        self._root.appendChild(self._buildComment(root, false));

        var replies = repliesByParent.get(root.id) || [];
        if (replies.length === 0) return;

        var details = document.createElement("details");
        details.className = "replies";
        var summary = document.createElement("summary");
        summary.textContent = replies.length + " repl" + (replies.length === 1 ? "y" : "ies");
        details.appendChild(summary);
        replies.forEach(function (reply) {
          details.appendChild(self._buildComment(reply, true));
        });
        self._root.appendChild(details);
      });
    }

    _buildComment(c, isReply) {
      var wrap = document.createElement("div");
      wrap.className = isReply ? "comment reply" : "comment";

      var meta = document.createElement("div");
      meta.className = "meta";

      var author = document.createElement("span");
      author.className = "author";
      author.textContent = c.authorName || c.authorHandle || "[unknown]";
      meta.appendChild(author);
      meta.appendChild(document.createTextNode(" · " + (c.date || "[no date]") + " · " + (c.likeCount || 0) + " likes"));

      var body = document.createElement("div");
      body.className = "body";
      body.textContent = c.body || "[no content]";

      wrap.appendChild(meta);
      wrap.appendChild(body);
      return wrap;
    }
  }

  customElements.define("series-picker", SeriesPickerElement);
  customElements.define("episode-list", EpisodeListElement);
  customElements.define("comment-thread", CommentThreadElement);
})();
