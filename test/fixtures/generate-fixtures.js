// One-off generator for the placeholder fixtures below -- not run by the
// test suite. Produces synthetic HTML in Tapas's real markup shape (same
// classes/structure as captured live responses) but with made-up content,
// so parseCommentBlocks is exercised against the real template without
// bundling any real person's username or comment text into the repo.
const fs = require("fs");
const path = require("path");

const rootComment = ({ id, handle, name, date, body, likes, replyCnt }) => `
    <div class="comment-row-wrap js-comment-parent-row" id="comment-row-${id}">
        <div class="comment-row">
            <div class="row__writer">
                <a class="writer__thumb" href="/${handle}">
                    <img class="circle" src="https://example-cdn.test/placeholder-avatar.png" alt="${name}">
                    <div class="thumb-overlay circle"></div>
                </a>
            </div>
            <div class="row__body">
                <div class="body__row" id="comment-box-${id}">
                    <div class="body__writer"><a class="writer__name" href="/${handle}">${name}</a><p class="writer__date">${date}</p></div>
                    <div class="body__comment js-comment-body">${body}</div>
                    <div class="body__info">
                        <a class="info__button js-have-to-sign "
                           id="comment-like-${id}"
                           data-id="${id}"
                           data-cnt="${likes}"
                           data-permalink="/episode/99999?_=_#comment-section"
                           data-where="Comment"><span class="js-like-cnt">${likes}</span></a>
                        <hr/>
                        <a class="info__button info__button--reply js-have-to-sign"
                           data-permalink="/episode/99999?_=_#comment-section"
                           data-where="Comment"
                           data-id="${id}"></a>
                    </div>
                    <div>
                        <a class="body__button js-toggle-reply-btn${replyCnt === 0 ? " hidden" : ""}"
                           data-reply-cnt="${replyCnt}" data-id="${id}">
                            <span class="button__label js-toggle-reply-label">View ${replyCnt} ${replyCnt === 1 ? "reply" : "replies"}</span></a>
                    </div>
                </div>
                <script type="text/template" id="tpCommentEdit${id}">
                    <div class="body__edit js-comment-edit-box js-comment-row">
                        <div class="edit__write_box">
                            <textarea class="autogrow js-edit-box" placeholder="Leave a note" autocomplete="off" maxlength="2000" tabindex="${id}">{{body}}</textarea>
                        </div>
                    </div>
                </script>
            </div>
        </div>
        <div class="comment-row__reply hidden js-reply-list"></div>
    </div>
`;

const reply = ({ id, handle, name, date, body, likes }) => `
    <div class="reply-wrapper js-comment-reply" id="comment-row-${id}">
        <div></div>
        <div class="body__reply">
            <div class="reply__writer">
                <a class="writer__thumb" href="/${handle}">
                    <img class="circle" src="https://example-cdn.test/placeholder-avatar.png" alt="${name}">
                    <div class="thumb-overlay circle"></div>
                </a>
            </div>
            <div class="reply__body" id="comment-box-${id}">
                <div class="body__writer"><a class="writer__name" href="/${handle}">${name}</a><p class="writer__date">${date}</p></div>
                <div class="body__comment js-comment-body">${body}</div>
                <div class="body__info">
                    <a class="info__button js-have-to-sign "
                       data-id="${id}"
                       data-cnt="${likes}"
                       data-permalink="/episode/99999?_=_#comment-section"
                       data-where="Comment"><span class="js-like-cnt">${likes}</span></a>
                </div>
            </div>
        </div>
    </div>
`;

const roots = [
  { id: 1000001, handle: "placeholder_user1", name: "Placeholder User 1", date: "Jan 01, 2020", body: "This is a sample comment for testing.", likes: 50, replyCnt: 0 },
  { id: 1000002, handle: "placeholder_user2", name: "Placeholder User 2", date: "Feb 02, 2020", body: "This is another sample comment.", likes: 19, replyCnt: 1 },
  { id: 1000003, handle: "placeholder_user3", name: "Placeholder User 3", date: "Mar 03, 2020", body: "Sample comment number three.", likes: 13, replyCnt: 0 },
  { id: 1000004, handle: "placeholder_user4", name: "Placeholder User 4", date: "Apr 04, 2020", body: "Sample comment number four.", likes: 2, replyCnt: 0 },
  { id: 1000005, handle: "placeholder_user5", name: "Placeholder User 5", date: "May 05, 2020", body: "Sample comment number five.", likes: 1, replyCnt: 0 },
  { id: 1000006, handle: "placeholder_user6", name: "Placeholder User 6", date: "Jun 06, 2020", body: "Sample comment number six.", likes: 1, replyCnt: 0 },
];

const rootFixture = {
  code: 200,
  msg: "",
  type: "DEFAULT",
  data: {
    pagination: { since: 1790000000000, page: 1, has_next: false, sort: "TOP_COMMENT", max_limit: 10 },
    total_comment_cnt: 7,
    html: roots.map(rootComment).join("\n"),
  },
  error_details: null,
};

const replies = [
  { id: 2000001, handle: "placeholder_replier1", name: "Placeholder Replier 1", date: "Feb 10, 2020", body: "This is a sample reply for testing.", likes: 8 },
];

const repliesFixture = {
  code: 200,
  msg: "",
  type: "DEFAULT",
  data: {
    pagination: { since: 1790000001000, page: 1, has_next: false, sort: null, max_limit: 20 },
    html: replies.map(reply).join("\n"),
  },
  error_details: null,
};

fs.writeFileSync(path.join(__dirname, "root-comments.json"), JSON.stringify(rootFixture, null, 2), "utf8");
fs.writeFileSync(path.join(__dirname, "replies-page1.json"), JSON.stringify(repliesFixture, null, 2), "utf8");
console.log("wrote placeholder fixtures");
