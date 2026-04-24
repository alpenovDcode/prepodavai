-- AlterTable: теги урока для библиотеки материалов (M4)
ALTER TABLE "lessons" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Индекс GIN по массиву тегов — быстрый поиск по "содержит тег X"
CREATE INDEX "lessons_tags_idx" ON "lessons" USING GIN ("tags");
