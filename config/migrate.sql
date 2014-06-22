BEGIN;

ALTER TABLE "page" RENAME TO "page_tmp";

CREATE TABLE "page" ("id" INTEGER NOT NULL PRIMARY KEY, "title" TEXT, "user_id" TEXT, "created" DATETIME NOT NULL, "text" TEXT NOT NULL, "public" SMALLINT NOT NULL, "encrypted" SMALLINT NOT NULL, FOREIGN KEY ("user_id") REFERENCES "user" ("id"));

INSERT INTO "page" SELECT "id","name","user_id","created","text","public","encrypted" FROM "page_tmp";

DROP TABLE "page_tmp";
CREATE INDEX "page_title" on "page" ("title" DESC);

COMMIT;
